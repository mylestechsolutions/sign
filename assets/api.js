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
    if (!backend() || backend().indexOf('DEPLOYMENT_ID') >= 0) throw err('NOT_READY');
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
  // Shows a spinner on the button and ignores further clicks while fn runs.
  async function busy(button, fn) {
    if (!button || button.classList.contains('busy')) return undefined;
    button.classList.add('busy');
    button.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { button.classList.remove('busy'); button.removeAttribute('aria-busy'); }
  }
  // Wakes the back end while the page is being read, so the first real click does not pay the start-up.
  function warm() {
    if (!backend() || backend().indexOf('DEPLOYMENT_ID') >= 0) return;
    fetch(backend(), { mode: 'no-cors' }).catch(function () { /* only a wake-up */ });
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
  // Asks before an action that cannot be taken back. Resolves true only on the action's own button; Cancel, the
  // close button and Escape all resolve false. The close button comes first, so it has the focus: Enter never
  // confirms by accident.
  function ask(text, okLabel, tone) {
    var d = document.getElementById('confirm');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'confirm';
      d.innerHTML = '<button class="x" aria-label="Close">&times;</button><p id="confirm-text"></p>' +
        '<div class="actions"><button class="pill" id="confirm-ok"></button><button class="pill" id="confirm-no"></button></div>';
      document.body.appendChild(d);
    }
    var ok = d.querySelector('#confirm-ok');
    var no = d.querySelector('#confirm-no');
    d.querySelector('#confirm-text').textContent = text;
    ok.textContent = okLabel;
    ok.className = 'pill ' + (tone || 'red');
    no.textContent = Lang.t('ui.cancel');
    return new Promise(function (resolve) {
      function done(yes) { d.onclose = null; if (d.open) d.close(); resolve(yes); }
      ok.onclick = function () { done(true); };
      no.onclick = function () { done(false); };
      d.querySelector('.x').onclick = function () { done(false); };
      d.onclose = function () { done(false); };
      d.showModal();
    });
  }
  // What a screen's inputs hold, to tell whether leaving it would throw entries away.
  function entries(root) {
    return Array.prototype.map.call(root.querySelectorAll('input'), function (i) {
      return i.type === 'checkbox' ? String(i.checked) : i.type === 'file' ? String(i.files.length) : i.value;
    }).join('\u0000');
  }
  // Closing or reloading the tab asks first (the browser's own question) while unsaved() is true.
  function guardLeave(unsaved) {
    window.addEventListener('beforeunload', function (e) {
      if (unsaved()) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  return { call: call, reportedIp: reportedIp, bytes: bytes, download: download, fileBase64: fileBase64, toast: toast,
    busy: busy, warm: warm, ask: ask, entries: entries, guardLeave: guardLeave };
})();
