#!/usr/bin/env bash
# Syntaxprüfung aller JavaScript-Module als ES-Module (findet z. B. abgeschnittene Zeilen durch // in Einzeilern)
set -e; n=0; bad=0
for f in $(git ls-files --cached --others --exclude-standard 'js/*.js' 'js/**/*.js' sw.js); do n=$((n+1)); if ! node --input-type=module --check < "$f" 2>/tmp/syn.err; then echo "✗ $f"; cat /tmp/syn.err; bad=$((bad+1)); fi; done
echo "$n Dateien geprüft, $bad mit Fehlern"; [ "$bad" = 0 ]
