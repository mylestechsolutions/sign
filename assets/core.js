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

  return {
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
