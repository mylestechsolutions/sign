// Codes, manager sessions, recipient tickets and link secrets.
// Codes live only as SHA-256 hashes in the script cache (10 minutes), one a minute per subject at most.
// Sessions live 12 hours in script properties under the token's hash. A recipient who confirmed a code gets a
// one-hour ticket. Link secrets are 244 random bits: the register keeps their hash, the script properties keep
// the secret itself (never visible in the sheet) so that a reminder can repeat the same link.
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
