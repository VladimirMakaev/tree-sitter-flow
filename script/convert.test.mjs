// Unit tests for the Hermes-to-tree-sitter converter: node --test script/
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';

import {convert, fixKeyAfterModifier} from './convert.mjs';

const require = createRequire(import.meta.url);
const hermes = require('hermes-parser');
const parse = text => hermes.parse(text, {flow: 'all', babel: false, sourceType: 'module'});

test('hermes-range-fixup: key after a modifier', () => {
  const text = 'class A {\n  declare static\n}';
  const key = parse(text).body[0].body.body[0].key;
  // The Hermes bug this fixup exists for: the key's range is `declare`.
  assert.equal(text.slice(...key.range), 'declare');
  assert.deepEqual(fixKeyAfterModifier(text, key), [20, 26]);

  const stats = {};
  const nodes = convert(parse(text), text, stats);
  const id = nodes.find(n => n.kind === 'property_identifier');
  assert.equal(text.slice(id.start, id.end), 'static');
  assert.equal(stats['hermes-range-fixup'], 1);
});

test('hermes-range-fixup: not applied to correct ranges', () => {
  for (const text of ['class A { declare x: number }', 'class A { static static }', 'class A { \\u0061 = 1 }',
    'const o = {a: 1, b() {}}']) {
    const stats = {};
    convert(parse(text), text, stats);
    assert.equal(stats['hermes-range-fixup'], 0, text);
  }
});

test('typed bindings: the annotation is a sibling of the name', () => {
  const text = 'const x: number = 1;';
  const kinds = convert(parse(text), text).map(n => `${n.kind}:${text.slice(n.start, n.end)}:${n.field}`);
  assert.deepEqual(kinds, [
    'lexical_declaration:const x: number = 1;:null',
    'variable_declarator:x: number = 1:null',
    'identifier:x:name',
    'type_annotation:: number:type_annotation',
    'number_type_annotation:number:null',
    'number:1:value',
  ]);
});

test('hermes-range-fixup: parenthesized match case body and record default', () => {
  for (const [text, inner] of [
    ["const x = match (a) { 'a' => (b => true), _ => 1 };", "'a' => (b => true)"],
    ['record R { a: number = (1, 2) }', 'a: number = (1, 2)'],
  ]) {
    const options = {flow: 'all', babel: false, sourceType: 'module', enableExperimentalFlowMatchSyntax: true,
      enableExperimentalFlowRecordSyntax: true};
    const ast = hermes.parse(text, options);
    const stats = {};
    const nodes = convert(ast, text, stats);
    assert.ok(nodes.some(n => text.slice(n.start, n.end) === inner), text);
    assert.equal(stats['hermes-range-fixup'], 1, text);
  }
});

test('hermes-range-fixup: parenthesized check type of a conditional type', () => {
  for (const text of ['type A = (?B) extends C ? D : E;', 'type A = ((B)) extends C ? D : E;']) {
    const stats = {};
    const nodes = convert(parse(text), text, stats);
    const n = nodes.find(x => x.kind === 'conditional_type_annotation');
    assert.equal(text.slice(n.start, n.end), text.slice(9, -1), text);
    assert.equal(stats['hermes-range-fixup'], 1, text);
  }
  const text = 'type A = (B extends C ? D : E);';
  const stats = {};
  convert(parse(text), text, stats);
  assert.equal(stats['hermes-range-fixup'], 0);
});

test('hermes-range-fixup: private class members start at their modifiers', () => {
  const text = 'class A {\n  // x\n  static #a: number = 1;\n  static +#b = 2;\n  #c = 3;\n}';
  const stats = {};
  const nodes = convert(parse(text), text, stats);
  const fields = nodes.filter(n => n.kind === 'field_definition').map(n => text.slice(n.start, n.end));
  assert.deepEqual(fields, ['static #a: number = 1', 'static +#b = 2', '#c = 3']);
  assert.equal(stats['hermes-range-fixup'], 2);
});
