# Document signing for Myles Tech: design

Date: 26 November 2026. Approved by the founder section by section on that day.

## Purpose

A manager at Myles Tech Solutions SARL prepares an agreement, signs it for the company and sends it by e-mail.
The recipient confirms their e-mail address with a code, fills in their part, signs, and both sides receive the
signed PDF. The first document is the Student Intern Non Disclosure Agreement (Cameroon); the MOU follows by adding
its template. It is the company's own tool, independent of EduCore and C4, and costs nothing to run.

## Decisions

| Question | Decision |
| --- | --- |
| Who sends | Named managers of Myles Tech, added and removed by the owner |
| Which documents | Templates: a Word file whose blanks are marked `{{field}}` |
| Signing order | The company signs first, then the recipient |
| Proof of the signer | A secret link, a 6-digit code sent to the recipient's e-mail, a drawn or typed signature |
| Proof of the document | A certificate page in the PDF and its fingerprint in a register, checkable on a public page |
| Where it runs | Pages on GitHub Pages (public repository `mylestechsolutions/sign`); back end as a Google Apps Script running as the owner's Gmail; files and register in that account's Google Drive |
| E-mail | Amazon SES in the management account (domain `mylestechsolutionsllc.com`), from `sign@mylestechsolutionsllc.com`, replies to the manager (amendment of 26 November) |
| Choosing a document | A dropdown of every template (NDA first, MOU when uploaded); the owner uploads new templates (amendment of 26 November) |
| Cost | Nothing beyond accounts the company already has, plus SES at $0.10 per 1,000 e-mails |
| Record and notifications | Every document's history kept and downloadable (one ZIP of the register, the history and the signed PDFs); an e-mail to the person concerned at every step, and an activity feed in the console (amendment of 26 November) |

## 1. How it works

1. **Sign in.** A manager opens the console, types their e-mail, receives a 6-digit code and is in. Only addresses
   on the managers list get a code. The owner adds and removes managers.
2. **Prepare.** "New document" opens a dropdown of document types (NDA, MOU, ...); for the NDA it asks for the company's part: the intern's full legal name and e-mail, role and
   department, supervisor, effective, start and end dates, work location, security contact and urgent channel, and
   the name and title of the company signatory. The manager signs (drawn once and remembered, or typed), previews
   the PDF and presses Send.
3. **Invite.** The recipient receives an e-mail from `Myles Tech Solutions <sign@mylestechsolutionsllc.com>` (sent
   through Amazon SES), with replies going to the manager who sent it: "Please review and sign your Student Intern NDA". The button opens
   the signing page, which sends a 6-digit code to the same address.
4. **Sign.** The recipient reads the NDA with the company's part filled in, adds their address, school or
   university, course of study and place of signature, may correct their name (the correction is recorded),
   ticks "I have read and agree", draws or types their signature and presses Sign.
5. **Done.** Both sides receive the signed PDF by e-mail at once. Its last page is the signature certificate. The
   console shows the document as Completed and lets the manager download it at any time.
6. **Follow-up.** One reminder after 3 days without signature. The link stops working after 30 days. The manager
   can resend or withdraw at any time.

Every page is in English and French, with the language menu at the top right.

## 2. The pieces

- **Pages** (public repository `mylestechsolutions/sign`, served free by GitHub Pages at
  `https://mylestechsolutions.github.io/sign/`; a custom address can point there later at no cost):
  - `index.html`: the manager console (sign-in, the list of documents with status and a search box, New NDA,
    the managers list for the owner only);
  - `sign.html`: the page the recipient opens from the e-mail;
  - `check.html`: drop a signed PDF to see whether it is genuine and unchanged.
  The repository holds page code and the back end's code only: no documents, names, addresses, keys, and no
  personal e-mail address.
- **Back end**: a Google Apps Script web app running as the owner's Gmail. It checks every code and link, fills
  the template, makes the PDFs, sends the e-mails and keeps the register. The pages call it over HTTPS
  (`fetch`, plain-text JSON bodies so that no pre-flight request is needed). Its source lives in the same
  repository under `apps-script/`; its settings (owner, managers, secrets) live in the script's private
  properties, never in the repository.
- **Storage**, in the owner's Google Drive, private and never shared by link:
  - folder `MylesTech signing/templates/`: the template Google Docs;
  - folder `MylesTech signing/documents/<number>/`: the PDF sent, the signed PDF, the two signature images;
  - Google Sheet `Signing register`: tab `documents` (one row per document: number, template, manager,
    recipient name and e-mail, status, times, the signed PDF's fingerprint), tab `log` (every step), tab
    `managers`.
- **Templates**: a Word file converted to a Google Doc, its blanks marked as named fields. For each document the
  template is copied, the fields are replaced, the signature images are put in place, and the copy is saved as PDF.

**E-mail limits**: SES allows 50,000 e-mails a day (one NDA uses about 5). The script calls SES over HTTPS with
AWS Signature Version 4, as an IAM user allowed only to send as `sign@mylestechsolutionsllc.com`. Storage: the account's free 15 GB; an NDA is under 1 MB.

## 3. Security, records and proof

- **Links and codes.** Each document has its own link carrying a long random secret (32 random bytes). Opening
  it is not enough: a 6-digit code is sent to the recipient's e-mail each time, valid 10 minutes, 5 tries, then a
  15-minute wait. Managers sign in with the same kind of code; a session lasts 12 hours on that browser.
- **Rights.** A manager sees and acts on what they sent; the owner sees everything. Every request carries either
  a manager session or a document secret plus a confirmed code; the back end refuses anything else.
- **Locked once signed.** After the recipient signs, no field can change. The signed PDF is made once and its
  SHA-256 fingerprint is written to the register.
- **The log** records, with time and browser, each step: created, sent, opened, code sent, code confirmed, signed,
  completed, reminded, withdrawn, expired.
- **The certificate page** (last page of the signed PDF): document title and number; for each signer, name,
  e-mail, the time of signing and the place given; "e-mail confirmed by a code sent to this address"; the
  fingerprint of the agreement pages; "Check this document at https://mylestechsolutions.github.io/sign/check".
  The internet address shown is the one the signer's browser reported, and the page says so: Apps Script does not
  see the visitor's address.
- **The check page.** Anyone drops a PDF; its fingerprint is computed in their browser (the file never leaves the
  computer) and sent to the back end, which answers "Genuine and unchanged: Student Intern NDA, signed by ... on ...
  and ... on ..." or "Not found: this file was changed, or was not signed here".
- **Plain answers when something goes wrong**: an expired link offers "ask for a new link" (the manager is told);
  a withdrawn document says so; pressing Sign twice shows the finished document; the daily e-mail limit is
  reported in words instead of failing silently.
- **Personal data** (the recipient's address, school, course, signature) exists only in the owner's Drive and in
  the two signed copies sent to the parties.

## 4. The look: EduCore's premium kit

Taken from `EduCore/lib/shared/premium_kit.dart` and `educore_app_style.dart`, translated to CSS.

| Token | Value |
| --- | --- |
| Page | `#F5F7FB` |
| Text (navy), second ink, muted | `#17233C`, `#3A475E`, `#5F6B82` |
| Lines | `#E3E8F2`, strong `#D5DCEA` |
| Blue (the leading act), soft blue | `#3967E8`, `#EAF0FF` |
| Green, soft green | `#15803D`, `#E7F6EC` |
| Amber, soft amber | `#B45309`, `#FFF4E2` |
| Red (closes, withdraw), soft red | `#DC2626`, `#FEECEC` |
| Card | white, radius 18 px, 1 px border `#E3E8F2` |
| Shadow at rest | `0 1px 2px rgba(23,35,60,.04), 0 12px 28px -8px rgba(23,35,60,.063)` |
| Shadow lifted | `0 2px 4px rgba(23,35,60,.07), 0 22px 40px -10px rgba(43,85,212,.14)` |
| Motion | 220 ms, `cubic-bezier(.215,.61,.355,1)` (ease-out cubic) |
| Type | Inter |
| Buttons | pill-shaped, 44 px high (52 px large), 20 px side padding (26 px large), weight 700 |

- Cards rise a few pixels on hover and take the lifted shadow, so they seem to come off the page.
- Buttons: the act that moves things forward is the blue pill (Send, Sign, Confirm); reading and side steps are
  white pills (Preview, Download); closing or withdrawing is red. On hover a button lifts and its shadow glows in
  its own colour; pressed, it sinks.
- EduCore's habits: every pop-up has a close control at the top right; a submit button stays inactive and says
  what is still missing; the document list has a search box; secondary cards fold shut on phones; the language
  menu sits at the top right.

## 5. Templates

Field names say who fills them:

- `company_*`: the manager, when preparing;
- `recipient_*`: the recipient, when signing (`recipient_name` and `recipient_email` are given by the manager and
  can be corrected by the recipient);
- `*_signature`, `*_signed_date`, `document_number`: the system, at signing.

The Student Intern NDA, field by field:

| Blank in the document | Field |
| --- | --- |
| Intern full legal name (twice) | `recipient_name` |
| Address | `recipient_address` |
| School or university | `recipient_school` |
| Course of study | `recipient_course` |
| Internship role and department | `company_role_department` |
| Company supervisor | `company_supervisor` |
| Effective date, start date, end date | `company_effective_date`, `company_start_date`, `company_end_date` |
| Work location | `company_work_location` |
| Security contact name and email | `company_security_contact` |
| Urgent reporting telephone or channel | `company_urgent_channel` |
| For Myles Tech Solutions SARL: name, title, signature, date | `company_signatory_name`, `company_signatory_title`, `company_signature`, `company_signed_date` |
| Intern: signature, date, place of signature | `recipient_signature`, `recipient_signed_date`, `recipient_place` |

The template is a marked copy of `MylesTech_Cameroon_Student_Intern_NDA.docx`; the original file is not changed.
The stipend amount in clause 13 stays part of the text; it becomes a field only if amounts start to differ.
A new document type (the MOU) is added by marking its blanks the same way and uploading it.

## 6. Testing

- **Automatic**: every field of a template is replaced and none is left; the prefix rules decide who may fill
  what; a code expires and stops after 5 tries; a link expires after 30 days; the check page accepts the
  genuine PDF and rejects a copy changed by one byte. Pure functions are shared between the pages and the
  back end and tested with Node; the Apps Script part is tested on a separate test deployment.
- **End to end**: a test NDA sent to a second address of the owner, signed there; the e-mails, the PDF, the
  certificate page, an expired link, wrong codes and a withdrawn document are checked before the first real use.

## 7. Going live

1. Create the public repository `mylestechsolutions/sign` and switch on GitHub Pages.
2. Prepare the NDA template and the Apps Script back end.
3. The owner signs in to Google once and approves the script's permissions (send mail as the owner, manage its
   own Drive files). This is the owner's step.
4. Run the end-to-end test NDA.
5. The owner sends the first real NDA.

## Not in this version

SMS or WhatsApp delivery; more than two signers; fields placed by drag and drop; a PDF digital signature shown by
Adobe Reader; a custom domain; the MOU template (added once the NDA works end to end).
