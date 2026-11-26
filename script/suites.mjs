// Locates the inputs of the public test suites fetched by fetch-suites.sh and
// of this repository's corpus tests.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SUITES = process.env.SUITES_DIR || path.join(ROOT, '.cache/suites');

export function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(p, accept, out);
    } else if (accept(p)) {
      out.push(p);
    }
  }
  return out;
}

export function hasFlowPragma(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(4096);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return buf.subarray(0, n).toString('utf8').includes('@flow');
}

// Flow's own parser tests, split by the expected output into valid and
// invalid inputs.
export function flowParserTests() {
  const base = path.join(SUITES, 'flow/src/parser/test/flow');
  const files = walk(base, p => p.endsWith('.js') || p.endsWith('.js.flow')).sort();
  const valid = [];
  const invalid = [];
  for (const file of files) {
    const stem = file.endsWith('.js.flow') ? file.slice(0, -'.js.flow'.length) : file.slice(0, -'.js'.length);
    const treeFile = stem + '.tree.json';
    if (!fs.existsSync(treeFile)) continue;
    const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
    const inInvalidDir = path.relative(base, file).split(path.sep).some(part => part.endsWith('_invalid'));
    if (inInvalidDir || (tree.errors && tree.errors.length > 0)) invalid.push(file);
    else valid.push(file);
  }
  return {valid, invalid};
}

export const SUITE_FILES = {
  hermes: () => walk(path.join(SUITES, 'hermes/test/Parser/flow'), p => p.endsWith('.js')).sort(),
  babel: () => walk(path.join(SUITES, 'babel/packages/babel-parser/test/fixtures/flow'),
    p => /[/\\]input\.m?js$/.test(p)).sort(),
  'flow-typed': () => walk(path.join(SUITES, 'flow-typed/definitions'),
    p => p.endsWith('.js') && hasFlowPragma(p)).sort(),
  react: () => walk(path.join(SUITES, 'react/packages'), p => p.endsWith('.js') && hasFlowPragma(p)).sort(),
  'react-native': () => walk(path.join(SUITES, 'react-native'),
    p => (p.endsWith('.js') || p.endsWith('.js.flow')) && hasFlowPragma(p)).sort(),
  'flow-tests': () => walk(path.join(SUITES, 'flow-tests/tests'), isJavaScript).sort(),
  prettier: () => walk(path.join(SUITES, 'prettier/tests/format'), isJavaScript).sort(),
  relay: () => walk(path.join(SUITES, 'relay/packages'), isJavaScript).sort(),
  metro: () => walk(path.join(SUITES, 'metro'), isJavaScript).sort(),
  stylex: () => walk(path.join(SUITES, 'stylex'), isJavaScript).sort(),
};

function isJavaScript(file) {
  return /\.(m?js|js\.flow)$/.test(file);
}

// The inputs of test/corpus/*.txt, as {name, source} pairs.
export function corpusInputs() {
  const dir = path.join(ROOT, 'test/corpus');
  const out = [];
  for (const file of walk(dir, p => p.endsWith('.txt')).sort()) {
    const text = fs.readFileSync(file, 'utf8');
    // A header is a name, then optional attribute lines such as `:cst`.
    const re = /^(={3,})[^\n]*\n([^\n]*)\n(?::[^\n]*\n)*\1[^\n]*\n([\s\S]*?)\n-{3,}\n/gm;
    for (const m of text.matchAll(re)) {
      out.push({name: `${path.relative(ROOT, file)}: ${m[2].trim()}`, source: m[3]});
    }
  }
  return out;
}

// Fetches the public suites at their pinned commits when they are missing.
export function ensureSuites() {
  if (fs.existsSync(path.join(SUITES, 'tree-sitter-javascript/.git'))) return;
  console.error(`Fetching the public test suites into ${SUITES} ...`);
  execFileSync('bash', [path.join(ROOT, 'script/fetch-suites.sh')], {stdio: ['ignore', 'inherit', 'inherit'],
    env: {...process.env, SUITES_DIR: SUITES}});
}
