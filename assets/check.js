const $ = (s) => document.querySelector(s);

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function check(file) {
  const out = $('#result');
  out.classList.remove('hidden');
  $('#result-title').textContent = '';
  $('#result-text').textContent = '';
  try {
    const r = await Http.call('check.lookup', { sha256: await sha256Hex(await file.arrayBuffer()) });
    out.style.borderColor = r.found ? 'var(--green)' : 'var(--red)';
    $('#result-title').textContent = Lang.t(r.found ? 'check.ok' : 'check.no');
    if (r.found) {
      $('#result-text').textContent = Lang.t('check.by', {
        title: Lang.get() === 'fr' ? r.title_fr : r.title_en, number: r.number,
        company: r.company.name, at1: SignCore.formatUtc(Date.parse(r.company.signedAt)),
        recipient: r.recipient.name, at2: SignCore.formatUtc(Date.parse(r.recipient.signedAt)) });
    }
  } catch (e) { $('#result-title').textContent = e.message; }
}

Lang.menu($('#lang'));
Lang.apply();
document.addEventListener('langchange', () => Lang.apply());
const drop = $('#drop');
$('#pick').onclick = (e) => { e.stopPropagation(); $('#file').click(); };
drop.onclick = () => $('#file').click();
$('#file').onchange = () => { if ($('#file').files[0]) check($('#file').files[0]); };
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) check(f); });
