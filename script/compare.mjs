#!/usr/bin/env node
// Compares tree-sitter-flow trees with Hermes ESTree trees.
//
//   npm run compare                          # every suite
//   npm run compare -- --suite hermes        # one suite (repeatable)
//   npm run compare -- --json                # machine-readable output
//   npm run compare -- --max-errors 20       # print at most 20 mismatches
//
// Suites: corpus (test/corpus), flow-parser, hermes, babel, flow-typed, react,
// react-native. The public suites come from script/fetch-suites.sh.
//
// For each input that hermes-parser accepts, the Hermes AST is converted to
// the tree that tree-sitter-flow should produce (script/convert.mjs, naming in
// script/mapping.mjs) and compared with the actual tree: node kinds, byte
// ranges and, where both sides have one, field names. tree-sitter nodes with
// no ESTree counterpart (mapping.mjs IGNORED) and anonymous tokens are not
// compared. Exits with status 1 when any input mismatches, except the inputs
// listed with a reason in script/known-differences.txt.

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

import {convert} from './convert.mjs';
import {IGNORED} from './mapping.mjs';
import {ROOT, SUITES, SUITE_FILES, corpusInputs, ensureSuites, flowParserTests} from './suites.mjs';

const require = createRequire(import.meta.url);
const flowParser = require('flow-parser');

// Corpus cases that hermes-parser rejects must still be Flow: flow-parser has
// to accept them. It reads call type arguments only with an `@flow` pragma.
const FLOW_OPTIONS = {
  components: true,
  enums: true,
  esproposal_decorators: true,
  pattern_matching: true,
  records: true,
  types: true,
};

function flowParserAccepts(source) {
  const text = source.includes('@flow') ? source : `// @flow\n${source}`;
  try {
    return flowParser.parse(text, FLOW_OPTIONS).errors.length === 0;
  } catch {
    return false;
  }
}

// hermes-parser runs Hermes compiled to WebAssembly. Some inputs abort the
// WebAssembly instance, which then fails on every later input, so the module
// is loaded again after any failure.
function loadHermes() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}hermes-parser${path.sep}`) || key.includes(`${path.sep}hermes-estree${path.sep}`)) {
      delete require.cache[key];
    }
  }
  return require('hermes-parser');
}
let hermes = loadHermes();
function hermesParse(source) {
  try {
    return hermes.parse(source, HERMES_OPTIONS);
  } catch (e) {
    hermes = loadHermes();
    throw e;
  }
}
const Parser = require('tree-sitter');

const HERMES_OPTIONS = {
  babel: false,
  enableExperimentalComponentSyntax: true,
  enableExperimentalFlowMatchSyntax: true,
  enableExperimentalFlowRecordSyntax: true,
  flow: 'all',
  sourceType: 'module',
  tokens: false,
};

const ALL_SUITES = ['corpus', 'flow-parser', 'hermes', 'babel', 'flow-typed', 'react', 'react-native'];

function parseArgs(argv) {
  const opts = {suites: [], json: false, maxErrors: 200, color: process.stdout.isTTY};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--suite') opts.suites.push(argv[++i]);
    else if (a.startsWith('--suite=')) opts.suites.push(a.slice('--suite='.length));
    else if (a === '--json') opts.json = true;
    else if (a === '--max-errors') opts.maxErrors = Number(argv[++i]);
    else if (a.startsWith('--max-errors=')) opts.maxErrors = Number(a.slice('--max-errors='.length));
    else if (a === '--no-color') opts.color = false;
    else if (a === '--help' || a === '-h') {
      console.log('usage: npm run compare -- [--suite NAME]... [--json] [--max-errors N]');
      console.log(`suites: ${ALL_SUITES.join(', ')}`);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  for (const s of opts.suites) {
    if (!ALL_SUITES.includes(s)) {
      console.error(`unknown suite: ${s} (suites: ${ALL_SUITES.join(', ')})`);
      process.exit(2);
    }
  }
  if (opts.suites.length === 0) opts.suites = ALL_SUITES;
  return opts;
}

async function loadLanguage() {
  const mod = await import(path.join(ROOT, 'bindings/node/index.js'));
  return mod.default ?? mod;
}

function inputsOf(suite) {
  if (suite === 'corpus') return corpusInputs();
  ensureSuites();
  const files = suite === 'flow-parser' ? flowParserTests().valid : SUITE_FILES[suite]();
  return files.map(file => ({name: path.relative(SUITES, file), file}));
}

// The named nodes of a tree-sitter tree, without IGNORED kinds.
function actualNodes(tree) {
  const out = [];
  const cursor = tree.walk();
  // Returns the end of the node's last token that is not a comment: a
  // trailing comment can end up inside a node through a zero-width automatic
  // semicolon, while ESTree ranges never end with one.
  const visit = parent => {
    const kind = cursor.nodeType;
    const missing = cursor.nodeIsMissing;
    const start = cursor.startIndex;
    let end = cursor.endIndex;
    let self = parent;
    let entry = null;
    if ((cursor.nodeIsNamed || missing) && !(kind in IGNORED)) {
      entry = {kind: missing ? `MISSING ${kind}` : kind, start, end, field: cursor.currentFieldName ?? null, parent};
      out.push(entry);
      self = out.length - 1;
    }
    if (cursor.gotoFirstChild()) {
      let last = start;
      do {
        const isTrivia = cursor.nodeType === 'comment' || cursor.nodeType === 'html_comment';
        const childEnd = visit(self);
        if (!isTrivia && cursor.endIndex > cursor.startIndex) last = Math.max(last, childEnd);
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
      end = Math.max(last, start);
      if (entry) entry.end = end;
    }
    return end;
  };
  visit(-1);
  return out;
}

function pathOf(nodes, i) {
  const parts = [];
  for (let j = i; j >= 0; j = nodes[j].parent) parts.push(nodes[j].kind);
  return parts.reverse().join(' > ');
}

function diff(expected, actual) {
  const key = n => `${n.kind}\u0000${n.start}\u0000${n.end}`;
  const pool = new Map();
  actual.forEach((n, i) => {
    const k = key(n);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(i);
  });
  const matchedActual = new Set();
  const mismatches = [];
  expected.forEach((n, i) => {
    const list = pool.get(key(n));
    if (list && list.length) {
      const j = list.shift();
      matchedActual.add(j);
      const a = actual[j];
      if (n.field && a.field && n.field !== a.field) {
        mismatches.push({type: 'field', kind: n.kind, start: n.start, end: n.end,
          expected: n.field, actual: a.field, expectedPath: pathOf(expected, i), actualPath: pathOf(actual, j)});
      }
    } else {
      mismatches.push({type: 'missing', kind: n.kind, start: n.start, end: n.end, field: n.field,
        expectedPath: pathOf(expected, i)});
    }
  });
  actual.forEach((n, j) => {
    if (!matchedActual.has(j)) {
      mismatches.push({type: 'unexpected', kind: n.kind, start: n.start, end: n.end, field: n.field,
        actualPath: pathOf(actual, j)});
    }
  });
  mismatches.sort((a, b) => a.start - b.start || b.end - a.end);
  return mismatches;
}

function lineCol(text, offset) {
  let line = 1;
  let last = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i + 1;
    }
  }
  return {line, col: offset - last + 1, lineStart: last};
}

function excerpt(text, start, end) {
  const {line, col, lineStart} = lineCol(text, start);
  let lineEnd = text.indexOf('\n', lineStart);
  if (lineEnd < 0) lineEnd = text.length;
  const src = text.slice(lineStart, lineEnd);
  const width = Math.max(1, Math.min(end, lineEnd) - Math.max(start, 0));
  const gutter = String(line).length;
  return `${' '.repeat(gutter)} |\n${line} | ${src.slice(0, 160)}\n${' '.repeat(gutter)} | ${' '.repeat(Math.max(0, Math.min(col - 1, 160)))}${'^'.repeat(Math.min(width, 80))}`;
}

function describe(m) {
  const range = `[${m.start}, ${m.end})`;
  if (m.type === 'field') return `field     ${m.kind} ${range}: expected field \`${m.expected}\`, got \`${m.actual}\``;
  if (m.type === 'missing') return `missing   ${m.kind} ${range}${m.field ? ` (field \`${m.field}\`)` : ''}`;
  return `unexpected ${m.kind} ${range}${m.field ? ` (field \`${m.field}\`)` : ''}`;
}

export function loadKnownDifferences() {
  const known = new Map();
  const file = path.join(ROOT, 'script/known-differences.txt');
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('#');
    known.set((i < 0 ? t : t.slice(0, i)).trim(), i < 0 ? '' : t.slice(i + 1).trim());
  }
  return known;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const known = loadKnownDifferences();
  const stillKnown = new Set();
  const parser = new Parser();
  parser.setLanguage(await loadLanguage());
  const summary = [];
  const files = [];
  let printed = 0;
  const c = opts.color ? {red: s => `\x1b[31m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m`}
    : {red: s => s, dim: s => s, bold: s => s};

  for (const suite of opts.suites) {
    const stats = {suite, inputs: 0, compared: 0, matched: 0, mismatched: 0, known: 0, skipped: 0, kinds: new Map(),
      fixups: {'hermes-range-fixup': 0}};
    for (const input of inputsOf(suite)) {
      stats.inputs++;
      const source = input.source ?? fs.readFileSync(input.file, 'utf8');
      let ast;
      try {
        ast = hermesParse(source);
      } catch {
        stats.skipped++;
        if (suite === 'corpus' && !flowParserAccepts(source)) {
          stats.mismatched++;
          const m = {type: 'rejected', kind: 'input rejected by flow-parser and hermes-parser', start: 0, end: 0};
          files.push({suite, name: input.name, mismatches: [m]});
          stats.kinds.set(m.kind, (stats.kinds.get(m.kind) ?? 0) + 1);
          if (!opts.json && printed < opts.maxErrors) {
            printed++;
            console.log(c.bold(input.name));
            console.log(`  ${c.red('neither flow-parser nor hermes-parser accepts this corpus input')}\n`);
          }
        }
        continue;
      }
      stats.compared++;
      let expected;
      try {
        expected = convert(ast, source, stats.fixups);
      } catch (e) {
        expected = [{kind: `converter error: ${e.message}`, start: 0, end: 0, field: null, parent: -1}];
      }
      const tree = parser.parse(source, undefined, {bufferSize: Math.max(32 * 1024, source.length * 2 + 16)});
      const mismatches = diff(expected, actualNodes(tree));
      if (known.has(input.name)) {
        if (mismatches.length > 0) {
          stats.known++;
          stillKnown.add(input.name);
          continue;
        }
      }
      if (mismatches.length === 0) {
        stats.matched++;
        continue;
      }
      stats.mismatched++;
      for (const m of mismatches) {
        const k = `${m.type} ${m.kind}`;
        stats.kinds.set(k, (stats.kinds.get(k) ?? 0) + 1);
      }
      files.push({suite, name: input.name, mismatches});
      if (!opts.json && printed < opts.maxErrors) {
        console.log(c.bold(`${input.name}`));
        for (const m of mismatches) {
          if (printed >= opts.maxErrors) break;
          printed++;
          const {line, col} = lineCol(source, m.start);
          console.log(`  ${line}:${col}  ${c.red(describe(m))}`);
          if (m.expectedPath) console.log(c.dim(`      expected: ${m.expectedPath}`));
          if (m.actualPath) console.log(c.dim(`      actual:   ${m.actualPath}`));
          console.log(excerpt(source, m.start, m.end).split('\n').map(l => `      ${l}`).join('\n'));
        }
        console.log();
      }
    }
    summary.push(stats);
  }

  // Known differences in the suites that ran but that match now.
  const ran = new Set(opts.suites.map(s => (s === 'flow-parser' ? 'flow' : s) + '/'));
  const fixed = [...known.keys()].filter(k => !stillKnown.has(k) && [...ran].some(r => k.startsWith(r)));
  if (opts.json) {
    console.log(JSON.stringify({
      summary: summary.map(s => ({...s, kinds: Object.fromEntries(s.kinds)})),
      files,
      knownDifferences: [...stillKnown].map(k => ({file: k, reason: known.get(k)})),
      fixed,
    }, null, 2));
  } else {
    const total = files.reduce((n, f) => n + f.mismatches.length, 0);
    if (printed < total) console.log(c.dim(`(${total - printed} more mismatches not shown; use --max-errors)\n`));
    if (stillKnown.size) {
      console.log('Known differences (script/known-differences.txt):');
      for (const k of stillKnown) console.log(`  ${k} -- ${known.get(k)}`);
      console.log();
    }
    if (fixed.length) {
      console.log(c.red('Known differences that match now (remove them from script/known-differences.txt):'));
      for (const k of fixed) console.log(`  ${k}`);
      console.log();
    }
    console.log('| Suite | Inputs | Compared | Matched | Mismatched | Known differences | Hermes rejects | hermes-range-fixup | Top mismatch kinds |');
    console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const s of summary) {
      const top = [...s.kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ');
      console.log(`| ${s.suite} | ${s.inputs} | ${s.compared} | ${s.matched} | ${s.mismatched} | ${s.known} | ${s.skipped} | ` +
        `${s.fixups['hermes-range-fixup']} | ${top || '-'} |`);
    }
  }
  process.exit(summary.some(s => s.mismatched > 0) || fixed.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
