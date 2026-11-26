// A local stand-in for the Apps Script back end: the same actions for one owner, in memory, with the same shared
// rules (assets/core.js). It serves the pages, points assets/config.js at itself, keeps an outbox of the codes and
// links it "sent", and returns small valid PDFs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../../assets/core.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const meta = (names) => names.map((n) => ({ name: n, owner: C.fieldOwner(n), kind: C.fieldKind(n), en: C.humanLabel(n), fr: C.humanLabel(n) }));
const NDA = ['recipient_name', 'recipient_email', 'recipient_address', 'recipient_school', 'recipient_course',
  'company_role_department', 'company_supervisor', 'company_effective_date', 'company_start_date', 'company_end_date',
  'company_work_location', 'company_security_contact', 'company_urgent_channel', 'company_signatory_name',
  'company_signatory_title', 'company_signature', 'company_signed_date', 'recipient_signature',
  'recipient_signed_date', 'recipient_place'];
const MOU = ['recipient_name', 'recipient_email', 'company_partner_name', 'company_signature', 'recipient_signature', 'recipient_place'];
const TEMPLATES = [
  { code: 'NDA', title_en: 'Student Intern Non Disclosure Agreement', title_fr: 'Accord de confidentialité', names: NDA, fields: meta(NDA) },
  { code: 'MOU', title_en: 'Memorandum of Understanding', title_fr: 'Protocole d\'accord', names: MOU, fields: meta(MOU) }
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function pdf(note) {
  return Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R ' +
    '/Resources << /Font << /F1 5 0 R >> >> >> endobj\n' +
    '4 0 obj << /Length 44 >> stream\nBT /F1 24 Tf 72 760 Td (Test agreement) Tj ET\nendstream endobj\n' +
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n% ' + note + '\n');
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fail = (code, detail) => Object.assign(new Error(code), { code, detail });

export async function start(port = 0) {
  const s = { managers: [{ email: 'owner@test.local', name: '', title: '', role: 'owner' }], docs: [], outbox: [],
    codes: {}, sessions: {}, tickets: {}, seq: 0, log: [], url: '' };
  const send = (to, extra) => s.outbox.push(Object.assign({ to }, extra));
  const step = (number, event, actor) => s.log.push({ time: new Date().toISOString(), number, event, actor });
  const manager = (token) => { const e = s.sessions[token]; const m = s.managers.find((x) => x.email === e); if (!m) throw fail('SIGN_IN'); return m; };
  const tpl = (code) => { const t = TEMPLATES.find((x) => x.code === code); if (!t) throw fail('NO_TEMPLATE'); return t; };
  const byLink = (req) => { const d = s.docs.find((x) => x.number === req.number); if (!d || d.secret !== req.secret) throw fail('LINK_INVALID'); return d; };
  const checkCode = (key, code) => { if (s.codes[key] !== String(code || '').trim()) throw fail('CODE_WRONG', { left: 4 }); delete s.codes[key]; };
  const newCode = () => C.codeFromHex(crypto.randomBytes(8).toString('hex'));
  const routes = {
    'manager.requestCode': (r) => { const code = newCode(); s.codes['m:' + r.email] = code;
      if (s.managers.some((m) => m.email === r.email)) send(r.email, { code }); return { sent: true }; },
    'manager.verifyCode': (r) => { checkCode('m:' + r.email, r.code); const token = crypto.randomBytes(16).toString('hex');
      s.sessions[token] = r.email; return { session: token, me: Object.assign({ hasSignature: false }, s.managers.find((x) => x.email === r.email)) }; },
    'manager.me': (r) => Object.assign({ hasSignature: false }, manager(r.session)),
    'manager.signOut': (r) => { delete s.sessions[r.session]; return { ok: true }; },
    'manager.saveProfile': (r) => { const m = manager(r.session); m.name = r.name; m.title = r.title; return Object.assign({ hasSignature: false }, m); },
    'templates.list': (r) => { manager(r.session); return TEMPLATES.map((t) => ({ code: t.code, title_en: t.title_en, title_fr: t.title_fr, fields: t.fields })); },
    'documents.preview': (r) => { manager(r.session); return { pdf: pdf('preview').toString('base64') }; },
    'documents.send': (r) => {
      const m = manager(r.session);
      const t = tpl(r.template);
      const v = C.validateFields(t.names, r.values, 'company');
      if (v.missing.length || v.invalid.length || !r.signature) throw fail('INCOMPLETE', v);
      const number = C.documentNumber(t.code, 2026, ++s.seq);
      const d = { number, template: t.code, status: 'sent', secret: crypto.randomBytes(16).toString('hex'), manager_email: m.email,
        recipient_name: v.clean.recipient_name, recipient_email: v.clean.recipient_email, sent_at: new Date().toISOString(),
        completed_at: '', expires_at: C.expiresAt(Date.now()), company: v.clean, sent: pdf('sent ' + number) };
      s.docs.push(d);
      send(d.recipient_email, { link: s.url + '/sign.html#' + number + '.' + d.secret });
      step(number, 'sent', m.email);
      m.name = v.clean.company_signatory_name || m.name; m.title = v.clean.company_signatory_title || m.title;
      return { number, me: Object.assign({ hasSignature: false }, m) };
    },
    'console.home': (r) => ({ me: routes['manager.me'](r), templates: routes['templates.list'](r),
      documents: routes['documents.list'](r), activity: routes['activity.list'](r) }),
    'documents.list': (r) => { manager(r.session); return s.docs.filter((d) => !r.type || d.template === r.type).map((d) => ({ number: d.number,
      template: d.template, status: d.status, recipient_name: d.recipient_name, recipient_email: d.recipient_email, sent_at: d.sent_at, completed_at: d.completed_at })); },
    'documents.history': (r) => { manager(r.session); return s.log.filter((l) => l.number === r.number).reverse(); },
    'documents.export': (r) => { manager(r.session); return { name: 'record.zip', documents: s.docs.length, zip: Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(18), 'binary').toString('base64') }; },
    'activity.list': (r) => { manager(r.session); const items = s.log.slice().reverse().slice(0, 50); return { items, fresh: items.filter((i) => r.since && i.time > r.since).length }; },
    'documents.download': (r) => { manager(r.session); const d = s.docs.find((x) => x.number === r.number);
      return { name: d.number + '.pdf', pdf: (d.signed || d.sent).toString('base64') }; },
    'recipient.open': (r) => { const d = byLink(r); const t = tpl(d.template); return { status: d.status, number: d.number, title_en: t.title_en,
      title_fr: t.title_fr, recipient_name: d.recipient_name, sentTo: 'in***@test.local', expires_at: d.expires_at }; },
    'recipient.requestCode': (r) => { const d = byLink(r); const code = newCode(); s.codes['r:' + d.number] = code;
      send(d.recipient_email, { code }); return { sentTo: 'in***@test.local' }; },
    'recipient.verifyCode': (r) => { const d = byLink(r); checkCode('r:' + d.number, r.code); d.status = C.transition(d.status, 'open');
      step(d.number, 'code confirmed', d.recipient_email);
      const t = tpl(d.template); const ticket = crypto.randomBytes(16).toString('hex'); s.tickets[ticket] = d.number;
      return { ticket, pdf: d.sent.toString('base64'), form: C.sideFields(t.names, 'recipient').map((n) => t.fields.find((f) => f.name === n)),
        values: { recipient_name: d.recipient_name } }; },
    'recipient.sign': (r) => { const d = byLink(r); if (s.tickets[r.ticket] !== d.number) throw fail('CODE_AGAIN');
      if (r.agree !== true) throw fail('AGREE_NEEDED');
      const v = C.validateFields(tpl(d.template).names, r.values, 'recipient');
      if (v.missing.length || v.invalid.length || !r.signature) throw fail('INCOMPLETE', v);
      d.status = C.transition(d.status, 'sign'); d.completed_at = new Date().toISOString();
      d.signed = pdf('signed ' + d.number + ' ' + d.completed_at); d.sha = sha(d.signed); d.recipient = v.clean;
      step(d.number, 'signed', d.recipient_email);
      return { number: d.number, pdf: d.signed.toString('base64') }; },
    'check.lookup': (r) => { const d = s.docs.find((x) => x.sha === r.sha256); const t = d && tpl(d.template);
      return d ? { found: true, number: d.number, title_en: t.title_en, title_fr: t.title_fr,
        company: { name: d.company.company_signatory_name, signedAt: d.sent_at }, recipient: { name: d.recipient.recipient_name, signedAt: d.completed_at } } : { found: false }; }
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let out;
        try { const r = JSON.parse(body); const h = routes[r.action]; if (!h) throw fail('UNKNOWN_ACTION'); out = { ok: true, data: h(r) }; }
        catch (e) { out = { ok: false, error: e.code || 'INTERNAL', detail: e.detail || null }; }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (url.pathname === '/assets/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end('window.SIGN_CONFIG = { backend: ' + JSON.stringify(s.url + '/api') + ' };');
      return;
    }
    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  s.url = 'http://127.0.0.1:' + server.address().port;
  return {
    url: s.url,
    lastTo: (to) => s.outbox.filter((m) => m.to === to).slice(-1)[0],
    outbox: () => s.outbox.slice(),
    signedPdf: (number) => s.docs.find((d) => d.number === number).signed,
    stop: () => new Promise((ok) => server.close(ok))
  };
}
