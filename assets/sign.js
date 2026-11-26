import { showPdf } from './pdfview.js';

const $ = (s) => document.querySelector(s);
const [number, secret] = decodeURIComponent(location.hash.slice(1)).split('.');
const st = { ticket: '', form: [], pad: null, ip: '', typeMode: false };
const SECTIONS = ['s-message', 's-code', 's-doc', 's-done'];

function show(id) { SECTIONS.forEach((s) => $('#' + s).classList.toggle('hidden', s !== id)); }
function bi(el, en, fr) { el.dataset.en = en; el.dataset.fr = fr; el.textContent = Lang.get() === 'fr' ? fr : en; return el; }
function message(key, text) { show('s-message'); $('#s-message-text').textContent = text || Lang.t(key); }

async function boot() {
  Lang.menu($('#lang'));
  Lang.apply();
  document.addEventListener('langchange', () => Lang.apply());
  if (!number || !secret) return message('sign.badlink');
  let info;
  try { info = await Http.call('recipient.open', { number, secret }); }
  catch (e) { return message(e.code === 'LINK_INVALID' ? 'sign.badlink' : null, e.message); }
  bi($('#s-title'), info.title_en, info.title_fr);
  $('#s-number').textContent = info.number;
  Http.reportedIp().then((ip) => { st.ip = ip; });
  if (info.status === 'expired') return expired();
  if (info.status === 'withdrawn') return message('sign.withdrawn');
  if (info.status === 'completed') return message('sign.already');
  codeStep(info);
}

function expired() {
  message('sign.expired');
  const b = document.createElement('button');
  b.className = 'pill blue';
  b.textContent = Lang.t('sign.askNew');
  b.onclick = async () => {
    try { await Http.call('recipient.askNewLink', { number, secret }); Http.toast(Lang.t('sign.asked')); b.disabled = true; }
    catch (e) { Http.toast(e.message); }
  };
  $('#s-message-actions').appendChild(b);
}

function codeStep(info) {
  show('s-code');
  if (info.sentTo) $('#s-code-lead').textContent = Lang.t('sign.code.lead', { email: info.sentTo });
  $('#s-send').onclick = async () => {
    $('#s-code-error').textContent = '';
    try { await Http.call('recipient.requestCode', { number, secret }); $('#s-code-2').classList.remove('hidden'); $('#s-code-input').focus(); }
    catch (e) { $('#s-code-error').textContent = e.message; }
  };
  $('#s-open').onclick = async () => {
    $('#s-code-error').textContent = '';
    try {
      const r = await Http.call('recipient.verifyCode', { number, secret, code: $('#s-code-input').value });
      st.ticket = r.ticket;
      await docStep(r);
    } catch (e) { $('#s-code-error').textContent = e.message; }
  };
}

function values() {
  const v = {};
  $('#s-form').querySelectorAll('input[name]').forEach((i) => { v[i.name] = i.value; });
  return v;
}

async function docStep(r) {
  show('s-doc');
  st.form = r.form;
  $('#s-form').innerHTML = '';
  r.form.forEach((f) => {
    const label = document.createElement('label');
    label.className = 'field';
    label.appendChild(bi(document.createElement('span'), f.en, f.fr));
    const input = document.createElement('input');
    input.name = f.name;
    input.type = f.kind === 'date' ? 'date' : 'text';
    input.value = (r.values && r.values[f.name]) || '';
    label.appendChild(input);
    $('#s-form').appendChild(label);
  });
  st.pad = SignaturePad($('#s-pad'));
  const update = () => {
    const names = st.form.map((f) => f.name);
    const res = SignCore.validateFields(names, values(), 'recipient');
    const need = res.missing.concat(res.invalid).map((n) => { const f = st.form.find((x) => x.name === n);
      return f ? (Lang.get() === 'fr' ? f.fr : f.en) : n; });
    if (st.pad.isEmpty()) need.push(Lang.t('need.signature'));
    if (!$('#s-agree').checked) need.push(Lang.t('need.agree'));
    $('#s-sign').disabled = need.length > 0;
    $('#s-why').textContent = need.length ? Lang.t('need', { list: need.join(', ') }) : '';
  };
  $('#s-doc').addEventListener('input', update);
  $('#s-agree').onchange = update;
  st.pad.onChange(update);
  $('#s-clear').onclick = () => { st.pad.clear(); $('#s-typed').value = ''; };
  $('#s-mode').onclick = () => {
    st.typeMode = !st.typeMode;
    $('#s-typed').classList.toggle('hidden', !st.typeMode);
    $('#s-mode').textContent = Lang.t(st.typeMode ? 'pad.draw' : 'pad.type');
    st.pad.clear();
  };
  $('#s-typed').oninput = () => st.pad.typed($('#s-typed').value);
  $('#s-sign').onclick = sign;
  update();
  await showPdf($('#s-pages'), Http.bytes(r.pdf));
}

async function sign() {
  $('#s-error').textContent = '';
  $('#s-sign').disabled = true;
  try {
    const r = await Http.call('recipient.sign',
      { number, secret, ticket: st.ticket, values: values(), signature: st.pad.png(), agree: $('#s-agree').checked },
      { browser: navigator.userAgent, ip: st.ip });
    show('s-done');
    $('#s-download').onclick = () => Http.download(r.pdf, number + ' signed.pdf');
  } catch (e) {
    if (e.code === 'CODE_AGAIN') { codeStep({ sentTo: '' }); return; }
    $('#s-error').textContent = e.message;
    $('#s-sign').disabled = false;
  }
}

boot();
