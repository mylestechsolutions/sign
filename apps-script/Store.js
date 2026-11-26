// The register (a Google Sheet with four tabs) and the script's private settings.
// Values are written as text (number format @) so that Sheets never turns ISO times into dates.
var Store = (function () {
  var TABS = {
    documents: ['number', 'template', 'status', 'manager_email', 'recipient_name', 'recipient_email',
      'created_at', 'sent_at', 'opened_at', 'signed_at', 'completed_at', 'withdrawn_at', 'expired_at',
      'expires_at', 'reminded_at', 'company_signed_at', 'folder_id', 'sent_pdf_id', 'signed_pdf_id',
      'sha256', 'secret_hash', 'fields_json'],
    log: ['time', 'number', 'event', 'actor', 'detail', 'browser', 'reported_ip'],
    managers: ['email', 'name', 'title', 'role', 'added_at', 'signature_file_id'],
    templates: ['code', 'title_en', 'title_fr', 'doc_id', 'fields_json', 'created_at', 'active']
  };

  function props() { return PropertiesService.getScriptProperties(); }
  function prop(k) { return props().getProperty(k); }
  function setProp(k, v) { props().setProperty(k, String(v)); }
  function delProp(k) { props().deleteProperty(k); }

  function book() {
    var id = prop('REGISTER_ID');
    if (!id) throw fail_('NOT_SET_UP');
    return SpreadsheetApp.openById(id);
  }
  function tab(name) { return book().getSheetByName(name); }

  function rows(name) {
    var cols = TABS[name];
    var values = tab(name).getDataRange().getValues();
    var out = [];
    for (var i = 1; i < values.length; i++) {
      if (values[i].join('') === '') continue;
      var o = { _row: i + 1 };
      for (var c = 0; c < cols.length; c++) o[cols[c]] = values[i][c] == null ? '' : String(values[i][c]);
      out.push(o);
    }
    return out;
  }

  function put(sheet, row, line) {
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 200);
    sheet.getRange(row, 1, 1, line.length).setNumberFormat('@').setValues([line]);
  }

  function writeRow(name, obj) {
    var cols = TABS[name];
    var line = cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); });
    var sheet = tab(name);
    if (!obj._row) obj._row = sheet.getLastRow() + 1;
    put(sheet, obj._row, line);
    return obj;
  }

  function withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return fn(); } finally { lock.releaseLock(); }
  }

  function findIn(name, col, value) {
    var all = rows(name);
    for (var i = 0; i < all.length; i++) if (all[i][col] === value) return all[i];
    return null;
  }

  function nextNumber(code) {  // call inside withLock
    var year = new Date().getUTCFullYear();
    var key = 'SEQ_' + code + '_' + year;
    var n = Number(prop(key) || '0') + 1;
    setProp(key, n);
    return SignCore.documentNumber(code, year, n);
  }

  function log(number, event, actor, detail, client) {
    var sheet = tab('log');
    put(sheet, sheet.getLastRow() + 1, [new Date().toISOString(), number || '', event, actor || '',
      detail || '', (client && client.browser) || '', (client && client.ip) || '']);
  }

  // The steps of the documents whose numbers are in the set (an object used as a set), newest first.
  function steps(numbers, limit) {
    var out = rows('log').filter(function (r) { return r.number && numbers[r.number]; });
    out.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    return limit ? out.slice(0, limit) : out;
  }

  function manager(email) { return findIn('managers', 'email', String(email || '').toLowerCase()); }

  function removeManager(email) {
    var m = manager(email);
    if (m) tab('managers').deleteRow(m._row);
    return !!m;
  }

  function templates() { return rows('templates').filter(function (t) { return t.active === 'yes'; }); }

  function createRegister(folder) {
    var ss = SpreadsheetApp.create('Signing register');
    Object.keys(TABS).forEach(function (name, i) {
      var sheet = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
      var cols = TABS[name];
      sheet.getRange(1, 1, sheet.getMaxRows(), cols.length).setNumberFormat('@');
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    return ss.getId();
  }

  return {
    prop: prop, setProp: setProp, delProp: delProp, rows: rows, writeRow: writeRow, withLock: withLock,
    findDoc: function (n) { return findIn('documents', 'number', n); },
    findBySha: function (s) { return findIn('documents', 'sha256', s); },
    nextNumber: nextNumber, log: log, steps: steps, manager: manager, removeManager: removeManager,
    saveManager: function (m) { m.email = String(m.email).toLowerCase(); return writeRow('managers', m); },
    templates: templates,
    template: function (code) { return findIn('templates', 'code', code); },
    saveTemplate: function (t) { return writeRow('templates', t); },
    createRegister: createRegister
  };
})();
