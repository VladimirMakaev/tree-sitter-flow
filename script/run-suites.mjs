#!/usr/bin/env node
// Runs tree-sitter-flow over public Flow test suites and real code, and checks
// the results against script/known-failures.txt.
//
//   script/fetch-suites.sh            # fetch the suites at pinned commits
//   node script/run-suites.mjs        # report
//   node script/run-suites.mjs --check --perf --json results.json
//
// Environment: SUITES_DIR (default .cache/suites), TREE_SITTER (tree-sitter
// CLI, default node_modules/.bin/tree-sitter), JOBS (parallel workers).

import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {checkNames, checkNodeTypes} from './naming.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = process.env.SUITES_DIR || path.join(ROOT, '.cache/suites');
const CACHE = path.join(ROOT, '.cache');
const TS = process.env.TREE_SITTER || path.join(ROOT, 'node_modules/.bin/tree-sitter');
const JOBS = Number(process.env.JOBS) || Math.max(2, os.availableParallelism?.() ?? os.cpus().length);
const args = new Set(process.argv.slice(2));
const jsonOut = (() => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--json');
  return i >= 0 ? argv[i + 1] : null;
})();

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, {encoding: 'utf8', maxBuffer: 1 << 30, ...opts});
  if (r.status !== 0 && !opts.allowFailure) {
    throw new Error(`${cmd} ${argv.join(' ')} failed:\n${r.stderr}`);
  }
  return r;
}

function walk(dir, accept, out = []) {
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

function hasFlowPragma(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(4096);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return buf.subarray(0, n).toString('utf8').includes('@flow');
}

const rel = file => path.relative(SUITES, file);

// --------------------------------------------------------------------------
// Suites

function flowParserTests() {
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

const SUITE_FILES = {
  hermes: () => walk(path.join(SUITES, 'hermes/test/Parser/flow'), p => p.endsWith('.js')).sort(),
  babel: () => walk(path.join(SUITES, 'babel/packages/babel-parser/test/fixtures/flow'),
    p => /\/input\.m?js$/.test(p)).sort(),
  'flow-typed': () => walk(path.join(SUITES, 'flow-typed/definitions'),
    p => p.endsWith('.js') && hasFlowPragma(p)).sort(),
  react: () => walk(path.join(SUITES, 'react/packages'), p => p.endsWith('.js') && hasFlowPragma(p)).sort(),
  'react-native': () => walk(path.join(SUITES, 'react-native'),
    p => (p.endsWith('.js') || p.endsWith('.js.flow')) && hasFlowPragma(p)).sort(),
};

// --------------------------------------------------------------------------
// Reference parsers

function runWorker(files, timeoutMs, extra = []) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'script/accept-worker.mjs'), ...extra, ...files],
      {cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore']});
    let out = '';
    child.stdout.on('data', d => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      const results = new Map();
      for (const line of out.split('\n')) {
        if (!line) continue;
        try {
          const r = JSON.parse(line);
          results.set(r.file, r);
        } catch {
          // A worker killed mid-line.
        }
      }
      resolve(results);
    });
  });
}

async function referenceParse(files) {
  const results = new Map();
  const batches = [];
  for (let i = 0; i < files.length; i += 25) batches.push(files.slice(i, i + 25));
  let next = 0;
  const retry = [];
  async function lane() {
    while (next < batches.length) {
      const batch = batches[next++];
      const r = await runWorker(batch, 120000);
      for (const f of batch) {
        if (r.has(f)) results.set(f, r.get(f));
        else retry.push(f);
      }
    }
  }
  await Promise.all(Array.from({length: JOBS}, lane));
  // Files from batches that timed out run one at a time. If flow-parser
  // still times out, hermes-parser alone decides.
  const undecided = [];
  for (const f of retry) {
    let r = await runWorker([f], 30000);
    if (!r.has(f)) r = await runWorker([f], 30000, ['--hermes-only']);
    if (r.has(f)) results.set(f, r.get(f));
    else undecided.push(f);
  }
  return {results, undecided};
}

// --------------------------------------------------------------------------
// tree-sitter

function buildLibraries() {
  fs.mkdirSync(CACHE, {recursive: true});
  const flowLib = path.join(CACHE, 'flow.so');
  const jsLib = path.join(CACHE, 'javascript.so');
  run(TS, ['build', '-o', flowLib], {cwd: ROOT});
  run(TS, ['build', '-o', jsLib, path.join(ROOT, 'node_modules/tree-sitter-javascript')], {cwd: ROOT});
  return {flow: {lib: flowLib, name: 'flow'}, javascript: {lib: jsLib, name: 'javascript'}};
}

function writeList(files) {
  const list = path.join(CACHE, `paths-${process.pid}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(list, files.join('\n') + '\n');
  return list;
}

// Parses files and returns Map(file -> {ms, error}).
function treeSitterParse(files, lang) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 500) {
    const chunk = files.slice(i, i + 500);
    const list = writeList(chunk);
    const r = run(TS, ['parse', '-q', '-t', '--lib-path', lang.lib, '--lang-name', lang.name, '--paths', list],
      {cwd: CACHE, allowFailure: true});
    fs.unlinkSync(list);
    for (const line of r.stdout.split('\n')) {
      const m = /^(.*?)\s*\tParse:\s*([\d.]+) ms\s*\t\s*\d+ bytes\/ms(.*)$/.exec(line);
      if (m) out.set(m[1].trim(), {ms: Number(m[2]), error: m[3].trim()});
    }
    for (const f of chunk) if (!out.has(f)) out.set(f, {ms: 0, error: 'no result'});
  }
  return out;
}

// Returns Map(file -> Set of named node types) from the XML output.
function treeSitterTypes(files, lang) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 300) {
    const list = writeList(files.slice(i, i + 300));
    const r = run(TS, ['parse', '-x', '--no-ranges', '--lib-path', lang.lib, '--lang-name', lang.name, '--paths', list],
      {cwd: CACHE, allowFailure: true});
    fs.unlinkSync(list);
    const parts = r.stdout.split('<source name="');
    for (const part of parts.slice(1)) {
      const name = part.slice(0, part.indexOf('"')).replace(/&amp;/g, '&');
      const types = new Set();
      for (const m of part.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)[\s>]/g)) types.add(m[1]);
      types.delete('source');
      out.set(name, types);
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Known failures

function loadKnownFailures() {
  const file = path.join(ROOT, 'script/known-failures.txt');
  const known = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [p, ...reason] = t.split('#');
    known.set(p.trim(), reason.join('#').trim());
  }
  return known;
}

// --------------------------------------------------------------------------
// Performance

function timeOne(file, lang, repeat = 3) {
  let best = Infinity;
  for (let i = 0; i < repeat; i++) {
    const r = run(TS, ['parse', '-q', '-t', '--lib-path', lang.lib, '--lang-name', lang.name, file],
      {cwd: CACHE, allowFailure: true});
    const m = /Parse:\s*([\d.]+) ms/.exec(r.stdout);
    if (m) best = Math.min(best, Number(m[1]));
  }
  return best;
}

function perf(files, langs) {
  const flow = treeSitterParse(files, langs.flow);
  const js = treeSitterParse(files, langs.javascript);
  const total = m => [...m.values()].reduce((s, v) => s + v.ms, 0);
  const bytes = f => fs.statSync(f).size;
  const slowest = [...flow.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([f, v]) => ({
    file: rel(f), bytes: bytes(f), ms: v.ms, javascriptMs: js.get(f)?.ms ?? null,
  }));
  // Linearity: parse the slowest files repeated 1x and 8x.
  const scaling = [];
  for (const s of slowest) {
    const src = fs.readFileSync(path.join(SUITES, s.file), 'utf8');
    const one = path.join(CACHE, 'perf-1.js');
    const eight = path.join(CACHE, 'perf-8.js');
    fs.writeFileSync(one, src);
    fs.writeFileSync(eight, Array(8).fill(src).join('\n;\n'));
    const t1 = timeOne(one, langs.flow);
    const t8 = timeOne(eight, langs.flow);
    scaling.push({file: s.file, t1, t8, ratio: t8 / t1});
  }
  return {
    files: files.length,
    bytes: files.reduce((s, f) => s + bytes(f), 0),
    flowMs: total(flow),
    javascriptMs: total(js),
    slowest,
    scaling,
  };
}

// --------------------------------------------------------------------------

function pct(n, d) {
  return d === 0 ? '-' : `${(100 * n / d).toFixed(2)}%`;
}

async function main() {
  if (!fs.existsSync(path.join(SUITES, 'flow'))) {
    console.error(`No suites in ${SUITES}; run script/fetch-suites.sh first.`);
    process.exit(2);
  }
  const langs = buildLibraries();
  const known = loadKnownFailures();
  const report = {suites: {}, unexpected: [], fixed: []};

  const flowTests = flowParserTests();
  const groups = {};
  for (const [name, fn] of Object.entries(SUITE_FILES)) groups[name] = fn();

  // Reference parsers decide what Flow accepts for every suite but Flow's
  // own tests, whose expected output already says so.
  const toCheck = [...flowTests.valid, ...Object.values(groups).flat()];
  const {results: reference, undecided} = await referenceParse(toCheck);

  // A file is in a suite when flow-parser or hermes-parser accepts it.
  const accepted = f => reference.get(f)?.flow || reference.get(f)?.hermes;
  const suiteInputs = {
    'flow-parser-tests': flowTests.valid,
    hermes: groups.hermes.filter(accepted),
    babel: groups.babel.filter(accepted),
    'flow-typed': groups['flow-typed'].filter(accepted),
    react: groups.react.filter(accepted),
    'react-native': groups['react-native'].filter(accepted),
  };
  // Inputs both reference parsers reject; report how many produce an ERROR.
  const rejected = {};
  for (const name of Object.keys(groups)) rejected[name] = groups[name].filter(f => reference.has(f) && !accepted(f));

  const allParsed = new Map();
  for (const [suite, files] of Object.entries(suiteInputs)) {
    const parsed = treeSitterParse(files, langs.flow);
    for (const [f, v] of parsed) allParsed.set(f, v);
    const failures = files.filter(f => parsed.get(f).error).map(rel);
    const unexpected = failures.filter(f => !known.has(f));
    const fixed = [...known.keys()].filter(k => files.some(f => rel(f) === k) && !failures.includes(k));
    report.suites[suite] = {
      total: files.length,
      clean: files.length - failures.length,
      failures: failures.map(f => ({file: f, known: known.get(f) ?? null})),
    };
    if (suite === 'hermes' || suite === 'babel') {
      report.suites[suite].candidates = groups[suite].length;
      report.suites[suite].hermesParserAccepts = groups[suite].filter(f => reference.get(f)?.hermes).length;
    }
    report.unexpected.push(...unexpected.map(f => `${f}: ${parsed.get(path.join(SUITES, f)).error}`));
    report.fixed.push(...fixed);
  }

  // Invalid inputs that produce an ERROR or MISSING node.
  const invalidParsed = treeSitterParse(flowTests.invalid, langs.flow);
  report.suites['flow-parser-tests'].invalid = {
    total: flowTests.invalid.length,
    withError: flowTests.invalid.filter(f => invalidParsed.get(f).error).length,
  };
  for (const [name, files] of Object.entries(rejected)) {
    const parsed = treeSitterParse(files, langs.flow);
    report.suites[name].invalid = {total: files.length, withError: files.filter(f => parsed.get(f).error).length};
  }
  report.undecided = undecided.map(rel);

  // Naming check over suites 1 and 2, without the inputs where Hermes builds
  // a different tree (script/known-differences.txt).
  const knownDifferences = new Set(fs.readFileSync(path.join(ROOT, 'script/known-differences.txt'), 'utf8')
    .split('\n').map(l => l.split('#')[0].trim()).filter(Boolean));
  const namingFiles = [...suiteInputs['flow-parser-tests'], ...suiteInputs.hermes, ...suiteInputs.babel]
    .filter(f => reference.get(f)?.hermes && !allParsed.get(f).error && !knownDifferences.has(rel(f)));
  const tsTypes = treeSitterTypes(namingFiles, langs.flow);
  report.naming = checkNames({
    files: namingFiles,
    hermesTypes: f => new Set(reference.get(f).types),
    treeSitterTypes: f => tsTypes.get(f) ?? new Set(),
    estreeDef: fs.readFileSync(path.join(SUITES, 'hermes/include/hermes/AST/ESTree.def'), 'utf8'),
    flowNodeTypes: JSON.parse(fs.readFileSync(path.join(ROOT, 'src/node-types.json'), 'utf8')),
    javascriptNodeTypes: JSON.parse(fs.readFileSync(
      path.join(ROOT, 'node_modules/tree-sitter-javascript/src/node-types.json'), 'utf8')),
    rel,
  });
  const nodeTypes = checkNodeTypes({
    estreeDef: fs.readFileSync(path.join(SUITES, 'hermes/include/hermes/AST/ESTree.def'), 'utf8'),
    flowNodeTypes: JSON.parse(fs.readFileSync(path.join(ROOT, 'src/node-types.json'), 'utf8')),
    javascriptNodeTypes: JSON.parse(fs.readFileSync(
      path.join(ROOT, 'node_modules/tree-sitter-javascript/src/node-types.json'), 'utf8')),
  });
  report.naming.flowNodes = nodeTypes.flowNodes;
  report.naming.problems.push(...nodeTypes.problems);

  if (args.has('--perf')) {
    const real = [...suiteInputs['flow-typed'], ...suiteInputs.react, ...suiteInputs['react-native']];
    report.perf = perf(real, langs);
  }

  printReport(report);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');

  if (args.has('--check')) {
    let ok = true;
    if (report.unexpected.length > 0) {
      console.error(`\n${report.unexpected.length} unexpected failure(s):`);
      for (const u of report.unexpected) console.error(`  ${u}`);
      ok = false;
    }
    if (report.naming.problems.length > 0) {
      console.error(`\nnaming check: ${report.naming.problems.length} problem(s):`);
      for (const p of report.naming.problems) console.error(`  ${p}`);
      ok = false;
    }
    if (report.perf && report.perf.scaling.some(s => s.ratio > 16)) {
      console.error('\nsuperlinear parse time detected');
      ok = false;
    }
    if (report.fixed.length > 0) {
      console.error(`\nknown failures that now parse (remove them from script/known-failures.txt):`);
      for (const f of report.fixed) console.error(`  ${f}`);
    }
    process.exit(ok ? 0 : 1);
  }
}

function printReport(report) {
  console.log('| Suite | Clean | Total | Rate |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const [name, s] of Object.entries(report.suites)) {
    console.log(`| ${name} | ${s.clean} | ${s.total} | ${pct(s.clean, s.total)} |`);
  }
  console.log('\nInputs the Flow parsers reject, and how many of them produce an ERROR or MISSING node:');
  for (const [name, s] of Object.entries(report.suites)) {
    if (s.invalid) console.log(`  ${name}: ${s.invalid.withError}/${s.invalid.total} (${pct(s.invalid.withError, s.invalid.total)})`);
  }
  for (const name of ['hermes', 'babel']) {
    const s = report.suites[name];
    console.log(`${name}: ${s.candidates} inputs, flow-parser accepts ${s.total}, hermes-parser accepts ${s.hermesParserAccepts}`);
  }
  if (report.undecided.length) console.log(`Reference parsers timed out on: ${report.undecided.join(', ')}`);
  console.log('\nKnown failures:');
  for (const s of Object.values(report.suites)) {
    for (const f of s.failures) console.log(`  ${f.file}${f.known ? ` -- ${f.known}` : ' -- UNEXPECTED'}`);
  }
  const n = report.naming;
  console.log(`\nNaming check: ${n.flowNodes} Flow node types in the grammar; ${n.files} files, ` +
    `${n.hermesFlowTypes} Hermes Flow node types seen, ${n.mapped} mapped, ${n.problems.length} problems`);
  for (const p of n.notes) console.log(`  note: ${p}`);
  if (report.perf) {
    const p = report.perf;
    console.log(`\nPerformance: ${p.files} files, ${(p.bytes / 1e6).toFixed(1)} MB; ` +
      `tree-sitter-flow ${(p.flowMs / 1000).toFixed(2)} s, tree-sitter-javascript ${(p.javascriptMs / 1000).toFixed(2)} s`);
    console.log('| File | Bytes | Flow ms | JavaScript ms | 8x/1x |');
    console.log('| --- | ---: | ---: | ---: | ---: |');
    p.slowest.forEach((s, i) => {
      console.log(`| ${s.file} | ${s.bytes} | ${s.ms.toFixed(2)} | ${s.javascriptMs?.toFixed(2)} | ${p.scaling[i].ratio.toFixed(2)} |`);
    });
  }
}

await main();
