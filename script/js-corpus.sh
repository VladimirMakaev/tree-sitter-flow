#!/usr/bin/env bash
# Runs tree-sitter-javascript's own corpus, fetched at its pinned commit by
# script/fetch-suites.sh, against tree-sitter-flow.
#
# One test is excluded: "Extra complex literals in expressions" is invalid
# JavaScript that checks error recovery, and tree-sitter-flow recovers from
# the error with a different tree.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SUITES="${SUITES_DIR:-$ROOT/.cache/suites}"
TS="${TREE_SITTER:-$ROOT/node_modules/.bin/tree-sitter}"

if [ ! -d "$SUITES/tree-sitter-javascript/test/corpus" ]; then
  SUITES_DIR="$SUITES" bash "$ROOT/script/fetch-suites.sh"
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/test"
cp -R "$SUITES/tree-sitter-javascript/test/corpus" "$WORK/test/corpus"
ln -s "$ROOT/src" "$WORK/src"
ln -s "$ROOT/grammar.js" "$WORK/grammar.js"
cat > "$WORK/tree-sitter.json" <<'JSON'
{
  "grammars": [{"name": "flow", "scope": "source.flow", "path": ".", "file-types": ["flow"]}],
  "metadata": {"version": "0.1.0"}
}
JSON
cd "$WORK"
"$TS" test --rebuild --exclude '^Extra complex literals in expressions$'
