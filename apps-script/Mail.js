// Every e-mail goes through Amazon SES (management account, us-east-1), from Myles Tech Solutions
// <sign@mylestechsolutionsllc.com>, replies to the manager. The message is built by SignCore.mime and the
// request signed by SignCore.sigv4 (the same code the Node tests check against botocore).
var Mail = (function () {
  var NAME = 'Myles Tech Solutions';
  var ADDRESS = 'Myles Tech Solutions SARL, Quartier Hippodrome, Yaoundé, Cameroon';
  var HOST = 'email.us-east-1.amazonaws.com';
  var PATH = '/v2/email/outbound-emails';
  var CRYPTO = {
    hmac: function (key, text) { return Utilities.computeHmacSha256Signature(Utilities.newBlob(text).getBytes(), key); },
    sha256hex: function (text) {
      return SignCore.bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
    },
    bytes: function (text) { return Utilities.newBlob(text).getBytes(); },
    b64: function (text) { return Utilities.base64Encode(text, Utilities.Charset.UTF_8); }
  };

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
      'padding:28px;box-shadow:0 12px 28px -8px rgba(23,35,60,.06)">' +
      '<img src="' + esc(Store.prop('PAGES_URL') + '/assets/logo.png') + '" alt="Myles Tech Solutions" height="56" style="display:block;margin:0 0 18px">' +
      block(en) + btn +
      '<hr style="border:0;border-top:1px solid #E3E8F2;margin:22px 0">' + block(fr) +
      (button ? '<p style="margin:16px 0 0;font-size:12px;color:#5F6B82">' + esc(button.url) + '</p>' : '') +
      '</div><p style="text-align:center;font-size:12px;color:#5F6B82;margin-top:16px">' + esc(ADDRESS) + '</p></div>';
  }

  function send(to, subject, en, fr, button, opts) {
    var key = { accessKey: Store.prop('SES_ACCESS_KEY'), secretKey: Store.prop('SES_SECRET_KEY') };
    var from = Store.prop('MAIL_FROM');
    if (!key.accessKey || !key.secretKey || !from) throw fail_('MAIL_NOT_SET_UP');
    var text = en.title + '\n\n' + en.lines.join('\n') + (button ? '\n\n' + button.url : '') +
      '\n\n---\n' + fr.title + '\n\n' + fr.lines.join('\n');
    var attachments = ((opts && opts.attachments) || []).map(function (b) {
      return { name: b.getName(), type: b.getContentType() || 'application/pdf', base64: Utilities.base64Encode(b.getBytes()) };
    });
    var raw = SignCore.mime({ fromName: NAME, from: from, to: to, replyTo: opts && opts.replyTo, subject: subject,
      text: text, html: page(en, fr, button), attachments: attachments }, Utilities.getUuid().replace(/-/g, ''), CRYPTO);
    var body = JSON.stringify({ FromEmailAddress: from, Destination: { ToAddresses: [to] },
      Content: { Raw: { Data: Utilities.base64Encode(raw) } } });
    var amzDate = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    var headers = SignCore.sigv4({ host: HOST, path: PATH, region: 'us-east-1', service: 'ses', body: body, amzDate: amzDate },
      key, CRYPTO);
    var res = UrlFetchApp.fetch('https://' + HOST + PATH, { method: 'post', contentType: 'application/json', payload: body,
      headers: headers, muteHttpExceptions: true });
    var status = res.getResponseCode();
    if (status !== 200) {
      console.error('SES ' + status + ': ' + res.getContentText().slice(0, 300));
      throw fail_(status === 429 ? 'MAIL_LIMIT' : 'MAIL_FAILED');
    }
    return JSON.parse(res.getContentText()).MessageId;
  }

  function code(to, value) {
    return send(to, 'Your code / Votre code: ' + value,
      { title: 'Your code: ' + value, lines: ['Enter it on the page that asked for it. It works for 10 minutes.',
        'If you did not ask for it, ignore this e-mail.'] },
      { title: 'Votre code : ' + value, lines: ['Saisissez-le sur la page qui l\'a demandé. Il est valable 10 minutes.',
        'Si vous ne l\'avez pas demandé, ignorez ce message.'] });
  }

  function invite(rec, tpl, link, replyTo, reminder) {
    var subject = (reminder ? 'Reminder: ' : '') + 'Please review and sign: ' + tpl.title_en + ' / ' + tpl.title_fr;
    return send(rec.recipient_email, subject,
      { title: (reminder ? 'Reminder: ' : '') + 'Please review and sign your ' + tpl.title_en,
        lines: ['Hello ' + rec.recipient_name + ',',
          'Myles Tech Solutions SARL has prepared and signed this document for you (' + rec.number + ').',
          'Open it, confirm your e-mail with the code we send you, fill in your part and sign. The link works until ' +
          rec.expires_at.slice(0, 10) + '.', 'Questions? Reply to this e-mail: it reaches the person who sent it.'] },
      { title: (reminder ? 'Rappel : ' : '') + 'Veuillez lire et signer : ' + tpl.title_fr,
        lines: ['Bonjour ' + rec.recipient_name + ',',
          'Myles Tech Solutions SARL a préparé et signé ce document pour vous (' + rec.number + ').',
          'Ouvrez-le, confirmez votre adresse avec le code envoyé, remplissez votre partie et signez.',
          'Des questions ? Répondez à ce message : il parvient à la personne qui l\'a envoyé.'] },
      { url: link, label: 'Review and sign / Lire et signer' }, { replyTo: replyTo });
  }

  function completed(rec, tpl, blob, to, replyTo, checkUrl) {
    return send(to, 'Signed: ' + tpl.title_en + ' (' + rec.number + ')',
      { title: 'Signed by both sides', lines: [tpl.title_en + ' (' + rec.number + ') is signed. Your copy is attached.',
        'To check that a copy is genuine and unchanged, drop it on ' + checkUrl + '.'] },
      { title: 'Signé par les deux parties', lines: [tpl.title_fr + ' (' + rec.number + ') est signé. Votre copie est jointe.',
        'Pour vérifier qu\'une copie est authentique et intacte, déposez-la sur ' + checkUrl + '.'] },
      null, { replyTo: replyTo, attachments: [blob] });
  }

  // The other steps of the notification table (design, amendment 3).
  function notice(to, kind, rec, tpl, consoleUrl, replyTo) {
    var who = rec.recipient_name + ' <' + rec.recipient_email + '>';
    var T = {
      sent: ['Sent: ' + rec.number, { title: 'Sent to ' + rec.recipient_name, lines: [tpl.title_en + ' (' + rec.number + ') went to ' + who + '.',
        'The link works until ' + rec.expires_at.slice(0, 10) + '. You will be told when it is opened and when it is signed.'] },
        { title: 'Envoyé à ' + rec.recipient_name, lines: [tpl.title_fr + ' (' + rec.number + ') a été envoyé à ' + who + '.',
          'Vous serez prévenu à l\'ouverture et à la signature.'] }],
      opened: ['Opened: ' + rec.number, { title: rec.recipient_name + ' opened the document', lines: [tpl.title_en + ' (' + rec.number + ') was opened after the e-mail code was confirmed.'] },
        { title: rec.recipient_name + ' a ouvert le document', lines: [tpl.title_fr + ' (' + rec.number + ') a été ouvert après confirmation du code.'] }],
      withdrawn: ['Withdrawn: ' + tpl.title_en + ' (' + rec.number + ')', { title: 'This document was withdrawn', lines: ['Myles Tech Solutions withdrew ' + tpl.title_en + ' (' + rec.number + '). The link no longer works; nothing more is needed from you.'] },
        { title: 'Ce document a été retiré', lines: ['Myles Tech Solutions a retiré ' + tpl.title_fr + ' (' + rec.number + '). Le lien ne fonctionne plus ; rien d\'autre n\'est attendu de vous.'] }],
      expired: ['Expired: ' + rec.number, { title: rec.recipient_name + ' did not sign in time', lines: ['The link for ' + tpl.title_en + ' (' + rec.number + ') has expired. Resend it from the console if it is still needed.'] },
        { title: rec.recipient_name + ' n\'a pas signé à temps', lines: ['Le lien de ' + tpl.title_fr + ' (' + rec.number + ') a expiré. Renvoyez-le depuis la console si besoin.'] }],
      newLink: ['A new link is asked for ' + rec.number, { title: rec.recipient_name + ' asks for a new link', lines: ['The link for ' + rec.number + ' has expired. Resend it from the console.'] },
        { title: rec.recipient_name + ' demande un nouveau lien', lines: ['Le lien de ' + rec.number + ' a expiré. Renvoyez-le depuis la console.'] }]
    }[kind];
    if (!T) throw fail_('UNKNOWN_NOTICE');
    var button = kind === 'withdrawn' ? null : { url: consoleUrl, label: 'Open the console / Ouvrir la console' };
    return send(to, T[0], T[1], T[2], button, { replyTo: replyTo });
  }

  // A test message to SES's own simulator mailbox: proves the key, the policy and the signing.
  function test() {
    return send('success@simulator.amazonses.com', 'Signing tool mail check',
      { title: 'Mail check', lines: ['This message proves that the signing tool can send through Amazon SES.'] },
      { title: 'Vérification', lines: ['Ce message prouve que l\'outil peut envoyer par Amazon SES.'] });
  }

  return { code: code, invite: invite, completed: completed, notice: notice, test: test };
})();
