// Entry points of the web app. Every request is a POST of JSON { action, ... } sent as text/plain (no pre-flight).
var VERSION = '1.1.1';

function doGet() {
  return json_({ ok: true, data: { service: 'mylestech-sign', version: VERSION } });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (x) {
    return json_({ ok: false, error: 'BAD_REQUEST' });
  }
  try {
    var handler = Api.routes[req.action];
    if (!handler) throw fail_('UNKNOWN_ACTION');
    return json_({ ok: true, data: handler(req) });
  } catch (x) {
    var code = (x && x.code) || 'INTERNAL';
    if (code === 'INTERNAL') console.error(x && x.stack ? x.stack : String(x));
    return json_({ ok: false, error: code, detail: (x && x.detail) || null });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, detail) {
  var e = new Error(code);
  e.code = code;
  e.detail = detail || null;
  return e;
}
