#!/usr/bin/env bash
# Fetches the public test suites used by script/run-suites.mjs at pinned
# commits. Only the needed paths are checked out (blobless, sparse clones).
set -euo pipefail

DEST="${SUITES_DIR:-$(cd "$(dirname "$0")/.." && pwd)/.cache/suites}"
mkdir -p "$DEST"

fetch() {
  local name=$1 url=$2 commit=$3
  shift 3
  local dir="$DEST/$name"
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$commit" ]; then
    echo "$name: up to date ($commit)"
    return
  fi
  rm -rf "$dir"
  git init -q "$dir"
  git -C "$dir" remote add origin "$url"
  git -C "$dir" config core.sparseCheckout true
  git -C "$dir" sparse-checkout set --no-cone "$@"
  git -C "$dir" fetch -q --depth=1 --filter=blob:none origin "$commit"
  git -C "$dir" checkout -q FETCH_HEAD
  echo "$name: $commit"
}

# Keep these commits in sync with README.md.
fetch flow https://github.com/facebook/flow.git cd7afc31797c5055890fca501ee0e7cde967ce98 \
  '/src/parser/test/flow/'
fetch hermes https://github.com/facebook/hermes.git abd48fb5f5f2fb03496e4391b5ec97b731e406df \
  '/test/Parser/flow/' '/include/hermes/AST/ESTree.def'
fetch babel https://github.com/babel/babel.git f8345b3dcc7b53142ebaea61ec405259de75e14a \
  '/packages/babel-parser/test/fixtures/flow/**/input.js' \
  '/packages/babel-parser/test/fixtures/flow/**/input.mjs' \
  '/packages/babel-parser/test/fixtures/flow/**/options.json'
fetch flow-typed https://github.com/flow-typed/flow-typed.git c75b7b3fbf3a4c78eee6d0a3349957f808455a91 \
  '/definitions/**/*.js'
fetch react https://github.com/facebook/react.git edae846a9a17442c00429f2b15375afbfa0376c9 \
  '/packages/**/*.js'
fetch react-native https://github.com/facebook/react-native.git c3b3eaa37842f6e3cd876978d21ad390a7beb68b \
  '*.js' '*.js.flow'
fetch tree-sitter-javascript https://github.com/tree-sitter/tree-sitter-javascript.git \
  44c892e0be055ac465d5eeddae6d3e194424e7de '/test/corpus/'
