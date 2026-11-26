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
