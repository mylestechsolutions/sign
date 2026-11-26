import { showPdf } from './pdfview.js';

const $ = (s) => document.querySelector(s);
const state = { session: localStorage.getItem('mts.session') || '', me: null, templates: [], pad: null, typeMode: false,
  pending: [], draft: null };
const HOME = 'mts.home';  // the last start screen, shown at once on the next visit, then refreshed
const VIEWS = ['signin', 'home', 'compose', 'managers'];

function show(id) { VIEWS.forEach((v) => $('#' + v).classList.toggle('hidden', v !== id)); }
function bi(el, en, fr) { el.dataset.en = en; el.dataset.fr = fr; el.textContent = Lang.get() === 'fr' ? fr : en; return el; }
function errorIn(sel, e) { $(sel).textContent = e ? e.message : ''; }
function titleOf(t) { return Lang.get() === 'fr' ? t.title_fr : t.title_en; }
function when(iso) { return iso ? SignCore.formatUtc(Date.parse(iso)) : ''; }

function cachedHome() { try { return JSON.parse(localStorage.getItem(HOME) || 'null'); } catch (e) { return null; } }
function saveHome(h) { try { localStorage.setItem(HOME, JSON.stringify(h)); } catch (e) { /* storage full: no shortcut next time */ } }
function forget() { localStorage.removeItem('mts.session'); localStorage.removeItem(HOME); state.session = ''; state.templates = []; }

async function call(action, payload) {
  try {
    return await Http.call(action, Object.assign({ session: state.session }, payload || {}));
  } catch (e) {
    if (e.code === 'SIGN_IN') { forget(); renderSignin(); }
    throw e;
  }
}

async function templates() {
  if (!state.templates.length) state.templates = await call('templates.list');
  return state.templates;
}

function closeOnX(dialog) { dialog.querySelector('.x').onclick = () => dialog.close(); }
function confirmBox(text, okLabel, tone) {
  const d = $('#confirm');
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  $('#confirm-ok').className = 'pill ' + (tone || 'red');
  $('#confirm-no').textContent = Lang.get() === 'fr' ? 'Annuler' : 'Cancel';
  return new Promise((resolve) => {
    $('#confirm-ok').onclick = () => { d.close(); resolve(true); };
    $('#confirm-no').onclick = () => { d.close(); resolve(false); };
    d.querySelector('.x').onclick = () => { d.close(); resolve(false); };
    d.showModal();
  });
}

function renderSignin() {
  show('signin');
  $('#signin').innerHTML = `
    <h1 data-i18n="signin.title"></h1><p class="muted" data-i18n="signin.lead"></p>
    <label class="field"><span data-i18n="signin.email"></span><input id="si-email" type="email" autocomplete="email"></label>
    <div class="actions"><button class="pill blue" id="si-send" data-i18n="signin.send"></button></div>
    <div id="si-step2" class="hidden">
      <p class="muted" data-i18n="signin.sent"></p>
      <label class="field"><span data-i18n="signin.code"></span>
        <input id="si-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
      <div class="actions"><button class="pill blue" id="si-go" data-i18n="signin.go"></button></div>
    </div>
    <p class="error" id="si-error"></p>`;
  Lang.apply($('#signin'));
  $('#si-send').onclick = () => Http.busy($('#si-send'), async () => {
    errorIn('#si-error');
    try { await Http.call('manager.requestCode', { email: $('#si-email').value }); $('#si-step2').classList.remove('hidden'); $('#si-code').focus(); }
    catch (e) { errorIn('#si-error', e); }
  });
  $('#si-go').onclick = () => Http.busy($('#si-go'), async () => {
    errorIn('#si-error');
    try {
      const r = await Http.call('manager.verifyCode', { email: $('#si-email').value, code: $('#si-code').value });
      localStorage.removeItem(HOME);
      state.session = r.session; state.me = r.me; localStorage.setItem('mts.session', r.session);
      renderHome();
    } catch (e) { errorIn('#si-error', e); }
  });
}

async function renderHome() {
  show('home');
  const owner = state.me.role === 'owner';
  $('#home').innerHTML = `<div class="card">
      <div class="spread">
        <h1 data-i18n="console.title"></h1>
        <div class="actions" style="margin:0">
          <button class="pill blue" id="h-new" data-i18n="console.new"></button>
          <button class="pill" id="h-export" data-i18n="console.export"></button>
          ${owner ? '<button class="pill" id="h-managers" data-i18n="console.managers"></button>' : ''}
          <button class="pill" id="h-out" data-i18n="console.signout"></button>
        </div>
      </div>
      <div class="filters">
        <label class="field"><input id="h-q" type="search" data-i18n-ph="console.search"></label>
        <label class="field"><select id="h-type" aria-label="Type"></select></label>
      </div>
      <div class="list" id="h-list"></div>
    </div>
    <details class="card lift fold" open id="h-activity"><summary><span data-i18n="console.activity"></span><span class="badge fresh hidden" id="h-fresh"></span></summary>
      <ul class="feed" id="h-feed" style="margin-top:12px"></ul></details>`;
  Lang.apply($('#home'));
  if (matchMedia('(max-width: 640px)').matches) $('#h-activity').open = false;
  const sel = $('#h-type');
  sel.innerHTML = `<option value="">${Lang.t('console.allTypes')}</option>`;
  $('#h-new').onclick = renderCompose;
  if (owner) $('#h-managers').onclick = () => Http.busy($('#h-managers'), renderManagers);
  $('#h-out').onclick = () => Http.busy($('#h-out'), async () => {
    try { await call('manager.signOut'); } catch (e) { /* signed out anyway */ }
    forget(); renderSignin();
  });
  $('#h-export').onclick = () => Http.busy($('#h-export'), async () => {
    try {
      const r = await call('documents.export', { type: sel.value });
      Http.download(r.zip, r.name, 'application/zip');
      Http.toast(Lang.t('console.exported', { n: r.documents }));
    } catch (e) { Http.toast(e.message); }
  });
  let timer;
  const reload = () => { clearTimeout(timer); timer = setTimeout(() => loadList(), 300); };
  $('#h-q').oninput = reload;
  sel.onchange = () => loadList();
  const cached = cachedHome();
  if (cached) paintHome(cached, false);
  else $('#h-list').innerHTML = `<p class="loading">${Lang.t('busy.loading')}</p>`;
  await refreshHome();
}

// The whole start screen in one request, painted over what was shown from memory.
async function refreshHome() {
  if ($('#home').classList.contains('hidden') || !state.session) return;
  const filtered = $('#h-q').value || $('#h-type').value;
  try {
    const h = await call('console.home', { since: localStorage.getItem('mts.seen') || '', query: $('#h-q').value, type: $('#h-type').value });
    if (!filtered) saveHome(h);
    if (!$('#home').classList.contains('hidden')) paintHome(h, true);
  } catch (e) { if (e.code !== 'SIGN_IN') Http.toast(e.message); }
}

function paintHome(h, fresh) {
  state.me = h.me || state.me;
  state.templates = h.templates || state.templates;
  const sel = $('#h-type');
  const chosen = sel.value;
  sel.innerHTML = `<option value="">${Lang.t('console.allTypes')}</option>`;
  state.templates.forEach((t) => { const o = document.createElement('option'); o.value = t.code; bi(o, t.title_en, t.title_fr); sel.appendChild(o); });
  sel.value = chosen;
  renderRows(h.documents || []);
  const feed = $('#h-feed');
  feed.innerHTML = '';
  const a = h.activity || { items: [], fresh: 0 };
  a.items.forEach((i) => feed.appendChild(feedItem(i.time, i.number + ' · ' + Lang.event(i.event) + (i.actor ? ' · ' + i.actor : ''))));
  $('#h-fresh').classList.toggle('hidden', !(fresh && a.fresh));
  if (fresh && a.fresh) $('#h-fresh').textContent = Lang.t('console.fresh', { n: a.fresh });
  if (fresh && a.items[0]) localStorage.setItem('mts.seen', a.items[0].time);
}

async function loadList() {
  try { renderRows(await call('documents.list', { query: $('#h-q').value, type: $('#h-type').value })); }
  catch (e) { if (e.code !== 'SIGN_IN') Http.toast(e.message); }
}

// Documents still being sent from this page come first, marked "Sending".
function renderRows(rows) {
  const list = $('#h-list');
  const pending = state.pending.map((p) => ({ pending: true, number: '', template: p.template, status: 'sending',
    recipient_name: p.name, recipient_email: p.email }));
  const all = pending.concat(rows);
  list.innerHTML = all.length ? '' : `<p class="muted">${Lang.t('console.empty')}</p>`;
  const tpls = state.templates;
  all.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'row' + (r.pending ? ' pending' : '');
    el.innerHTML = `<div><strong></strong><div class="muted"></div></div>
      <div class="actions" style="margin:0"><span class="badge ${r.status}"></span></div>`;
    const t = tpls.find((x) => x.code === r.template);
    el.querySelector('strong').textContent = r.recipient_name + (r.number ? ' (' + r.number + ')' : '');
    el.querySelector('.muted').textContent = (t ? titleOf(t) + ' · ' : '') + r.recipient_email +
      (r.pending ? '' : ' · ' + (r.completed_at || r.sent_at).slice(0, 10));
    el.querySelector('.badge').textContent = Lang.t('status.' + r.status);
    if (!r.pending) {
      const acts = el.querySelector('.actions');
      const btn = (key, cls, fn) => { const b = document.createElement('button'); b.className = 'pill small ' + cls;
        b.textContent = Lang.t(key); b.onclick = () => fn(b); acts.appendChild(b); };
      btn('doc.download', '', (b) => Http.busy(b, async () => {
        try { const d = await call('documents.download', { number: r.number }); Http.download(d.pdf, d.name); } catch (e) { Http.toast(e.message); }
      }));
      btn('doc.history', '', () => openHistory(r));
      if (['sent', 'opened', 'expired'].includes(r.status)) {
        btn('doc.resend', '', async (b) => {
          if (!(await confirmBox(Lang.t('doc.confirmResend', { name: r.recipient_name }), Lang.t('doc.resend'), 'blue'))) return;
          await Http.busy(b, async () => {
            try { await call('documents.resend', { number: r.number }); Http.toast(Lang.t('new.sent', { number: r.number })); loadList(); }
            catch (e) { Http.toast(e.message); }
          });
        });
      }
      if (['sent', 'opened'].includes(r.status)) {
        btn('doc.withdraw', 'red', async (b) => {
          if (!(await confirmBox(Lang.t('doc.confirmWithdraw'), Lang.t('doc.withdraw')))) return;
          await Http.busy(b, async () => {
            try { await call('documents.withdraw', { number: r.number }); loadList(); } catch (e) { Http.toast(e.message); }
          });
        });
      }
    }
    list.appendChild(el);
  });
}

function feedItem(time, text) {
  const li = document.createElement('li');
  li.innerHTML = '<time></time><span></span>';
  li.firstChild.textContent = when(time);
  li.lastChild.textContent = text;
  return li;
}

async function openHistory(r) {
  const d = $('#history');
  closeOnX(d);
  $('#history-title').textContent = r.recipient_name + ' (' + r.number + ')';
  const list = $('#history-list');
  list.innerHTML = `<p class="loading">${Lang.t('busy.loading')}</p>`;
  d.showModal();
  try {
    const steps = await call('documents.history', { number: r.number });
    list.innerHTML = '';
    steps.forEach((s) => list.appendChild(feedItem(s.time, Lang.event(s.event) + (s.actor ? ' · ' + s.actor : ''))));
  } catch (e) { list.innerHTML = ''; list.appendChild(feedItem('', e.message)); }
}

function inputFor(f, value) {
  const label = document.createElement('label');
  label.className = 'field';
  label.appendChild(bi(document.createElement('span'), f.en, f.fr));
  const input = document.createElement('input');
  input.name = f.name;
  input.type = f.kind === 'date' ? 'date' : f.kind === 'email' ? 'email' : 'text';
  input.value = value || '';
  label.appendChild(input);
  return label;
}

function collect(root) {
  const v = {};
  root.querySelectorAll('input[name]').forEach((i) => { v[i.name] = i.value; });
  return v;
}

async function renderCompose() {
  show('compose');
  const tpls = await templates();
  $('#compose').innerHTML = `
    <div class="card"><button class="x" id="c-close" aria-label="Close">&times;</button>
      <h1 data-i18n="new.title"></h1>
      <label class="field" style="max-width:420px"><span data-i18n="console.type"></span><select id="c-type"></select></label></div>
    <div class="card lift"><h2 data-i18n="new.recipient"></h2><div class="grid" id="c-recipient"></div></div>
    <details class="card lift fold" open><summary data-i18n="new.company"></summary><div class="grid" id="c-company" style="margin-top:14px"></div></details>
    <div class="card lift"><h2 data-i18n="new.sign"></h2>
      <label class="field ${state.me.hasSignature ? '' : 'hidden'}"><input type="checkbox" id="c-saved" ${state.me.hasSignature ? 'checked' : ''}><span data-i18n="new.useSaved"></span></label>
      <div id="c-padwrap">
        <canvas class="pad" id="c-pad"></canvas>
        <input id="c-typed" class="hidden" data-i18n-ph="pad.typed">
        <div class="actions"><button class="pill" id="c-clear" data-i18n="pad.clear"></button>
          <button class="pill" id="c-mode" data-i18n="pad.type"></button></div>
        <label class="field" style="margin-top:12px"><input type="checkbox" id="c-remember"><span data-i18n="new.save"></span></label>
      </div>
    </div>
    <div class="card"><div class="actions" style="margin:0">
      <button class="pill" id="c-preview" data-i18n="new.preview"></button>
      <button class="pill blue large" id="c-send" data-i18n="new.send"></button></div>
      <p class="why" id="c-why"></p><p class="error" id="c-error"></p></div>`;
  const sel = $('#c-type');
  tpls.forEach((t) => { const o = document.createElement('option'); o.value = t.code; bi(o, t.title_en, t.title_fr); sel.appendChild(o); });
  sel.value = state.draft && tpls.some((t) => t.code === state.draft.template) ? state.draft.template
    : tpls.some((t) => t.code === 'NDA') ? 'NDA' : (tpls[0] && tpls[0].code);
  Lang.apply($('#compose'));
  if (matchMedia('(max-width: 640px)').matches) $('#compose details.fold').open = false;
  state.pad = SignaturePad($('#c-pad'));
  state.typeMode = false;
  const current = () => tpls.find((t) => t.code === sel.value);
  const usingSaved = () => state.me.hasSignature && $('#c-saved').checked;
  const fieldsFor = (keep) => {
    const t = current();
    $('#c-recipient').innerHTML = '';
    $('#c-company').innerHTML = '';
    t.fields.filter((f) => f.name === 'recipient_name' || f.name === 'recipient_email')
      .forEach((f) => $('#c-recipient').appendChild(inputFor(f, keep[f.name])));
    const defaults = Object.assign({ company_signatory_name: state.me.name, company_signatory_title: state.me.title }, keep);
    t.fields.filter((f) => f.owner === 'company').forEach((f) => $('#c-company').appendChild(inputFor(f, defaults[f.name])));
  };
  const update = () => {
    const t = current();
    $('#c-padwrap').classList.toggle('hidden', usingSaved());
    const r = SignCore.validateFields(t.fields.map((f) => f.name), collect($('#compose')), 'company');
    const need = r.missing.concat(r.invalid).map((n) => { const f = t.fields.find((x) => x.name === n);
      return f ? (Lang.get() === 'fr' ? f.fr : f.en) : n; });
    if (!usingSaved() && state.pad.isEmpty()) need.push(Lang.t('need.signature'));
    $('#c-send').disabled = need.length > 0;
    $('#c-preview').disabled = need.length > 0;
    $('#c-why').textContent = need.length ? Lang.t('need', { list: need.join(', ') }) : '';
  };
  fieldsFor(state.draft && state.draft.template === sel.value ? state.draft.values : {});
  sel.onchange = () => { fieldsFor(collect($('#compose'))); update(); };
  $('#compose').addEventListener('input', update);
  $('#c-saved').onchange = update;
  state.pad.onChange(update);
  $('#c-clear').onclick = () => { state.pad.clear(); $('#c-typed').value = ''; };
  $('#c-mode').onclick = () => {
    state.typeMode = !state.typeMode;
    $('#c-typed').classList.toggle('hidden', !state.typeMode);
    $('#c-mode').textContent = Lang.t(state.typeMode ? 'pad.draw' : 'pad.type');
    state.pad.clear();
  };
  $('#c-typed').oninput = () => state.pad.typed($('#c-typed').value);
  $('#c-close').onclick = renderHome;
  const payload = () => ({ template: sel.value, values: collect($('#compose')),
    signature: usingSaved() ? '' : state.pad.png(), saveSignature: !usingSaved() && $('#c-remember').checked });
  $('#c-preview').onclick = () => Http.busy($('#c-preview'), async () => {
    errorIn('#c-error');
    const d = $('#viewer'); closeOnX(d);
    $('#viewer-pages').innerHTML = `<p class="loading">${Lang.t('busy.preview')}</p>`;
    d.showModal();
    try {
      const r = await call('documents.preview', payload());
      if (d.open) await showPdf($('#viewer-pages'), Http.bytes(r.pdf));
    } catch (e) { d.close(); errorIn('#c-error', e); }
  });
  // Sign and send returns to the list at once with the document marked "Sending"; the server finishes in the
  // background (about 6 s) and the list then shows its number. If it fails, the entries stay in New document.
  $('#c-send').onclick = () => {
    errorIn('#c-error');
    const p = payload();
    const job = { template: p.template, name: p.values.recipient_name, email: p.values.recipient_email };
    state.draft = { template: p.template, values: p.values };
    state.pending.push(job);
    renderHome();
    call('documents.send', p).then((r) => {
      state.draft = null;
      if (r.me) state.me = r.me;
      Http.toast(Lang.t('new.sent', { number: r.number }));
    }).catch((e) => {
      if (e.code !== 'SIGN_IN') Http.toast(Lang.t('new.failed', { reason: e.message }));
    }).finally(() => {
      state.pending = state.pending.filter((x) => x !== job);
      refreshHome();
    });
  };
  update();
}

async function renderManagers() {
  show('managers');
  const rows = await call('managers.list');
  $('#managers').innerHTML = `<div class="card"><button class="x" id="m-close" aria-label="Close">&times;</button>
      <h1 data-i18n="console.managers"></h1><div class="list" id="m-list"></div>
      <h2 style="margin-top:18px" data-i18n="managers.add"></h2>
      <div class="grid">
        <label class="field"><span data-i18n="signin.email"></span><input id="m-email" type="email"></label>
        <label class="field"><span data-i18n="managers.name"></span><input id="m-name"></label>
        <label class="field"><span data-i18n="managers.title"></span><input id="m-title"></label></div>
      <div class="actions"><button class="pill blue" id="m-add" data-i18n="managers.add"></button></div>
      <p class="error" id="m-error"></p></div>
    <div class="card lift"><h2 data-i18n="templates.title"></h2><p class="muted" data-i18n="templates.lead"></p>
      <div class="list" id="t-list"></div>
      <div class="grid" style="margin-top:14px">
        <label class="field"><span data-i18n="templates.file"></span><input id="t-file" type="file" accept=".docx"></label>
        <label class="field"><span data-i18n="templates.code"></span><input id="t-code" maxlength="8"></label>
        <label class="field"><span data-i18n="templates.titleEn"></span><input id="t-en"></label>
        <label class="field"><span data-i18n="templates.titleFr"></span><input id="t-fr"></label></div>
      <div class="actions"><button class="pill blue" id="t-upload" data-i18n="templates.upload"></button></div>
      <p class="error" id="t-error"></p></div>`;
  Lang.apply($('#managers'));
  rows.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = '<div><strong></strong><div class="muted"></div></div>';
    el.querySelector('strong').textContent = (m.name || m.email) + (m.role === 'owner' ? ' (owner)' : '');
    el.querySelector('.muted').textContent = m.email;
    if (m.role !== 'owner') {
      const b = document.createElement('button');
      b.className = 'pill small red';
      b.textContent = Lang.t('managers.remove');
      b.onclick = async () => {
        if (!(await confirmBox(Lang.t('managers.confirmRemove', { email: m.email }), Lang.t('managers.remove')))) return;
        await Http.busy(b, async () => { try { await call('managers.remove', { email: m.email }); await renderManagers(); } catch (e) { errorIn('#m-error', e); } });
      };
      el.appendChild(b);
    }
    $('#m-list').appendChild(el);
  });
  (await templates()).forEach((t) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = '<div><strong></strong><div class="muted"></div></div>';
    bi(el.querySelector('strong'), t.title_en, t.title_fr);
    el.querySelector('.muted').textContent = t.code + ' · ' + t.fields.length + ' fields';
    $('#t-list').appendChild(el);
  });
  $('#m-add').onclick = () => Http.busy($('#m-add'), async () => {
    try { await call('managers.add', { email: $('#m-email').value, name: $('#m-name').value, title: $('#m-title').value }); await renderManagers(); }
    catch (e) { errorIn('#m-error', e); }
  });
  $('#t-upload').onclick = () => Http.busy($('#t-upload'), async () => {
    errorIn('#t-error');
    const file = $('#t-file').files[0];
    if (!file) { errorIn('#t-error', { message: Lang.t('templates.file') }); return; }
    try {
      const r = await call('templates.upload', { docx: await Http.fileBase64(file), code: $('#t-code').value,
        title_en: $('#t-en').value, title_fr: $('#t-fr').value });
      Http.toast(Lang.t('templates.done', { code: r.code, n: r.fields.length }));
      state.templates = [];
      localStorage.removeItem(HOME);
      await renderManagers();
    } catch (e) { errorIn('#t-error', e); }
  });
  $('#m-close').onclick = renderHome;
}

async function boot() {
  Lang.menu($('#lang'));
  Lang.apply();
  document.addEventListener('langchange', () => Lang.apply());
  Http.warm();
  if (state.session) {
    const cached = cachedHome();
    if (cached && cached.me) { state.me = cached.me; state.templates = cached.templates || []; return renderHome(); }
    try { state.me = await call('manager.me'); return renderHome(); } catch (e) { /* sign in again */ }
  }
  renderSignin();
}

boot();
