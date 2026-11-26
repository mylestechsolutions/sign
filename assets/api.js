// The pages' only door to the back end (named Http so that it never reads like the back end's Api).
var Http = (function () {
  function backend() { return (window.SIGN_CONFIG && window.SIGN_CONFIG.backend) || ''; }
  function err(code, detail) {
    var e = new Error(Lang.t('err.' + code, detail || {}));
    e.code = code;
    e.detail = detail || {};
    return e;
  }
  async function call(action, payload, client) {
    var body = JSON.stringify(Object.assign({ action: action, client: client || { browser: navigator.userAgent } }, payload || {}));
    var res;
    try {
      res = await fetch(backend(), { method: 'POST', body: body, redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    } catch (e) { throw err('NETWORK'); }
    var data;
    try { data = await res.json(); } catch (e) { throw err('SERVER'); }
    if (!data.ok) throw err(data.error || 'INTERNAL', data.detail);
    return data.data;
  }
  async function reportedIp() {
    try {
      var c = new AbortController();
      setTimeout(function () { c.abort(); }, 3000);
      var r = await fetch('https://api.ipify.org?format=json', { signal: c.signal });
      return (await r.json()).ip || '';
    } catch (e) { return ''; }
  }
  function bytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function download(b64, name, type) {
    var url = URL.createObjectURL(new Blob([bytes(b64)], { type: type || 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  async function fileBase64(file) {
    var buf = new Uint8Array(await file.arrayBuffer());
    var bin = '';
    for (var i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function toast(message) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span></span><button aria-label="Close">×</button>';
    el.firstChild.textContent = message;
    el.lastChild.onclick = function () { el.remove(); };
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 7000);
  }
  return { call: call, reportedIp: reportedIp, bytes: bytes, download: download, fileBase64: fileBase64, toast: toast };
})();
