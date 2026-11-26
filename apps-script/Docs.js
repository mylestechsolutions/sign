// Filling a template, placing signatures, making the PDFs and the certificate page.
// Text fields are replaced literally (find, delete, insert). A signature image goes exactly where its field was,
// and the text after it on the same line keeps its formatting. Fields not filled yet become a line of
// underscores, as in the original document.
var Docs = (function () {
  var BLANK = '____________________';
  var SIGNATURE_WIDTH = 150;

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function folder(id) { return DriveApp.getFolderById(id); }

  function replaceText(body, field, value) {
    var pattern = escapeRe('{{' + field + '}}');
    var found = body.findText(pattern);
    for (var guard = 0; found && guard < 50; guard++) {
      var t = found.getElement().asText();
      var s = found.getStartOffset();
      t.deleteText(s, found.getEndOffsetInclusive());
      if (value) t.insertText(s, value);
      found = body.findText(pattern);
    }
  }

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
    img.setWidth(SIGNATURE_WIDTH).setHeight(Math.round(SIGNATURE_WIDTH * ratio));
    if (tail) par.insertText(at + 1, tail).setAttributes(tailAttrs);
  }

  // values: { field: text }, images: { field: PNG blob }. Returns the open Document.
  function fill(docId, values, images) {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    Object.keys(images || {}).forEach(function (f) { if (images[f]) replaceImage(body, f, images[f]); });
    Object.keys(values || {}).forEach(function (f) { replaceText(body, f, values[f]); });
    SignCore.templateFields(body.getText()).forEach(function (f) { replaceText(body, f, BLANK); });
    return doc;
  }

  function pdf(doc, name) {
    doc.saveAndClose();
    return DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(name);
  }

  function copyOf(tpl, inFolder, name) {
    return DriveApp.getFileById(tpl.doc_id).makeCopy(name, inFolder).getId();
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
    var dir = folder(rec.folder_id);
    var copyId = copyOf(tpl, dir, rec.number + ' draft');
    var file = dir.createFile(pdf(fill(copyId, values, { company_signature: companySig }), rec.number + ' sent.pdf'));
    DriveApp.getFileById(copyId).setTrashed(true);
    return file;
  }

  // The signed PDF: every field, both signatures, then the certificate page. Returns { file, sha, agreementSha }.
  function makeSigned(rec, tpl, values, sigs, cert) {
    var dir = folder(rec.folder_id);
    var copyId = copyOf(tpl, dir, rec.number + ' signing');
    var agreement = pdf(fill(copyId, values, sigs), 'agreement.pdf');
    cert.agreementSha256 = Auth.shaBytes(agreement.getBytes());
    var signed = pdf(appendCertificate(copyId, SignCore.certificateRows(cert)), rec.number + ' signed.pdf');
    var file = dir.createFile(signed);
    DriveApp.getFileById(copyId).setTrashed(true);
    return { file: file, sha: Auth.shaBytes(file.getBlob().getBytes()), agreementSha: cert.agreementSha256 };
  }

  // A throw-away preview for the manager before sending.
  function preview(tpl, values, companySig) {
    var tmp = folder(Store.prop('TMP_ID'));
    var copyId = copyOf(tpl, tmp, 'preview ' + new Date().toISOString());
    var blob = pdf(fill(copyId, values, { company_signature: companySig }), 'preview.pdf');
    DriveApp.getFileById(copyId).setTrashed(true);
    return Utilities.base64Encode(blob.getBytes());
  }

  function importTemplate(docxBlob, name) {
    var file = Drive.Files.create({ name: name, mimeType: MimeType.GOOGLE_DOCS, parents: [Store.prop('TEMPLATES_ID')] }, docxBlob);
    return file.id;
  }

  function fieldsOf(docId) { return SignCore.templateFields(DocumentApp.openById(docId).getBody().getText()); }

  function base64Of(fileId) { return Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes()); }

  return {
    fill: fill, pdf: pdf, pngBlob: pngBlob, makeSent: makeSent, makeSigned: makeSigned, preview: preview,
    importTemplate: importTemplate, fieldsOf: fieldsOf, base64Of: base64Of, folder: folder, BLANK: BLANK
  };
})();
