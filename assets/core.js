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
