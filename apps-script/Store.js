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

  // Speed (measured 26 Nov: each settings read ~80 ms, opening the register ~270 ms, each tab read ~400 ms):
  // within one request every setting, the register and each tab are read once; the two small tabs that rarely
  // change (managers, templates) are also kept in the script cache between requests, under a version number that
  // every write moves on, so a stale copy is never read back.
  var propMemo = {};
  var tabMemo = {};
  var bookMemo = null;
  var lockHeld = false;
  var SHARED = { managers: true, templates: true };

  function props() { return PropertiesService.getScriptProperties(); }
  function prop(k) {
    if (!Object.prototype.hasOwnProperty.call(propMemo, k)) propMemo[k] = props().getProperty(k);
    return propMemo[k];
  }
  function setProp(k, v) { props().setProperty(k, String(v)); propMemo[k] = String(v); }
  function delProp(k) { props().deleteProperty(k); propMemo[k] = null; }

  function book() {
    if (bookMemo) return bookMemo;
    var id = prop('REGISTER_ID');
    if (!id) throw fail_('NOT_SET_UP');
    bookMemo = SpreadsheetApp.openById(id);
    return bookMemo;
  }
  function tab(name) { return book().getSheetByName(name); }

  function valuesOf(name) {
    if (tabMemo[name]) return tabMemo[name];
    var key = SHARED[name] ? 'tab:' + name + ':' + (props().getProperty('V_' + name) || '0') : '';
    if (key) {
      var hit = CacheService.getScriptCache().get(key);
      if (hit) { tabMemo[name] = JSON.parse(hit); return tabMemo[name]; }
    }
    var v = tab(name).getDataRange().getValues().map(function (row) {
      return row.map(function (c) { return c == null ? '' : String(c); });
    });
    tabMemo[name] = v;
    if (key) { try { CacheService.getScriptCache().put(key, JSON.stringify(v), 21600); } catch (e) { /* too big: read the sheet */ } }
    return v;
  }
  function changed(name) {
    delete tabMemo[name];
    if (SHARED[name]) props().setProperty('V_' + name, String(Date.now()));
  }

  function rows(name) {
    var cols = TABS[name];
    var values = valuesOf(name);
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
    changed(name);
    return obj;
  }

  // Inside the lock everything is read afresh (another request may have just written). Taking the lock again
  // from inside it runs the code directly: releasing it from the inside would end the outer protection.
  function withLock(fn) {
    if (lockHeld) return fn();
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    lockHeld = true;
    propMemo = {};
    tabMemo = {};
    try { return fn(); } finally { lockHeld = false; lock.releaseLock(); }
  }
  function inLock() { return lockHeld; }

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
    changed('log');
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
    if (m) { tab('managers').deleteRow(m._row); changed('managers'); }
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
    prop: prop, setProp: setProp, delProp: delProp, rows: rows, writeRow: writeRow, withLock: withLock, inLock: inLock,
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
