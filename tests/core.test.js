const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/core.js');

test('templateFields lists each {{field}} once, in order', () => {
  const text = 'Name: {{recipient_name}} Role: {{company_role_department}} again {{recipient_name}} {{Bad}} {{x}}';
  assert.deepEqual(C.templateFields(text), ['recipient_name', 'company_role_department']);
});

test('fieldOwner reads the prefix', () => {
  assert.equal(C.fieldOwner('company_supervisor'), 'company');
  assert.equal(C.fieldOwner('recipient_school'), 'recipient');
  assert.equal(C.fieldOwner('company_signature'), 'system');
  assert.equal(C.fieldOwner('recipient_signed_date'), 'system');
  assert.equal(C.fieldOwner('document_number'), 'system');
  assert.equal(C.fieldOwner('stipend'), 'unknown');
});

test('fieldKind tells dates and e-mails apart', () => {
  assert.equal(C.fieldKind('company_start_date'), 'date');
  assert.equal(C.fieldKind('recipient_email'), 'email');
  assert.equal(C.fieldKind('recipient_course'), 'text');
});

test('humanLabel turns a field name into words', () => {
  assert.equal(C.humanLabel('company_role_department'), 'Role department');
  assert.equal(C.humanLabel('recipient_place'), 'Place');
});

test('sanitizeValue trims, flattens whitespace, drops control characters and braces', () => {
  assert.equal(C.sanitizeValue('  Jean\n\tPaul  '), 'Jean Paul');
  assert.equal(C.sanitizeValue('a{{b}}c'), 'abc');
  assert.equal(C.sanitizeValue(null), '');
  assert.equal(C.sanitizeValue('x'.repeat(400)).length, 300);
  assert.equal(C.sanitizeValue('abcdef', 3), 'abc');
});

test('isEmail accepts ordinary addresses only', () => {
  assert.equal(C.isEmail('intern@example.org'), true);
  assert.equal(C.isEmail('no-at-sign.org'), false);
  assert.equal(C.isEmail('a b@example.org'), false);
  assert.equal(C.isEmail('a@b.c'), false);
});

const NDA = ['recipient_name', 'recipient_address', 'company_role_department', 'company_start_date',
  'company_signatory_name', 'company_signature', 'recipient_signature', 'recipient_place', 'document_number'];

test('validateFields: the company side fills company fields plus the recipient name and e-mail', () => {
  const r = C.validateFields(NDA, {
    recipient_name: ' Awa Ndi ', recipient_email: 'awa@example.org', company_role_department: 'Marketing',
    company_start_date: '2026-12-01', company_signatory_name: '', recipient_address: 'must be ignored'
  }, 'company');
  assert.deepEqual(r.missing, ['company_signatory_name']);
  assert.deepEqual(r.invalid, []);
  assert.equal(r.clean.recipient_name, 'Awa Ndi');
  assert.equal('recipient_address' in r.clean, false);
});

test('validateFields: the recipient side fills recipient fields, never company ones', () => {
  const r = C.validateFields(NDA, {
    recipient_name: 'Awa Ndi', recipient_address: 'Yaounde', recipient_place: '',
    company_role_department: 'changed by the recipient'
  }, 'recipient');
  assert.deepEqual(r.missing, ['recipient_place']);
  assert.equal('company_role_department' in r.clean, false);
});

test('validateFields rejects a bad date or e-mail', () => {
  const r = C.validateFields(NDA, {
    recipient_name: 'A', recipient_email: 'nope', company_role_department: 'R',
    company_start_date: '01/12/2026', company_signatory_name: 'B'
  }, 'company');
  assert.deepEqual(r.invalid.sort(), ['company_start_date', 'recipient_email']);
});

test('documentNumber is MT-<code>-<year>-<4 digits>', () => {
  assert.equal(C.documentNumber('NDA', 2026, 7), 'MT-NDA-2026-0007');
  assert.throws(() => C.documentNumber('nda', 2026, 1), /code/);
});

test('codeFromHex gives six digits from random hex', () => {
  assert.equal(C.codeFromHex('0000000000000'), '000000');
  assert.equal(C.codeFromHex('00000000f4240'), '000000');
  assert.equal(C.codeFromHex('00000000f4241'), '000001');
  assert.match(C.codeFromHex('9f86d081884c7d659a2feaa0c55ad015'), /^\d{6}$/);
});

test('bytesToHex reads signed bytes the way Apps Script returns them', () => {
  assert.equal(C.bytesToHex([0, 15, -1, -128, 127]), '000fff807f');
});

test('codeAttempt: a right code passes and clears the tries', () => {
  const r = C.codeAttempt({ tries: 2, lockedUntil: 0 }, true, true, 1000);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.state, { tries: 0, lockedUntil: 0 });
});

test('codeAttempt: an expired code is refused without spending a try', () => {
  const r = C.codeAttempt({ tries: 1, lockedUntil: 0 }, false, false, 1000);
  assert.equal(r.reason, 'expired');
  assert.equal(r.state.tries, 1);
});

test('codeAttempt: the fifth wrong code locks for 15 minutes', () => {
  let state = { tries: 0, lockedUntil: 0 };
  let r;
  for (let i = 0; i < 4; i++) { r = C.codeAttempt(state, true, false, 1000); state = r.state; }
  assert.equal(r.reason, 'wrong');
  assert.equal(r.left, 1);
  r = C.codeAttempt(state, true, false, 1000);
  assert.equal(r.reason, 'locked');
  assert.equal(r.state.lockedUntil, 1000 + 15 * 60 * 1000);
  const during = C.codeAttempt(r.state, true, true, 2000);
  assert.equal(during.allowed, false);
  assert.equal(during.reason, 'locked');
  const after = C.codeAttempt(r.state, true, true, 1000 + 15 * 60 * 1000);
  assert.equal(after.allowed, true);
});

test('transition follows the life of a document', () => {
  assert.equal(C.transition('sent', 'open'), 'opened');
  assert.equal(C.transition('opened', 'sign'), 'completed');
  assert.equal(C.transition('sent', 'withdraw'), 'withdrawn');
  assert.equal(C.transition('expired', 'resend'), 'sent');
  assert.throws(() => C.transition('completed', 'sign'), (e) => e.code === 'BAD_STATE');
  assert.throws(() => C.transition('withdrawn', 'open'), (e) => e.code === 'BAD_STATE');
});

test('sweepAction reminds once after 3 days and expires after 30', () => {
  const sent = Date.UTC(2026, 10, 1);
  const doc = { status: 'sent', sentAt: new Date(sent).toISOString(), expiresAt: C.expiresAt(sent), remindedAt: '' };
  assert.equal(C.sweepAction(doc, sent + 2 * C.DAY), null);
  assert.equal(C.sweepAction(doc, sent + 3 * C.DAY), 'remind');
  assert.equal(C.sweepAction(Object.assign({}, doc, { remindedAt: 'x' }), sent + 4 * C.DAY), null);
  assert.equal(C.sweepAction(doc, sent + 30 * C.DAY), 'expire');
  assert.equal(C.sweepAction(Object.assign({}, doc, { status: 'completed' }), sent + 40 * C.DAY), null);
});

test('formatUtc prints a readable UTC time', () => {
  assert.equal(C.formatUtc(Date.UTC(2026, 10, 26, 9, 5)), '2026-11-26 09:05 UTC');
});

test('certificateRows names both signers, the code check and the fingerprint, in English and French', () => {
  const rows = C.certificateRows({
    title: 'Student Intern NDA', number: 'MT-NDA-2026-0001', agreementSha256: 'ab'.repeat(32),
    checkUrl: 'https://mylestechsolutions.github.io/sign/check.html',
    company: { name: 'A Manager', title: 'Director', email: 'm@example.org', signedAt: Date.UTC(2026, 10, 26, 8, 0) },
    recipient: { name: 'Awa Ndi', email: 'awa@example.org', signedAt: Date.UTC(2026, 10, 26, 9, 5), place: 'Yaounde', ip: '' }
  });
  const text = rows.map((r) => r.join(' : ')).join('\n');
  assert.match(text, /MT-NDA-2026-0001/);
  assert.match(text, /Awa Ndi <awa@example.org>/);
  assert.match(text, /2026-11-26 09:05 UTC/);
  assert.match(text, /6-digit code/);
  assert.match(text, /Signé par/);
  assert.match(text, /not reported/);
  assert.match(text, new RegExp('ab'.repeat(32)));
});

const nodeCrypto = require('node:crypto');
const NODE = {
  hmac: (key, text) => Array.from(nodeCrypto.createHmac('sha256', Buffer.from(key)).update(text, 'utf8').digest()),
  sha256hex: (text) => nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex'),
  bytes: (text) => Array.from(Buffer.from(text, 'utf8')),
  b64: (text) => Buffer.from(text, 'utf8').toString('base64')
};

test('sigv4 signs an SES request exactly as botocore does', () => {
  // expected value computed with botocore 1.38 SigV4Auth for the same request and the AWS documentation's example keys
  const h = C.sigv4({ host: 'email.us-east-1.amazonaws.com', path: '/v2/email/outbound-emails', region: 'us-east-1',
    service: 'ses', body: '{"a":1}', amzDate: '20261126T120000Z' },
  { accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }, NODE);
  assert.equal(h['X-Amz-Date'], '20261126T120000Z');
  assert.equal(h.Authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261126/us-east-1/ses/aws4_request, ' +
    'SignedHeaders=host;x-amz-date, Signature=d64faed9e7a19c4e8440148bbbf19dfe36ae458ee1402d8d64ff4885f72a89a2');
});

test('mime builds an ASCII message with text, HTML and a PDF attachment', () => {
  const raw = C.mime({ fromName: 'Myles Tech Solutions', from: 'sign@example.org', to: 'awa@example.org',
    replyTo: 'm@example.org', subject: 'Signé: NDA', text: 'Bonjour Awa', html: '<p>Bonjour</p>',
    attachments: [{ name: 'MT-NDA-2026-0001 signed.pdf', type: 'application/pdf', base64: Buffer.from('%PDF-1.4 x'.repeat(30)).toString('base64') }] },
  'seed1', NODE);
  assert.match(raw, /^From: Myles Tech Solutions <sign@example.org>\r\n/);
  assert.match(raw, /\r\nReply-To: m@example.org\r\n/);
  assert.match(raw, /\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(raw, /filename="MT-NDA-2026-0001 signed.pdf"/);
  assert.ok(/^[\x00-\x7f]*$/.test(raw), 'only ASCII');
  assert.ok(raw.split('\r\n').every((l) => l.length <= 998), 'no line over 998 characters');
  const text = raw.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  assert.equal(Buffer.from(text.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Bonjour Awa');
  assert.match(raw, /--mixed_seed1--\r\n$/);
});
