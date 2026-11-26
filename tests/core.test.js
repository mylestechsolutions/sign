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
