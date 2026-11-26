/*
 * Rules shared by the signing pages, the Google Apps Script back end and the Node tests.
 * One file in three places: it must not use browser, Google or Node APIs.
 */
var SignCore = (function () {
  'use strict';

  var LIMITS = {
    codeMinutes: 10,
    codeTries: 5,
    lockMinutes: 15,
    sessionHours: 12,
    ticketMinutes: 60,
    remindAfterDays: 3,
    expireAfterDays: 30,
    valueMax: 300
  };
  var MINUTE = 60 * 1000;
  var DAY = 24 * 60 * MINUTE;
  var FIELD_RE = /\{\{([a-z][a-z0-9_]{1,60})\}\}/g;

  function templateFields(text) {
    var seen = {};
    var out = [];
    var m;
    FIELD_RE.lastIndex = 0;
    while ((m = FIELD_RE.exec(String(text || ''))) !== null) {
      if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
    }
    return out;
  }

  function fieldOwner(name) {
    if (name === 'document_number' || /_(signature|signed_date)$/.test(name)) return 'system';
    if (name.indexOf('company_') === 0) return 'company';
    if (name.indexOf('recipient_') === 0) return 'recipient';
    return 'unknown';
  }

  function fieldKind(name) {
    if (/_date$/.test(name)) return 'date';
    if (/_email$/.test(name)) return 'email';
    return 'text';
  }

  function humanLabel(name) {
    var words = String(name).replace(/^(company|recipient)_/, '').replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function sanitizeValue(value, max) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\s+/g, ' ').trim();
    var limit = max || LIMITS.valueMax;
    return s.length > limit ? s.slice(0, limit) : s;
  }

  function isEmail(s) {
    var v = String(s || '');
    return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  // Which fields a side must fill. The recipient's e-mail is part of the envelope, set by the company.
  function sideFields(fieldNames, side) {
    var names = fieldNames.filter(function (n) {
      return fieldOwner(n) === side && !(side === 'recipient' && n === 'recipient_email');
    });
    if (side === 'company') {
      ['recipient_name', 'recipient_email'].forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    }
    if (side === 'recipient' && names.indexOf('recipient_name') < 0 && fieldNames.indexOf('recipient_name') >= 0) {
      names.unshift('recipient_name');
    }
    return names;
  }

  function validateFields(fieldNames, values, side) {
    var clean = {};
    var missing = [];
    var invalid = [];
    sideFields(fieldNames, side).forEach(function (name) {
      var v = sanitizeValue(values && values[name]);
      if (!v) { missing.push(name); return; }
      var kind = fieldKind(name);
      if (kind === 'email' && !isEmail(v)) invalid.push(name);
      if (kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) invalid.push(name);
      clean[name] = v;
    });
    return { clean: clean, missing: missing, invalid: invalid };
  }

  function documentNumber(code, year, seq) {
    if (!/^[A-Z]{2,8}$/.test(String(code))) throw new Error('template code must be 2 to 8 capital letters');
    return 'MT-' + code + '-' + year + '-' + ('0000' + seq).slice(-4);
  }

  // Six digits from at least 13 random hex characters (52 bits, exact in a JS number).
  function codeFromHex(hex) {
    var n = parseInt(String(hex).slice(0, 13), 16) % 1000000;
    return ('000000' + n).slice(-6);
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] & 0xff;
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  }

  // state: { tries, lockedUntil }; known: a code is on file; matches: the code typed is that code.
  function codeAttempt(state, known, matches, now) {
    var s = { tries: (state && state.tries) || 0, lockedUntil: (state && state.lockedUntil) || 0 };
    if (now < s.lockedUntil) return { allowed: false, reason: 'locked', retryAt: s.lockedUntil, state: s };
    if (!known) return { allowed: false, reason: 'expired', state: s };
    if (matches) return { allowed: true, reason: 'ok', state: { tries: 0, lockedUntil: 0 } };
    var tries = s.tries + 1;
    if (tries >= LIMITS.codeTries) {
      var until = now + LIMITS.lockMinutes * MINUTE;
      return { allowed: false, reason: 'locked', retryAt: until, state: { tries: 0, lockedUntil: until } };
    }
    return { allowed: false, reason: 'wrong', left: LIMITS.codeTries - tries, state: { tries: tries, lockedUntil: 0 } };
  }

  var MOVES = {
    open: { sent: 'opened', opened: 'opened' },
    sign: { sent: 'completed', opened: 'completed' },
    withdraw: { sent: 'withdrawn', opened: 'withdrawn' },
    expire: { sent: 'expired', opened: 'expired' },
    resend: { sent: 'sent', opened: 'sent', expired: 'sent' }
  };

  function transition(status, event) {
    var to = MOVES[event] && MOVES[event][status];
    if (!to) {
      var e = new Error('a ' + status + ' document does not allow "' + event + '"');
      e.code = 'BAD_STATE';
      throw e;
    }
    return to;
  }

  function expiresAt(sentMs) {
    return new Date(sentMs + LIMITS.expireAfterDays * DAY).toISOString();
  }

  function sweepAction(doc, now) {
    if (doc.status !== 'sent' && doc.status !== 'opened') return null;
    if (doc.expiresAt && now >= Date.parse(doc.expiresAt)) return 'expire';
    if (!doc.remindedAt && doc.sentAt && now - Date.parse(doc.sentAt) >= LIMITS.remindAfterDays * DAY) return 'remind';
    return null;
  }

  function formatUtc(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
      p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
  }

  function certificateRows(c) {
    return [
      ['Document', c.title + ' (' + c.number + ')'],
      ['Signed for the company by / Signé pour la société par',
        c.company.name + ', ' + c.company.title + ' <' + c.company.email + '>'],
      ['Company signature time / Heure de signature de la société', formatUtc(c.company.signedAt)],
      ['Signed by / Signé par', c.recipient.name + ' <' + c.recipient.email + '>'],
      ['Signature time / Heure de signature', formatUtc(c.recipient.signedAt)],
      c.recipient.place ? ['Place given / Lieu indiqué', c.recipient.place] : null,
      ['E-mail confirmed / Adresse confirmée',
        'A 6-digit code sent to this address was entered before signing. / ' +
        'Un code à 6 chiffres envoyé à cette adresse a été saisi avant la signature.'],
      ['Internet address reported by the browser / Adresse internet déclarée par le navigateur',
        c.recipient.ip || 'not reported / non déclarée'],
      ['Fingerprint of the agreement pages (SHA-256) / Empreinte des pages de l\'accord', c.agreementSha256],
      ['Check this document / Vérifier ce document', c.checkUrl]
    ].filter(Boolean);
  }

  // AWS Signature Version 4 for a POST, signed on host and x-amz-date.
  // req = { host, path, region, service, body, amzDate }; creds = { accessKey, secretKey };
  // c = { hmac(keyBytes, text) -> bytes, sha256hex(text) -> hex, bytes(text) -> bytes }
  function sigv4(req, creds, c) {
    var day = req.amzDate.slice(0, 8);
    var canonical = ['POST', req.path, '', 'host:' + req.host + '\nx-amz-date:' + req.amzDate + '\n',
      'host;x-amz-date', c.sha256hex(req.body)].join('\n');
    var scope = day + '/' + req.region + '/' + req.service + '/aws4_request';
    var toSign = ['AWS4-HMAC-SHA256', req.amzDate, scope, c.sha256hex(canonical)].join('\n');
    var key = c.hmac(c.bytes('AWS4' + creds.secretKey), day);
    key = c.hmac(key, req.region);
    key = c.hmac(key, req.service);
    key = c.hmac(key, 'aws4_request');
    return {
      'X-Amz-Date': req.amzDate,
      'Authorization': 'AWS4-HMAC-SHA256 Credential=' + creds.accessKey + '/' + scope +
        ', SignedHeaders=host;x-amz-date, Signature=' + bytesToHex(c.hmac(key, toSign))
    };
  }

  // A MIME message in ASCII only (every text part in base64): text and HTML alternatives, then attachments.
  // m = { fromName, from, to, replyTo, subject, text, html, attachments: [{ name, type, base64 }] };
  // c = { b64(text) -> base64 of its UTF-8 bytes }
  function mime(m, seed, c) {
    var mixed = 'mixed_' + seed;
    var alt = 'alt_' + seed;
    var word = function (s) {
      var v = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
      return /^[\x20-\x7e]*$/.test(v) ? v : '=?UTF-8?B?' + c.b64(v) + '?=';
    };
    var wrap = function (b64) { return String(b64).replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, ''); };
    var lines = ['From: ' + word(m.fromName) + ' <' + m.from + '>', 'To: ' + m.to];
    if (m.cc) lines.push('Cc: ' + m.cc);
    if (m.replyTo) lines.push('Reply-To: ' + m.replyTo);
    lines.push('Subject: ' + word(m.subject), 'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + mixed + '"', '',
      '--' + mixed, 'Content-Type: multipart/alternative; boundary="' + alt + '"', '',
      '--' + alt, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(c.b64(m.text)),
      '--' + alt, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(c.b64(m.html)),
      '--' + alt + '--');
    (m.attachments || []).forEach(function (a) {
      var name = String(a.name).replace(/[^\x20-\x7e]|"/g, '_');
      lines.push('--' + mixed, 'Content-Type: ' + a.type + '; name="' + name + '"',
        'Content-Disposition: attachment; filename="' + name + '"', 'Content-Transfer-Encoding: base64', '', wrap(a.base64));
    });
    lines.push('--' + mixed + '--', '');
    return lines.join('\r\n');
  }

  return {
    formatUtc: formatUtc,
    certificateRows: certificateRows,
    sigv4: sigv4,
    mime: mime,
    documentNumber: documentNumber,
    codeFromHex: codeFromHex,
    bytesToHex: bytesToHex,
    codeAttempt: codeAttempt,
    transition: transition,
    expiresAt: expiresAt,
    sweepAction: sweepAction,
    sanitizeValue: sanitizeValue,
    isEmail: isEmail,
    sideFields: sideFields,
    validateFields: validateFields,
    LIMITS: LIMITS,
    MINUTE: MINUTE,
    DAY: DAY,
    templateFields: templateFields,
    fieldOwner: fieldOwner,
    fieldKind: fieldKind,
    humanLabel: humanLabel
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = SignCore; }
