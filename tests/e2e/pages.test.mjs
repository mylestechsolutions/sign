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
  await page.locator(selector).scrollIntoViewIfNeeded();
  const b = await page.locator(selector).boundingBox();
  await page.mouse.move(b.x + 30, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 110, { steps: 10 });
  await page.mouse.up();
}

test('a manager picks the NDA, sends it, the intern signs it, the check page knows the signed copy', async () => {
  const srv = await start(0);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-e2e-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await prepare(page);
    await page.goto(srv.url + '/index.html');
    await page.fill('#si-email', 'owner@test.local');
    await page.click('#si-send');
    await page.waitForSelector('#si-step2:not(.hidden)');
    await page.fill('#si-code', srv.lastTo('owner@test.local').code);
    await page.click('#si-go');
    await page.waitForSelector('#h-new');
    await page.click('#h-new');
    await page.waitForSelector('#c-send');

    // the dropdown: MOU shows its own fields, NDA brings the NDA's back
    await page.selectOption('#c-type', 'MOU');
    assert.equal(await page.locator('#compose input[name="company_partner_name"]').count(), 1);
    assert.equal(await page.locator('#compose input[name="company_supervisor"]').count(), 0);
    await page.selectOption('#c-type', 'NDA');
    assert.equal(await page.locator('#compose input[name="company_supervisor"]').count(), 1);

    assert.equal(await page.isDisabled('#c-send'), true, 'Send must wait for the fields and a signature');
    assert.match(await page.textContent('#c-why'), /Still needed/);
    const company = { recipient_name: 'Awa Ndi', recipient_email: 'intern@test.local', company_role_department: 'Marketing',
      company_supervisor: 'B. Supervisor', company_effective_date: '2026-12-01', company_start_date: '2026-12-01',
      company_end_date: '2027-03-01', company_work_location: 'Yaounde', company_security_contact: 'security@test.local',
      company_urgent_channel: '+237 600 000 000', company_signatory_name: 'A Manager', company_signatory_title: 'Director' };
    for (const [k, v] of Object.entries(company)) await page.fill(`#compose input[name="${k}"]`, v);
    await draw(page, '#c-pad');
    assert.equal(await page.isDisabled('#c-send'), false, 'still waiting for: ' + await page.textContent('#c-why'));
    await page.click('#c-send');
    await page.waitForSelector('.row .badge.sent');
    assert.equal(await page.locator('.row.pending').count(), 0, 'the "Sending" row goes once the send is done');

    // Withdraw and Resend ask first; Cancel changes nothing
    for (const label of ['Withdraw', 'Resend']) {
      await page.click(`.row .pill:has-text("${label}")`);
      await page.waitForSelector('#confirm[open]');
      assert.match(await page.textContent('#confirm-text'), label === 'Withdraw' ? /Withdraw this document\?/ : /new link\?/);
      await page.click('#confirm-no');
      await page.waitForSelector('#confirm', { state: 'hidden' });
    }
    assert.equal(await page.locator('.row .badge.sent').count(), 1, 'cancelled: the document is still sent');
    assert.equal(srv.outbox().filter((m) => m.to === 'intern@test.local').length, 1, 'cancelled: no second link went out');

    const intern = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await prepare(intern);
    await intern.goto(srv.lastTo('intern@test.local').link);
    await intern.click('#s-send');
    await intern.waitForSelector('#s-code-2:not(.hidden)');
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
    const [file] = await Promise.all([intern.waitForEvent('download'), intern.click('#s-download')]);
    assert.match(file.suggestedFilename(), /signed\.pdf$/, 'the signed copy downloads on demand');

    // the record: the manager's list shows it signed, its history has the steps
    await page.reload();
    await page.waitForSelector('.row .badge.completed');
    await page.click('.row .pill:has-text("History")');
    await page.waitForFunction(() => document.querySelectorAll('#history-list li').length >= 3);

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
