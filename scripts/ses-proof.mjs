// Sends one message through Amazon SES with the same signing and message code the back end uses (assets/core.js).
//   SES_KEY_FILE=~/.mylestech-sign/ses-key.json node scripts/ses-proof.mjs [to]
// The default recipient is SES's own test mailbox, which accepts the message and delivers it to nobody.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../assets/core.js');
const keyFile = (process.env.SES_KEY_FILE || '~/.mylestech-sign/ses-key.json').replace(/^~/, os.homedir());
const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const to = process.argv[2] || 'success@simulator.amazonses.com';
const N = {
  hmac: (k, text) => Array.from(crypto.createHmac('sha256', Buffer.from(k)).update(text, 'utf8').digest()),
  sha256hex: (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
  bytes: (text) => Array.from(Buffer.from(text, 'utf8')),
  b64: (text) => Buffer.from(text, 'utf8').toString('base64')
};
const raw = C.mime({ fromName: 'Myles Tech Solutions', from: key.from, to, subject: 'Signing tool mail check',
  text: 'This message proves that the signing tool can send through Amazon SES.',
  html: '<p>This message proves that the signing tool can send through Amazon SES.</p>' }, crypto.randomBytes(6).toString('hex'), N);
const body = JSON.stringify({ FromEmailAddress: key.from, Destination: { ToAddresses: [to] },
  Content: { Raw: { Data: Buffer.from(raw).toString('base64') } } });
const host = 'email.us-east-1.amazonaws.com';
const path = '/v2/email/outbound-emails';
for (let attempt = 1; attempt <= 6; attempt++) {
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const headers = C.sigv4({ host, path, region: 'us-east-1', service: 'ses', body, amzDate }, key, N);
  const res = await fetch('https://' + host + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body });
  const text = await res.text();
  if (res.status === 200) { console.log('sent through SES to ' + to + ', message ' + JSON.parse(text).MessageId); process.exit(0); }
  console.log('attempt ' + attempt + ': HTTP ' + res.status + ' ' + text.slice(0, 160));
  if (!/InvalidClientTokenId|UnrecognizedClient|SignatureDoesNotMatch|AccessDenied/.test(text) || attempt === 6) process.exit(1);
  await new Promise((ok) => setTimeout(ok, 8000));   // a new key takes a few seconds to work everywhere
}
