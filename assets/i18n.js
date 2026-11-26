var I18N = {
  en: {
    'signin.title': 'Sign in', 'signin.lead': 'Managers sign in with a code sent to their e-mail.',
    'signin.email': 'Your e-mail', 'signin.send': 'Send me a code', 'signin.code': 'The 6-digit code',
    'signin.go': 'Sign in', 'signin.sent': 'If this address belongs to a manager, a code is on its way.',
    'console.title': 'Documents', 'console.new': 'New document', 'console.search': 'Search by number, name, e-mail or status',
    'console.type': 'Document type', 'console.allTypes': 'All types', 'console.export': 'Download record',
    'console.exported': 'Record downloaded: {n} documents.', 'console.activity': 'Activity', 'console.fresh': '{n} new',
    'console.empty': 'Nothing sent yet.', 'console.signout': 'Sign out', 'console.managers': 'Managers and templates',
    'status.sent': 'Sent', 'status.opened': 'Opened', 'status.completed': 'Signed', 'status.expired': 'Expired', 'status.withdrawn': 'Withdrawn',
    'doc.download': 'Download', 'doc.history': 'History', 'doc.resend': 'Resend', 'doc.withdraw': 'Withdraw',
    'doc.confirmWithdraw': 'Withdraw this document? The link stops working and the recipient is told.',
    'new.title': 'Prepare and send', 'new.company': 'The company\'s part', 'new.recipient': 'Who receives it',
    'new.sign': 'Your signature', 'new.useSaved': 'Use my saved signature', 'new.save': 'Remember this signature',
    'new.preview': 'Preview', 'new.send': 'Sign and send', 'new.sent': 'Sent: {number}. The recipient has the link.',
    'pad.clear': 'Clear', 'pad.type': 'Type instead', 'pad.draw': 'Draw instead', 'pad.typed': 'Type your name',
    'need': 'Still needed: {list}', 'need.signature': 'a signature', 'need.agree': 'your agreement',
    'managers.add': 'Add manager', 'managers.remove': 'Remove', 'managers.name': 'Name', 'managers.title': 'Title',
    'templates.title': 'Document types', 'templates.lead': 'Add a type (an MOU, a contract) from a Word file whose blanks are marked like {{company_partner_name}} or {{recipient_address}}, with {{company_signature}} and {{recipient_signature}} where each side signs.',
    'templates.file': 'Word file (.docx)', 'templates.code': 'Code (2 to 8 capital letters, e.g. MOU)',
    'templates.titleEn': 'Title in English', 'templates.titleFr': 'Title in French', 'templates.upload': 'Upload',
    'templates.done': 'Added: {code}, {n} fields.',
    'sign.title': 'Review and sign', 'sign.code.lead': 'To prove it is you, we send a 6-digit code to {email}.',
    'sign.code.send': 'Send me the code', 'sign.code.go': 'Open the document', 'sign.yours': 'Your part',
    'sign.agree': 'I have read and agree to this document.', 'sign.go': 'Sign', 'sign.done': 'Signed. A copy is in your e-mail.',
    'sign.download': 'Download my signed copy', 'sign.expired': 'This link has expired.', 'sign.askNew': 'Ask for a new link',
    'sign.asked': 'Done: the company is told and will send a new link.', 'sign.withdrawn': 'This document was withdrawn by the company.',
    'sign.already': 'This document is already signed. Your copy was sent to your e-mail.', 'sign.badlink': 'This link is not valid.',
    'check.title': 'Check a signed document', 'check.lead': 'Drop a PDF here. It never leaves your computer: only its fingerprint is checked.',
    'check.pick': 'Choose a PDF', 'check.ok': 'Genuine and unchanged', 'check.no': 'Not found: this file was changed, or was not signed here.',
    'check.by': '{title} ({number}), signed for the company by {company} on {at1} and by {recipient} on {at2}.',
    'ev.sent': 'sent', 'ev.resent': 'sent again', 'ev.code_sent': 'code sent to the recipient', 'ev.code_confirmed': 'opened (code confirmed)',
    'ev.signed': 'signed', 'ev.withdrawn': 'withdrawn', 'ev.reminded': 'reminder sent', 'ev.expired': 'expired',
    'ev.new_link_asked': 'new link asked', 'ev.name_corrected': 'name corrected by the recipient', 'ev.notice_failed': 'a notice could not be sent',
    'err.NETWORK': 'No connection. Try again.', 'err.SERVER': 'The service did not answer. Try again in a minute.',
    'err.SIGN_IN': 'Please sign in again.', 'err.CODE_WRONG': 'Wrong code. {left} tries left.',
    'err.CODE_EXPIRED': 'This code has expired. Ask for a new one.', 'err.LOCKED': 'Too many tries. Wait 15 minutes.',
    'err.WAIT': 'A code was just sent. Wait a minute before asking again.', 'err.CODE_AGAIN': 'Please confirm your code again.',
    'err.MAIL_LIMIT': 'Too many e-mails right now. Try again in a minute.', 'err.MAIL_FAILED': 'The e-mail could not be sent. Try again in a minute.',
    'err.MAIL_NOT_SET_UP': 'E-mail is not set up yet.', 'err.INCOMPLETE': 'Some fields are missing or not valid.',
    'err.SIGNATURE_MISSING': 'A signature is needed.', 'err.BAD_EMAIL': 'This e-mail address is not valid.',
    'err.LINK_INVALID': 'This link is not valid.', 'err.BAD_STATE': 'This document can no longer be changed.',
    'err.OWNER_ONLY': 'Only the owner can do this.', 'err.ALREADY_MANAGER': 'Already a manager.', 'err.NOT_FOUND': 'Not found.',
    'err.AGREE_NEEDED': 'Please tick that you agree.', 'err.TEMPLATE_INVALID': 'This template cannot be used: {reason}.',
    'err.NO_TEMPLATE': 'This document type is not available.', 'err.INTERNAL': 'Something went wrong. Try again.'
  },
  fr: {
    'signin.title': 'Connexion', 'signin.lead': 'Les responsables se connectent avec un code envoyé à leur e-mail.',
    'signin.email': 'Votre e-mail', 'signin.send': 'Recevoir un code', 'signin.code': 'Le code à 6 chiffres',
    'signin.go': 'Se connecter', 'signin.sent': 'Si cette adresse est celle d\'un responsable, un code est en route.',
    'console.title': 'Documents', 'console.new': 'Nouveau document', 'console.search': 'Chercher par numéro, nom, e-mail ou statut',
    'console.type': 'Type de document', 'console.allTypes': 'Tous les types', 'console.export': 'Télécharger le registre',
    'console.exported': 'Registre téléchargé : {n} documents.', 'console.activity': 'Activité', 'console.fresh': '{n} nouveaux',
    'console.empty': 'Rien n\'a encore été envoyé.', 'console.signout': 'Se déconnecter', 'console.managers': 'Responsables et modèles',
    'status.sent': 'Envoyé', 'status.opened': 'Ouvert', 'status.completed': 'Signé', 'status.expired': 'Expiré', 'status.withdrawn': 'Retiré',
    'doc.download': 'Télécharger', 'doc.history': 'Historique', 'doc.resend': 'Renvoyer', 'doc.withdraw': 'Retirer',
    'doc.confirmWithdraw': 'Retirer ce document ? Le lien ne fonctionnera plus et le destinataire sera prévenu.',
    'new.title': 'Préparer et envoyer', 'new.company': 'La partie de la société', 'new.recipient': 'Destinataire',
    'new.sign': 'Votre signature', 'new.useSaved': 'Utiliser ma signature enregistrée', 'new.save': 'Enregistrer cette signature',
    'new.preview': 'Aperçu', 'new.send': 'Signer et envoyer', 'new.sent': 'Envoyé : {number}. Le destinataire a reçu le lien.',
    'pad.clear': 'Effacer', 'pad.type': 'Taper plutôt', 'pad.draw': 'Dessiner plutôt', 'pad.typed': 'Tapez votre nom',
    'need': 'Il manque : {list}', 'need.signature': 'une signature', 'need.agree': 'votre accord',
    'managers.add': 'Ajouter un responsable', 'managers.remove': 'Retirer', 'managers.name': 'Nom', 'managers.title': 'Fonction',
    'templates.title': 'Types de document', 'templates.lead': 'Ajoutez un type (un protocole d\'accord, un contrat) depuis un fichier Word dont les blancs sont marqués comme {{company_partner_name}} ou {{recipient_address}}, avec {{company_signature}} et {{recipient_signature}} là où chaque partie signe.',
    'templates.file': 'Fichier Word (.docx)', 'templates.code': 'Code (2 à 8 lettres majuscules, ex. MOU)',
    'templates.titleEn': 'Titre en anglais', 'templates.titleFr': 'Titre en français', 'templates.upload': 'Ajouter',
    'templates.done': 'Ajouté : {code}, {n} champs.',
    'sign.title': 'Lire et signer', 'sign.code.lead': 'Pour prouver que c\'est vous, nous envoyons un code à 6 chiffres à {email}.',
    'sign.code.send': 'Recevoir le code', 'sign.code.go': 'Ouvrir le document', 'sign.yours': 'Votre partie',
    'sign.agree': 'J\'ai lu ce document et je l\'accepte.', 'sign.go': 'Signer', 'sign.done': 'Signé. Une copie est dans votre e-mail.',
    'sign.download': 'Télécharger ma copie signée', 'sign.expired': 'Ce lien a expiré.', 'sign.askNew': 'Demander un nouveau lien',
    'sign.asked': 'C\'est fait : la société est prévenue et enverra un nouveau lien.', 'sign.withdrawn': 'Ce document a été retiré par la société.',
    'sign.already': 'Ce document est déjà signé. Votre copie a été envoyée à votre e-mail.', 'sign.badlink': 'Ce lien n\'est pas valide.',
    'check.title': 'Vérifier un document signé', 'check.lead': 'Déposez un PDF ici. Il ne quitte jamais votre ordinateur : seule son empreinte est vérifiée.',
    'check.pick': 'Choisir un PDF', 'check.ok': 'Authentique et intact', 'check.no': 'Introuvable : ce fichier a été modifié, ou n\'a pas été signé ici.',
    'check.by': '{title} ({number}), signé pour la société par {company} le {at1} et par {recipient} le {at2}.',
    'ev.sent': 'envoyé', 'ev.resent': 'renvoyé', 'ev.code_sent': 'code envoyé au destinataire', 'ev.code_confirmed': 'ouvert (code confirmé)',
    'ev.signed': 'signé', 'ev.withdrawn': 'retiré', 'ev.reminded': 'rappel envoyé', 'ev.expired': 'expiré',
    'ev.new_link_asked': 'nouveau lien demandé', 'ev.name_corrected': 'nom corrigé par le destinataire', 'ev.notice_failed': 'une notification n\'a pas pu partir',
    'err.NETWORK': 'Pas de connexion. Réessayez.', 'err.SERVER': 'Le service n\'a pas répondu. Réessayez dans une minute.',
    'err.SIGN_IN': 'Veuillez vous reconnecter.', 'err.CODE_WRONG': 'Code incorrect. Encore {left} essais.',
    'err.CODE_EXPIRED': 'Ce code a expiré. Demandez-en un nouveau.', 'err.LOCKED': 'Trop d\'essais. Attendez 15 minutes.',
    'err.WAIT': 'Un code vient d\'être envoyé. Attendez une minute.', 'err.CODE_AGAIN': 'Veuillez confirmer votre code à nouveau.',
    'err.MAIL_LIMIT': 'Trop d\'e-mails en ce moment. Réessayez dans une minute.', 'err.MAIL_FAILED': 'L\'e-mail n\'a pas pu partir. Réessayez dans une minute.',
    'err.MAIL_NOT_SET_UP': 'L\'e-mail n\'est pas encore configuré.', 'err.INCOMPLETE': 'Des champs manquent ou ne sont pas valides.',
    'err.SIGNATURE_MISSING': 'Une signature est nécessaire.', 'err.BAD_EMAIL': 'Cette adresse e-mail n\'est pas valide.',
    'err.LINK_INVALID': 'Ce lien n\'est pas valide.', 'err.BAD_STATE': 'Ce document ne peut plus être modifié.',
    'err.OWNER_ONLY': 'Seul le propriétaire peut faire cela.', 'err.ALREADY_MANAGER': 'Déjà responsable.', 'err.NOT_FOUND': 'Introuvable.',
    'err.AGREE_NEEDED': 'Veuillez cocher votre accord.', 'err.TEMPLATE_INVALID': 'Ce modèle ne peut pas être utilisé : {reason}.',
    'err.NO_TEMPLATE': 'Ce type de document n\'est pas disponible.', 'err.INTERNAL': 'Une erreur est survenue. Réessayez.'
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
  function event(name) { return t('ev.' + String(name).replace(/ /g, '_')); }
  return { t: t, apply: apply, set: set, menu: menu, event: event, get: function () { return current; } };
})();
