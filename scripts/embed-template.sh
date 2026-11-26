#!/bin/sh
# Puts the marked Word template into the Apps Script project as base64. The output is NOT tracked by git:
# the public repository never holds the agreement.
set -eu
cd "$(dirname "$0")/.."
test -s templates/student-intern-nda.docx || { echo "make the template first: scripts/mark_nda.py"; exit 1; }
base64 < templates/student-intern-nda.docx | tr -d '\n' > apps-script/TemplateNda.html
echo "apps-script/TemplateNda.html: $(wc -c < apps-script/TemplateNda.html | tr -d ' ') characters (not tracked)"
