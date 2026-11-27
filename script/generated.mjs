// Generated snippets around `<`: call type arguments, comparisons, generic
// arrow functions and JSX, in many contexts.
//
//   npm run generated                # check every snippet
//   npm run generated -- --json      # machine-readable result
//   npm run generated -- --list      # print the snippets flow-parser accepts
//
// The snippets combine type forms, argument forms and contexts. The set is
// deterministic: every pair of forms is covered, plus a fixed-seed sample of
// triples. Only snippets that flow-parser accepts (with `@flow`) are kept.
// Each must parse with no ERROR or MISSING node, and with the same reading of
// every `<` as flow-parser: the same number of calls with type arguments,
// comparisons, arrow functions, JSX elements, type casts, class fields and
// class methods. Every node must
// also end at its last token (script/ranges.mjs); Flow declarations and
// statements followed by comments in many placements check that. The exit
// code is non-zero on any failure.

import path from 'node:path';
import {createRequire} from 'node:module';
import {rangeProblems} from './ranges.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const flowParser = require('flow-parser');
const Parser = require('tree-sitter');

const FLOW_OPTIONS = {
  components: true,
  enums: true,
  esproposal_decorators: true,
  pattern_matching: true,
  records: true,
  types: true,
};

// Type arguments, each the text between `<` and `>`.
const TYPES = [
  'T', 'void', 'string, number', 'T,', 'string, number,', '',
  '?T', '?(() => void)', 'T[]', '(A | B)[]', 'T[K]', "T['k']", 'T?.[K]', "T?.['k']", 'T?.[K]?.[L]',
  'A<B>', 'A<B<C>>', 'A<B<C<D>>>', 'A<?B>', 'A.B<C>', 'A<B,>',
  '{a: T}', '{+a: T, -b?: U}', '{[k: K]: V}', '{...A, b: T}', '{...}', '{|a: T|}', '{a(): void}', '{}',
  '[A, B]', '[a: A, b?: B]', '[]',
  'A | B', 'A & B', '| A | B', '"a" | "b"', '1', '-1', 'true', 'null',
  '() => void', '(a: A) => B', '(A) => B', '(...A) => B', '(a?: A, ...b: B) => C', '<U>(u: U) => U',
  'typeof x', 'typeof x.y', 'keyof A', '$Keys<typeof x>',
  'A extends B ? C : D', 'A extends infer B ? B : C', 'A extends 0 ? B : C',
  'component(a: string)', 'component(...b: C)', 'component(a: A) renders B', 'component<T>(a: T)',
  'component()', 'hook (a: A) => B',
  'renders A', 'renders? A', 'renders* A', 'renders (A | B)',
  'interface {a: T}', '$ReadOnly<{a: T}>', 'Class<T>', 'mixed', 'empty', 'any',
  "import('a')", "typeof import('a')", "import('a').B", "typeof import('a').B",
];

// Argument lists, each the text between `(` and `)`.
const ARGS = [
  '', 'a', 'a,', 'a, b', 'a, b,',
  '/:/', '/a:/g', '/[/]:/', '/:/, c,', '/a:/(c),', 'a / b', 'a / b / c',
  '`t`', '`${a}`', '`${`${a}`}`', '`a: ${b}`',
  'x => x', 'x => {}', '(x) => {}', '(x: T): U => x', '(): void => {}', 'async (x) => {}', 'async x => x',
  'function (): void {}', 'function* () {}',
  'c ? d : e', 'c ? (d) : e', '{a: b}', '{a}', '[a]', '...a', 'a < b', 'a > b', '(a: T)', '<A />',
  "'a:b'", '"c"', 'a ? b : (c): d => e',
];

// Contexts for an expression `E`.
const CONTEXTS = [
  'E;',
  'x = E;',
  'const v = E;',
  'x = c ? E : d;',
  'x = E ? c : d;',
  'x = c ? d : E;',
  'x = c ? E : d => {};',
  'x = c ? E : (d: D) => {};',
  'x = c ? E : d => e;',
  'x = (E: T);',
  'x = (E: () => void);',
  'x = (E: (a: A) => B);',
  'x = E as T;',
  'class K { p = E; }',
  'class K { p: T = E; }',
  'class K { p = E\n  .q(); }',
  'class K { [p] = E; }',
  'class K { static p = E; m() {} }',
  'f(E, 1);',
  'function g() { return E; }',
  'async function g() { await E; }',
  'x = [E, E];',
  'x = {k: E};',
  'x = () => E;',
  'x = `${E}`;',
  'x = <A b={E} />;',
  'if (E) {}',
  'x = !E;',
  'x = E.y;',
  'x = E || d;',
  'x = d + E;',
  'x = E ?? d;',
  'x = (E);',
  'x = <A>{E}</A>;',
  'export default E;',
  'x = E\n(b);',
  'x = E\n[0];',
  'class K { p = E\n  q = 1; }',
  'x = c ? (E) : d;',
  'for (const v of E) {}',
];

// Expressions that take the type arguments `T` and arguments `A`.
const CALLS = [
  'f<T>(A)',
  'a.b<T>(A)',
  'new C<T>(A)',
  'f?.<T>(A)',
];

// Class heritage with type arguments; `T` is the type arguments.
const HERITAGE = [
  'class K extends B<T> {}',
  'class K extends B<T> implements I<T> {}',
  'class K implements I<T> {}',
  'class K extends B<T> implements I<T> {\n  m() {\n    (g => {});\n  }\n}',
  'class K extends B<T> {\n  m() {\n    (g => {});\n  }\n}',
  'x = class extends B<T> {};',
  'const K = new C<T>;',
];

// Operands of comparison chains `a < X > Y`, which must stay comparisons
// whenever `X` is not a type or `Y` is not an argument list.
const OPERANDS = [
  'b', '(b)', '2', '(b << 16 >> 0)', '((b: c) | 0)', '(b | 0)', 'b ? c : d', 'b.c', 'b[0]', '-b', '!b',
  'b++', 'b + c', 'b && c', '(b, c)', '"s"', 'b < c', 'f(b)',
];
const RIGHT = ['(c)', '(0)', '((c) | 0)', 'c', '(c: T)', '(c)(d)', '(c) ? 1 : 2', '-(c)', '[c]'];
const RELATIONAL = [
  'x = a < X > Y;',
  'if ((a) < X > Y) {}',
  'x = (a < X > Y);',
  'x = c ? a < X > Y : d;',
];

// Generic arrow functions and JSX elements where an expression starts.
const STARTS = [
  '<T>(x: T): T => x', '<T,>(x) => x', '<T: A = B>(x) => x', '<T>(x) => {}', '<T>() => 3', '<T>(x: T) => <A />',
  'async <T>(x: T) => x', '<T>(x: T): Promise<T> => x', '<T>(a: T, b: (c: T) => void) => b(a)',
  '<A>text</A>', '<A>() => 3</A>', '<A b="c">d</A>', '<A />', '<>x</>', '<A.B>c</A.B>',
];
const START_CONTEXTS = [
  'x = E;', 'f(E);', 'x = c ? E : d;', 'x = c ? d : E;', 'class K { p = E; }', 'x = <A b={E} />;',
  'x = [E];', 'x = (E);', 'export default E;', 'x = {k: E};', 'x = c ? (E) : d;', 'x = a < b ? E : c;',
  'x = (a) < (b) ? E : c;', 'return E;',
];

// Flow declarations and statements, without a final `;`, each followed by a
// comment and what comes next: the node must end at its last token.
const DECLARATIONS = [
  'type A = number', 'type A = {a: B}', 'type A = | B | C', 'type A = B<C>', 'type A = typeof b',
  'opaque type A = number', 'opaque type A: B = C', 'declare opaque type A', 'declare opaque type A super B',
  'declare var a: number', 'declare let a: T', 'declare const a: T', 'declare function f(): void',
  'declare function f(x: mixed): boolean %checks(typeof x === "string")', 'declare class A {}',
  "declare module 'a' {}", 'declare export function f(): void', 'declare type A = B', 'export type A = B',
  "import type A from 'a'", "import {type A} from 'a'", 'interface I {}', 'enum E {A}', 'x = (a: T)',
  'const a: T = b', 'let a: T', 'class K { a: T }', 'class K { a: T = 1 }', 'class K<T> extends B<T> {}',
  'component C() {}', 'hook useA() {}', 'declare component C()', 'declare hook useA(): void',
  'function f(): T {}', 'function f<T>(a: T): T', 'x = a as T', 'f<T>(a)', 'x = match (a) { 1 => 2 }',
  'declare export default T', "declare module.exports: T", 'export default class {}', 'record R {}',
];
const COMMENTS = [' // c', '  // c', ' /* c */', '/* c */', ' /**\n * c\n */', ' /* c */ /* d */', '\n// c',
  '\n/**\n * c\n */', ' /**\n * c\n */ /**\n * d\n */', ' /* c */\n/* d */', ''];
const FOLLOWERS = ['', '\n', '\nh();', '\n\nexport type B = C;', '\n  ;'];
const BODIES = ['S', 'function g() { S }', 'function g() {\n  S\n}', 'if (a) {\n  S\n}'];

// Class member modifiers before a member with a Flow type, on the same line
// or the next: the member must read as flow-parser reads it.
const CLASS_MODIFIERS = ['declare', 'override', 'readonly', '+', '-', 'private', 'protected', 'public', 'static',
  'async', 'get', 'set', 'declare static', 'static readonly', 'static async', 'static +', 'override readonly'];
const TYPED_MEMBERS = ['b: T', 'b?: T', 'b: T = 1', 'b(): T {}', 'b<T>(): T {}', '[b]: T', '#b: T', 'b(c: T) {}'];

function members() {
  const out = new Set();
  for (const modifier of CLASS_MODIFIERS) {
    for (const member of TYPED_MEMBERS) {
      for (const sep of [' ', '\n  ']) {
        out.add(`class K { ${modifier}${sep}${member} }`);
        out.add(`class K {\n  ${modifier}${sep}${member}\n  c: T;\n}`);
      }
    }
  }
  for (const member of TYPED_MEMBERS) {
    for (const sep of [' ', '\n  ']) out.add(`abstract class K { abstract${sep}${member.replace(' {}', '')} }`);
  }
  return [...out];
}

function declarations() {
  const out = new Set();
  for (const d of DECLARATIONS) {
    for (const comment of COMMENTS) {
      for (const follower of FOLLOWERS) out.add(`${d}${comment}${follower}`);
    }
    for (const body of BODIES) {
      for (const comment of COMMENTS.slice(0, 5)) out.add(body.replace('S', `${d}${comment}`));
    }
  }
  return [...out];
}

// A small deterministic generator (mulberry32).
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function call(template, type, args) {
  return template.replace('<T>', `<${type}>`).replace('(A)', `(${args})`);
}

function snippets() {
  const out = new Set();
  const add = (context, expr) => out.add(context.replaceAll('E', expr));
  // Every pair of forms, with the default third.
  for (const type of TYPES) {
    for (const context of CONTEXTS) add(context, call(CALLS[0], type, 'a'));
    for (const args of ARGS) add(CONTEXTS[0], call(CALLS[0], type, args));
    for (const template of CALLS) add(CONTEXTS[1], call(template, type, 'a'));
    for (const heritage of HERITAGE) out.add(heritage.replaceAll('<T>', `<${type}>`));
  }
  for (const args of ARGS) {
    for (const context of CONTEXTS) add(context, call(CALLS[0], 'T', args));
    for (const template of CALLS) add(CONTEXTS[1], call(template, 'T', args));
  }
  for (const template of CALLS) {
    for (const context of CONTEXTS) add(context, call(template, 'T', 'a'));
  }
  // A fixed-seed sample of triples.
  const next = random(20261126);
  const pick = list => list[Math.floor(next() * list.length)];
  for (let i = 0; i < 4000; i++) add(pick(CONTEXTS), call(pick(CALLS), pick(TYPES), pick(ARGS)));
  // Comparison chains.
  for (const template of RELATIONAL) {
    for (const x of OPERANDS) {
      for (const y of RIGHT) out.add(template.replace('X', x).replace('Y', y));
    }
  }
  // Generic arrow functions and JSX.
  for (const context of START_CONTEXTS) {
    for (const start of STARTS) add(context, start);
  }
  for (const d of declarations()) out.add(d);
  for (const m of members()) out.add(m);
  return [...out];
}

function flowAst(source) {
  try {
    const ast = flowParser.parse(`// @flow\n${source}`, FLOW_OPTIONS);
    return ast.errors.length === 0 ? ast : null;
  } catch {
    return null;
  }
}

// What each reading of `<` produces, counted in both trees.
function emptyShape() {
  return {typeArgumentCalls: 0, comparisons: 0, arrows: 0, jsx: 0, casts: 0, classFields: 0, classMethods: 0};
}

function flowShape(node, shape = emptyShape()) {
  if (Array.isArray(node)) {
    for (const child of node) flowShape(child, shape);
    return shape;
  }
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return shape;
  switch (node.type) {
    case 'CallExpression':
    case 'OptionalCallExpression':
    case 'NewExpression':
      if (node.typeArguments) shape.typeArgumentCalls++;
      break;
    case 'BinaryExpression':
      if (node.operator === '<' || node.operator === '>') shape.comparisons++;
      break;
    case 'ArrowFunctionExpression':
      shape.arrows++;
      break;
    case 'JSXElement':
    case 'JSXFragment':
      shape.jsx++;
      break;
    case 'TypeCastExpression':
      shape.casts++;
      break;
    case 'PropertyDefinition':
    case 'ClassProperty':
    case 'ClassPrivateProperty':
    case 'AbstractPropertyDefinition':
      shape.classFields++;
      break;
    case 'MethodDefinition':
    case 'AbstractMethodDefinition':
      shape.classMethods++;
      break;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && key !== 'comments') flowShape(value, shape);
  }
  return shape;
}

function treeShape(node, shape = emptyShape()) {
  switch (node.type) {
    case 'call_expression':
    case 'new_expression':
      if (node.childForFieldName('type_arguments')) shape.typeArgumentCalls++;
      break;
    case 'binary_expression': {
      const op = node.childForFieldName('operator')?.type;
      if (op === '<' || op === '>') shape.comparisons++;
      break;
    }
    case 'arrow_function':
      shape.arrows++;
      break;
    case 'jsx_element':
    case 'jsx_self_closing_element':
      shape.jsx++;
      break;
    case 'type_cast_expression':
      shape.casts++;
      break;
    case 'field_definition':
    case 'abstract_property_definition':
      shape.classFields++;
      break;
    case 'method_definition':
    case 'abstract_method_definition':
      if (node.parent?.type === 'class_body') shape.classMethods++;
      break;
  }
  for (const child of node.namedChildren) treeShape(child, shape);
  return shape;
}

function firstProblem(node) {
  if (node.type === 'ERROR' || node.isMissing) return node;
  if (!node.hasError) return null;
  for (const child of node.children) {
    const found = firstProblem(child);
    if (found) return found;
  }
  return node;
}

async function main() {
  const json = process.argv.includes('--json');
  const list = process.argv.includes('--list');
  const mod = await import(path.join(ROOT, 'bindings/node/index.js'));
  const parser = new Parser();
  parser.setLanguage(mod.default ?? mod);

  const all = snippets();
  const asts = new Map();
  for (const source of all) {
    const ast = flowAst(source);
    if (ast) asts.set(source, ast);
  }
  const accepted = [...asts.keys()];
  if (list) {
    for (const s of accepted) console.log(JSON.stringify(s));
    return;
  }
  const failures = [];
  for (const source of accepted) {
    const text = `// @flow\n${source}`;
    const tree = parser.parse(text);
    if (tree.rootNode.hasError) {
      const problem = firstProblem(tree.rootNode);
      failures.push({source, problem: `${problem.isMissing ? 'MISSING' : problem.type} at ` +
        `${problem.startPosition.row}:${problem.startPosition.column}`});
      continue;
    }
    const ranges = rangeProblems(tree.rootNode, 1);
    if (ranges.length) {
      const r = ranges[0];
      failures.push({source, problem: `${r.type} [${r.start}, ${r.end}] ${r.what} at ${r.lastToken}`});
      continue;
    }
    const expected = flowShape(asts.get(source).body);
    const actual = treeShape(tree.rootNode);
    const differences = Object.keys(expected).filter(k => expected[k] !== actual[k]);
    if (differences.length) {
      failures.push({source, problem: differences.map(k => `${k}: flow-parser ${expected[k]}, ` +
        `tree-sitter-flow ${actual[k]}`).join('; ')});
    }
  }
  const result = {generated: all.length, accepted: accepted.length, rejected: all.length - accepted.length,
    failures};
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const f of failures) console.log(`FAIL ${JSON.stringify(f.source)}: ${f.problem}`);
    console.log(`${all.length} snippets generated, ${accepted.length} accepted by flow-parser, ` +
      `${accepted.length - failures.length} parse clean with flow-parser's reading, ${failures.length} failures`);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
