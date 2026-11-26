# Document Signing for Myles Tech: Implementation Plan

> **For the implementer:** REQUIRED SUB-SKILL: use superpowers:executing-plans to carry out this plan task by task.

**Goal:** A manager prepares the Student Intern NDA, signs it for Myles Tech Solutions SARL and e-mails it; the
recipient confirms a code, fills their part, signs; both receive the signed PDF; anyone can check a copy.

**Architecture:** Static pages on GitHub Pages (public repository `mylestechsolutions/sign`) call a Google Apps
Script web app that runs as the owner's Gmail. The script fills a Google Doc template, exports PDFs, keeps a
register in a Google Sheet and sends mail with MailApp. The rules shared by pages, script and tests live in one
file, `assets/core.js`, tested with Node.

**Tech Stack:** plain HTML, CSS and JavaScript (no build step), pdf.js for viewing PDFs, Google Apps Script V8
(DriveApp, DocumentApp, SpreadsheetApp, MailApp, CacheService, PropertiesService, LockService, advanced Drive v3),
`@google/clasp` 3.x to push the script, Node 24 `node:test`, Playwright for the page tests, python-docx 1.2 to
mark the Word template.

Design: `docs/plans/2026-11-26-document-signing-design.md` (approved 26 November 2026).

---

## Rules for every task

- Repository: `/Users/brinketu/mylestech-sign` (branch `main`). Commit after every task with the message shown.
- No em dashes anywhere (use ":" or "-"). No line in a commit, comment or document credits an AI tool.
- The repository is PUBLIC: never write a personal e-mail address, a document, a template, a secret or the
  deployment's private settings into a tracked file. `.gitignore` keeps `templates/` and
  `apps-script/TemplateNda.html` out.
- `assets/core.js` is the only source of the shared rules; `apps-script/core.js` is a copy made by
  `scripts/sync-core.sh`, and a test fails when they differ.
- Run all unit tests with `npm test` from the repository root.

## File map

```
.gitignore  .nojekyll  package.json  README.md
index.html  sign.html  check.html                 pages served by GitHub Pages
assets/core.js                                    shared rules (pages, script, tests)
assets/config.js  assets/app.css  assets/i18n.js  assets/api.js
assets/pad.js  assets/pdfview.js  assets/console.js  assets/sign.js  assets/check.js
assets/vendor/pdfjs/pdf.min.mjs  assets/vendor/pdfjs/pdf.worker.min.mjs
apps-script/appsscript.json  apps-script/.claspignore
apps-script/core.js (copy)  apps-script/Code.js  apps-script/Store.js  apps-script/Auth.js
apps-script/Docs.js  apps-script/Mail.js  apps-script/Api.js  apps-script/Setup.js
apps-script/TemplateNda.html (generated, NOT tracked)
scripts/sync-core.sh  scripts/mark_nda.py  scripts/embed-template.sh
templates/ (NOT tracked: the marked Word template)
tests/core.test.js  tests/copies.test.js
tests/e2e/mock-backend.mjs  tests/e2e/pages.test.mjs
```

---

### Task 1: Repository skeleton

**Files:**
- Create: `/Users/brinketu/mylestech-sign/package.json`
- Create: `/Users/brinketu/mylestech-sign/.gitignore`
- Create: `/Users/brinketu/mylestech-sign/.nojekyll` (empty)
- Create: `/Users/brinketu/mylestech-sign/README.md`

**Step 1: Write the files**

`package.json`:
```json
{
  "name": "mylestech-sign",
  "private": true,
  "description": "Document signing for Myles Tech Solutions SARL",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "e2e": "node --test \"tests/e2e/*.test.mjs\"",
    "sync": "sh scripts/sync-core.sh"
  }
}
```

`.gitignore`:
```
node_modules/
templates/
apps-script/TemplateNda.html
.clasp.json
.DS_Store
tests/e2e/.artifacts/
```

`README.md`:
```markdown
# Myles Tech document signing

A manager prepares an agreement, signs it for Myles Tech Solutions SARL and sends it by e-mail; the recipient
confirms a code sent to their e-mail, fills their part and signs; both receive the signed PDF.

- Pages: https://mylestechsolutions.github.io/sign/ (this repository, GitHub Pages)
- Back end: a Google Apps Script web app (source in `apps-script/`), run by the owner's Google account
- Check a signed copy: https://mylestechsolutions.github.io/sign/check.html

Design and plan: `docs/plans/`. Tests: `npm test` (rules), `npm run e2e` (pages against a local stand-in).
No documents, templates, personal data or secrets are kept in this repository.
```

**Step 2: Check and commit**

Run: `cd /Users/brinketu/mylestech-sign && node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo ok`
Expected: `ok`

```bash
git add package.json .gitignore .nojekyll README.md
git commit -m "Repository skeleton for the signing tool"
```

---

### Task 2: Shared rules, part 1: template fields and who fills them

**Files:**
- Create: `/Users/brinketu/mylestech-sign/assets/core.js`
- Test: `/Users/brinketu/mylestech-sign/tests/core.test.js`

**Step 1: Write the failing test**

`tests/core.test.js`:
```js
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
```

**Step 2: Run it to see it fail**

Run: `cd /Users/brinketu/mylestech-sign && npm test`
Expected: FAIL with `Cannot find module '../assets/core.js'`

**Step 3: Write the minimal implementation**

`assets/core.js` (the whole file as it stands after this task; later tasks add functions inside the same closure
and to the returned object):
```js
/*
 * Rules shared by the signing pages, the Google Apps Script back end and the Node tests.
 * One file in three places: it must not use browser, Google or Node APIs.
 */
var SignCore = (function () {
  'use strict';

  var LIMITS = {
    codeMinutes: 10,
    codeTries: 5,
    lockMinutes: 15,
    sessionHours: 12,
    ticketMinutes: 60,
    remindAfterDays: 3,
    expireAfterDays: 30,
    valueMax: 300
  };
  var MINUTE = 60 * 1000;
  var DAY = 24 * 60 * MINUTE;
  var FIELD_RE = /\{\{([a-z][a-z0-9_]{1,60})\}\}/g;

  function templateFields(text) {
    var seen = {};
    var out = [];
    var m;
    FIELD_RE.lastIndex = 0;
    while ((m = FIELD_RE.exec(String(text || ''))) !== null) {
      if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
    }
    return out;
  }

  function fieldOwner(name) {
    if (name === 'document_number' || /_(signature|signed_date)$/.test(name)) return 'system';
    if (name.indexOf('company_') === 0) return 'company';
    if (name.indexOf('recipient_') === 0) return 'recipient';
    return 'unknown';
  }

  function fieldKind(name) {
    if (/_date$/.test(name)) return 'date';
    if (/_email$/.test(name)) return 'email';
    return 'text';
  }

  function humanLabel(name) {
    var words = String(name).replace(/^(company|recipient)_/, '').replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  return {
    LIMITS: LIMITS,
    MINUTE: MINUTE,
    DAY: DAY,
    templateFields: templateFields,
    fieldOwner: fieldOwner,
    fieldKind: fieldKind,
    humanLabel: humanLabel
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = SignCore; }
```

**Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: `# pass 4`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: template fields and who fills them"
```

---

### Task 3: Shared rules, part 2: clean values and check a side's fields

**Files:**
- Modify: `assets/core.js` (add three functions and export them)
- Test: `tests/core.test.js` (append)

**Step 1: Write the failing tests** (append to `tests/core.test.js`)

```js
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
```

**Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `C.sanitizeValue is not a function`

**Step 3: Implement** (inside the closure in `assets/core.js`, before `return`)

```js
  function sanitizeValue(value, max) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\s+/g, ' ').trim();
    var limit = max || LIMITS.valueMax;
    return s.length > limit ? s.slice(0, limit) : s;
  }

  function isEmail(s) {
    var v = String(s || '');
    return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  // Which fields a side must fill. The recipient's e-mail is part of the envelope, set by the company.
  function sideFields(fieldNames, side) {
    var names = fieldNames.filter(function (n) {
      return fieldOwner(n) === side && !(side === 'recipient' && n === 'recipient_email');
    });
    if (side === 'company') {
      ['recipient_name', 'recipient_email'].forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    }
    if (side === 'recipient' && names.indexOf('recipient_name') < 0 && fieldNames.indexOf('recipient_name') >= 0) {
      names.unshift('recipient_name');
    }
    return names;
  }

  function validateFields(fieldNames, values, side) {
    var clean = {};
    var missing = [];
    var invalid = [];
    sideFields(fieldNames, side).forEach(function (name) {
      var v = sanitizeValue(values && values[name]);
      if (!v) { missing.push(name); return; }
      var kind = fieldKind(name);
      if (kind === 'email' && !isEmail(v)) invalid.push(name);
      if (kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) invalid.push(name);
      clean[name] = v;
    });
    return { clean: clean, missing: missing, invalid: invalid };
  }
```

Add to the returned object: `sanitizeValue: sanitizeValue, isEmail: isEmail, sideFields: sideFields,
validateFields: validateFields,`

Note: `fieldOwner('recipient_name')` is `recipient`, so the company side gets it through the explicit list, and
the recipient side may correct it.

**Step 4: Run to see them pass**

Run: `npm test`
Expected: `# pass 9`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: clean values and check each side's fields"
```

---

### Task 4: Shared rules, part 3: numbers, codes and fingerprints

**Files:**
- Modify: `assets/core.js`
- Test: `tests/core.test.js` (append)

**Step 1: Write the failing tests**

```js
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
```

**Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `C.documentNumber is not a function`

**Step 3: Implement** (inside the closure)

```js
  function documentNumber(code, year, seq) {
    if (!/^[A-Z]{2,8}$/.test(String(code))) throw new Error('template code must be 2 to 8 capital letters');
    return 'MT-' + code + '-' + year + '-' + ('0000' + seq).slice(-4);
  }

  // Six digits from at least 13 random hex characters (52 bits, exact in a JS number).
  function codeFromHex(hex) {
    var n = parseInt(String(hex).slice(0, 13), 16) % 1000000;
    return ('000000' + n).slice(-6);
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] & 0xff;
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  }
```

Export: `documentNumber: documentNumber, codeFromHex: codeFromHex, bytesToHex: bytesToHex,`

**Step 4: Run to see them pass**

Run: `npm test`
Expected: `# pass 12`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: document numbers, codes and fingerprints"
```

---

### Task 5: Shared rules, part 4: code attempts (expiry, five tries, lock)

**Files:**
- Modify: `assets/core.js`
- Test: `tests/core.test.js` (append)

**Step 1: Write the failing tests**

```js
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
```

**Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `C.codeAttempt is not a function`

**Step 3: Implement**

```js
  // state: { tries, lockedUntil }; known: a code is on file; matches: the code typed is that code.
  function codeAttempt(state, known, matches, now) {
    var s = { tries: (state && state.tries) || 0, lockedUntil: (state && state.lockedUntil) || 0 };
    if (now < s.lockedUntil) return { allowed: false, reason: 'locked', retryAt: s.lockedUntil, state: s };
    if (!known) return { allowed: false, reason: 'expired', state: s };
    if (matches) return { allowed: true, reason: 'ok', state: { tries: 0, lockedUntil: 0 } };
    var tries = s.tries + 1;
    if (tries >= LIMITS.codeTries) {
      var until = now + LIMITS.lockMinutes * MINUTE;
      return { allowed: false, reason: 'locked', retryAt: until, state: { tries: 0, lockedUntil: until } };
    }
    return { allowed: false, reason: 'wrong', left: LIMITS.codeTries - tries, state: { tries: tries, lockedUntil: 0 } };
  }
```

Export: `codeAttempt: codeAttempt,`

**Step 4: Run to see them pass**

Run: `npm test`
Expected: `# pass 15`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: code attempts with expiry, five tries and a lock"
```

---

### Task 6: Shared rules, part 5: document states, reminders and expiry

**Files:**
- Modify: `assets/core.js`
- Test: `tests/core.test.js` (append)

**Step 1: Write the failing tests**

```js
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
```

**Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `C.transition is not a function`

**Step 3: Implement**

```js
  var MOVES = {
    open: { sent: 'opened', opened: 'opened' },
    sign: { sent: 'completed', opened: 'completed' },
    withdraw: { sent: 'withdrawn', opened: 'withdrawn' },
    expire: { sent: 'expired', opened: 'expired' },
    resend: { sent: 'sent', opened: 'sent', expired: 'sent' }
  };

  function transition(status, event) {
    var to = MOVES[event] && MOVES[event][status];
    if (!to) {
      var e = new Error('a ' + status + ' document does not allow "' + event + '"');
      e.code = 'BAD_STATE';
      throw e;
    }
    return to;
  }

  function expiresAt(sentMs) {
    return new Date(sentMs + LIMITS.expireAfterDays * DAY).toISOString();
  }

  function sweepAction(doc, now) {
    if (doc.status !== 'sent' && doc.status !== 'opened') return null;
    if (doc.expiresAt && now >= Date.parse(doc.expiresAt)) return 'expire';
    if (!doc.remindedAt && doc.sentAt && now - Date.parse(doc.sentAt) >= LIMITS.remindAfterDays * DAY) return 'remind';
    return null;
  }
```

Export: `transition: transition, expiresAt: expiresAt, sweepAction: sweepAction,`

**Step 4: Run to see them pass**

Run: `npm test`
Expected: `# pass 17`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: document states, one reminder, expiry"
```

---

### Task 7: Shared rules, part 6: the signature certificate

**Files:**
- Modify: `assets/core.js`
- Test: `tests/core.test.js` (append)

**Step 1: Write the failing tests**

```js
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
```

**Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `C.formatUtc is not a function`

**Step 3: Implement**

```js
  function formatUtc(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
      p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
  }

  function certificateRows(c) {
    return [
      ['Document', c.title + ' (' + c.number + ')'],
      ['Signed for the company by / Signé pour la société par',
        c.company.name + ', ' + c.company.title + ' <' + c.company.email + '>'],
      ['Company signature time / Heure de signature de la société', formatUtc(c.company.signedAt)],
      ['Signed by / Signé par', c.recipient.name + ' <' + c.recipient.email + '>'],
      ['Signature time / Heure de signature', formatUtc(c.recipient.signedAt)],
      ['Place given / Lieu indiqué', c.recipient.place],
      ['E-mail confirmed / Adresse confirmée',
        'A 6-digit code sent to this address was entered before signing. / ' +
        'Un code à 6 chiffres envoyé à cette adresse a été saisi avant la signature.'],
      ['Internet address reported by the browser / Adresse internet déclarée par le navigateur',
        c.recipient.ip || 'not reported / non déclarée'],
      ['Fingerprint of the agreement pages (SHA-256) / Empreinte des pages de l\'accord', c.agreementSha256],
      ['Check this document / Vérifier ce document', c.checkUrl]
    ];
  }
```

Export: `formatUtc: formatUtc, certificateRows: certificateRows`

**Step 4: Run to see them pass**

Run: `npm test`
Expected: `# pass 19`, `# fail 0`

**Step 5: Commit**

```bash
git add assets/core.js tests/core.test.js
git commit -m "Shared rules: the signature certificate"
```

---

### Task 8: One source for the shared rules

**Files:**
- Create: `scripts/sync-core.sh`
- Create: `apps-script/core.js` (generated by the script)
- Test: `tests/copies.test.js`

**Step 1: Write the failing test**

`tests/copies.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('apps-script/core.js is an exact copy of assets/core.js (run npm run sync)', () => {
  const root = path.join(__dirname, '..');
  const a = fs.readFileSync(path.join(root, 'assets/core.js'), 'utf8');
  const b = fs.readFileSync(path.join(root, 'apps-script/core.js'), 'utf8');
  assert.equal(b, a);
});
```

**Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL with `ENOENT` for `apps-script/core.js`

**Step 3: Write the copy script**

`scripts/sync-core.sh`:
```sh
#!/bin/sh
# assets/core.js is the only source of the shared rules; Apps Script gets an exact copy.
set -eu
cd "$(dirname "$0")/.."
mkdir -p apps-script
cp assets/core.js apps-script/core.js
echo "apps-script/core.js copied from assets/core.js"
```

Run: `chmod +x scripts/sync-core.sh && npm run sync`
Expected: `apps-script/core.js copied from assets/core.js`

**Step 4: Run to see it pass**

Run: `npm test`
Expected: `# pass 20`, `# fail 0`

**Step 5: Commit**

```bash
git add scripts/sync-core.sh apps-script/core.js tests/copies.test.js
git commit -m "One source for the shared rules, copied into the Apps Script project"
```

---

### Task 9: The NDA template (marked copy, never tracked)

**Files:**
- Create: `scripts/mark_nda.py`
- Create: `scripts/embed-template.sh`
- Output (not tracked): `templates/student-intern-nda.docx`, `apps-script/TemplateNda.html`

The NDA has 20 blanks, each a run of underscores inside a single run of its paragraph (no tables; soft line
breaks between items). Each blank is named from the label just before it; `Signature:` and `Date:` are named by
the block they sit in (company block starts with "FOR MYLES TECH SOLUTIONS SARL", intern block with "INTERN").

**Step 1: Write the marking script**

`scripts/mark_nda.py`:
```python
#!/usr/bin/env python3
"""Makes the Student Intern NDA template: a copy of the Word file in which each blank (a run of underscores)
becomes a named {{field}}. The original file is never changed.

    python3 scripts/mark_nda.py <original.docx> templates/student-intern-nda.docx
"""
import re
import sys
from collections import Counter

import docx

FIXED = {
    'Intern full legal name:': 'recipient_name',
    'Address:': 'recipient_address',
    'School or university:': 'recipient_school',
    'Course of study:': 'recipient_course',
    'Internship role and department:': 'company_role_department',
    'Company supervisor:': 'company_supervisor',
    'Effective date:': 'company_effective_date',
    'Internship start date:': 'company_start_date',
    'Internship end date:': 'company_end_date',
    'Work location:': 'company_work_location',
    'Security contact name and email:': 'company_security_contact',
    'Urgent reporting telephone or channel:': 'company_urgent_channel',
    'Name:': 'company_signatory_name',
    'Title:': 'company_signatory_title',
    'Full legal name:': 'recipient_name',
    'Place of signature:': 'recipient_place',
}
BY_BLOCK = {
    'Signature:': {'company': 'company_signature', 'intern': 'recipient_signature'},
    'Date:': {'company': 'company_signed_date', 'intern': 'recipient_signed_date'},
}
EXPECTED = Counter({
    'recipient_name': 2, 'recipient_address': 1, 'recipient_school': 1, 'recipient_course': 1,
    'company_role_department': 1, 'company_supervisor': 1, 'company_effective_date': 1,
    'company_start_date': 1, 'company_end_date': 1, 'company_work_location': 1,
    'company_security_contact': 1, 'company_urgent_channel': 1, 'company_signatory_name': 1,
    'company_signatory_title': 1, 'company_signature': 1, 'company_signed_date': 1,
    'recipient_signature': 1, 'recipient_signed_date': 1, 'recipient_place': 1,
})
BLANK = re.compile(r'_{4,}')
FIELD = re.compile(r'\{\{([a-z_]+)\}\}')


def field_for(label, block):
    if label in BY_BLOCK:
        if block not in ('company', 'intern'):
            sys.exit(f'"{label}" outside a signature block: the template needs a person to look at it')
        return BY_BLOCK[label][block]
    if label not in FIXED:
        sys.exit(f'no field for the blank after "{label}"')
    return FIXED[label]


def mark(src, dst):
    doc = docx.Document(src)
    used = []
    for p in doc.paragraphs:
        block = 'company' if 'FOR MYLES TECH SOLUTIONS SARL' in p.text else ('intern' if p.text.startswith('INTERN') else '')
        for run in p.runs:
            text = run.text
            if not BLANK.search(text):
                continue
            out, pos = [], 0
            for m in BLANK.finditer(text):
                label = text[pos:m.start()].strip().split('\n')[-1].strip()
                field = field_for(label, block)
                out.append(text[pos:m.start()])
                out.append('{{' + field + '}}')
                used.append(field)
                pos = m.end()
            out.append(text[pos:])
            run.text = ''.join(out)
    doc.save(dst)
    return used


def check(dst):
    doc = docx.Document(dst)
    text = '\n'.join(p.text for p in doc.paragraphs)
    found = Counter(FIELD.findall(text))
    if found != EXPECTED:
        sys.exit(f'fields differ from the plan: {dict(found - EXPECTED)} extra, {dict(EXPECTED - found)} missing')
    if BLANK.search(text):
        sys.exit('a blank was left unmarked')
    return found


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    used = mark(sys.argv[1], sys.argv[2])
    found = check(sys.argv[2])
    print(f'{len(used)} blanks marked, {len(found)} distinct fields, checked: {sys.argv[2]}')
```

**Step 2: Run it and check its output**

Run:
```bash
cd /Users/brinketu/mylestech-sign && mkdir -p templates && \
python3 scripts/mark_nda.py /Users/brinketu/Downloads/MylesTech_Cameroon_Student_Intern_NDA.docx templates/student-intern-nda.docx && \
textutil -convert txt -stdout templates/student-intern-nda.docx | grep -o '{{[a-z_]*}}' | sort | uniq -c
```
Expected: `20 blanks marked, 19 distinct fields, checked: templates/student-intern-nda.docx`, then the 19 field
names with `2 {{recipient_name}}` and `1` for every other.

Then open `templates/student-intern-nda.docx` in Word or Pages and confirm by eye that the layout is unchanged
apart from the field names. Show it to the owner (the design says the owner checks the template once).

**Step 3: Write the embedding script** (Apps Script cannot read local files; the template travels inside the
script project as base64, in a file git never sees)

`scripts/embed-template.sh`:
```sh
#!/bin/sh
# Puts the marked Word template into the Apps Script project as base64. The output is NOT tracked by git:
# the public repository never holds the agreement.
set -eu
cd "$(dirname "$0")/.."
test -s templates/student-intern-nda.docx || { echo "make the template first: scripts/mark_nda.py"; exit 1; }
base64 < templates/student-intern-nda.docx | tr -d '\n' > apps-script/TemplateNda.html
echo "apps-script/TemplateNda.html: $(wc -c < apps-script/TemplateNda.html | tr -d ' ') characters (not tracked)"
```

Run: `chmod +x scripts/embed-template.sh && scripts/embed-template.sh && git status --short`
Expected: one line with the size; `git status` lists only the two scripts, NOT `templates/` or `TemplateNda.html`.

**Step 4: Commit**

```bash
git add scripts/mark_nda.py scripts/embed-template.sh
git commit -m "Template tools: mark the NDA's blanks as named fields, embed it for the script"
```

---

### Task 10: Apps Script project: manifest and request router

**Files:**
- Create: `apps-script/appsscript.json`
- Create: `apps-script/.claspignore`
- Create: `apps-script/Code.js`

**Step 1: Write the manifest**

`apps-script/appsscript.json`:
```json
{
  "timeZone": "Africa/Douala",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Drive", "serviceId": "drive", "version": "v3" }
    ]
  },
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" },
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

`apps-script/.claspignore`:
```
**/**
!appsscript.json
!*.js
!TemplateNda.html
```

**Step 2: Write the router**

`apps-script/Code.js`:
```js
// Entry points of the web app. Every request is a POST of JSON { action, ... } sent as text/plain (no pre-flight).
var VERSION = '1.0.0';

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
```

**Step 3: Check the JavaScript parses**

Run: `cd /Users/brinketu/mylestech-sign && node --check apps-script/Code.js && echo ok`
Expected: `ok` (Apps Script globals are only called, not defined, so Node can parse the file.)

**Step 4: Commit**

```bash
git add apps-script/appsscript.json apps-script/.claspignore apps-script/Code.js
git commit -m "Apps Script project: manifest and the request router"
```

---

### Task 11: Apps Script: the register (Google Sheet) and script settings

**Files:**
- Create: `apps-script/Store.js`

Values are written as text (number format `@`) so that Sheets never turns ISO times into dates.

**Step 1: Write the file**

`apps-script/Store.js`:
```js
var Store = (function () {
  var TABS = {
    documents: ['number', 'template', 'status', 'manager_email', 'recipient_name', 'recipient_email',
      'created_at', 'sent_at', 'opened_at', 'signed_at', 'completed_at', 'withdrawn_at', 'expired_at',
      'expires_at', 'reminded_at', 'company_signed_at', 'folder_id', 'sent_pdf_id', 'signed_pdf_id',
      'sha256', 'secret_hash', 'fields_json'],
    log: ['time', 'number', 'event', 'actor', 'detail', 'browser', 'reported_ip'],
    managers: ['email', 'name', 'title', 'role', 'added_at', 'signature_file_id'],
    templates: ['code', 'title_en', 'title_fr', 'doc_id', 'fields_json', 'created_at', 'active']
  };

  function props() { return PropertiesService.getScriptProperties(); }
  function prop(k) { return props().getProperty(k); }
  function setProp(k, v) { props().setProperty(k, String(v)); }
  function delProp(k) { props().deleteProperty(k); }

  function book() {
    var id = prop('REGISTER_ID');
    if (!id) throw fail_('NOT_SET_UP');
    return SpreadsheetApp.openById(id);
  }
  function tab(name) { return book().getSheetByName(name); }

  function rows(name) {
    var cols = TABS[name];
    var values = tab(name).getDataRange().getValues();
    var out = [];
    for (var i = 1; i < values.length; i++) {
      if (values[i].join('') === '') continue;
      var o = { _row: i + 1 };
      for (var c = 0; c < cols.length; c++) o[cols[c]] = values[i][c] == null ? '' : String(values[i][c]);
      out.push(o);
    }
    return out;
  }

  function put(sheet, row, line) {
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 200);
    sheet.getRange(row, 1, 1, line.length).setNumberFormat('@').setValues([line]);
  }

  function writeRow(name, obj) {
    var cols = TABS[name];
    var line = cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); });
    var sheet = tab(name);
    if (!obj._row) obj._row = sheet.getLastRow() + 1;
    put(sheet, obj._row, line);
    return obj;
  }

  function withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return fn(); } finally { lock.releaseLock(); }
  }

  function findIn(name, col, value) {
    var all = rows(name);
    for (var i = 0; i < all.length; i++) if (all[i][col] === value) return all[i];
    return null;
  }

  function nextNumber(code) {  // call inside withLock
    var year = new Date().getUTCFullYear();
    var key = 'SEQ_' + code + '_' + year;
    var n = Number(prop(key) || '0') + 1;
    setProp(key, n);
    return SignCore.documentNumber(code, year, n);
  }

  function log(number, event, actor, detail, client) {
    var sheet = tab('log');
    put(sheet, sheet.getLastRow() + 1, [new Date().toISOString(), number || '', event, actor || '',
      detail || '', (client && client.browser) || '', (client && client.ip) || '']);
  }

  function manager(email) { return findIn('managers', 'email', String(email || '').toLowerCase()); }

  function removeManager(email) {
    var m = manager(email);
    if (m) tab('managers').deleteRow(m._row);
    return !!m;
  }

  function templates() { return rows('templates').filter(function (t) { return t.active === 'yes'; }); }

  function createRegister(folder) {
    var ss = SpreadsheetApp.create('Signing register');
    Object.keys(TABS).forEach(function (name, i) {
      var sheet = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
      var cols = TABS[name];
      sheet.getRange(1, 1, sheet.getMaxRows(), cols.length).setNumberFormat('@');
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    return ss.getId();
  }

  return {
    prop: prop, setProp: setProp, delProp: delProp, rows: rows, writeRow: writeRow, withLock: withLock,
    findDoc: function (n) { return findIn('documents', 'number', n); },
    findBySha: function (s) { return findIn('documents', 'sha256', s); },
    nextNumber: nextNumber, log: log, manager: manager, removeManager: removeManager,
    saveManager: function (m) { m.email = String(m.email).toLowerCase(); return writeRow('managers', m); },
    templates: templates,
    template: function (code) { return findIn('templates', 'code', code); },
    saveTemplate: function (t) { return writeRow('templates', t); },
    createRegister: createRegister
  };
})();
```

**Step 2: Check it parses**

Run: `node --check apps-script/Store.js && echo ok`
Expected: `ok`

**Step 3: Commit**

```bash
git add apps-script/Store.js
git commit -m "Apps Script: the register sheet and script settings"
```

---

### Task 12: Apps Script: codes, sessions, tickets and link secrets

**Files:**
- Create: `apps-script/Auth.js`

Codes are stored only as SHA-256 hashes in the script cache (10 minutes). One code a minute per subject at most,
so a stranger cannot flood an inbox. Manager sessions live 12 hours in script properties under the token's hash.
A recipient who confirmed a code gets a one-hour ticket. Link secrets are 244 random bits; the register keeps only
their hash, and script properties keep the secret itself (never visible in the sheet) so reminders can repeat it.

**Step 1: Write the file**

`apps-script/Auth.js`:
```js
var Auth = (function () {
  function cache() { return CacheService.getScriptCache(); }
  function sha(s) {
    return SignCore.bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
  }
  function shaBytes(bytes) {
    return SignCore.bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  }
  function randomHex() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
  function triesOf(key) { return JSON.parse(cache().get('tries:' + key) || '{"tries":0,"lockedUntil":0}'); }

  function issueCode(purpose, subject) {
    var key = purpose + ':' + subject;
    var state = triesOf(key);
    if (Date.now() < state.lockedUntil) throw fail_('LOCKED', { retryAt: state.lockedUntil });
    if (cache().get('sent:' + key)) throw fail_('WAIT', { seconds: 60 });
    var code = SignCore.codeFromHex(Utilities.getUuid().replace(/-/g, ''));
    cache().put('code:' + key, sha(code), SignCore.LIMITS.codeMinutes * 60);
    cache().put('sent:' + key, '1', 60);
    return code;
  }

  function checkCode(purpose, subject, typed) {
    var key = purpose + ':' + subject;
    var expect = cache().get('code:' + key);
    var r = SignCore.codeAttempt(triesOf(key), !!expect, !!expect && expect === sha(String(typed || '').trim()), Date.now());
    cache().put('tries:' + key, JSON.stringify(r.state), 21600);
    if (r.allowed) { cache().remove('code:' + key); return true; }
    var codes = { locked: 'LOCKED', expired: 'CODE_EXPIRED', wrong: 'CODE_WRONG' };
    throw fail_(codes[r.reason], { left: r.left || 0, retryAt: r.retryAt || 0 });
  }

  function startSession(email) {
    var token = randomHex();
    Store.setProp('session:' + sha(token), JSON.stringify({
      email: email, exp: Date.now() + SignCore.LIMITS.sessionHours * 3600 * 1000
    }));
    return token;
  }
  function endSession(token) { if (token) Store.delProp('session:' + sha(token)); }

  function manager(token) {
    var raw = token ? Store.prop('session:' + sha(token)) : null;
    var s = raw ? JSON.parse(raw) : null;
    if (!s || Date.now() > s.exp) { endSession(token); throw fail_('SIGN_IN'); }
    var m = Store.manager(s.email);
    if (!m) { endSession(token); throw fail_('SIGN_IN'); }
    return m;
  }
  function owner(token) {
    var m = manager(token);
    if (m.role !== 'owner') throw fail_('OWNER_ONLY');
    return m;
  }

  function startTicket(number) {
    var ticket = randomHex();
    cache().put('ticket:' + number + ':' + sha(ticket), '1', SignCore.LIMITS.ticketMinutes * 60);
    return ticket;
  }
  function checkTicket(number, ticket) {
    if (!ticket || !cache().get('ticket:' + number + ':' + sha(ticket))) throw fail_('CODE_AGAIN');
  }

  function newSecret(number) {
    var secret = randomHex();
    Store.setProp('secret:' + number, secret);
    return secret;
  }
  function secretOf(number) { return Store.prop('secret:' + number); }
  function forgetSecret(number) { Store.delProp('secret:' + number); }
  function secretMatches(doc, secret) { return !!doc && !!secret && doc.secret_hash === sha(secret); }

  function cleanSessions() {
    var all = PropertiesService.getScriptProperties().getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('session:') !== 0) return;
      try { if (Date.now() > JSON.parse(all[k]).exp) Store.delProp(k); } catch (e) { Store.delProp(k); }
    });
  }

  return {
    sha: sha, shaBytes: shaBytes, issueCode: issueCode, checkCode: checkCode,
    startSession: startSession, endSession: endSession, manager: manager, owner: owner,
    startTicket: startTicket, checkTicket: checkTicket,
    newSecret: newSecret, secretOf: secretOf, forgetSecret: forgetSecret, secretMatches: secretMatches,
    cleanSessions: cleanSessions
  };
})();
```

**Step 2: Check it parses**

Run: `node --check apps-script/Auth.js && echo ok`
Expected: `ok`

**Step 3: Commit**

```bash
git add apps-script/Auth.js
git commit -m "Apps Script: codes, manager sessions, recipient tickets, link secrets"
```

---

### Task 13: Apps Script: filling the template, PDFs and the certificate page

**Files:**
- Create: `apps-script/Docs.js`

Text fields are replaced literally (find, delete, insert: no regular-expression replacement of values). A
signature image goes exactly where its field was, and the text after it on the same line keeps its formatting.
Fields not filled yet become a line of underscores, as in the original.

**Step 1: Write the file**

`apps-script/Docs.js`:
```js
var Docs = (function () {
  var BLANK = '____________________';
  var SIGNATURE_WIDTH = 150;

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function folder(id) { return DriveApp.getFolderById(id); }

  function replaceText(body, field, value) {
    var pattern = escapeRe('{{' + field + '}}');
    var found = body.findText(pattern);
    for (var guard = 0; found && guard < 50; guard++) {
      var t = found.getElement().asText();
      var s = found.getStartOffset();
      t.deleteText(s, found.getEndOffsetInclusive());
      if (value) t.insertText(s, value);
      found = body.findText(pattern);
    }
  }

  function replaceImage(body, field, blob) {
    var found = body.findText(escapeRe('{{' + field + '}}'));
    if (!found) throw fail_('TEMPLATE_FIELD_MISSING', field);
    var t = found.getElement().asText();
    var start = found.getStartOffset();
    var full = t.getText();
    var tail = full.substring(found.getEndOffsetInclusive() + 1);
    var tailAttrs = tail ? t.getAttributes(found.getEndOffsetInclusive() + 1) : null;
    var par = t.getParent();
    var idx = par.getChildIndex(t);
    t.deleteText(start, full.length - 1);
    var at = start === 0 ? idx : idx + 1;
    var img = par.insertInlineImage(at, blob);
    var ratio = img.getHeight() / Math.max(1, img.getWidth());
    img.setWidth(SIGNATURE_WIDTH).setHeight(Math.round(SIGNATURE_WIDTH * ratio));
    if (tail) par.insertText(at + 1, tail).setAttributes(tailAttrs);
  }

  // values: { field: text }, images: { field: PNG blob }. Returns the open Document.
  function fill(docId, values, images) {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    Object.keys(images || {}).forEach(function (f) { if (images[f]) replaceImage(body, f, images[f]); });
    Object.keys(values || {}).forEach(function (f) { replaceText(body, f, values[f]); });
    SignCore.templateFields(body.getText()).forEach(function (f) { replaceText(body, f, BLANK); });
    return doc;
  }

  function pdf(doc, name) {
    doc.saveAndClose();
    return DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(name);
  }

  function copyOf(tpl, inFolder, name) {
    return DriveApp.getFileById(tpl.doc_id).makeCopy(name, inFolder).getId();
  }

  function appendCertificate(docId, rows) {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    body.appendPageBreak();
    body.appendParagraph('Signature certificate / Certificat de signature')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var table = body.appendTable(rows);
    table.setBorderColor('#E3E8F2');
    for (var r = 0; r < table.getNumRows(); r++) {
      table.getCell(r, 0).setWidth(170).editAsText().setBold(true).setFontSize(9);
      table.getCell(r, 1).editAsText().setFontSize(9);
    }
    return doc;
  }

  function pngBlob(dataUrl, name) {
    var b64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    if (!b64 || b64.length > 2000000) throw fail_('SIGNATURE_MISSING');
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', name);
  }

  // The PDF the recipient reads: company part and company signature filled, the recipient's part blank.
  function makeSent(rec, tpl, values, companySig) {
    var dir = folder(rec.folder_id);
    var copyId = copyOf(tpl, dir, rec.number + ' draft');
    var file = dir.createFile(pdf(fill(copyId, values, { company_signature: companySig }), rec.number + ' sent.pdf'));
    DriveApp.getFileById(copyId).setTrashed(true);
    return file;
  }

  // The signed PDF: every field, both signatures, then the certificate page. Returns { file, sha, agreementSha }.
  function makeSigned(rec, tpl, values, sigs, cert) {
    var dir = folder(rec.folder_id);
    var copyId = copyOf(tpl, dir, rec.number + ' signing');
    var agreement = pdf(fill(copyId, values, sigs), 'agreement.pdf');
    cert.agreementSha256 = Auth.shaBytes(agreement.getBytes());
    var signed = pdf(appendCertificate(copyId, SignCore.certificateRows(cert)), rec.number + ' signed.pdf');
    var file = dir.createFile(signed);
    DriveApp.getFileById(copyId).setTrashed(true);
    return { file: file, sha: Auth.shaBytes(file.getBlob().getBytes()), agreementSha: cert.agreementSha256 };
  }

  // A throw-away preview for the manager before sending.
  function preview(tpl, values, companySig) {
    var tmp = folder(Store.prop('TMP_ID'));
    var copyId = copyOf(tpl, tmp, 'preview ' + new Date().toISOString());
    var blob = pdf(fill(copyId, values, { company_signature: companySig }), 'preview.pdf');
    DriveApp.getFileById(copyId).setTrashed(true);
    return Utilities.base64Encode(blob.getBytes());
  }

  function importTemplate(docxBlob, name) {
    var file = Drive.Files.create({ name: name, mimeType: MimeType.GOOGLE_DOCS, parents: [Store.prop('TEMPLATES_ID')] }, docxBlob);
    return file.id;
  }

  function fieldsOf(docId) { return SignCore.templateFields(DocumentApp.openById(docId).getBody().getText()); }

  function base64Of(fileId) { return Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes()); }

  return {
    fill: fill, pdf: pdf, pngBlob: pngBlob, makeSent: makeSent, makeSigned: makeSigned, preview: preview,
    importTemplate: importTemplate, fieldsOf: fieldsOf, base64Of: base64Of, folder: folder, BLANK: BLANK
  };
})();
```

**Step 2: Check it parses**

Run: `node --check apps-script/Docs.js && echo ok`
Expected: `ok`

**Step 3: Commit**

```bash
git add apps-script/Docs.js
git commit -m "Apps Script: fill the template, place signatures, make the PDFs and the certificate"
```

---

### Task 14: Apps Script: the e-mails

**Files:**
- Create: `apps-script/Mail.js`

Every e-mail comes from the owner's Gmail under the name "Myles Tech Solutions", replies go to the manager, the
text is in English then French, and the button is EduCore's blue pill. Each send first checks the daily quota.

**Step 1: Write the file**

`apps-script/Mail.js`:
```js
var Mail = (function () {
  var NAME = 'Myles Tech Solutions';
  var ADDRESS = 'Myles Tech Solutions SARL, Quartier Hippodrome, Yaoundé, Cameroon';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function page(en, fr, button) {
    var btn = button ? '<p style="margin:24px 0"><a href="' + esc(button.url) + '" style="background:#3967E8;color:#fff;' +
      'text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block;' +
      'box-shadow:0 12px 28px -10px rgba(43,85,212,.55)">' + esc(button.label) + '</a></p>' : '';
    var block = function (b) {
      return '<h1 style="font-size:20px;margin:0 0 12px;color:#17233C">' + esc(b.title) + '</h1>' +
        b.lines.map(function (l) { return '<p style="margin:0 0 10px;color:#3A475E;line-height:1.5">' + esc(l) + '</p>'; }).join('');
    };
    return '<div style="background:#F5F7FB;padding:32px 12px;font-family:Inter,Segoe UI,Arial,sans-serif">' +
      '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E3E8F2;border-radius:18px;' +
      'padding:28px;box-shadow:0 12px 28px -8px rgba(23,35,60,.06)">' + block(en) + btn +
      '<hr style="border:0;border-top:1px solid #E3E8F2;margin:22px 0">' + block(fr) +
      (button ? '<p style="margin:16px 0 0;font-size:12px;color:#5F6B82">' + esc(button.url) + '</p>' : '') +
      '</div><p style="text-align:center;font-size:12px;color:#5F6B82;margin-top:16px">' + esc(ADDRESS) + '</p></div>';
  }

  function send(to, subject, en, fr, button, opts) {
    if (MailApp.getRemainingDailyQuota() < 1) throw fail_('MAIL_LIMIT');
    var o = {
      to: to, subject: subject, name: NAME, htmlBody: page(en, fr, button),
      body: en.title + '\n\n' + en.lines.join('\n') + (button ? '\n\n' + button.url : '') +
        '\n\n---\n' + fr.title + '\n\n' + fr.lines.join('\n')
    };
    if (opts && opts.replyTo) o.replyTo = opts.replyTo;
    if (opts && opts.attachments) o.attachments = opts.attachments;
    MailApp.sendEmail(o);
  }

  function code(to, value) {
    send(to, 'Your code / Votre code: ' + value,
      { title: 'Your code: ' + value, lines: ['Enter it on the page that asked for it. It works for 10 minutes.', 'If you did not ask for it, ignore this e-mail.'] },
      { title: 'Votre code : ' + value, lines: ['Saisissez-le sur la page qui l\'a demandé. Il est valable 10 minutes.', 'Si vous ne l\'avez pas demandé, ignorez ce message.'] });
  }

  function invite(rec, tpl, link, replyTo, reminder) {
    var subject = (reminder ? 'Reminder: ' : '') + 'Please review and sign: ' + tpl.title_en + ' / ' + tpl.title_fr;
    send(rec.recipient_email, subject,
      { title: (reminder ? 'Reminder: ' : '') + 'Please review and sign your ' + tpl.title_en,
        lines: ['Hello ' + rec.recipient_name + ',', 'Myles Tech Solutions SARL has prepared and signed this document for you (' + rec.number + ').',
          'Open it, confirm your e-mail with the code we send you, fill in your part and sign. The link works until ' + rec.expires_at.slice(0, 10) + '.'] },
      { title: (reminder ? 'Rappel : ' : '') + 'Veuillez lire et signer : ' + tpl.title_fr,
        lines: ['Bonjour ' + rec.recipient_name + ',', 'Myles Tech Solutions SARL a préparé et signé ce document pour vous (' + rec.number + ').',
          'Ouvrez-le, confirmez votre adresse avec le code envoyé, remplissez votre partie et signez.'] },
      { url: link, label: 'Review and sign / Lire et signer' }, { replyTo: replyTo });
  }

  function completed(rec, tpl, blob, to, replyTo, checkUrl) {
    send(to, 'Signed: ' + tpl.title_en + ' (' + rec.number + ')',
      { title: 'Signed by both sides', lines: [tpl.title_en + ' (' + rec.number + ') is signed. Your copy is attached.',
        'To check that a copy is genuine and unchanged, drop it on ' + checkUrl + '.'] },
      { title: 'Signé par les deux parties', lines: [tpl.title_fr + ' (' + rec.number + ') est signé. Votre copie est jointe.',
        'Pour vérifier qu\'une copie est authentique et intacte, déposez-la sur ' + checkUrl + '.'] },
      null, { replyTo: replyTo, attachments: [blob] });
  }

  function newLinkAsked(rec, managerEmail, consoleUrl) {
    send(managerEmail, 'A new link is asked for ' + rec.number,
      { title: rec.recipient_name + ' asks for a new link', lines: ['The link for ' + rec.number + ' has expired. Resend it from the console.'] },
      { title: rec.recipient_name + ' demande un nouveau lien', lines: ['Le lien de ' + rec.number + ' a expiré. Renvoyez-le depuis la console.'] },
      { url: consoleUrl, label: 'Open the console / Ouvrir la console' });
  }

  return { code: code, invite: invite, completed: completed, newLinkAsked: newLinkAsked };
})();
```

**Step 2: Check it parses and holds no em dash**

Run: `node --check apps-script/Mail.js && ! grep -n "$(printf '\342\200\224')" apps-script/*.js && echo ok`
Expected: `ok`

**Step 3: Commit**

```bash
git add apps-script/Mail.js
git commit -m "Apps Script: the e-mails, in English and French, in EduCore's look"
```

---

### Task 15: Apps Script: the actions the pages call

**Files:**
- Create: `apps-script/Api.js`

Rules kept here: a manager acts only on documents they sent (the owner on all); the recipient's side can never
write a company field (`SignCore.validateFields`); a document changes state only through `SignCore.transition`;
the number and the row are taken under the script lock; a code request for an address that is not a manager
answers exactly like one that is.

**Step 1: Write the file**

`apps-script/Api.js`:
```js
var Api = (function () {
  function now() { return new Date().toISOString(); }
  function pages(path) { return Store.prop('PAGES_URL') + '/' + path; }
  function linkFor(rec) { return pages('sign.html#' + rec.number + '.' + Auth.secretOf(rec.number)); }
  function mask(email) { var p = String(email).split('@'); return p[0].slice(0, 2) + '***@' + p[1]; }
  function lower(s) { return SignCore.sanitizeValue(s, 254).toLowerCase(); }
  function client(req) {
    var c = req.client || {};
    return { browser: SignCore.sanitizeValue(c.browser, 200), ip: SignCore.sanitizeValue(c.ip, 60) };
  }

  function template(code) {
    var t = Store.template(code);
    if (!t || t.active !== 'yes') throw fail_('NO_TEMPLATE');
    t.fields = JSON.parse(t.fields_json);
    t.names = t.fields.map(function (f) { return f.name; });
    return t;
  }

  function complete(r) {
    if (r.missing.length || r.invalid.length) throw fail_('INCOMPLETE', { missing: r.missing, invalid: r.invalid });
    return r.clean;
  }

  function me(m) {
    return { email: m.email, name: m.name, title: m.title, role: m.role, hasSignature: !!m.signature_file_id };
  }

  function mine(m, number) {
    var rec = Store.findDoc(String(number || ''));
    if (!rec || (m.role !== 'owner' && rec.manager_email !== m.email)) throw fail_('NOT_FOUND');
    return rec;
  }

  function companySignature(m, req) {
    if (req.signature) {
      var blob = Docs.pngBlob(req.signature, 'company-signature.png');
      if (req.saveSignature) {
        var f = Docs.folder(Store.prop('SIGS_ID')).createFile(blob.copyBlob().setName(m.email + '.png'));
        if (m.signature_file_id) DriveApp.getFileById(m.signature_file_id).setTrashed(true);
        m.signature_file_id = f.getId();
        Store.saveManager(m);
      }
      return blob;
    }
    if (m.signature_file_id) return DriveApp.getFileById(m.signature_file_id).getBlob().setName('company-signature.png');
    throw fail_('SIGNATURE_MISSING');
  }

  function companyValues(t, clean, number) {
    var v = { document_number: number, company_signed_date: now().slice(0, 10), recipient_name: clean.recipient_name };
    t.names.forEach(function (n) { if (SignCore.fieldOwner(n) === 'company' && clean[n]) v[n] = clean[n]; });
    return v;
  }

  function openRec(req) {
    var rec = Store.findDoc(String(req.number || ''));
    if (!Auth.secretMatches(rec, req.secret)) throw fail_('LINK_INVALID');
    if ((rec.status === 'sent' || rec.status === 'opened') && Date.now() >= Date.parse(rec.expires_at)) {
      rec.status = SignCore.transition(rec.status, 'expire');
      rec.expired_at = now();
      Store.writeRow('documents', rec);
      Store.log(rec.number, 'expired', 'system');
    }
    return rec;
  }

  var routes = {
    'manager.requestCode': function (req) {
      var email = lower(req.email);
      if (!SignCore.isEmail(email)) throw fail_('BAD_EMAIL');
      var code = Auth.issueCode('manager', email);
      if (Store.manager(email)) Mail.code(email, code);
      return { sent: true };
    },
    'manager.verifyCode': function (req) {
      var email = lower(req.email);
      Auth.checkCode('manager', email, req.code);
      var m = Store.manager(email);
      if (!m) throw fail_('CODE_WRONG', { left: 0 });
      Store.log('', 'manager signed in', email, '', client(req));
      return { session: Auth.startSession(email), me: me(m) };
    },
    'manager.me': function (req) { return me(Auth.manager(req.session)); },
    'manager.signOut': function (req) { Auth.endSession(req.session); return { ok: true }; },
    'manager.saveProfile': function (req) {
      var m = Auth.manager(req.session);
      m.name = SignCore.sanitizeValue(req.name, 120);
      m.title = SignCore.sanitizeValue(req.title, 120);
      Store.saveManager(m);
      if (req.signature) companySignature(m, { signature: req.signature, saveSignature: true });
      return me(Store.manager(m.email));
    },
    'templates.list': function (req) {
      Auth.manager(req.session);
      return Store.templates().map(function (t) {
        return { code: t.code, title_en: t.title_en, title_fr: t.title_fr, fields: JSON.parse(t.fields_json) };
      });
    },
    'documents.preview': function (req) {
      var m = Auth.manager(req.session);
      var t = template(req.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'company'));
      return { pdf: Docs.preview(t, companyValues(t, clean, 'MT-' + t.code + '-PREVIEW'), companySignature(m, req)) };
    },
    'documents.send': function (req) {
      var m = Auth.manager(req.session);
      var t = template(req.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'company'));
      var sig = companySignature(m, req);
      var rec = Store.withLock(function () {
        var number = Store.nextNumber(t.code);
        var dir = Docs.folder(Store.prop('DOCS_ID')).createFolder(number);
        dir.createFile(sig.copyBlob().setName('company-signature.png'));
        var at = now();
        var r = {
          number: number, template: t.code, status: 'sent', manager_email: m.email,
          recipient_name: clean.recipient_name, recipient_email: clean.recipient_email.toLowerCase(),
          created_at: at, sent_at: at, company_signed_at: at, expires_at: SignCore.expiresAt(Date.parse(at)),
          folder_id: dir.getId(), fields_json: JSON.stringify(clean)
        };
        r.secret_hash = Auth.sha(Auth.newSecret(number));
        return Store.writeRow('documents', r);
      });
      rec.sent_pdf_id = Docs.makeSent(rec, t, companyValues(t, clean, rec.number), sig).getId();
      Store.writeRow('documents', rec);
      Mail.invite(rec, t, linkFor(rec), m.email, false);
      Store.log(rec.number, 'sent', m.email, rec.recipient_email, client(req));
      return { number: rec.number };
    },
    'documents.list': function (req) {
      var m = Auth.manager(req.session);
      var q = SignCore.sanitizeValue(req.query, 100).toLowerCase();
      return Store.rows('documents').filter(function (r) {
        if (m.role !== 'owner' && r.manager_email !== m.email) return false;
        return !q || [r.number, r.recipient_name, r.recipient_email, r.status].join(' ').toLowerCase().indexOf(q) >= 0;
      }).map(function (r) {
        return { number: r.number, template: r.template, status: r.status, recipient_name: r.recipient_name,
          recipient_email: r.recipient_email, manager_email: r.manager_email, sent_at: r.sent_at,
          completed_at: r.completed_at, expires_at: r.expires_at };
      }).sort(function (a, b) { return a.sent_at < b.sent_at ? 1 : -1; });
    },
    'documents.download': function (req) {
      var rec = mine(Auth.manager(req.session), req.number);
      var id = rec.signed_pdf_id || rec.sent_pdf_id;
      return { name: rec.number + (rec.signed_pdf_id ? ' signed.pdf' : ' sent.pdf'), pdf: Docs.base64Of(id) };
    },
    'documents.withdraw': function (req) {
      var m = Auth.manager(req.session);
      Store.withLock(function () {
        var rec = mine(m, req.number);
        rec.status = SignCore.transition(rec.status, 'withdraw');
        rec.withdrawn_at = now();
        Store.writeRow('documents', rec);
        Auth.forgetSecret(rec.number);
      });
      Store.log(req.number, 'withdrawn', m.email, '', client(req));
      return { ok: true };
    },
    'documents.resend': function (req) {
      var m = Auth.manager(req.session);
      var rec = Store.withLock(function () {
        var r = mine(m, req.number);
        r.status = SignCore.transition(r.status, 'resend');
        r.secret_hash = Auth.sha(Auth.newSecret(r.number));
        r.sent_at = now();
        r.expires_at = SignCore.expiresAt(Date.now());
        r.reminded_at = '';
        return Store.writeRow('documents', r);
      });
      Mail.invite(rec, template(rec.template), linkFor(rec), m.email, false);
      Store.log(rec.number, 'resent', m.email, '', client(req));
      return { ok: true };
    },
    'managers.list': function (req) {
      Auth.owner(req.session);
      return Store.rows('managers').map(me);
    },
    'managers.add': function (req) {
      Auth.owner(req.session);
      var email = lower(req.email);
      if (!SignCore.isEmail(email)) throw fail_('BAD_EMAIL');
      if (Store.manager(email)) throw fail_('ALREADY_MANAGER');
      Store.saveManager({ email: email, name: SignCore.sanitizeValue(req.name, 120),
        title: SignCore.sanitizeValue(req.title, 120), role: 'manager', added_at: now() });
      return { ok: true };
    },
    'managers.remove': function (req) {
      var o = Auth.owner(req.session);
      var email = lower(req.email);
      if (email === o.email) throw fail_('OWNER_STAYS');
      Store.removeManager(email);
      return { ok: true };
    },
    'admin.selfTest': function (req) { Auth.owner(req.session); return { report: selfTest() }; },
    'recipient.open': function (req) {
      var rec = openRec(req);
      var t = template(rec.template);
      return { status: rec.status, number: rec.number, title_en: t.title_en, title_fr: t.title_fr,
        recipient_name: rec.recipient_name, sentTo: mask(rec.recipient_email), expires_at: rec.expires_at };
    },
    'recipient.requestCode': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'sent' && rec.status !== 'opened') throw fail_('BAD_STATE', { status: rec.status });
      Mail.code(rec.recipient_email, Auth.issueCode('recipient', rec.number));
      Store.log(rec.number, 'code sent', rec.recipient_email, '', client(req));
      return { sentTo: mask(rec.recipient_email) };
    },
    'recipient.verifyCode': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'sent' && rec.status !== 'opened') throw fail_('BAD_STATE', { status: rec.status });
      Auth.checkCode('recipient', rec.number, req.code);
      if (rec.status === 'sent') {
        rec.status = SignCore.transition(rec.status, 'open');
        rec.opened_at = now();
        Store.writeRow('documents', rec);
      }
      Store.log(rec.number, 'code confirmed', rec.recipient_email, '', client(req));
      var t = template(rec.template);
      var form = SignCore.sideFields(t.names, 'recipient').map(function (n) {
        return t.fields.filter(function (f) { return f.name === n; })[0];
      });
      return { ticket: Auth.startTicket(rec.number), pdf: Docs.base64Of(rec.sent_pdf_id), form: form,
        values: { recipient_name: rec.recipient_name } };
    },
    'recipient.sign': function (req) {
      var rec0 = openRec(req);
      Auth.checkTicket(rec0.number, req.ticket);
      if (rec0.status === 'completed') return { already: true, pdf: Docs.base64Of(rec0.signed_pdf_id) };
      if (req.agree !== true) throw fail_('AGREE_NEEDED');
      var t = template(rec0.template);
      var clean = complete(SignCore.validateFields(t.names, req.values, 'recipient'));
      var recipientSig = Docs.pngBlob(req.signature, 'recipient-signature.png');
      var c = client(req);
      var out = Store.withLock(function () {
        var rec = Store.findDoc(rec0.number);
        rec.status = SignCore.transition(rec.status, 'sign');
        var dir = Docs.folder(rec.folder_id);
        dir.createFile(recipientSig.copyBlob());
        var company = JSON.parse(rec.fields_json);
        var at = now();
        var values = Object.assign({}, companyValues(t, company, rec.number), clean, {
          company_signed_date: rec.company_signed_at.slice(0, 10), recipient_signed_date: at.slice(0, 10) });
        var sigs = { company_signature: dir.getFilesByName('company-signature.png').next().getBlob(),
          recipient_signature: recipientSig };
        var made = Docs.makeSigned(rec, t, values, sigs, {
          title: t.title_en, number: rec.number, checkUrl: pages('check.html'),
          company: { name: company.company_signatory_name || '', title: company.company_signatory_title || '',
            email: rec.manager_email, signedAt: Date.parse(rec.company_signed_at) },
          recipient: { name: clean.recipient_name, email: rec.recipient_email, signedAt: Date.parse(at),
            place: clean.recipient_place || '', ip: c.ip } });
        if (clean.recipient_name !== rec.recipient_name) {
          Store.log(rec.number, 'name corrected', rec.recipient_email, rec.recipient_name + ' -> ' + clean.recipient_name, c);
        }
        rec.recipient_name = clean.recipient_name;
        rec.signed_at = at;
        rec.completed_at = at;
        rec.sha256 = made.sha;
        rec.signed_pdf_id = made.file.getId();
        rec.fields_json = JSON.stringify(Object.assign({}, company, clean));
        Store.writeRow('documents', rec);
        Auth.forgetSecret(rec.number);
        return { rec: rec, file: made.file };
      });
      Store.log(out.rec.number, 'signed', out.rec.recipient_email, out.rec.sha256, c);
      [out.rec.recipient_email, out.rec.manager_email].forEach(function (to) {
        Mail.completed(out.rec, t, out.file.getBlob(), to, out.rec.manager_email, pages('check.html'));
      });
      return { number: out.rec.number, pdf: Docs.base64Of(out.file.getId()) };
    },
    'recipient.askNewLink': function (req) {
      var rec = openRec(req);
      if (rec.status !== 'expired') throw fail_('BAD_STATE', { status: rec.status });
      Mail.newLinkAsked(rec, rec.manager_email, pages('index.html'));
      Store.log(rec.number, 'new link asked', rec.recipient_email, '', client(req));
      return { asked: true };
    },
    'check.lookup': function (req) {
      var sha = String(req.sha256 || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha)) throw fail_('BAD_REQUEST');
      var rec = Store.findBySha(sha);
      if (!rec || rec.status !== 'completed') return { found: false };
      var t = Store.template(rec.template);
      var f = JSON.parse(rec.fields_json);
      return { found: true, number: rec.number, title_en: t.title_en, title_fr: t.title_fr,
        company: { name: f.company_signatory_name || '', signedAt: rec.company_signed_at },
        recipient: { name: rec.recipient_name, signedAt: rec.signed_at } };
    }
  };

  return { routes: routes, linkFor: linkFor };
})();
```

**Step 2: Check it parses**

Run: `node --check apps-script/Api.js && echo ok`
Expected: `ok`

**Step 3: Commit**

```bash
git add apps-script/Api.js
git commit -m "Apps Script: the actions for managers, recipients and the check page"
```

---

### Task 16: Apps Script: one-time setup, self-test and the daily sweep

**Files:**
- Create: `apps-script/Setup.js`

`setup()` is the function the owner runs once in the script editor (it is also what makes Google ask for the
permissions). It creates the Drive folder, the register, the owner's manager row, the NDA template from
`TemplateNda.html`, and the daily trigger; then it runs `selfTest()` and prints the report.

**Step 1: Write the file**

`apps-script/Setup.js`:
```js
var NDA_TEMPLATE = {
  code: 'NDA',
  title_en: 'Student Intern Non Disclosure Agreement',
  title_fr: 'Accord de confidentialité du stagiaire étudiant',
  labels: {
    recipient_name: ['Intern full legal name', 'Nom légal complet du stagiaire'],
    recipient_email: ['Intern e-mail', 'E-mail du stagiaire'],
    recipient_address: ['Address', 'Adresse'],
    recipient_school: ['School or university', 'École ou université'],
    recipient_course: ['Course of study', 'Filière'],
    recipient_place: ['Place of signature', 'Lieu de signature'],
    company_role_department: ['Internship role and department', 'Poste et département du stage'],
    company_supervisor: ['Company supervisor', 'Superviseur dans l\'entreprise'],
    company_effective_date: ['Effective date', 'Date d\'entrée en vigueur'],
    company_start_date: ['Internship start date', 'Date de début du stage'],
    company_end_date: ['Internship end date', 'Date de fin du stage'],
    company_work_location: ['Work location', 'Lieu de travail'],
    company_security_contact: ['Security contact name and e-mail', 'Contact sécurité (nom et e-mail)'],
    company_urgent_channel: ['Urgent reporting telephone or channel', 'Téléphone ou canal de signalement urgent'],
    company_signatory_name: ['Signing for the company: name', 'Signataire pour la société : nom'],
    company_signatory_title: ['Signing for the company: title', 'Signataire pour la société : fonction']
  }
};
var TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fieldMeta_(names, labels) {
  var all = names.slice();
  if (all.indexOf('recipient_email') < 0) all.splice(1, 0, 'recipient_email');
  return all.map(function (n) {
    var l = labels[n] || [SignCore.humanLabel(n), SignCore.humanLabel(n)];
    return { name: n, owner: SignCore.fieldOwner(n), kind: SignCore.fieldKind(n), en: l[0], fr: l[1] };
  });
}

function installNda_() {
  var b64 = HtmlService.createHtmlOutputFromFile('TemplateNda').getContent();
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), MimeType.MICROSOFT_WORD, 'Student Intern NDA.docx');
  var docId = Docs.importTemplate(blob, NDA_TEMPLATE.title_en);
  Store.saveTemplate({
    code: NDA_TEMPLATE.code, title_en: NDA_TEMPLATE.title_en, title_fr: NDA_TEMPLATE.title_fr, doc_id: docId,
    fields_json: JSON.stringify(fieldMeta_(Docs.fieldsOf(docId), NDA_TEMPLATE.labels)),
    created_at: new Date().toISOString(), active: 'yes'
  });
}

function setup() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ROOT_ID')) {
    var root = DriveApp.createFolder('MylesTech signing');
    p.setProperty('ROOT_ID', root.getId());
    p.setProperty('TEMPLATES_ID', root.createFolder('templates').getId());
    p.setProperty('DOCS_ID', root.createFolder('documents').getId());
    p.setProperty('SIGS_ID', root.createFolder('signatures').getId());
    p.setProperty('TMP_ID', root.createFolder('tmp').getId());
    p.setProperty('REGISTER_ID', Store.createRegister(root));
    p.setProperty('PAGES_URL', 'https://mylestechsolutions.github.io/sign');
  }
  var owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!Store.manager(owner)) {
    Store.saveManager({ email: owner, name: '', title: '', role: 'owner', added_at: new Date().toISOString() });
  }
  if (!Store.template(NDA_TEMPLATE.code)) installNda_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySweep') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySweep').timeBased().everyDays(1).atHour(8).create();
  var report = selfTest();
  console.log(report);
  return report;
}

function selfTest() {
  var lines = [];
  var t = Store.template(NDA_TEMPLATE.code);
  var meta = JSON.parse(t.fields_json);
  var inDoc = meta.filter(function (f) { return f.name !== 'recipient_email'; }).map(function (f) { return f.name; });
  lines.push('template fields: ' + inDoc.length + (inDoc.length === 19 ? ' ok' : ' EXPECTED 19'));
  var copyId = DriveApp.getFileById(t.doc_id).makeCopy('self-test', Docs.folder(Store.prop('TMP_ID'))).getId();
  var values = {};
  inDoc.forEach(function (n) { values[n] = 'TEST ' + n; });
  var sig = Utilities.newBlob(Utilities.base64Decode(TINY_PNG), 'image/png', 'test.png');
  var doc = Docs.fill(copyId, values, { company_signature: sig, recipient_signature: sig.copyBlob() });
  var left = SignCore.templateFields(doc.getBody().getText());
  lines.push('fields left after filling: ' + left.length + (left.length === 0 ? ' ok' : ' ' + left.join(', ')));
  var blob = Docs.pdf(doc, 'self-test.pdf');
  lines.push('pdf: ' + blob.getBytes().length + ' bytes, fingerprint ' + Auth.shaBytes(blob.getBytes()).slice(0, 16));
  DriveApp.getFileById(copyId).setTrashed(true);
  lines.push('managers: ' + Store.rows('managers').length + ', templates: ' + Store.templates().length);
  lines.push('e-mails left today: ' + MailApp.getRemainingDailyQuota());
  return lines.join('\n');
}

function dailySweep() {
  var nowMs = Date.now();
  Store.rows('documents').forEach(function (rec) {
    var act = SignCore.sweepAction({ status: rec.status, sentAt: rec.sent_at, expiresAt: rec.expires_at,
      remindedAt: rec.reminded_at }, nowMs);
    if (act === 'expire') {
      Store.withLock(function () {
        rec.status = SignCore.transition(rec.status, 'expire');
        rec.expired_at = new Date(nowMs).toISOString();
        Store.writeRow('documents', rec);
      });
      Auth.forgetSecret(rec.number);
      Store.log(rec.number, 'expired', 'system');
    } else if (act === 'remind') {
      try {
        Mail.invite(rec, Store.template(rec.template), Api.linkFor(rec), rec.manager_email, true);
        rec.reminded_at = new Date(nowMs).toISOString();
        Store.writeRow('documents', rec);
        Store.log(rec.number, 'reminded', 'system');
      } catch (e) {
        Store.log(rec.number, 'reminder failed', 'system', String((e && e.code) || e));
      }
    }
  });
  Auth.cleanSessions();
  var files = Docs.folder(Store.prop('TMP_ID')).getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (nowMs - f.getDateCreated().getTime() > SignCore.DAY) f.setTrashed(true);
  }
}
```

**Step 2: Check every Apps Script file parses and the copy is current**

Run: `for f in apps-script/*.js; do node --check "$f" || exit 1; done && npm test && echo ok`
Expected: `# pass 20` and `ok`

**Step 3: Commit**

```bash
git add apps-script/Setup.js
git commit -m "Apps Script: one-time setup, self-test and the daily reminders and expiry"
```

---

### Task 17: Pages: EduCore's look, two languages, the call to the back end

**Files:**
- Create: `assets/config.js`, `assets/app.css`, `assets/i18n.js`, `assets/api.js`

**Step 1: `assets/config.js`** (the web app address is filled in Task 24; it is public by nature)

```js
window.SIGN_CONFIG = { backend: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec' };
```

**Step 2: `assets/app.css`** (values from `EduCore/lib/shared/premium_kit.dart`)

```css
:root {
  --page: #F5F7FB; --navy: #17233C; --ink2: #3A475E; --muted: #5F6B82; --line: #E3E8F2; --line-strong: #D5DCEA;
  --blue: #3967E8; --blue-soft: #EAF0FF; --green: #15803D; --green-soft: #E7F6EC;
  --amber: #B45309; --amber-soft: #FFF4E2; --red: #DC2626; --red-soft: #FEECEC;
  --rest: 0 1px 2px rgba(23,35,60,.04), 0 12px 28px -8px rgba(23,35,60,.063);
  --raised: 0 2px 4px rgba(23,35,60,.07), 0 22px 40px -10px rgba(43,85,212,.14);
  --motion: 220ms cubic-bezier(.215,.61,.355,1);
  --radius: 18px;
  --font: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--navy); font: 15px/1.5 var(--font); }
.top { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; }
.brand { font-weight: 800; letter-spacing: -.01em; font-size: 17px; }
.brand span { color: var(--blue); }
main { max-width: 980px; margin: 0 auto; padding: 8px 16px 64px; }
h1 { font-size: 26px; letter-spacing: -.02em; margin: 6px 0 4px; }
h2 { font-size: 18px; margin: 0 0 12px; }
.muted { color: var(--muted); }
.stack > * + * { margin-top: 18px; }
.card { position: relative; background: #fff; border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--rest); padding: 22px; transition: transform var(--motion), box-shadow var(--motion); }
.card.lift:hover, .card.lift:focus-within { transform: translateY(-3px); box-shadow: var(--raised); }
.pill { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px; border: 1px solid var(--line-strong);
  background: #fff; color: var(--navy); font: 700 14px/1.2 var(--font); text-decoration: none; cursor: pointer;
  box-shadow: 0 1px 2px rgba(23,35,60,.06);
  transition: transform var(--motion), box-shadow var(--motion), background var(--motion); }
.pill:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 24px -12px rgba(23,35,60,.4); }
.pill:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
.pill.blue { background: var(--blue); border-color: var(--blue); color: #fff; box-shadow: 0 8px 20px -12px rgba(57,103,232,.8); }
.pill.blue:hover:not(:disabled) { box-shadow: 0 16px 32px -12px rgba(57,103,232,.8); }
.pill.red { background: var(--red); border-color: var(--red); color: #fff; }
.pill.red:hover:not(:disabled) { box-shadow: 0 16px 32px -12px rgba(220,38,38,.65); }
.pill.large { min-height: 52px; padding: 0 26px; font-size: 16px; }
.pill:disabled { opacity: .45; cursor: not-allowed; }
.pill:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--blue-soft); outline-offset: 2px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 18px; }
label.field { display: block; margin: 0 0 14px; font-weight: 600; font-size: 13px; color: var(--ink2); }
input, select { width: 100%; margin-top: 6px; padding: 11px 14px; border: 1px solid var(--line-strong);
  border-radius: 12px; font: 15px var(--font); color: var(--navy); background: #fff;
  transition: border-color var(--motion), box-shadow var(--motion); }
input:focus, select:focus { border-color: var(--blue); box-shadow: 0 0 0 4px var(--blue-soft); outline: none; }
input[type=checkbox] { width: auto; margin: 0 8px 0 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0 18px; }
.why { font-size: 13px; color: var(--amber); }
.error { color: var(--red); font-size: 14px; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.badge.sent, .badge.opened { background: var(--blue-soft); color: var(--blue); }
.badge.completed { background: var(--green-soft); color: var(--green); }
.badge.expired { background: var(--amber-soft); color: var(--amber); }
.badge.withdrawn { background: var(--red-soft); color: var(--red); }
.list { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px;
  border-radius: 14px; border: 1px solid transparent;
  transition: background var(--motion), transform var(--motion), box-shadow var(--motion), border-color var(--motion); }
.row:hover { background: #fff; border-color: var(--line); transform: translateY(-2px); box-shadow: var(--raised); }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; gap: 12px;
  align-items: center; background: var(--navy); color: #fff; padding: 12px 12px 12px 18px; border-radius: 14px; box-shadow: var(--raised); }
.toast button { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; }
dialog { border: 0; border-radius: var(--radius); box-shadow: var(--raised); padding: 26px; width: min(760px, calc(100% - 24px)); }
dialog::backdrop { background: rgba(23,35,60,.35); }
.x { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; border-radius: 999px; border: 0;
  background: var(--red-soft); color: var(--red); font-size: 18px; cursor: pointer; transition: transform var(--motion); }
.x:hover { transform: scale(1.08); }
.pad { display: block; width: 100%; height: 180px; border: 1px dashed var(--line-strong); border-radius: 14px;
  background: #fff; touch-action: none; }
.pages canvas { display: block; width: 100%; height: auto; border-radius: 10px; box-shadow: var(--rest); margin-bottom: 14px; background: #fff; }
.drop { border: 2px dashed var(--line-strong); border-radius: var(--radius); padding: 36px; text-align: center; cursor: pointer;
  transition: border-color var(--motion), background var(--motion); }
.drop.over { border-color: var(--blue); background: var(--blue-soft); }
details.fold > summary { cursor: pointer; font-weight: 700; list-style: none; }
.hidden { display: none !important; }
@media (max-width: 640px) { .card { padding: 16px; } main { padding: 4px 10px 48px; } h1 { font-size: 22px; } }
```

**Step 3: `assets/i18n.js`**

```js
var I18N = {
  en: {
    'brand': 'Myles Tech', 'lang': 'Language',
    'signin.title': 'Sign in', 'signin.lead': 'Managers sign in with a code sent to their e-mail.',
    'signin.email': 'Your e-mail', 'signin.send': 'Send me a code', 'signin.code': 'The 6-digit code',
    'signin.go': 'Sign in', 'signin.sent': 'If this address belongs to a manager, a code is on its way.',
    'console.title': 'Documents', 'console.new': 'New NDA', 'console.search': 'Search by number, name, e-mail or status',
    'console.empty': 'Nothing sent yet.', 'console.signout': 'Sign out', 'console.managers': 'Managers',
    'status.sent': 'Sent', 'status.opened': 'Opened', 'status.completed': 'Completed', 'status.expired': 'Expired', 'status.withdrawn': 'Withdrawn',
    'doc.download': 'Download', 'doc.resend': 'Resend', 'doc.withdraw': 'Withdraw', 'doc.confirmWithdraw': 'Withdraw this document? The link stops working.',
    'new.title': 'Prepare and send', 'new.company': 'The company\'s part', 'new.recipient': 'Who receives it',
    'new.sign': 'Your signature', 'new.useSaved': 'Use my saved signature', 'new.save': 'Remember this signature',
    'new.preview': 'Preview', 'new.send': 'Sign and send', 'new.sent': 'Sent: {number}. The recipient has the link.',
    'pad.clear': 'Clear', 'pad.type': 'Type instead', 'pad.draw': 'Draw instead', 'pad.typed': 'Type your name',
    'need': 'Still needed: {list}', 'need.signature': 'a signature', 'need.agree': 'your agreement',
    'managers.add': 'Add manager', 'managers.remove': 'Remove', 'managers.name': 'Name', 'managers.title': 'Title',
    'sign.title': 'Review and sign', 'sign.code.lead': 'To prove it is you, we send a 6-digit code to {email}.',
    'sign.code.send': 'Send me the code', 'sign.code.go': 'Open the document', 'sign.yours': 'Your part',
    'sign.agree': 'I have read and agree to this document.', 'sign.go': 'Sign', 'sign.done': 'Signed. A copy is in your e-mail.',
    'sign.download': 'Download my signed copy', 'sign.expired': 'This link has expired.', 'sign.askNew': 'Ask for a new link',
    'sign.asked': 'Done: the company is told and will send a new link.', 'sign.withdrawn': 'This document was withdrawn by the company.',
    'sign.already': 'This document is already signed. Your copy was sent to your e-mail.', 'sign.badlink': 'This link is not valid.',
    'check.title': 'Check a signed document', 'check.lead': 'Drop a PDF here. It never leaves your computer: only its fingerprint is checked.',
    'check.pick': 'Choose a PDF', 'check.ok': 'Genuine and unchanged', 'check.no': 'Not found: this file was changed, or was not signed here.',
    'check.by': '{title} ({number}), signed for the company by {company} on {at1} and by {recipient} on {at2}.',
    'err.NETWORK': 'No connection. Try again.', 'err.SERVER': 'The service did not answer. Try again in a minute.',
    'err.SIGN_IN': 'Please sign in again.', 'err.CODE_WRONG': 'Wrong code. {left} tries left.',
    'err.CODE_EXPIRED': 'This code has expired. Ask for a new one.', 'err.LOCKED': 'Too many tries. Wait 15 minutes.',
    'err.WAIT': 'A code was just sent. Wait a minute before asking again.', 'err.CODE_AGAIN': 'Please confirm your code again.',
    'err.MAIL_LIMIT': 'Today\'s e-mail limit is reached. Try again tomorrow.', 'err.INCOMPLETE': 'Some fields are missing or not valid.',
    'err.SIGNATURE_MISSING': 'A signature is needed.', 'err.BAD_EMAIL': 'This e-mail address is not valid.',
    'err.LINK_INVALID': 'This link is not valid.', 'err.BAD_STATE': 'This document can no longer be changed.',
    'err.OWNER_ONLY': 'Only the owner can do this.', 'err.ALREADY_MANAGER': 'Already a manager.', 'err.NOT_FOUND': 'Not found.',
    'err.AGREE_NEEDED': 'Please tick that you agree.', 'err.INTERNAL': 'Something went wrong. Try again.'
  },
  fr: {
    'brand': 'Myles Tech', 'lang': 'Langue',
    'signin.title': 'Connexion', 'signin.lead': 'Les responsables se connectent avec un code envoyé à leur e-mail.',
    'signin.email': 'Votre e-mail', 'signin.send': 'Recevoir un code', 'signin.code': 'Le code à 6 chiffres',
    'signin.go': 'Se connecter', 'signin.sent': 'Si cette adresse est celle d\'un responsable, un code est en route.',
    'console.title': 'Documents', 'console.new': 'Nouvel accord de confidentialité', 'console.search': 'Chercher par numéro, nom, e-mail ou statut',
    'console.empty': 'Rien n\'a encore été envoyé.', 'console.signout': 'Se déconnecter', 'console.managers': 'Responsables',
    'status.sent': 'Envoyé', 'status.opened': 'Ouvert', 'status.completed': 'Signé', 'status.expired': 'Expiré', 'status.withdrawn': 'Retiré',
    'doc.download': 'Télécharger', 'doc.resend': 'Renvoyer', 'doc.withdraw': 'Retirer', 'doc.confirmWithdraw': 'Retirer ce document ? Le lien ne fonctionnera plus.',
    'new.title': 'Préparer et envoyer', 'new.company': 'La partie de la société', 'new.recipient': 'Destinataire',
    'new.sign': 'Votre signature', 'new.useSaved': 'Utiliser ma signature enregistrée', 'new.save': 'Enregistrer cette signature',
    'new.preview': 'Aperçu', 'new.send': 'Signer et envoyer', 'new.sent': 'Envoyé : {number}. Le destinataire a reçu le lien.',
    'pad.clear': 'Effacer', 'pad.type': 'Taper plutôt', 'pad.draw': 'Dessiner plutôt', 'pad.typed': 'Tapez votre nom',
    'need': 'Il manque : {list}', 'need.signature': 'une signature', 'need.agree': 'votre accord',
    'managers.add': 'Ajouter un responsable', 'managers.remove': 'Retirer', 'managers.name': 'Nom', 'managers.title': 'Fonction',
    'sign.title': 'Lire et signer', 'sign.code.lead': 'Pour prouver que c\'est vous, nous envoyons un code à 6 chiffres à {email}.',
    'sign.code.send': 'Recevoir le code', 'sign.code.go': 'Ouvrir le document', 'sign.yours': 'Votre partie',
    'sign.agree': 'J\'ai lu ce document et je l\'accepte.', 'sign.go': 'Signer', 'sign.done': 'Signé. Une copie est dans votre e-mail.',
    'sign.download': 'Télécharger ma copie signée', 'sign.expired': 'Ce lien a expiré.', 'sign.askNew': 'Demander un nouveau lien',
    'sign.asked': 'C\'est fait : la société est prévenue et enverra un nouveau lien.', 'sign.withdrawn': 'Ce document a été retiré par la société.',
    'sign.already': 'Ce document est déjà signé. Votre copie a été envoyée à votre e-mail.', 'sign.badlink': 'Ce lien n\'est pas valide.',
    'check.title': 'Vérifier un document signé', 'check.lead': 'Déposez un PDF ici. Il ne quitte jamais votre ordinateur : seule son empreinte est vérifiée.',
    'check.pick': 'Choisir un PDF', 'check.ok': 'Authentique et intact', 'check.no': 'Introuvable : ce fichier a été modifié, ou n\'a pas été signé ici.',
    'check.by': '{title} ({number}), signé pour la société par {company} le {at1} et par {recipient} le {at2}.',
    'err.NETWORK': 'Pas de connexion. Réessayez.', 'err.SERVER': 'Le service n\'a pas répondu. Réessayez dans une minute.',
    'err.SIGN_IN': 'Veuillez vous reconnecter.', 'err.CODE_WRONG': 'Code incorrect. Encore {left} essais.',
    'err.CODE_EXPIRED': 'Ce code a expiré. Demandez-en un nouveau.', 'err.LOCKED': 'Trop d\'essais. Attendez 15 minutes.',
    'err.WAIT': 'Un code vient d\'être envoyé. Attendez une minute.', 'err.CODE_AGAIN': 'Veuillez confirmer votre code à nouveau.',
    'err.MAIL_LIMIT': 'La limite d\'e-mails du jour est atteinte. Réessayez demain.', 'err.INCOMPLETE': 'Des champs manquent ou ne sont pas valides.',
    'err.SIGNATURE_MISSING': 'Une signature est nécessaire.', 'err.BAD_EMAIL': 'Cette adresse e-mail n\'est pas valide.',
    'err.LINK_INVALID': 'Ce lien n\'est pas valide.', 'err.BAD_STATE': 'Ce document ne peut plus être modifié.',
    'err.OWNER_ONLY': 'Seul le propriétaire peut faire cela.', 'err.ALREADY_MANAGER': 'Déjà responsable.', 'err.NOT_FOUND': 'Introuvable.',
    'err.AGREE_NEEDED': 'Veuillez cocher votre accord.', 'err.INTERNAL': 'Une erreur est survenue. Réessayez.'
  }
};

var Lang = (function () {
  var saved = localStorage.getItem('mts.lang');
  var current = saved || (((navigator.language || 'en').slice(0, 2) === 'fr') ? 'fr' : 'en');
  function t(key, vars) {
    var s = (I18N[current] && I18N[current][key]) || I18N.en[key] || key;
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    // texts that come from the back end in both languages (template titles, field labels)
    (root || document).querySelectorAll('[data-en]').forEach(function (el) {
      el.textContent = current === 'fr' ? el.dataset.fr : el.dataset.en;
    });
    document.documentElement.lang = current;
  }
  function set(lang) {
    current = lang;
    localStorage.setItem('mts.lang', lang);
    apply();
    document.dispatchEvent(new CustomEvent('langchange'));
  }
  function menu(holder) {
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Language / Langue');
    sel.innerHTML = '<option value="en">English</option><option value="fr">Français</option>';
    sel.value = current;
    sel.style.width = 'auto';
    sel.onchange = function () { set(sel.value); };
    holder.appendChild(sel);
  }
  return { t: t, apply: apply, set: set, menu: menu, get: function () { return current; } };
})();
```

**Step 4: `assets/api.js`** (named `Http` so that it never reads like the back end's `Api`)

```js
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
  function download(b64, name) {
    var url = URL.createObjectURL(new Blob([bytes(b64)], { type: 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
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
  return { call: call, reportedIp: reportedIp, bytes: bytes, download: download, toast: toast };
})();
```

**Step 5: Check the scripts parse and commit**

Run: `for f in assets/config.js assets/i18n.js assets/api.js; do node --check "$f" || exit 1; done && echo ok`
Expected: `ok`

```bash
git add assets/config.js assets/app.css assets/i18n.js assets/api.js
git commit -m "Pages: EduCore's look, English and French, the call to the back end"
```

---

### Task 18: Pages: the signature pad and the PDF viewer

**Files:**
- Create: `assets/pad.js`, `assets/pdfview.js`
- Create: `assets/vendor/pdfjs/pdf.min.mjs`, `assets/vendor/pdfjs/pdf.worker.min.mjs`, `assets/vendor/pdfjs/VERSION`, `assets/vendor/pdfjs/LICENSE`

**Step 1: Vendor a pinned pdf.js** (no third-party script at run time for the document itself)

Run:
```bash
cd /Users/brinketu/mylestech-sign && V=$(npm view pdfjs-dist version) && T=$(mktemp -d) && \
(cd "$T" && npm pack "pdfjs-dist@$V" >/dev/null && tar xzf "pdfjs-dist-$V.tgz") && mkdir -p assets/vendor/pdfjs && \
cp "$T/package/build/pdf.min.mjs" "$T/package/build/pdf.worker.min.mjs" "$T/package/LICENSE" assets/vendor/pdfjs/ && \
echo "$V" > assets/vendor/pdfjs/VERSION && ls -la assets/vendor/pdfjs && rm -rf "$T"
```
Expected: the four files listed, `VERSION` holding the version printed by npm.

**Step 2: `assets/pad.js`**

```js
// Draw or type a signature; export a transparent PNG. Works with mouse, pen and finger.
function SignaturePad(canvas) {
  var ctx = canvas.getContext('2d');
  var drawing = false;
  var empty = true;
  var last = null;
  var listeners = [];
  function changed() { listeners.forEach(function (f) { f(); }); }
  function setup() {
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#17233C';
    ctx.fillStyle = '#17233C';
  }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
    if (empty) { empty = false; changed(); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drawing = false; });
  });
  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; changed(); }
  async function typed(name) {
    clear();
    if (!name) return;
    try { await document.fonts.load('600 44px "Dancing Script"'); } catch (e) { /* the fallback font still draws */ }
    var r = canvas.getBoundingClientRect();
    ctx.font = '600 44px "Dancing Script", "Brush Script MT", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 18, r.height / 2);
    empty = false;
    changed();
  }
  setup();
  window.addEventListener('resize', function () { if (empty) setup(); });
  return {
    clear: clear, typed: typed,
    png: function () { return canvas.toDataURL('image/png'); },
    isEmpty: function () { return empty; },
    onChange: function (f) { listeners.push(f); }
  };
}
```

**Step 3: `assets/pdfview.js`** (an ES module)

```js
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// Renders every page of the PDF into the container, as wide as the container.
export async function showPdf(container, bytes) {
  container.innerHTML = '';
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const width = container.clientWidth || 720;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  return doc.numPages;
}
```

**Step 4: Check and commit**

Run: `node --check assets/pad.js && T=$(mktemp -d) && cp assets/pdfview.js "$T/pdfview.mjs" && node --check "$T/pdfview.mjs" && rm -rf "$T" && echo ok`
Expected: `ok`

```bash
git add assets/pad.js assets/pdfview.js assets/vendor/pdfjs
git commit -m "Pages: the signature pad and a pinned pdf.js viewer"
```

---

### Task 19: The manager console (`index.html`)

**Files:**
- Create: `index.html`, `assets/console.js`

**Step 1: `index.html`** (the head and script tags are the same on all three pages)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Myles Tech Sign</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Dancing+Script:wght@600&display=swap">
  <link rel="stylesheet" href="assets/app.css">
</head>
<body>
  <header class="top"><div class="brand">Myles Tech <span>Sign</span></div><div id="lang"></div></header>
  <main class="stack">
    <section id="signin" class="card lift hidden"></section>
    <section id="home" class="hidden"></section>
    <section id="compose" class="stack hidden"></section>
    <section id="managers" class="hidden"></section>
  </main>
  <dialog id="viewer"><button class="x" aria-label="Close">&times;</button><div class="pages" id="viewer-pages"></div></dialog>
  <dialog id="confirm"><button class="x" aria-label="Close">&times;</button><p id="confirm-text"></p>
    <div class="actions"><button class="pill red" id="confirm-ok"></button><button class="pill" id="confirm-no">OK</button></div></dialog>
  <script src="assets/config.js"></script>
  <script src="assets/core.js"></script>
  <script src="assets/i18n.js"></script>
  <script src="assets/api.js"></script>
  <script src="assets/pad.js"></script>
  <script type="module" src="assets/console.js"></script>
</body>
</html>
```

**Step 2: `assets/console.js`**

```js
import { showPdf } from './pdfview.js';

const $ = (s) => document.querySelector(s);
const state = { session: localStorage.getItem('mts.session') || '', me: null, templates: [], pad: null, typeMode: false };
const VIEWS = ['signin', 'home', 'compose', 'managers'];

function show(id) { VIEWS.forEach((v) => $('#' + v).classList.toggle('hidden', v !== id)); }
function bi(el, en, fr) { el.dataset.en = en; el.dataset.fr = fr; el.textContent = Lang.get() === 'fr' ? fr : en; return el; }
function errorIn(sel, e) { $(sel).textContent = e ? e.message : ''; }

async function call(action, payload) {
  try {
    return await Http.call(action, Object.assign({ session: state.session }, payload || {}));
  } catch (e) {
    if (e.code === 'SIGN_IN') { localStorage.removeItem('mts.session'); state.session = ''; renderSignin(); }
    throw e;
  }
}

function closeOnX(dialog) { dialog.querySelector('.x').onclick = () => dialog.close(); }
function confirmBox(text, okLabel) {
  const d = $('#confirm');
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
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
  $('#si-send').onclick = async () => {
    errorIn('#si-error');
    try { await Http.call('manager.requestCode', { email: $('#si-email').value }); $('#si-step2').classList.remove('hidden'); $('#si-code').focus(); }
    catch (e) { errorIn('#si-error', e); }
  };
  $('#si-go').onclick = async () => {
    errorIn('#si-error');
    try {
      const r = await Http.call('manager.verifyCode', { email: $('#si-email').value, code: $('#si-code').value });
      state.session = r.session; state.me = r.me; localStorage.setItem('mts.session', r.session);
      renderHome();
    } catch (e) { errorIn('#si-error', e); }
  };
}

async function renderHome() {
  show('home');
  const owner = state.me.role === 'owner';
  $('#home').innerHTML = `<div class="card">
    <div class="actions" style="justify-content:space-between;margin:0">
      <h1 data-i18n="console.title"></h1>
      <div class="actions" style="margin:0">
        <button class="pill blue" id="h-new" data-i18n="console.new"></button>
        ${owner ? '<button class="pill" id="h-managers" data-i18n="console.managers"></button>' : ''}
        <button class="pill" id="h-out" data-i18n="console.signout"></button>
      </div>
    </div>
    <label class="field" style="margin-top:14px"><input id="h-q" type="search" data-i18n-ph="console.search"></label>
    <div class="list" id="h-list"></div></div>`;
  Lang.apply($('#home'));
  $('#h-new').onclick = renderCompose;
  if (owner) $('#h-managers').onclick = renderManagers;
  $('#h-out').onclick = async () => { try { await call('manager.signOut'); } catch (e) { /* signed out anyway */ }
    localStorage.removeItem('mts.session'); state.session = ''; renderSignin(); };
  let timer;
  $('#h-q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => loadList($('#h-q').value), 300); };
  await loadList('');
}

async function loadList(q) {
  const list = $('#h-list');
  const rows = await call('documents.list', { query: q });
  list.innerHTML = rows.length ? '' : `<p class="muted">${Lang.t('console.empty')}</p>`;
  rows.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<div><strong></strong><div class="muted"></div></div>
      <div class="actions" style="margin:0"><span class="badge ${r.status}"></span></div>`;
    el.querySelector('strong').textContent = r.recipient_name + ' (' + r.number + ')';
    el.querySelector('.muted').textContent = r.recipient_email + ' · ' + (r.completed_at || r.sent_at).slice(0, 10);
    el.querySelector('.badge').textContent = Lang.t('status.' + r.status);
    const acts = el.querySelector('.actions');
    const btn = (key, cls, fn) => { const b = document.createElement('button'); b.className = 'pill ' + cls;
      b.textContent = Lang.t(key); b.onclick = fn; acts.appendChild(b); };
    btn('doc.download', '', async () => { try { const d = await call('documents.download', { number: r.number }); Http.download(d.pdf, d.name); } catch (e) { Http.toast(e.message); } });
    if (['sent', 'opened', 'expired'].includes(r.status)) {
      btn('doc.resend', '', async () => { try { await call('documents.resend', { number: r.number }); Http.toast(Lang.t('new.sent', { number: r.number })); loadList(q); } catch (e) { Http.toast(e.message); } });
    }
    if (['sent', 'opened'].includes(r.status)) {
      btn('doc.withdraw', 'red', async () => {
        if (!(await confirmBox(Lang.t('doc.confirmWithdraw'), Lang.t('doc.withdraw')))) return;
        try { await call('documents.withdraw', { number: r.number }); loadList(q); } catch (e) { Http.toast(e.message); }
      });
    }
    list.appendChild(el);
  });
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
  if (!state.templates.length) state.templates = await call('templates.list');
  const tpl = state.templates.find((t) => t.code === 'NDA') || state.templates[0];
  const names = tpl.fields.map((f) => f.name);
  $('#compose').innerHTML = `
    <div class="card"><button class="x" id="c-close" aria-label="Close">&times;</button>
      <h1 id="c-title"></h1><p class="muted" data-i18n="new.title"></p></div>
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
  bi($('#c-title'), tpl.title_en, tpl.title_fr);
  tpl.fields.filter((f) => f.name === 'recipient_name' || f.name === 'recipient_email')
    .forEach((f) => $('#c-recipient').appendChild(inputFor(f)));
  const defaults = { company_signatory_name: state.me.name, company_signatory_title: state.me.title };
  tpl.fields.filter((f) => f.owner === 'company').forEach((f) => $('#c-company').appendChild(inputFor(f, defaults[f.name])));
  Lang.apply($('#compose'));
  if (matchMedia('(max-width: 640px)').matches) $('#compose details.fold').open = false;
  state.pad = SignaturePad($('#c-pad'));
  state.typeMode = false;
  const usingSaved = () => state.me.hasSignature && $('#c-saved').checked;
  const update = () => {
    $('#c-padwrap').classList.toggle('hidden', usingSaved());
    const r = SignCore.validateFields(names, collect($('#compose')), 'company');
    const need = r.missing.concat(r.invalid).map((n) => { const f = tpl.fields.find((x) => x.name === n);
      return f ? (Lang.get() === 'fr' ? f.fr : f.en) : n; });
    if (!usingSaved() && state.pad.isEmpty()) need.push(Lang.t('need.signature'));
    $('#c-send').disabled = need.length > 0;
    $('#c-preview').disabled = need.length > 0;
    $('#c-why').textContent = need.length ? Lang.t('need', { list: need.join(', ') }) : '';
  };
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
  const payload = () => ({ template: tpl.code, values: collect($('#compose')),
    signature: usingSaved() ? '' : state.pad.png(), saveSignature: !usingSaved() && $('#c-remember').checked });
  $('#c-preview').onclick = async () => {
    errorIn('#c-error');
    try {
      const r = await call('documents.preview', payload());
      const d = $('#viewer'); closeOnX(d); d.showModal();
      await showPdf($('#viewer-pages'), Http.bytes(r.pdf));
    } catch (e) { errorIn('#c-error', e); }
  };
  $('#c-send').onclick = async () => {
    errorIn('#c-error');
    $('#c-send').disabled = true;
    try {
      const p = payload();
      const r = await call('documents.send', p);
      const name = p.values.company_signatory_name, title = p.values.company_signatory_title;
      if (name !== state.me.name || title !== state.me.title || p.saveSignature) {
        state.me = await call('manager.saveProfile', { name: name, title: title });
      }
      Http.toast(Lang.t('new.sent', { number: r.number }));
      renderHome();
    } catch (e) { errorIn('#c-error', e); update(); }
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
    <p class="error" id="m-error"></p></div>`;
  Lang.apply($('#managers'));
  rows.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = '<div><strong></strong><div class="muted"></div></div>';
    el.querySelector('strong').textContent = (m.name || m.email) + (m.role === 'owner' ? ' (owner)' : '');
    el.querySelector('.muted').textContent = m.email;
    if (m.role !== 'owner') {
      const b = document.createElement('button');
      b.className = 'pill red';
      b.textContent = Lang.t('managers.remove');
      b.onclick = async () => { try { await call('managers.remove', { email: m.email }); renderManagers(); } catch (e) { errorIn('#m-error', e); } };
      el.appendChild(b);
    }
    $('#m-list').appendChild(el);
  });
  $('#m-add').onclick = async () => {
    try { await call('managers.add', { email: $('#m-email').value, name: $('#m-name').value, title: $('#m-title').value }); renderManagers(); }
    catch (e) { errorIn('#m-error', e); }
  };
  $('#m-close').onclick = renderHome;
}

async function boot() {
  Lang.menu($('#lang'));
  Lang.apply();
  document.addEventListener('langchange', () => Lang.apply());
  if (state.session) {
    try { state.me = await call('manager.me'); return renderHome(); } catch (e) { /* sign in again */ }
  }
  renderSignin();
}

boot();
```

**Step 3: Check and commit**

Run: `T=$(mktemp -d) && cp assets/console.js assets/pdfview.js "$T/" && mv "$T/console.js" "$T/console.mjs" && node --check "$T/console.mjs" && rm -rf "$T" && echo ok`
Expected: `ok`

```bash
git add index.html assets/console.js
git commit -m "Pages: the manager console (sign-in, documents, new NDA, managers)"
```

---

### Task 20: The signing page (`sign.html`)

**Files:**
- Create: `sign.html`, `assets/sign.js`

**Step 1: `sign.html`**: the same `<head>`, header and script tags as `index.html` (Task 19), with this `<main>`
and `assets/sign.js` as the module (no `pad.js` change):

```html
  <main class="stack">
    <section id="s-head" class="card"><h1 id="s-title" data-i18n="sign.title"></h1><p class="muted" id="s-number"></p></section>
    <section id="s-message" class="card hidden"><p id="s-message-text"></p><div class="actions" id="s-message-actions"></div></section>
    <section id="s-code" class="card lift hidden">
      <p id="s-code-lead"></p>
      <div class="actions"><button class="pill blue" id="s-send" data-i18n="sign.code.send"></button></div>
      <div id="s-code-2" class="hidden">
        <label class="field"><span data-i18n="signin.code"></span><input id="s-code-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
        <div class="actions"><button class="pill blue" id="s-open" data-i18n="sign.code.go"></button></div>
      </div>
      <p class="error" id="s-code-error"></p>
    </section>
    <section id="s-doc" class="stack hidden">
      <div class="card"><div class="pages" id="s-pages"></div></div>
      <div class="card lift"><h2 data-i18n="sign.yours"></h2><div class="grid" id="s-form"></div>
        <canvas class="pad" id="s-pad"></canvas><input id="s-typed" class="hidden" data-i18n-ph="pad.typed">
        <div class="actions"><button class="pill" id="s-clear" data-i18n="pad.clear"></button><button class="pill" id="s-mode" data-i18n="pad.type"></button></div>
        <label class="field" style="margin-top:14px"><input type="checkbox" id="s-agree"><span data-i18n="sign.agree"></span></label>
        <div class="actions"><button class="pill blue large" id="s-sign" data-i18n="sign.go"></button></div>
        <p class="why" id="s-why"></p><p class="error" id="s-error"></p></div>
    </section>
    <section id="s-done" class="card lift hidden"><h2 data-i18n="sign.done"></h2>
      <div class="actions"><button class="pill blue" id="s-download" data-i18n="sign.download"></button></div></section>
  </main>
```

**Step 2: `assets/sign.js`**

```js
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
  b.onclick = async () => { try { await Http.call('recipient.askNewLink', { number, secret }); Http.toast(Lang.t('sign.asked')); b.disabled = true; } catch (e) { Http.toast(e.message); } };
  $('#s-message-actions').appendChild(b);
}

function codeStep(info) {
  show('s-code');
  $('#s-code-lead').textContent = Lang.t('sign.code.lead', { email: info.sentTo });
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
```

**Step 3: Check and commit**

Run: `T=$(mktemp -d) && cp assets/sign.js "$T/sign.mjs" && cp assets/pdfview.js "$T/" && node --check "$T/sign.mjs" && rm -rf "$T" && echo ok`
Expected: `ok`

```bash
git add sign.html assets/sign.js
git commit -m "Pages: the signing page (code, read, fill, sign, download)"
```

---

### Task 21: The check page (`check.html`)

**Files:**
- Create: `check.html`, `assets/check.js`

**Step 1: `check.html`**: same `<head>`, header and scripts (without `pad.js`), module `assets/check.js`:

```html
  <main class="stack">
    <section class="card"><h1 data-i18n="check.title"></h1><p class="muted" data-i18n="check.lead"></p></section>
    <section class="card lift"><div class="drop" id="drop"><p data-i18n="check.lead"></p>
      <button class="pill blue" id="pick" data-i18n="check.pick"></button></div>
      <input type="file" id="file" accept="application/pdf" class="hidden"></section>
    <section class="card hidden" id="result"><h2 id="result-title"></h2><p id="result-text"></p></section>
  </main>
```

**Step 2: `assets/check.js`**

```js
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
```

**Step 3: Check and commit**

Run: `T=$(mktemp -d) && cp assets/check.js "$T/check.mjs" && node --check "$T/check.mjs" && rm -rf "$T" && echo ok`
Expected: `ok`

```bash
git add check.html assets/check.js
git commit -m "Pages: the check page (fingerprint computed in the browser)"
```

---

### Task 22: The pages tested end to end against a local stand-in

**Files:**
- Create: `tests/e2e/mock-backend.mjs`, `tests/e2e/pages.test.mjs`
- Modify: `package.json` (dev dependency `playwright`)

The stand-in implements the same actions as `apps-script/Api.js` for one owner, in memory, with the same shared
rules (`assets/core.js`). It serves the pages, rewrites `assets/config.js` to point at itself, keeps an outbox
of the codes and links it "sent", and returns a small valid PDF. Chrome as installed on the Mac is used
(`channel: 'chrome'`), so no browser download is needed.

**Step 1: Install Playwright for the tests only**

Run: `cd /Users/brinketu/mylestech-sign && npm i -D playwright && git status --short`
Expected: `package.json` and `package-lock.json` changed; `node_modules/` ignored.

**Step 2: Write the stand-in**

`tests/e2e/mock-backend.mjs`:
```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../../assets/core.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAMES = ['recipient_name', 'recipient_email', 'recipient_address', 'recipient_school', 'recipient_course',
  'company_role_department', 'company_supervisor', 'company_effective_date', 'company_start_date', 'company_end_date',
  'company_work_location', 'company_security_contact', 'company_urgent_channel', 'company_signatory_name',
  'company_signatory_title', 'company_signature', 'company_signed_date', 'recipient_signature',
  'recipient_signed_date', 'recipient_place'];
const FIELDS = NAMES.map((n) => ({ name: n, owner: C.fieldOwner(n), kind: C.fieldKind(n), en: C.humanLabel(n), fr: C.humanLabel(n) }));
const TEMPLATE = { code: 'NDA', title_en: 'Student Intern Non Disclosure Agreement', title_fr: 'Accord de confidentialité', fields: FIELDS };
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
    codes: {}, sessions: {}, tickets: {}, seq: 0, url: '' };
  const send = (to, extra) => s.outbox.push(Object.assign({ to }, extra));
  const manager = (token) => { const e = s.sessions[token]; const m = s.managers.find((x) => x.email === e); if (!m) throw fail('SIGN_IN'); return m; };
  const byLink = (req) => { const d = s.docs.find((x) => x.number === req.number); if (!d || d.secret !== req.secret) throw fail('LINK_INVALID'); return d; };
  const checkCode = (key, code) => { if (s.codes[key] !== String(code || '').trim()) throw fail('CODE_WRONG', { left: 4 }); delete s.codes[key]; };
  const routes = {
    'manager.requestCode': (r) => { const code = C.codeFromHex(crypto.randomBytes(8).toString('hex')); s.codes['m:' + r.email] = code;
      if (s.managers.some((m) => m.email === r.email)) send(r.email, { code }); return { sent: true }; },
    'manager.verifyCode': (r) => { checkCode('m:' + r.email, r.code); const token = crypto.randomBytes(16).toString('hex');
      s.sessions[token] = r.email; const m = s.managers.find((x) => x.email === r.email); return { session: token, me: Object.assign({ hasSignature: false }, m) }; },
    'manager.me': (r) => Object.assign({ hasSignature: false }, manager(r.session)),
    'manager.signOut': (r) => { delete s.sessions[r.session]; return { ok: true }; },
    'manager.saveProfile': (r) => { const m = manager(r.session); m.name = r.name; m.title = r.title; return Object.assign({ hasSignature: false }, m); },
    'templates.list': (r) => { manager(r.session); return [TEMPLATE]; },
    'documents.preview': (r) => { manager(r.session); return { pdf: pdf('preview').toString('base64') }; },
    'documents.send': (r) => {
      const m = manager(r.session);
      const v = C.validateFields(NAMES, r.values, 'company');
      if (v.missing.length || v.invalid.length || !r.signature) throw fail('INCOMPLETE', v);
      const number = C.documentNumber('NDA', 2026, ++s.seq);
      const d = { number, status: 'sent', secret: crypto.randomBytes(16).toString('hex'), manager_email: m.email,
        recipient_name: v.clean.recipient_name, recipient_email: v.clean.recipient_email, sent_at: new Date().toISOString(),
        completed_at: '', expires_at: C.expiresAt(Date.now()), company: v.clean, sent: pdf('sent ' + number) };
      s.docs.push(d);
      send(d.recipient_email, { link: s.url + '/sign.html#' + number + '.' + d.secret });
      return { number };
    },
    'documents.list': (r) => { manager(r.session); return s.docs.map((d) => ({ number: d.number, status: d.status,
      recipient_name: d.recipient_name, recipient_email: d.recipient_email, sent_at: d.sent_at, completed_at: d.completed_at })); },
    'documents.download': (r) => { manager(r.session); const d = s.docs.find((x) => x.number === r.number);
      return { name: d.number + '.pdf', pdf: (d.signed || d.sent).toString('base64') }; },
    'recipient.open': (r) => { const d = byLink(r); return { status: d.status, number: d.number, title_en: TEMPLATE.title_en,
      title_fr: TEMPLATE.title_fr, recipient_name: d.recipient_name, sentTo: 'in***@test.local', expires_at: d.expires_at }; },
    'recipient.requestCode': (r) => { const d = byLink(r); const code = C.codeFromHex(crypto.randomBytes(8).toString('hex'));
      s.codes['r:' + d.number] = code; send(d.recipient_email, { code }); return { sentTo: 'in***@test.local' }; },
    'recipient.verifyCode': (r) => { const d = byLink(r); checkCode('r:' + d.number, r.code); d.status = C.transition(d.status, 'open');
      const ticket = crypto.randomBytes(16).toString('hex'); s.tickets[ticket] = d.number;
      return { ticket, pdf: d.sent.toString('base64'), form: C.sideFields(NAMES, 'recipient').map((n) => FIELDS.find((f) => f.name === n)),
        values: { recipient_name: d.recipient_name } }; },
    'recipient.sign': (r) => { const d = byLink(r); if (s.tickets[r.ticket] !== d.number) throw fail('CODE_AGAIN');
      if (r.agree !== true) throw fail('AGREE_NEEDED');
      const v = C.validateFields(NAMES, r.values, 'recipient');
      if (v.missing.length || v.invalid.length || !r.signature) throw fail('INCOMPLETE', v);
      d.status = C.transition(d.status, 'sign'); d.completed_at = new Date().toISOString();
      d.signed = pdf('signed ' + d.number + ' ' + d.completed_at); d.sha = sha(d.signed); d.recipient = v.clean;
      return { number: d.number, pdf: d.signed.toString('base64') }; },
    'check.lookup': (r) => { const d = s.docs.find((x) => x.sha === r.sha256);
      return d ? { found: true, number: d.number, title_en: TEMPLATE.title_en, title_fr: TEMPLATE.title_fr,
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
    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  s.url = 'http://127.0.0.1:' + server.address().port;
  return {
    url: s.url,
    lastTo: (to) => s.outbox.filter((m) => m.to === to).slice(-1)[0],
    signedPdf: (number) => s.docs.find((d) => d.number === number).signed,
    stop: () => new Promise((ok) => server.close(ok))
  };
}
```

**Step 3: Write the failing end-to-end test**

`tests/e2e/pages.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { start } from './mock-backend.mjs';

async function prepare(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('https://api.ipify.org/**', (r) => r.fulfill({ json: { ip: '198.51.100.7' } }));
}
async function draw(page, selector) {
  const b = await page.locator(selector).boundingBox();
  await page.mouse.move(b.x + 30, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 110, { steps: 10 });
  await page.mouse.up();
}

test('a manager sends the NDA, the intern signs it, the check page knows the signed copy', async () => {
  const srv = await start(0);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-e2e-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await prepare(page);
    await page.goto(srv.url + '/index.html');
    await page.fill('#si-email', 'owner@test.local');
    await page.click('#si-send');
    await page.fill('#si-code', srv.lastTo('owner@test.local').code);
    await page.click('#si-go');
    await page.click('#h-new');
    await page.waitForSelector('#c-send');
    assert.equal(await page.isDisabled('#c-send'), true, 'Send must wait for the fields and a signature');
    assert.match(await page.textContent('#c-why'), /Still needed/);
    const company = { recipient_name: 'Awa Ndi', recipient_email: 'intern@test.local', company_role_department: 'Marketing',
      company_supervisor: 'B. Supervisor', company_effective_date: '2026-12-01', company_start_date: '2026-12-01',
      company_end_date: '2027-03-01', company_work_location: 'Yaounde', company_security_contact: 'security@test.local',
      company_urgent_channel: '+237 600 000 000', company_signatory_name: 'A Manager', company_signatory_title: 'Director' };
    for (const [k, v] of Object.entries(company)) await page.fill(`#compose input[name="${k}"]`, v);
    await draw(page, '#c-pad');
    assert.equal(await page.isDisabled('#c-send'), false);
    await page.click('#c-send');
    await page.waitForSelector('.row .badge.sent');

    const intern = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await prepare(intern);
    await intern.goto(srv.lastTo('intern@test.local').link);
    await intern.click('#s-send');
    await intern.fill('#s-code-input', srv.lastTo('intern@test.local').code);
    await intern.click('#s-open');
    await intern.waitForSelector('#s-pages canvas');
    for (const [k, v] of Object.entries({ recipient_address: 'Yaounde', recipient_school: 'University of Yaounde I',
      recipient_course: 'Computer science', recipient_place: 'Yaounde' })) await intern.fill(`#s-form input[name="${k}"]`, v);
    await draw(intern, '#s-pad');
    assert.equal(await intern.isDisabled('#s-sign'), true, 'Sign must wait for the agreement box');
    await intern.check('#s-agree');
    await intern.click('#s-sign');
    await intern.waitForSelector('#s-done:not(.hidden)');

    const signed = path.join(dir, 'signed.pdf');
    fs.writeFileSync(signed, srv.signedPdf('MT-NDA-2026-0001'));
    const changed = path.join(dir, 'changed.pdf');
    const bytes = fs.readFileSync(signed); bytes[bytes.length - 3] ^= 1; fs.writeFileSync(changed, bytes);
    const check = await browser.newPage();
    await prepare(check);
    await check.goto(srv.url + '/check.html');
    await check.setInputFiles('#file', signed);
    await check.waitForFunction(() => document.querySelector('#result-title').textContent.length > 0);
    assert.match(await check.textContent('#result-title'), /Genuine and unchanged/);
    await check.setInputFiles('#file', changed);
    await check.waitForFunction(() => /Not found/.test(document.querySelector('#result-title').textContent));
  } finally {
    await browser.close();
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 4: Run it**

Run: `npm run e2e`
Expected: PASS (`# pass 1`). If it fails, the message names the step; fix the page code, not the test.

**Step 5: Commit**

```bash
git add package.json package-lock.json tests/e2e/mock-backend.mjs tests/e2e/pages.test.mjs
git commit -m "End-to-end test of the three pages against a local stand-in"
```

---

### Task 23: Publish the pages on GitHub

**Files:** none new. Uses the GitHub token in the macOS keychain (service `educore-github-replica`).

**Step 1: Make sure nothing private is tracked**

Run:
```bash
cd /Users/brinketu/mylestech-sign && git ls-files | grep -E '^templates/|TemplateNda|\.clasp\.json' ; \
git grep -nE '[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.' -- . ':!tests' ; \
git grep -n "$(printf '\342\200\224')" ; gitleaks git . --redact --no-banner --log-level error --exit-code 1 && echo "clean"
```
Expected: no file listed, no address, no em dash, and `clean`.

**Step 2: Create the public repository and push**

Run:
```bash
export GH_TOKEN="$(security find-generic-password -s educore-github-replica -w)"
gh repo create mylestechsolutions/sign --public --description "Myles Tech document signing" --disable-issues --disable-wiki
git -c credential.helper= -c credential.helper=/Users/brinketu/EducationApp/local-stack/replica/git-credential-educore \
  -c http.version=HTTP/1.1 push https://github.com/mylestechsolutions/sign.git main
```
Expected: the repository exists and `main` is pushed.

**Step 3: Switch on GitHub Pages from `main`, root folder, and wait for it**

Run:
```bash
gh api -X POST repos/mylestechsolutions/sign/pages -f 'source[branch]=main' -f 'source[path]=/'
for i in $(seq 1 30); do s=$(gh api repos/mylestechsolutions/sign/pages/builds/latest --jq .status 2>/dev/null); [ "$s" = built ] && break; sleep 10; done; echo "$s"
for p in "" sign.html check.html assets/core.js assets/vendor/pdfjs/pdf.min.mjs; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://mylestechsolutions.github.io/sign/$p)" "$p"; done
```
Expected: `built`, then `200` for every path.

---

### Task 24: The back end on Google (the owner's two steps included)

**Step 1 (owner):** open https://script.google.com/home/usersettings, switch "Google Apps Script API" on.

**Step 2 (owner):** in this terminal type `! npx @google/clasp login`, sign in as the owner's Gmail and allow.

**Step 3: Create the script project and push**

Run:
```bash
cd /Users/brinketu/mylestech-sign && npx @google/clasp create-script --type standalone --title "Myles Tech Sign" --rootDir apps-script
npm run sync && scripts/embed-template.sh && npx @google/clasp push --force
git status --short
```
Expected: `.clasp.json` created (ignored), every file pushed (`appsscript.json`, the eight `.js` files,
`TemplateNda.html`), and `git status` clean.

**Step 4 (owner):** open the project (`npx @google/clasp open-script`), choose the function `setup`, press Run,
then Review permissions, the owner's account, "Advanced", "Go to Myles Tech Sign", Allow. The execution log
must show: `template fields: 19 ok`, `fields left after filling: 0 ok`, a PDF size, `managers: 1, templates: 1`.

**Step 5: Deploy the web app and check it answers**

Run:
```bash
npx @google/clasp create-deployment --description "v1"
ID=<the deployment id printed>; curl -sL "https://script.google.com/macros/s/$ID/exec"
```
Expected: `{"ok":true,"data":{"service":"mylestech-sign","version":"1.0.0"}}`

**Step 6: Point the pages at it, publish, check**

Replace `DEPLOYMENT_ID` in `assets/config.js` with the id, then:
```bash
git add assets/config.js && git commit -m "Pages: point at the deployed back end"
git -c credential.helper= -c credential.helper=/Users/brinketu/EducationApp/local-stack/replica/git-credential-educore \
  -c http.version=HTTP/1.1 push https://github.com/mylestechsolutions/sign.git main
```
Expected: after the Pages build, https://mylestechsolutions.github.io/sign/ shows the sign-in card; asking a code
for an unknown address answers "If this address belongs to a manager, a code is on its way."

Later script changes: `npm run sync && npx @google/clasp push --force && npx @google/clasp update-deployment <ID>`
(the same deployment id keeps the address unchanged).

---

### Task 25: The test NDA with the owner (before any real use)

With the owner, on https://mylestechsolutions.github.io/sign/ (owner's Gmail signs in; a second address of the
owner receives):

1. Sign in with the code; Send stays inactive and lists what is missing; fill, sign, Preview shows the PDF with
   the company part and the company signature in place; Sign and send.
2. The second address gets the invitation: sender "Myles Tech Solutions", replies go to the manager, the blue
   button opens `sign.html`, the code e-mail arrives, the NDA shows with the company part filled.
3. Fill the intern's part, sign, tick, Sign. Both addresses receive the signed PDF: both signatures in place,
   dates filled, the certificate page last.
4. The check page says "Genuine and unchanged" for the attachment, and "Not found" after the PDF is opened and
   saved again in another program (its bytes change).
5. Send a second test NDA and withdraw it: its link says "withdrawn". Type five wrong codes on a third: "Too
   many tries. Wait 15 minutes."
6. Look at the Drive folder "MylesTech signing" and the "Signing register" sheet: one folder per document, every
   step in `log`, no secret visible in the sheet (only `secret_hash`).

Write down anything that differs from these expectations and fix it before the first real NDA.

---

### Task 26: A private copy of the template on GitHub

The founder's standing rule is that everything lives on GitHub too. The template is the company's agreement,
so it goes to a PRIVATE repository, never to `sign`.

Run:
```bash
export GH_TOKEN="$(security find-generic-password -s educore-github-replica -w)"
gh repo create mylestechsolutions/sign-templates --private --description "Myles Tech signing templates (private)" --disable-issues --disable-wiki
gh api -X PUT repos/mylestechsolutions/sign-templates/actions/permissions -F enabled=false
T=$(mktemp -d) && git -C "$T" init -q -b main && cp /Users/brinketu/mylestech-sign/templates/student-intern-nda.docx "$T/" && \
cp /Users/brinketu/Downloads/MylesTech_Cameroon_Student_Intern_NDA.docx "$T/original-student-intern-nda.docx" && \
git -C "$T" add -A && git -C "$T" commit -q -m "Student Intern NDA: the original and the marked template" && \
git -C "$T" -c credential.helper= -c credential.helper=/Users/brinketu/EducationApp/local-stack/replica/git-credential-educore \
  -c http.version=HTTP/1.1 push -q https://github.com/mylestechsolutions/sign-templates.git main && rm -rf "$T" && echo pushed
```
Expected: `pushed`; the repository is private (`gh api repos/mylestechsolutions/sign-templates --jq .private` prints `true`).

---

## Amendment 1 (26 November 2026): every e-mail goes through Amazon SES

The founder, during the build: "make sure u wire the email functionality and ensure parties can send email use
the SES we have in AWS". So the back end no longer sends with MailApp (Gmail). It calls Amazon SES in the
management account, region us-east-1 (production access, 50,000 e-mails a day, the domain
`mylestechsolutionsllc.com` verified with DKIM), over HTTPS, signed with AWS Signature Version 4, as an IAM user
that may only send as `sign@mylestechsolutionsllc.com`.

- **From:** `Myles Tech Solutions <sign@mylestechsolutionsllc.com>`. **Reply-To:** the manager who sent the
  document, so the parties write to each other simply by replying.
- **Cost:** $0.10 per 1,000 e-mails. The Gmail limit of about 100 a day no longer applies.
- **Manifest (Task 10):** replace the scope `https://www.googleapis.com/auth/script.send_mail` with
  `https://www.googleapis.com/auth/script.external_request`.
- **Task 7a (new, after Task 7):** two pure functions in `assets/core.js`, tested with Node:
  `SignCore.sigv4(req, creds, crypto)` and `SignCore.mime(message, seed, crypto)`. The crypto primitives are
  passed in (`hmac`, `sha256hex`, `bytes`, `b64`) because Node, Apps Script and browsers each have their own.
  The SigV4 test's expected value is computed once with botocore (`python3 -c ...` in the task) and written
  into the test.
- **Task 14 (replaced):** `Mail.send()` builds the message with `SignCore.mime` and POSTs it to
  `https://email.us-east-1.amazonaws.com/v2/email/outbound-emails` (`Content.Raw`) with `UrlFetchApp`, headers
  from `SignCore.sigv4`. A refused send becomes `MAIL_FAILED` (or `MAIL_LIMIT` on HTTP 429).
- **Task 23a (new, before Task 24):** in AWS 558: IAM user `mylestech-sign-mailer`, an inline policy allowing
  only `ses:SendEmail` and `ses:SendRawEmail` on the domain identity with the condition
  `ses:FromAddress = sign@mylestechsolutionsllc.com`, one access key written to a mode-600 file (never printed).
  Proof from this Mac: Node sends one message with the same `core.js` signing to
  `success@simulator.amazonses.com` (SES's test mailbox) and gets a MessageId.
- **Task 24 (changed):** the key travels to the script in `apps-script/Secrets.html` (git-ignored, pushed by
  clasp); `setup()` moves it into Script Properties (`SES_ACCESS_KEY`, `SES_SECRET_KEY`, `MAIL_FROM`); the file is
  then deleted locally and the project pushed again, so it leaves the script project.
- **Bounces:** SES forwards bounce and complaint notices to the From address. A `sign@` mailbox at Hostinger
  receives them if the owner creates one; sending works without it.

## Amendment 2 (26 November 2026): a document type dropdown, and new types uploaded by the owner

The founder: "it should have dropdown for NDA, MOU etc".

- **Console (Task 19):** the blue button reads "New document" (`console.new`: "New document" / "Nouveau document").
  The compose view starts with a dropdown of every active template (`templates.list`), showing the title in the
  current language; the NDA is chosen first. Changing the choice rebuilds the recipient and company fields for
  that template; values typed under fields of the same name are kept.
- **Owner's templates card (new, in the Managers view):** choose a `.docx` whose blanks are marked `{{field}}`,
  give a code (2 to 8 capital letters, for example `MOU`) and the English and French titles, press Upload. The
  page sends the file as base64 to `templates.upload` (owner only).
- **`templates.upload` (new action in Task 15):** converts the file to a Google Doc (`Docs.importTemplate`),
  reads its fields (`Docs.fieldsOf`), refuses it (`TEMPLATE_INVALID`, with the reason) unless it has
  `company_signature`, `recipient_signature`, at least one `company_` and one `recipient_` field, and a code not
  already used; otherwise stores it with labels from `SignCore.humanLabel` (English and French alike) and
  answers with the field list. It appears in the dropdown at once.
- **Tests:** the stand-in (Task 22) returns two templates (`NDA` and a two-field `MOU`) and the end-to-end test
  checks that choosing MOU shows its fields and that choosing NDA again restores the NDA's.

## Amendment 3 (26 November 2026): the record of every document, and a notification at every step

The founder: "make sure track record of all MOU, NDA etc can be kept and downloaded" and "notifications flow when
docs are sent to users to sign and so on".

**The record.** Nothing is ever deleted: every document keeps its row, its folder (the sent PDF, the signed PDF,
both signature images) and every step in `log`.

- `documents.history {session, number}` (new): the steps of one document (time, step, who, detail), shown in the
  console as a timeline under each document.
- `documents.export {session, type}` (new): one ZIP (`Utilities.zip`) holding `register.csv` (one line per document:
  number, type, status, recipient, manager, sent, signed, expires, fingerprint), `history.csv` (every step) and
  `signed/<number> signed.pdf` for each signed document. A manager gets what they sent, the owner everything;
  `type` limits it to one document type. Above about 400 signed documents the ZIP is cut by year
  (`year` parameter) to stay under the web app's response size.
- Console: a type filter beside the search (All, NDA, MOU, ...) and a white "Download record" button
  (`console.export`) that downloads the ZIP for the current filter.

**Notifications.** Every step tells the person it concerns, by e-mail through SES, and the console shows it:

| Step | E-mail to | What it says |
| --- | --- | --- |
| Sent | recipient | the invitation with the link |
| Sent | manager | "Sent to ..., link valid until ..." |
| Opened (first code confirmed) | manager | "... opened the document" |
| Reminder (day 3) | recipient | the invitation again, marked Reminder |
| Signed | both | the signed PDF attached and the check page |
| Withdrawn | recipient | "This document was withdrawn by Myles Tech Solutions" |
| Resent | recipient | a new invitation (the old link stops working) |
| Expired (day 30) | manager | "... did not sign; resend from the console" |
| New link asked | manager | "... asks for a new link" |

- `Mail.notice(to, kind, rec, tpl)` (new) writes the manager and recipient notices; one function, the table above
  as its cases. A notice that fails is written to `log` and does not stop the step it reports.
- `activity.list {session, since}` (new): the latest 50 steps of the documents the manager may see. The console
  shows them in an "Activity" card with a count of the steps since the last visit (time kept in the browser).

---

## Execution

Plan complete and saved to `docs/plans/2026-11-26-document-signing.md`. Two ways to carry it out:

1. **In this session, task by task** (recommended: the founder's standing rule is small, inline work without
   agent fan-outs), with a check after every task.
2. **In a separate session** that follows this plan with superpowers:executing-plans, in batches with checkpoints.
