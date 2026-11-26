#!/usr/bin/env node
// Checks version consistency across the repository:
//   - the package version is the same in every file that carries it;
//   - every tree-sitter CLI and runtime pin matches TREE_SITTER below;
//   - the generated parser and everything that refers to it use ABI 15.
//   npm run check-versions

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The tree-sitter versions this repository is built and tested with.
export const TREE_SITTER = {
  cli: '0.27.2',
  abi: 15,
  // Runtimes for the bindings: the 0.27 releases where they exist.
  rust: '0.27.2',
  python: '~=0.27',
  c: '0.27.2',
  // Newest releases of the bindings that have no 0.27 release.
  node: '^0.25.1',
  go: 'v0.24.0',
  swift: '0.25.0',
  // The grammar this one extends.
  javascript: '0.25.0',
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = file => JSON.parse(read(file));
const match = (file, re) => re.exec(read(file))?.[1] ?? '(missing)';

const pkg = json('package.json');
const lock = json('package-lock.json');

const parserVersion = ['major', 'minor', 'patch']
  .map(part => match('src/parser.c', new RegExp(`\\.${part}_version = (\\d+),`)))
  .join('.');

const versions = {
  'package.json': pkg.version,
  'src/parser.c (ABI 15 metadata)': parserVersion,
  'package-lock.json': lock.version,
  'package-lock.json (root package)': lock.packages?.['']?.version,
  'tree-sitter.json': json('tree-sitter.json').metadata.version,
  'Cargo.toml': match('Cargo.toml', /^version\s*=\s*"([^"]+)"/m),
  'Cargo.lock': match('Cargo.lock', /name = "tree-sitter-flow"\nversion = "([^"]+)"/),
  'pyproject.toml': match('pyproject.toml', /^version\s*=\s*"([^"]+)"/m),
  'CMakeLists.txt': match('CMakeLists.txt', /VERSION\s+"([^"]+)"/),
  'Makefile': match('Makefile', /^VERSION\s*:=\s*(\S+)/m),
};

const workflowCli = file => match(file, /^\s*TREE_SITTER_VERSION:\s*v?(\S+)/m);
const lockVersion = name => lock.packages?.[`node_modules/${name}`]?.version ?? '(missing)';
const cargoLock = name => match('Cargo.lock', new RegExp(`name = "${name}"\\nversion = "([^"]+)"`));

// [what, actual, expected]
const pins = [
  ['CLI: package.json devDependencies tree-sitter-cli', pkg.devDependencies['tree-sitter-cli'], TREE_SITTER.cli],
  ['CLI: package-lock.json tree-sitter-cli', lockVersion('tree-sitter-cli'), TREE_SITTER.cli],
  ['CLI: ci.yml TREE_SITTER_VERSION', workflowCli('.github/workflows/ci.yml'), TREE_SITTER.cli],
  ['CLI: release.yml TREE_SITTER_VERSION', workflowCli('.github/workflows/release.yml'), TREE_SITTER.cli],
  ['ABI: src/parser.c LANGUAGE_VERSION', Number(match('src/parser.c', /#define LANGUAGE_VERSION (\d+)/)), TREE_SITTER.abi],
  ['ABI: CMakeLists.txt TREE_SITTER_ABI_VERSION', Number(match('CMakeLists.txt', /set\(TREE_SITTER_ABI_VERSION (\d+)/)), TREE_SITTER.abi],
  ['ABI: publish.yml abi-version', Number(match('.github/workflows/publish.yml', /abi-version:\s*(\d+)/)), TREE_SITTER.abi],
  ['ABI: test/c/parse.c expected ABI', Number(match('test/c/parse.c', /if \(abi != (\d+)\)/)), TREE_SITTER.abi],
  ['ABI: package.json generate script', pkg.scripts.generate, 'tree-sitter generate'],
  ['Rust: Cargo.toml dev-dependencies tree-sitter', match('Cargo.toml', /^tree-sitter = "([^"]+)"/m), TREE_SITTER.rust],
  ['Rust: Cargo.lock tree-sitter', cargoLock('tree-sitter'), TREE_SITTER.rust],
  ['Python: pyproject.toml core extra', match('pyproject.toml', /"tree-sitter(~=[^"]+)"/), TREE_SITTER.python],
  ['C: ci.yml runtime checkout', workflowCli('.github/workflows/ci.yml'), TREE_SITTER.c],
  ['Node: package.json devDependencies tree-sitter', pkg.devDependencies['tree-sitter'], TREE_SITTER.node],
  ['Node: package.json peerDependencies tree-sitter', pkg.peerDependencies['tree-sitter'], TREE_SITTER.node],
  ['Go: go.mod go-tree-sitter', match('go.mod', /go-tree-sitter (v\S+)/), TREE_SITTER.go],
  ['Swift: Package.swift swift-tree-sitter', match('Package.swift', /swift-tree-sitter", from: "([^"]+)"/), TREE_SITTER.swift],
  ['tree-sitter-javascript: package.json', pkg.devDependencies['tree-sitter-javascript'], TREE_SITTER.javascript],
  ['tree-sitter-javascript: package-lock.json', lockVersion('tree-sitter-javascript'), TREE_SITTER.javascript],
];

let ok = true;
console.log('Package version');
for (const [file, version] of Object.entries(versions)) console.log(`  ${file.padEnd(34)} ${version}`);
if (new Set(Object.values(versions)).size !== 1) {
  console.error('error: the package versions differ; run `tree-sitter version <x>`, ' +
    '`cargo update -p tree-sitter-flow`, `npm install --package-lock-only --ignore-scripts` and `tree-sitter generate`');
  ok = false;
}
console.log('tree-sitter versions');
for (const [what, actual, expected] of pins) {
  const good = actual === expected;
  console.log(`  ${good ? 'ok  ' : 'FAIL'} ${what.padEnd(50)} ${actual}${good ? '' : ` (expected ${expected})`}`);
  if (!good) ok = false;
}
process.exit(ok ? 0 : 1);
