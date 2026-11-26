// The actions the pages call. Rules kept here: a manager acts only on documents they sent (the owner on all);
// the recipient's side can never write a company field (SignCore.validateFields); a document changes state only
// through SignCore.transition; numbers and rows are taken under the script lock; a code request for an address
// that is not a manager answers exactly like one that is; a notice that fails is logged and never stops a step.
var Api = (function () {
  function now() { return new Date().toISOString(); }
  function pages(path) { return Store.prop('PAGES_URL') + '/' + path; }
  function linkFor(rec) { return pages('sign.html#' + rec.number + '.' + Auth.secretOf(rec.number)); }
  function mask(email) { var p = String(email).split('@'); return p[0].slice(0, 2) + '***@' + p[1]; }
  function lower(s) { return SignCore.sanitizeValue(s, 254).toLowerCase(); }
  function client(req) {
    var c = req.client || {};
    return { browser: SignCore.sanitizeValue(c.browser, 200), ip: SignCore.sanitizeValue(c.ip, 60) };
  }
  function quietly(number, what, fn) {
    try { fn(); } catch (e) { Store.log(number, 'notice failed', 'system', what + ': ' + ((e && e.code) || e)); }
  }

  function template(code) {
    var t = Store.template(code);
    if (!t || t.active !== 'yes') throw fail_('NO_TEMPLATE');
    t.fields = JSON.parse(t.fields_json);
    t.names = t.fields.map(function (f) { return f.name; });
    return t;
  }

  function complete(r) {
    if (r.missing.length || r.invalid.length) throw fail_('INCOMPLETE', { missing: r.missing, invalid: r.invalid });
    return r.clean;
  }

  function me(m) {
    return { email: m.email, name: m.name, title: m.title, role: m.role, hasSignature: !!m.signature_file_id };
  }

  function visible(m) {
    return Store.rows('documents').filter(function (r) { return m.role === 'owner' || r.manager_email === m.email; });
  }

  function mine(m, number) {
    var rec = Store.findDoc(String(number || ''));
    if (!rec || (m.role !== 'owner' && rec.manager_email !== m.email)) throw fail_('NOT_FOUND');
    return rec;
  }

  function companySignature(m, req) {
    if (req.signature) {
      var blob = Docs.pngBlob(req.signature, 'company-signature.png');
      if (req.saveSignature) {
        var f = Docs.folder(Store.prop('SIGS_ID')).createFile(blob.copyBlob().setName(m.email + '.png'));
        if (m.signature_file_id) DriveApp.getFileById(m.signature_file_id).setTrashed(true);
        m.signature_file_id = f.getId();
        Store.saveManager(m);
      }
      return blob;
    }
    if (m.signature_file_id) return DriveApp.getFileById(m.signature_file_id).getBlob().setName('company-signature.png');
    throw fail_('SIGNATURE_MISSING');
  }

  function companyValues(t, clean, number) {
    var v = { document_number: number, company_signed_date: now().slice(0, 10), recipient_name: clean.recipient_name };
    t.names.forEach(function (n) { if (SignCore.fieldOwner(n) === 'company' && clean[n]) v[n] = clean[n]; });
    return v;
  }

  function openRec(req) {
    var rec = Store.findDoc(String(req.number || ''));
    if (!Auth.secretMatches(rec, req.secret)) throw fail_('LINK_INVALID');
    if ((rec.status === 'sent' || rec.status === 'opened') && Date.now() >= Date.parse(rec.expires_at)) {
      rec.status = SignCore.transition(rec.status, 'expire');
      rec.expired_at = now();
      Store.writeRow('documents', rec);
      Store.log(rec.number, 'expired', 'system');
      var t = template(rec.template);
      quietly(rec.number, 'expired', function () { Mail.notice(rec.manager_email, 'expired', rec, t, pages('index.html')); });
    }
    return rec;
  }

  function templatesOut() {
    return Store.templates().map(function (t) {
      return { code: t.code, title_en: t.title_en, title_fr: t.title_fr, fields: JSON.parse(t.fields_json) };
    });
  }

  function listOf(m, query, kind) {
    var q = SignCore.sanitizeValue(query, 100).toLowerCase();
    var type = SignCore.sanitizeValue(kind, 8);
    return visible(m).filter(function (r) {
      if (type && r.template !== type) return false;
      return !q || [r.number, r.recipient_name, r.recipient_email, r.status].join(' ').toLowerCase().indexOf(q) >= 0;
    }).map(function (r) {
      return { number: r.number, template: r.template, status: r.status, recipient_name: r.recipient_name,
        recipient_email: r.recipient_email, manager_email: r.manager_email, sent_at: r.sent_at,
        completed_at: r.completed_at, expires_at: r.expires_at };
    }).sort(function (a, b) { return a.sent_at < b.sent_at ? 1 : -1; });
  }

  function activityOf(m, sinceRaw) {
    var set = {};
    visible(m).forEach(function (d) { set[d.number] = true; });
    var since = String(sinceRaw || '');
    var items = Store.steps(set, 50).map(function (s) { return { time: s.time, number: s.number, event: s.event, actor: s.actor }; });
    return { items: items, fresh: items.filter(function (i) { return since && i.time > since; }).length };
  }

  function csv(rows, cols) {
    var cell = function (v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); })).join('\r\n');
  }

  var routes = {
    'manager.requestCode': function (req) {
      var email = lower(req.email);
      if (!SignCore.isEmail(email)) throw fail_('BAD_EMAIL');
      var code = Auth.issueCode('manager', email);
      if (Store.manager(email)) Mail.code(email, code);
      return { sent: true };
    },
    'manager.verifyCode': function (req) {
      var email = lower(req.email);
      Auth.checkCode('manager', email, req.code);
      var m = Store.manager(email);
      if (!m) throw fail_('CODE_WRONG', { left: 0 });
      Store.log('', 'manager signed in', email, '', client(req));
      return { session: Auth.startSession(email), me: me(m) };
    },
    'manager.me': function (req) { return me(Auth.manager(req.session)); },
    'manager.signOut': function (req) { Auth.endSession(req.session); return { ok: true }; },
    'manager.saveProfile': function (req) {
      var m = Auth.manager(req.session);
      m.name = SignCore.sanitizeValue(req.name, 120);
      m.title = SignCore.sanitizeValue(req.title, 120);
      Store.saveManager(m);
      if (req.signature) companySignature(m, { signature: req.signature, saveSignature: true });
      return me(Store.manager(m.email));
    },
    'templates.list': function (req) {
      Auth.manager(req.session);
      return templatesOut();
    },
    // Everything the console's first screen needs, in one request (it used to wait for three in a row).
    'console.home': function (req) {
      var m = Auth.manager(req.session);
      return { me: me(m), templates: templatesOut(), documents: listOf(m, req.query, req.type), activity: activityOf(m, req.since) };
    },
    'templates.upload': function (req) {
      Auth.owner(req.session);
      var code = String(req.code || '').trim().toUpperCase();
      if (!/^[A-Z]{2,8}$/.test(code)) throw fail_('TEMPLATE_INVALID', { reason: 'the code must be 2 to 8 capital letters' });
      if (Store.template(code)) throw fail_('TEMPLATE_INVALID', { reason: 'this code is already used' });
      var titleEn = SignCore.sanitizeValue(req.title_en, 120);
      var titleFr = SignCore.sanitizeValue(req.title_fr, 120) || titleEn;
      if (!titleEn) throw fail_('TEMPLATE_INVALID', { reason: 'a title is needed' });
      var b64 = String(req.docx || '');
      if (!b64 || b64.length > 15000000) throw fail_('TEMPLATE_INVALID', { reason: 'no Word file, or over 10 MB' });
      var docId = Docs.importTemplate(Utilities.newBlob(Utilities.base64Decode(b64), MimeType.MICROSOFT_WORD, code + '.docx'), titleEn);
      var names = Docs.fieldsOf(docId);
      var has = function (f) { return names.some(f); };
      var problem = !has(function (n) { return n === 'company_signature'; }) ? 'no {{company_signature}}' :
        !has(function (n) { return n === 'recipient_signature'; }) ? 'no {{recipient_signature}}' :
        !has(function (n) { return SignCore.fieldOwner(n) === 'company'; }) ? 'no company_ field' :
        !has(function (n) { return SignCore.fieldOwner(n) === 'recipient'; }) ? 'no recipient_ field' : '';
      if (problem) { DriveApp.getFileById(docId).setTrashed(true); throw fail_('TEMPLATE_INVALID', { reason: problem }); }
      Store.saveTemplate({ code: code, title_en: titleEn, title_fr: titleFr, doc_id: docId,
        fields_json: JSON.stringify(fieldMeta_(names, {})), created_at: now(), active: 'yes' });
      return { code: code, fields: names };
    },
    'documents.preview': function (req) {
      var m = Auth.manager(req.session);
      var t = template(req.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'company'));
      return { pdf: Docs.preview(t, companyValues(t, clean, 'MT-' + t.code + '-PREVIEW'), companySignature(m, req)) };
    },
    'documents.send': function (req) {
      var m = Auth.manager(req.session);
      var t = template(req.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'company'));
      // the signatory's name and title are remembered with the send itself (no second request)
      var profile = { name: clean.company_signatory_name || m.name, title: clean.company_signatory_title || m.title };
      var profileChanged = profile.name !== m.name || profile.title !== m.title;
      m.name = profile.name;
      m.title = profile.title;
      var sig = companySignature(m, req);
      if (profileChanged && !(req.saveSignature && req.signature)) Store.saveManager(m);
      var rec = Store.withLock(function () {
        var number = Store.nextNumber(t.code);
        var dir = Docs.folder(Store.prop('DOCS_ID')).createFolder(number);
        var sigFile = dir.createFile(sig.copyBlob().setName('company-signature.png'));
        var at = now();
        var r = {
          number: number, template: t.code, status: 'sent', manager_email: m.email,
          recipient_name: clean.recipient_name, recipient_email: clean.recipient_email.toLowerCase(),
          created_at: at, sent_at: at, company_signed_at: at, expires_at: SignCore.expiresAt(Date.parse(at)),
          folder_id: dir.getId(), fields_json: JSON.stringify(Object.assign({ _sig: sigFile.getId() }, clean))
        };
        r.secret_hash = Auth.sha(Auth.newSecret(number));
        return Store.writeRow('documents', r);
      });
      rec.sent_pdf_id = Docs.makeSent(rec, t, companyValues(t, clean, rec.number), sig).getId();
      Store.writeRow('documents', rec);
      // the invitation and the manager's "Sent" notice leave together; a failed invitation still fails the step
      var mails = Mail.batch([Mail.msg.invite(rec, t, linkFor(rec), m.email, false),
        Mail.msg.notice(m.email, 'sent', rec, t, pages('index.html'))]);
      if (mails[0].error) throw mails[0].error;
      Store.log(rec.number, 'sent', m.email, rec.recipient_email, client(req));
      if (mails[1].error) Store.log(rec.number, 'notice failed', 'system', 'sent: ' + (mails[1].error.code || mails[1].error));
      return { number: rec.number, me: me(m) };
    },
    'documents.list': function (req) {
      return listOf(Auth.manager(req.session), req.query, req.type);
    },
    'documents.history': function (req) {
      var rec = mine(Auth.manager(req.session), req.number);
      var set = {};
      set[rec.number] = true;
      return Store.steps(set).map(function (s) { return { time: s.time, event: s.event, actor: s.actor, detail: s.detail }; });
    },
    'documents.export': function (req) {
      var m = Auth.manager(req.session);
      var type = SignCore.sanitizeValue(req.type, 8);
      var year = SignCore.sanitizeValue(req.year, 4);
      var docs = visible(m).filter(function (r) {
        return (!type || r.template === type) && (!year || r.sent_at.slice(0, 4) === year);
      });
      var set = {};
      docs.forEach(function (d) { set[d.number] = true; });
      var blobs = [
        Utilities.newBlob(csv(docs, ['number', 'template', 'status', 'recipient_name', 'recipient_email', 'manager_email',
          'sent_at', 'opened_at', 'signed_at', 'expires_at', 'withdrawn_at', 'expired_at', 'sha256']), 'text/csv', 'register.csv'),
        Utilities.newBlob(csv(Store.steps(set), ['time', 'number', 'event', 'actor', 'detail', 'reported_ip']), 'text/csv', 'history.csv')
      ];
      docs.forEach(function (d) {
        if (d.signed_pdf_id) blobs.push(DriveApp.getFileById(d.signed_pdf_id).getBlob().setName('signed/' + d.number + ' signed.pdf'));
      });
      var zip = Utilities.zip(blobs, 'record.zip');
      return { name: 'MylesTech record ' + (type || 'all') + ' ' + now().slice(0, 10) + '.zip', documents: docs.length,
        zip: Utilities.base64Encode(zip.getBytes()) };
    },
    'activity.list': function (req) {
      return activityOf(Auth.manager(req.session), req.since);
    },
    'documents.download': function (req) {
      var rec = mine(Auth.manager(req.session), req.number);
      var id = rec.signed_pdf_id || rec.sent_pdf_id;
      return { name: rec.number + (rec.signed_pdf_id ? ' signed.pdf' : ' sent.pdf'), pdf: Docs.base64Of(id) };
    },
    'documents.withdraw': function (req) {
      var m = Auth.manager(req.session);
      var rec = Store.withLock(function () {
        var r = mine(m, req.number);
        r.status = SignCore.transition(r.status, 'withdraw');
        r.withdrawn_at = now();
        Store.writeRow('documents', r);
        Auth.forgetSecret(r.number);
        return r;
      });
      Store.log(rec.number, 'withdrawn', m.email, '', client(req));
      var t = template(rec.template);
      quietly(rec.number, 'withdrawn', function () { Mail.notice(rec.recipient_email, 'withdrawn', rec, t, '', m.email); });
      return { ok: true };
    },
    'documents.resend': function (req) {
      var m = Auth.manager(req.session);
      var rec = Store.withLock(function () {
        var r = mine(m, req.number);
        r.status = SignCore.transition(r.status, 'resend');
        r.secret_hash = Auth.sha(Auth.newSecret(r.number));
        r.sent_at = now();
        r.expires_at = SignCore.expiresAt(Date.now());
        r.reminded_at = '';
        return Store.writeRow('documents', r);
      });
      Mail.invite(rec, template(rec.template), linkFor(rec), m.email, false);
      Store.log(rec.number, 'resent', m.email, '', client(req));
      return { ok: true };
    },
    'managers.list': function (req) {
      Auth.owner(req.session);
      return Store.rows('managers').map(me);
    },
    'managers.add': function (req) {
      Auth.owner(req.session);
      var email = lower(req.email);
      if (!SignCore.isEmail(email)) throw fail_('BAD_EMAIL');
      if (Store.manager(email)) throw fail_('ALREADY_MANAGER');
      Store.saveManager({ email: email, name: SignCore.sanitizeValue(req.name, 120),
        title: SignCore.sanitizeValue(req.title, 120), role: 'manager', added_at: now() });
      return { ok: true };
    },
    'managers.remove': function (req) {
      var o = Auth.owner(req.session);
      var email = lower(req.email);
      if (email === o.email) throw fail_('OWNER_STAYS');
      Store.removeManager(email);
      return { ok: true };
    },
    'admin.selfTest': function (req) { Auth.owner(req.session); return { report: selfTest() }; },
    'recipient.open': function (req) {
      var rec = openRec(req);
      var t = template(rec.template);
      return { status: rec.status, number: rec.number, title_en: t.title_en, title_fr: t.title_fr,
        recipient_name: rec.recipient_name, sentTo: mask(rec.recipient_email), expires_at: rec.expires_at };
    },
    'recipient.requestCode': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'sent' && rec.status !== 'opened') throw fail_('BAD_STATE', { status: rec.status });
      Mail.code(rec.recipient_email, Auth.issueCode('recipient', rec.number));
      Store.log(rec.number, 'code sent', rec.recipient_email, '', client(req));
      return { sentTo: mask(rec.recipient_email) };
    },
    'recipient.verifyCode': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'sent' && rec.status !== 'opened') throw fail_('BAD_STATE', { status: rec.status });
      Auth.checkCode('recipient', rec.number, req.code);
      var t = template(rec.template);
      if (rec.status === 'sent') {
        rec.status = SignCore.transition(rec.status, 'open');
        rec.opened_at = now();
        Store.writeRow('documents', rec);
        quietly(rec.number, 'opened', function () { Mail.notice(rec.manager_email, 'opened', rec, t, pages('index.html')); });
      }
      Store.log(rec.number, 'code confirmed', rec.recipient_email, '', client(req));
      var form = SignCore.sideFields(t.names, 'recipient').map(function (n) {
        return t.fields.filter(function (f) { return f.name === n; })[0];
      });
      return { ticket: Auth.startTicket(rec.number), pdf: Docs.base64Of(rec.sent_pdf_id), form: form,
        values: { recipient_name: rec.recipient_name } };
    },
    'recipient.sign': function (req) {
      var rec0 = openRec(req);
      Auth.checkTicket(rec0.number, req.ticket);
      if (rec0.status === 'completed') return { already: true, number: rec0.number };
      if (req.agree !== true) throw fail_('AGREE_NEEDED');
      var t = template(rec0.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'recipient'));
      var recipientSig = Docs.pngBlob(req.signature, 'recipient-signature.png');
      var c = client(req);
      var out = Store.withLock(function () {
        var rec = Store.findDoc(rec0.number);
        rec.status = SignCore.transition(rec.status, 'sign');
        var dir = Docs.folder(rec.folder_id);
        dir.createFile(recipientSig.copyBlob());
        var company = JSON.parse(rec.fields_json);
        var at = now();
        var values = Object.assign({}, companyValues(t, company, rec.number), clean, {
          company_signed_date: rec.company_signed_at.slice(0, 10), recipient_signed_date: at.slice(0, 10) });
        var companySigFile = company._sig ? DriveApp.getFileById(company._sig) : dir.getFilesByName('company-signature.png').next();
        var sigs = { company_signature: companySigFile.getBlob(),
          recipient_signature: recipientSig };
        var made = Docs.makeSigned(rec, t, values, sigs, {
          title: t.title_en, number: rec.number, checkUrl: pages('check.html'),
          company: { name: company.company_signatory_name || '', title: company.company_signatory_title || '',
            email: rec.manager_email, signedAt: Date.parse(rec.company_signed_at) },
          recipient: { name: clean.recipient_name, email: rec.recipient_email, signedAt: Date.parse(at),
            place: clean.recipient_place || '', ip: c.ip } });
        if (clean.recipient_name !== rec.recipient_name) {
          Store.log(rec.number, 'name corrected', rec.recipient_email, rec.recipient_name + ' -> ' + clean.recipient_name, c);
        }
        rec.recipient_name = clean.recipient_name;
        rec.signed_at = at;
        rec.completed_at = at;
        rec.sha256 = made.sha;
        rec.signed_pdf_id = made.file.getId();
        rec.fields_json = JSON.stringify(Object.assign({}, company, clean));
        Store.writeRow('documents', rec);
        Auth.forgetSecret(rec.number);
        return { rec: rec, made: made };
      });
      Store.log(out.rec.number, 'signed', out.rec.recipient_email, out.rec.sha256, c);
      // one "Signed" e-mail to the recipient with the manager in copy: the PDF is encoded and sent once. The
      // answer stays small (the recipient's phone fetches the PDF only if asked: recipient.download).
      var copy = { name: out.rec.number + ' signed.pdf', type: 'application/pdf', base64: out.made.base64 };
      var mail = Mail.msg.completed(out.rec, t, copy, out.rec.recipient_email, out.rec.manager_email, pages('check.html'));
      if (out.rec.manager_email !== out.rec.recipient_email) mail.opts.cc = out.rec.manager_email;
      var sent = Mail.batch([mail])[0];
      if (sent.error) Store.log(out.rec.number, 'notice failed', 'system', 'signed copies: ' + (sent.error.code || sent.error));
      return { number: out.rec.number };
    },
    // The signed PDF for the recipient who has just signed (the ticket from their e-mail code, valid one hour).
    'recipient.download': function (req) {
      var rec = Store.findDoc(String(req.number || ''));
      if (!rec) throw fail_('LINK_INVALID');
      Auth.checkTicket(rec.number, req.ticket);
      if (rec.status !== 'completed' || !rec.signed_pdf_id) throw fail_('BAD_STATE', { status: rec.status });
      return { name: rec.number + ' signed.pdf', pdf: Docs.base64Of(rec.signed_pdf_id) };
    },
    'recipient.askNewLink': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'expired') throw fail_('BAD_STATE', { status: rec.status });
      var t = template(rec.template);
      Mail.notice(rec.manager_email, 'newLink', rec, t, pages('index.html'));
      Store.log(rec.number, 'new link asked', rec.recipient_email, '', client(req));
      return { asked: true };
    },
    'check.lookup': function (req) {
      var sha = String(req.sha256 || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha)) throw fail_('BAD_REQUEST');
      var rec = Store.findBySha(sha);
      if (!rec || rec.status !== 'completed') return { found: false };
      var t = Store.template(rec.template);
      var f = JSON.parse(rec.fields_json);
      return { found: true, number: rec.number, title_en: t.title_en, title_fr: t.title_fr,
        company: { name: f.company_signatory_name || '', signedAt: rec.company_signed_at },
        recipient: { name: rec.recipient_name, signedAt: rec.signed_at } };
    }
  };

  return { routes: routes, linkFor: linkFor, pages: pages, quietly: quietly };
})();
