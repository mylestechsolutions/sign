# Myles Tech document signing

A manager prepares an agreement, signs it for Myles Tech Solutions SARL and sends it by e-mail; the recipient
confirms a code sent to their e-mail, fills their part and signs; both receive the signed PDF.

- Pages: https://mylestechsolutions.github.io/sign/ (this repository, GitHub Pages)
- Back end: a Google Apps Script web app (source in `apps-script/`), run by the owner's Google account
- Check a signed copy: https://mylestechsolutions.github.io/sign/check.html

Design and plan: `docs/plans/`. Tests: `npm test` (rules), `npm run e2e` (pages against a local stand-in).
No documents, templates, personal data or secrets are kept in this repository.
