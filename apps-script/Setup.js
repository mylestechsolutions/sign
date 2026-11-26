// setup() is the function the owner runs once in the script editor (running it is what makes Google ask for the
// permissions). It makes the Drive folder, the register, the owner's manager row, the NDA template from
// TemplateNda.html, the SES key from Secrets.html (a file that never enters git), and the daily trigger; then it
// runs selfTest() and prints the report.
var NDA_TEMPLATE = {
  code: 'NDA',
  title_en: 'Student Intern Non Disclosure Agreement',
  title_fr: 'Accord de confidentialité du stagiaire étudiant',
  labels: {
    recipient_name: ['Intern full legal name', 'Nom légal complet du stagiaire'],
    recipient_email: ['Intern e-mail', 'E-mail du stagiaire'],
    recipient_address: ['Address', 'Adresse'],
    recipient_school: ['School or university', 'École ou université'],
    recipient_course: ['Course of study', 'Filière'],
    company_role_department: ['Internship role and department', 'Poste et département du stage'],
    company_supervisor: ['Company supervisor', 'Superviseur dans l\'entreprise'],
    company_effective_date: ['Effective date', 'Date d\'entrée en vigueur'],
    company_start_date: ['Internship start date', 'Date de début du stage'],
    company_end_date: ['Internship end date', 'Date de fin du stage'],
    company_work_location: ['Work location', 'Lieu de travail'],
    company_security_contact: ['Security contact name and e-mail', 'Contact sécurité (nom et e-mail)'],
    company_urgent_channel: ['Urgent reporting telephone or channel', 'Téléphone ou canal de signalement urgent'],
    company_signatory_name: ['Signing for the company: name', 'Signataire pour la société : nom'],
    company_signatory_title: ['Signing for the company: title', 'Signataire pour la société : fonction']
  }
};
var TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fieldMeta_(names, labels) {
  var all = names.slice();
  if (all.indexOf('recipient_email') < 0) all.splice(1, 0, 'recipient_email');
  return all.map(function (n) {
    var l = labels[n] || [SignCore.humanLabel(n), SignCore.humanLabel(n)];
    return { name: n, owner: SignCore.fieldOwner(n), kind: SignCore.fieldKind(n), en: l[0], fr: l[1] };
  });
}

function installNda_() {
  var b64 = HtmlService.createHtmlOutputFromFile('TemplateNda').getContent();
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), MimeType.MICROSOFT_WORD, 'Student Intern NDA.docx');
  var docId = Docs.importTemplate(blob, NDA_TEMPLATE.title_en);
  Store.saveTemplate({
    code: NDA_TEMPLATE.code, title_en: NDA_TEMPLATE.title_en, title_fr: NDA_TEMPLATE.title_fr, doc_id: docId,
    fields_json: JSON.stringify(fieldMeta_(Docs.fieldsOf(docId), NDA_TEMPLATE.labels)),
    created_at: new Date().toISOString(), active: 'yes'
  });
}

// Secrets.html holds {"accessKey": ..., "secretKey": ..., "from": ...}; it is pushed once, then removed.
function importSecrets_() {
  var raw;
  try { raw = HtmlService.createHtmlOutputFromFile('Secrets').getContent(); } catch (e) { return 'no Secrets file (kept the key on file)'; }
  var s = JSON.parse(raw);
  if (!s.accessKey || !s.secretKey || !s.from) throw new Error('Secrets.html is incomplete');
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SES_ACCESS_KEY', s.accessKey);
  p.setProperty('SES_SECRET_KEY', s.secretKey);
  p.setProperty('MAIL_FROM', s.from);
  // owners named in the file (for example a company address the owner signs in with), kept out of the public code
  (s.owners || []).forEach(function (email) {
    var e = String(email).toLowerCase();
    if (SignCore.isEmail(e) && !Store.manager(e)) Store.saveManager({ email: e, name: '', title: '', role: 'owner', added_at: new Date().toISOString() });
  });
  return 'SES key loaded (key ending ' + s.accessKey.slice(-4) + ', from ' + s.from + '), owners added: ' + (s.owners || []).length;
}

function setup() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ROOT_ID')) {
    var root = DriveApp.createFolder('MylesTech signing');
    p.setProperty('ROOT_ID', root.getId());
    p.setProperty('TEMPLATES_ID', root.createFolder('templates').getId());
    p.setProperty('DOCS_ID', root.createFolder('documents').getId());
    p.setProperty('SIGS_ID', root.createFolder('signatures').getId());
    p.setProperty('TMP_ID', root.createFolder('tmp').getId());
    p.setProperty('REGISTER_ID', Store.createRegister(root));
    p.setProperty('PAGES_URL', 'https://mylestechsolutions.github.io/sign');
  }
  var secrets = importSecrets_();
  var owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!Store.manager(owner)) {
    Store.saveManager({ email: owner, name: '', title: '', role: 'owner', added_at: new Date().toISOString() });
  }
  if (!Store.template(NDA_TEMPLATE.code)) installNda_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'dailySweep' || h === 'refillPool') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySweep').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('refillPool').timeBased().everyMinutes(10).create();
  var report = secrets + '\n' + selfTest() + '\n' + refillPool();
  console.log(report);
  return report;
}

// Every 10 minutes: keeps ready copies of each template so that a preview, a send or a signature never waits
// for the 2.5 s copy, and bins the used ones (Docs.refill).
function refillPool() {
  return Docs.refill();
}

function selfTest() {
  var lines = [];
  var t = Store.template(NDA_TEMPLATE.code);
  var meta = JSON.parse(t.fields_json);
  var inDoc = meta.filter(function (f) { return f.name !== 'recipient_email'; }).map(function (f) { return f.name; });
  lines.push('template fields: ' + inDoc.length + (inDoc.length === 18 ? ' ok' : ' EXPECTED 18'));
  var copyId = DriveApp.getFileById(t.doc_id).makeCopy('self-test', Docs.folder(Store.prop('TMP_ID'))).getId();
  var values = {};
  inDoc.forEach(function (n) { values[n] = 'TEST ' + n; });
  var sig = Utilities.newBlob(Utilities.base64Decode(TINY_PNG), 'image/png', 'test.png');
  var doc = Docs.fill(copyId, values, { company_signature: sig, recipient_signature: sig.copyBlob() });
  var left = SignCore.templateFields(doc.getBody().getText());
  lines.push('fields left after filling: ' + left.length + (left.length === 0 ? ' ok' : ' ' + left.join(', ')));
  var blob = Docs.pdf(doc, 'self-test.pdf');
  lines.push('pdf: ' + blob.getBytes().length + ' bytes, fingerprint ' + Auth.shaBytes(blob.getBytes()).slice(0, 16));
  DriveApp.getFileById(copyId).setTrashed(true);
  lines.push('managers: ' + Store.rows('managers').length + ', templates: ' + Store.templates().length);
  try { lines.push('mail through SES: ok, message ' + Mail.test()); } catch (e) { lines.push('mail through SES: FAILED ' + ((e && e.code) || e)); }
  return lines.join('\n');
}

function dailySweep() {
  var nowMs = Date.now();
  Store.rows('documents').forEach(function (rec) {
    var act = SignCore.sweepAction({ status: rec.status, sentAt: rec.sent_at, expiresAt: rec.expires_at,
      remindedAt: rec.reminded_at }, nowMs);
    if (act === 'expire') {
      Store.withLock(function () {
        rec.status = SignCore.transition(rec.status, 'expire');
        rec.expired_at = new Date(nowMs).toISOString();
        Store.writeRow('documents', rec);
      });
      Auth.forgetSecret(rec.number);
      Store.log(rec.number, 'expired', 'system');
      Api.quietly(rec.number, 'expired', function () {
        Mail.notice(rec.manager_email, 'expired', rec, Store.template(rec.template), Api.pages('index.html'));
      });
    } else if (act === 'remind') {
      Api.quietly(rec.number, 'reminder', function () {
        Mail.invite(rec, Store.template(rec.template), Api.linkFor(rec), rec.manager_email, true);
        rec.reminded_at = new Date(nowMs).toISOString();
        Store.writeRow('documents', rec);
        Store.log(rec.number, 'reminded', 'system');
      });
    }
  });
  Auth.cleanSessions();
  var files = Docs.folder(Store.prop('TMP_ID')).getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (nowMs - f.getDateCreated().getTime() > SignCore.DAY) f.setTrashed(true);
  }
}
