#!/usr/bin/env bash
# Prints `exists=true` when crates.io already has tree-sitter-flow at the
# given version, and `exists=false` otherwise; also writes it to
# $GITHUB_OUTPUT when set. Keeps the two publish paths from publishing a
# version twice.
#   bash script/crate-exists.sh 0.2.0
set -euo pipefail

version=$1
code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -A 'tree-sitter-flow release workflow (https://github.com/VladimirMakaev/tree-sitter-flow)' \
  "https://crates.io/api/v1/crates/tree-sitter-flow/$version")
case $code in
  200) exists=true ;;
  404) exists=false ;;
  *) echo "unexpected HTTP status $code from crates.io" >&2; exit 1 ;;
esac
echo "exists=$exists"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "exists=$exists" >> "$GITHUB_OUTPUT"; fi
