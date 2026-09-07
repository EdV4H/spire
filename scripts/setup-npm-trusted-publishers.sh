#!/usr/bin/env bash
# Configure npm trusted publishers (OIDC) for every publishable @edv4h/spire-*
# package, pointing at this repo's Release workflow. Run LOCALLY, logged in to
# npmjs.org as an @edv4h maintainer — this uses your npm account, not a CI secret.
#
# Prereqs:
#   npm install -g npm@latest                                   # need npm >= 11.15
#   npm login --scope=@edv4h --registry=https://registry.npmjs.org/
#
# The FIRST `npm trust` opens browser auth; on the npm site choose
# "skip 2FA for the next 5 minutes" so the rest run without prompting.
#
# Notes (see docs/npm-publishing.md):
#   - `--registry https://registry.npmjs.org/` overrides a private-registry scope
#     in your ~/.npmrc, which does NOT support trusted publishing and returns 405.
#   - Trust attaches to an EXISTING package. Before the first publish every call
#     returns 403 — publish once by hand (the doc has the command), then re-run.
set -u

REPO="EdV4H/spire"
WORKFLOW="release.yml"
REGISTRY="https://registry.npmjs.org/"

cd "$(dirname "$0")/.." || exit 1

fail=()
for f in packages/*/package.json plugins/*/package.json; do
	name=$(node -p "try{const p=require('./$f');p.private?'':(p.name||'')}catch{''}")
	[ -z "$name" ] && continue
	echo "== $name =="
	if npm trust github "$name" \
		--registry "$REGISTRY" --file "$WORKFLOW" --repo "$REPO" \
		--allow-publish --yes; then
		:
	else
		echo "!! $name failed (unpublished? configure after its first publish)"
		fail+=("$name")
	fi
done

if [ "${#fail[@]}" -gt 0 ]; then
	echo
	echo "Failed (${#fail[@]}): ${fail[*]}"
	exit 1
fi
echo "All trusted publishers configured."
