#!/usr/bin/env node
// Fails when the package version differs between the files that carry it.
//   npm run check-versions

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const match = (file, re) => re.exec(read(file))?.[1] ?? '(none)';

const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'tree-sitter.json': JSON.parse(read('tree-sitter.json')).metadata.version,
  'Cargo.toml': match('Cargo.toml', /^version\s*=\s*"([^"]+)"/m),
  'pyproject.toml': match('pyproject.toml', /^version\s*=\s*"([^"]+)"/m),
  'CMakeLists.txt': match('CMakeLists.txt', /VERSION\s+"([^"]+)"/),
  'Makefile': match('Makefile', /^VERSION\s*:=\s*(\S+)/m),
  'Cargo.lock': match('Cargo.lock', /name = "tree-sitter-flow"\nversion = "([^"]+)"/),
};

const distinct = new Set(Object.values(versions));
for (const [file, version] of Object.entries(versions)) console.log(`${file.padEnd(18)} ${version}`);
if (distinct.size !== 1) {
  console.error('\nversions differ: run `tree-sitter version <x>`, then `cargo update -p tree-sitter-flow`');
  process.exit(1);
}
