// Filling a template, placing signatures, making the PDFs and the certificate page.
// Text fields are replaced with one replaceText per field (the replacement is taken literally: checked 26 Nov
// with "a$1b\c"). A signature image goes exactly where its field was, and the text after it on the same line keeps
// its formatting. Fields not filled yet become a line of underscores, as in the original document.
//
// Speed (measured 26 Nov): copying a template takes ~2.5 s, so copies are made ahead of time by refillPool()
// (every 10 minutes) and a request takes a ready one; with none ready it makes one as before. Used copies are
// binned later by refillPool() and dailySweep(), not while someone waits.
var Docs = (function () {
  var BLANK = '____________________';
  var SIGNATURE_WIDTH = 160;
  var SIGNATURE_MAX_HEIGHT = 56;
  var POOL_SIZE = 6;

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function folder(id) { return DriveApp.getFolderById(id); }

  function replaceImage(body, field, blob) {
    var found = body.findText(escapeRe('{{' + field + '}}'));
    if (!found) throw fail_('TEMPLATE_FIELD_MISSING', field);
    var t = found.getElement().asText();
    var start = found.getStartOffset();
    var end = found.getEndOffsetInclusive();
    var full = t.getText();
    var tail = full.substring(end + 1);
    var tailAttrs = tail ? t.getAttributes(end + 1) : null;
    var par = t.getParent();
    var idx = par.getChildIndex(t);
    t.deleteText(start, full.length - 1);
    var at = start === 0 ? idx : idx + 1;
    var img = par.insertInlineImage(at, blob);
    var ratio = img.getHeight() / Math.max(1, img.getWidth());
    var w = SIGNATURE_WIDTH;
    var h = Math.round(w * ratio);
    if (h > SIGNATURE_MAX_HEIGHT) { h = SIGNATURE_MAX_HEIGHT; w = Math.round(h / ratio); }
    img.setWidth(w).setHeight(h);
    if (tail) par.insertText(at + 1, tail).setAttributes(tailAttrs);
  }

  // docOrId: an open Document or its id. values: { field: text }, images: { field: PNG blob }. Returns the Document.
  function fill(docOrId, values, images) {
    var doc = typeof docOrId === 'string' ? DocumentApp.openById(docOrId) : docOrId;
    var body = doc.getBody();
    Object.keys(images || {}).forEach(function (f) { if (images[f]) replaceImage(body, f, images[f]); });
    Object.keys(values || {}).forEach(function (f) {
      body.replaceText(escapeRe('{{' + f + '}}'), values[f] == null ? '' : String(values[f]));
    });
    SignCore.templateFields(body.getText()).forEach(function (f) { body.replaceText(escapeRe('{{' + f + '}}'), BLANK); });
    return doc;
  }

  function pdf(doc, name) {
    doc.saveAndClose();
    return DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(name);
  }

  // ---- ready copies ----
  function poolKey(code) { return 'POOL_' + code; }
  function readPool(code) {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(poolKey(code)) || '[]'); } catch (e) { return []; }
  }
  function writePool(code, list) { PropertiesService.getScriptProperties().setProperty(poolKey(code), JSON.stringify(list)); }

  // Runs fn under the script lock, or directly when this request already holds it. A request gives up (null)
  // after 1.5 s rather than wait behind a long signing: a fresh copy is then quicker.
  function underLock(fn, waitMs) {
    if (Store.inLock()) return fn();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(waitMs || 1500)) return null;
    try { return fn(); } finally { lock.releaseLock(); }
  }

  // Taking a copy also notes when it was taken (POOL_USED): the clean-up bins it only 30 minutes later.
  function takeReady(tpl) {
    return underLock(function () {
      var list = readPool(tpl.code);
      var pick = null;
      while (list.length && !pick) { var e = list.shift(); if (e.src === tpl.doc_id) pick = e.id; }
      writePool(tpl.code, list);
      if (pick) writePool('_USED', readPool('_USED').concat([{ id: pick, at: Date.now() }]));
      return pick;
    });
  }

  function openCopy(tpl, name) {
    var id = takeReady(tpl);
    if (id) { try { return DocumentApp.openById(id); } catch (e) { /* gone: make one */ } }
    return DocumentApp.openById(DriveApp.getFileById(tpl.doc_id).makeCopy(name, folder(Store.prop('TMP_ID'))).getId());
  }

  function poolFolder() {
    var id = Store.prop('POOL_ID');
    if (id) { try { return folder(id); } catch (e) { /* removed by hand: make it again */ } }
    var f = folder(Store.prop('ROOT_ID')).createFolder('ready copies');
    Store.setProp('POOL_ID', f.getId());
    return f;
  }

  // Tops every template up to POOL_SIZE ready copies, then bins copies taken more than 30 minutes ago, and
  // strays (an older template version, a lost list) more than 2 hours old. A copy still ready, or taken less
  // than 30 minutes ago, is never touched.
  function refill() {
    var dir = poolFolder();
    var lines = [];
    var keep = {};
    Store.templates().forEach(function (t) {
      var have = readPool(t.code).filter(function (e) { return e.src === t.doc_id; }).length;
      var made = [];
      for (var i = have; i < POOL_SIZE; i++) {
        made.push({ id: DriveApp.getFileById(t.doc_id).makeCopy('ready ' + t.code, dir).getId(), src: t.doc_id });
      }
      var list = underLock(function () {
        var l = readPool(t.code).filter(function (e) { return e.src === t.doc_id; }).concat(made);
        writePool(t.code, l);
        return l;
      }, 20000);
      made.forEach(function (e) { keep[e.id] = true; });
      readPool(t.code).forEach(function (e) { keep[e.id] = true; });
      lines.push(t.code + ': ' + (list ? list.length : have) + ' ready (' + made.length + ' made)');
    });
    var now = Date.now();
    var binned = {};
    var used = {};
    readPool('_USED').forEach(function (e) { used[e.id] = e.at; });
    var files = dir.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var id = f.getId();
      if (keep[id]) continue;
      var old = used[id] ? now - used[id] > 30 * SignCore.MINUTE : now - f.getDateCreated().getTime() > 120 * SignCore.MINUTE;
      if (old) { f.setTrashed(true); binned[id] = true; }
    }
    underLock(function () {
      writePool('_USED', readPool('_USED').filter(function (e) { return !binned[e.id] && now - e.at < 24 * 60 * SignCore.MINUTE; }));
    }, 20000);
    lines.push('used copies binned: ' + Object.keys(binned).length);
    return lines.join('\n');
  }

  function appendCertificate(docId, rows) {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    body.appendPageBreak();
    body.appendParagraph('Signature certificate / Certificat de signature')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var table = body.appendTable(rows);
    table.setBorderColor('#E3E8F2');
    for (var r = 0; r < table.getNumRows(); r++) {
      table.getCell(r, 0).setWidth(170).editAsText().setBold(true).setFontSize(9);
      table.getCell(r, 1).editAsText().setFontSize(9);
    }
    return doc;
  }

  function pngBlob(dataUrl, name) {
    var b64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    if (!b64 || b64.length > 2000000) throw fail_('SIGNATURE_MISSING');
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', name);
  }

  // The PDF the recipient reads: company part and company signature filled, the recipient's part blank.
  function makeSent(rec, tpl, values, companySig) {
    var doc = fill(openCopy(tpl, rec.number + ' draft'), values, { company_signature: companySig });
    return folder(rec.folder_id).createFile(pdf(doc, rec.number + ' sent.pdf'));
  }

  // The signed PDF: every field, both signatures, then the certificate page.
  // Returns { file, sha, agreementSha, base64 } (the base64 serves the e-mails and the answer: encoded once).
  function makeSigned(rec, tpl, values, sigs, cert) {
    var doc = fill(openCopy(tpl, rec.number + ' signing'), values, sigs);
    var id = doc.getId();
    var agreement = pdf(doc, 'agreement.pdf');
    cert.agreementSha256 = Auth.shaBytes(agreement.getBytes());
    var signed = pdf(appendCertificate(id, SignCore.certificateRows(cert)), rec.number + ' signed.pdf');
    var bytes = signed.getBytes();
    var file = folder(rec.folder_id).createFile(signed);
    return { file: file, sha: Auth.shaBytes(bytes), agreementSha: cert.agreementSha256, base64: Utilities.base64Encode(bytes) };
  }

  // A preview for the manager before sending.
  function preview(tpl, values, companySig) {
    var doc = fill(openCopy(tpl, 'preview ' + new Date().toISOString()), values, { company_signature: companySig });
    return Utilities.base64Encode(pdf(doc, 'preview.pdf').getBytes());
  }

  function importTemplate(docxBlob, name) {
    var file = Drive.Files.create({ name: name, mimeType: MimeType.GOOGLE_DOCS, parents: [Store.prop('TEMPLATES_ID')] }, docxBlob);
    return file.id;
  }

  function fieldsOf(docId) { return SignCore.templateFields(DocumentApp.openById(docId).getBody().getText()); }

  function base64Of(fileId) { return Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes()); }

  return {
    fill: fill, pdf: pdf, pngBlob: pngBlob, makeSent: makeSent, makeSigned: makeSigned, preview: preview,
    importTemplate: importTemplate, fieldsOf: fieldsOf, base64Of: base64Of, folder: folder, BLANK: BLANK,
    refill: refill
  };
})();
