#!/usr/bin/env bash
# The local proof of SDLC.md section 3: every check this repository has, in the order CI runs them, ending in
# GATE GREEN or GATE RED. CI runs this script on every push; on Windows it runs in Git Bash.
#
#   scripts/gate.sh [schemas|examples|mcp|validate|website|all]...      default: all
#
# A package's dependencies are installed with `npm ci` when its node_modules is missing or older than its lockfile, so
# a second run on an unchanged tree spends no time on them.
set -uo pipefail
cd "$(dirname "$0")/.."

steps=("$@")
[ ${#steps[@]} -eq 0 ] && steps=(all)
for s in "${steps[@]}"; do
  case "$s" in schemas|examples|mcp|validate|website|all) ;;
    *) echo "scripts/gate.sh: unknown step '$s'; one of schemas, examples, mcp, validate, website, all"; echo "GATE RED"; exit 1 ;;
  esac
done
wants() { for s in "${steps[@]}"; do [ "$s" = all ] || [ "$s" = "$1" ] && return 0; done; return 1; }

failed=0
step() {
  local name="$1"; shift
  echo "=== $name"
  if ! "$@"; then failed=1; echo "FAILED: $name"; fi
}
deps() {
  local dir="$1"
  if [ ! -f "$dir/node_modules/.package-lock.json" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    (cd "$dir" && npm ci --no-audit --no-fund --loglevel=error)
  fi
}
# A step that fails shows the last 40 lines of its own output; one that passes shows its last line.
quiet() {
  local out code
  out=$("$@" 2>&1); code=$?
  if [ $code -ne 0 ]; then printf '%s\n' "$out" | tail -40; else printf '%s\n' "$out" | grep -v '^\s*$' | tail -1; fi
  return $code
}
package() { deps "$1" && quiet bash -c "cd '$1' && npm test --silent"; }
website() { deps website && quiet bash -c "cd website && npm run build --silent"; }

wants schemas && step "protocol schemas" quiet node scripts/validate-schemas.mjs
wants examples && step "example payloads" quiet node scripts/validate-examples.mjs
wants mcp && step "best-mcp: build and smoke test" package mcp-server
wants validate && step "best-validate: build and smoke test" package validate-cli
wants website && step "website: copy the protocol and build" website

if [ $failed -ne 0 ]; then echo "GATE RED"; exit 1; fi
echo "GATE GREEN"
