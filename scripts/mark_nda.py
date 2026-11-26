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
    'recipient_signature': 1, 'recipient_signed_date': 1,
})
BLANK = re.compile(r'_{4,}')
# Left out of the template: the founder decided on 26 Nov 2026 that the intern is not asked where they sign.
DROP = re.compile(r'\n?Place of signature:\s*_{4,}')
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
            if block == 'intern' and DROP.search(text):
                text = DROP.sub('', text)
                run.text = text
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
    if 'Place of signature' in text:
        sys.exit('the place line should have been left out')
    return found


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    used = mark(sys.argv[1], sys.argv[2])
    found = check(sys.argv[2])
    print(f'{len(used)} blanks marked, {len(found)} distinct fields, checked: {sys.argv[2]}')
