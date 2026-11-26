// Checks that tree-sitter-flow reads plain JavaScript exactly as
// tree-sitter-javascript does.
//
//   npm run js-identity              # every input
//   npm run js-identity -- --json    # machine-readable result
//   npm run js-identity -- --show 20 # print up to 20 differences
//
// Inputs: the tree-sitter-javascript corpus, the JavaScript files without
// `@flow` in the fetched suites, and generated JavaScript snippets. An input
// is plain JavaScript when tree-sitter-javascript parses it with no ERROR or
// MISSING node. For each such input the two concrete syntax trees must be
// identical: every node, named or anonymous, with the same type, field and
// start and end byte.
//
// Only the intentional differences in DIFFERENCES are allowed, each recognized
// from the trees, and counted in the summary. The exit code is non-zero on any
// other difference.

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ROOT, SUITES, ensureSuites} from './suites.mjs';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');

const JS_TYPES = new Set(
  JSON.parse(fs.readFileSync(require.resolve('tree-sitter-javascript/src/node-types.json'), 'utf8'))
    .flatMap(t => [t.type, ...(t.subtypes ?? []).map(s => s.type)]));

// Intentional differences, in the order they are tried. Each gets the
// differing nodes of both trees and says whether it explains them.
const DIFFERENCES = [
  {
    name: 'await-call',
    reason: '`await (a)(b)` awaits the call, as in Flow\'s parser: Flow code is in ES modules, where `await` ' +
      'is a keyword. tree-sitter-javascript calls a function named `await`.',
    test: (ours, theirs) => some(theirs, n => n.type === 'call_expression' &&
      n.childForFieldName('function')?.text === 'await') && some(ours, n => n.type === 'await_expression'),
  },
  {
    name: 'arrow-function-end',
    reason: 'An arrow function cannot be called, indexed or compared directly, so after its block body `(`, ' +
      '`[`, a template or `<` on the next line starts a new statement, as in Flow\'s parser. ' +
      'tree-sitter-javascript continues the expression.',
    test: (ours, theirs) => some(theirs, n => ['call_expression', 'subscript_expression', 'binary_expression']
      .includes(n.type) && ['function', 'object', 'left'].some(f => n.childForFieldName(f)?.type === 'arrow_function')),
  },
  {
    name: 'call-type-arguments',
    reason: '`f<T>(x)` and `a < (b) > (c)` are calls with type arguments in Flow, where ' +
      'tree-sitter-javascript compares twice.',
    test: (ours, theirs) => some(ours, n => n.type === 'type_parameter_instantiation') &&
      some(theirs, n => n.type === 'binary_expression' && ['<', '>'].includes(n.childForFieldName('operator')?.type)) &&
      !some(ours, n => n.isNamed && !JS_TYPES.has(n.type) && !isTypeNode(n)),
  },
];

// Flow node types that type arguments contain.
function isTypeNode(node) {
  return /_type_annotation$|_type$|^type_|^qualified_type_identifier$|^variance$/.test(node.type);
}

function some(nodes, predicate) {
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.pop();
    if (predicate(n)) return true;
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
  return false;
}

function flowTypes(nodes, out) {
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.pop();
    if (n.isNamed && !JS_TYPES.has(n.type)) out.add(n.type);
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
}

function children(node) {
  const out = [];
  for (let i = 0; i < node.childCount; i++) out.push({node: node.child(i), field: node.fieldNameForChild(i)});
  return out;
}

const same = (a, b, fa, fb) => a.type === b.type && a.isNamed === b.isNamed && a.startIndex === b.startIndex &&
  a.endIndex === b.endIndex && (fa ?? null) === (fb ?? null);

// Compares two trees; returns the differing regions, each a pair of node lists.
function compareTrees(a, b, regions = []) {
  const ca = children(a);
  const cb = children(b);
  let i = 0;
  while (i < ca.length && i < cb.length && same(ca[i].node, cb[i].node, ca[i].field, cb[i].field)) i++;
  let ja = ca.length;
  let jb = cb.length;
  while (ja > i && jb > i && same(ca[ja - 1].node, cb[jb - 1].node, ca[ja - 1].field, cb[jb - 1].field)) {
    ja--;
    jb--;
  }
  if (i < ja || i < jb) regions.push({ours: ca.slice(i, ja).map(c => c.node), theirs: cb.slice(i, jb).map(c => c.node),
    parent: a});
  for (let k = 0; k < i; k++) compareTrees(ca[k].node, cb[k].node, regions);
  for (let k = ja; k < ca.length; k++) compareTrees(ca[k].node, cb[k - ja + jb].node, regions);
  return regions;
}

// ---------------------------------------------------------------- inputs

function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') walk(p, accept, out);
    } else if (accept(p)) {
      out.push(p);
    }
  }
  return out;
}

function corpusCases() {
  const dir = path.join(SUITES, 'tree-sitter-javascript/test/corpus');
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const re = /^={3,}\n(.*)\n={3,}\n([\s\S]*?)\n-{3,}\n/gm;
    let m;
    while ((m = re.exec(text))) out.push({name: `tree-sitter-javascript/${file}: ${m[1].trim()}`, source: m[2]});
  }
  return out;
}

const PLAIN_SUITES = ['react/packages', 'react-native', 'relay/packages', 'metro', 'stylex', 'prettier/tests/format'];

function suiteFiles() {
  const out = [];
  for (const dir of PLAIN_SUITES) {
    for (const file of walk(path.join(SUITES, dir), p => /\.m?js$/.test(p)).sort()) {
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('@flow')) continue;
      out.push({name: path.relative(SUITES, file), source});
    }
  }
  return out;
}

// Generated snippets with no Flow syntax.
const EXPRESSIONS = [
  'a', 'undefined', 'null', 'this', 'true', 'false', 'super.a', 'new.target', 'import.meta', '1', '"s"', '`t${a}`',
  '/a:b/g', 'a < b', 'a > b', 'a < b > c', 'a << b >> c', 'a < (b) > (c)', 'a < b ? c : d', '(a) < (b)',
  'a ? b : c', 'a => a', 'a => {}', '(a, b) => {}', 'async a => a', 'async () => {}', 'function () {}',
  'class {}', 'class extends A {}', '<A />', '<A b="c">d</A>', '<></>', 'a?.b', 'a?.[b]', 'a?.()', 'a ?? b',
  '[a, ...b]', '{a, b: c, ...d}', '(a, b)', 'a = b', 'a += b', 'typeof a', 'void a', 'delete a.b', '-a', 'a++',
  'await a', 'f(a, b,)', 'new A()', 'new A', 'a.b.c()', 'a`b`', 'type', 'of', 'as', 'async', 'get', 'set',
];
const STATEMENTS = [
  'E;', 'x = E;', 'const v = E;', 'let v = E, w = E;', 'if (E) { E; } // c', 'if (E) E; else { E; } /* c */',
  'while (E) {} // c', '{ E; } // c', 'for (const v of E) {}', 'switch (E) { case E: break; }',
  'try { E; } catch (e) { E; } finally {} // c', 'function f() { return E; } // c', 'class K { p = E; m() { E; } }',
  'class K { static p = E\n  q = E; }', 'x = () => { E; };', 'x = E\nx = E', 'x = E\n(E);', 'x = E\n[E];',
  'label: { E; }', 'do { E; } while (E) // c', 'export default E;', 'export const v = E;',
  'async function f() { await E; }', 'function* g() { yield E; }', 'x = {m() { E; }, get a() { return E; }};',
  'x = [E, E];', 'x = (E);', 'x = <A b={E}>{E}</A>;', 'f(E)\n// c\n', 'x = E // c\n', 'if (a) {\n  E;\n}  \n',
  'class K { a = async () => await E; m() {} }', 'class K{static a=async(e)=>await E;static async*b(){}}',
  'class K { a = E\n  b() {} }', 'class K { a = E; *b() {} }', 'class K { a = E\n  *b() {} }',
  'class K { get = E; set; static; async; }', 'x = {a: E, b() {}, [E]: E};',
];

function generated() {
  const out = new Set();
  for (const statement of STATEMENTS) {
    for (const expression of EXPRESSIONS) out.add(statement.replaceAll('E', expression));
  }
  return [...out].map((source, i) => ({name: `generated #${i}: ${JSON.stringify(source)}`, source}));
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const show = args.includes('--show') ? Number(args[args.indexOf('--show') + 1]) : 20;
  ensureSuites();
  const mod = await import(path.join(ROOT, 'bindings/node/index.js'));
  const flow = new Parser();
  flow.setLanguage(mod.default ?? mod);
  const js = new Parser();
  js.setLanguage(JavaScript);

  const sources = {corpus: corpusCases(), suites: suiteFiles(), generated: generated()};
  const summary = [];
  const counts = {};
  const examples = {};
  const flowNodeTypes = new Set();
  const failures = [];
  for (const [source, inputs] of Object.entries(sources)) {
    const row = {source, inputs: inputs.length, plain: 0, identical: 0, intentional: 0, failed: 0};
    for (const input of inputs) {
      const theirs = js.parse(input.source, undefined, {bufferSize: 1 << 22});
      if (theirs.rootNode.hasError) continue;
      row.plain++;
      const ours = flow.parse(input.source, undefined, {bufferSize: 1 << 22});
      const regions = compareTrees(ours.rootNode, theirs.rootNode);
      if (!regions.length) {
        row.identical++;
        continue;
      }
      let unexplained = null;
      for (const region of regions) {
        const difference = DIFFERENCES.find(d => d.test(region.ours, region.theirs));
        if (!difference) {
          unexplained ??= region;
          continue;
        }
        counts[difference.name] = (counts[difference.name] ?? 0) + 1;
        (examples[difference.name] ??= []).push(input.name);
        flowTypes(region.ours, flowNodeTypes);
      }
      if (unexplained) {
        row.failed++;
        const describe = nodes => nodes.map(n => `${n.isNamed ? n.type : JSON.stringify(n.type)} ` +
          `[${n.startIndex}, ${n.endIndex}]`).join(', ') || '(none)';
        const at = unexplained.ours[0] ?? unexplained.theirs[0] ?? unexplained.parent;
        failures.push({input: input.name, parent: unexplained.parent.type, ours: describe(unexplained.ours),
          theirs: describe(unexplained.theirs),
          excerpt: input.source.slice(Math.max(0, at.startIndex - 30), at.endIndex + 30)});
      } else {
        row.intentional++;
      }
    }
    summary.push(row);
  }
  const result = {summary, intentional: counts, examples, flowNodeTypes: [...flowNodeTypes].sort(), failures};
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const f of failures.slice(0, show)) {
      console.log(`DIFF ${f.input}\n  in ${f.parent}\n  tree-sitter-flow:       ${f.ours}\n` +
        `  tree-sitter-javascript: ${f.theirs}\n  ${JSON.stringify(f.excerpt)}`);
    }
    console.log('| Inputs | Total | Plain JavaScript | Identical | Intentional differences | Other differences |');
    console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const r of summary) {
      console.log(`| ${r.source} | ${r.inputs} | ${r.plain} | ${r.identical} | ${r.intentional} | ${r.failed} |`);
    }
    console.log(`Intentional differences: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    if (flowNodeTypes.size) console.log(`Flow node types in them: ${[...flowNodeTypes].sort().join(', ')}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
