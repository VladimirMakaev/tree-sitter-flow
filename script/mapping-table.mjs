#!/usr/bin/env node
// Prints the naming table of script/mapping.mjs as Markdown, for the README.
//   npm run mapping-table

import {FLOW, HERMES_PARSER_EXTRA, IGNORED, JAVASCRIPT, TREE_SITTER_ONLY, snakeCase} from './mapping.mjs';

const code = s => '`' + s + '`';
const out = [];
out.push('#### JavaScript nodes', '', '| Hermes ESTree | tree-sitter-flow | Notes |', '| --- | --- | --- |');
for (const [hermes, {kind, note}] of Object.entries(JAVASCRIPT)) {
  out.push(`| ${code(hermes)} | ${kind ? code(kind) : '(none)'} | ${note ?? ''} |`);
}
out.push('', '#### Flow nodes', '', '| Hermes ESTree | tree-sitter-flow | Notes |', '| --- | --- | --- |');
for (const [hermes, note] of Object.entries(FLOW)) {
  const extra = HERMES_PARSER_EXTRA[hermes] ? 'emitted by hermes-parser, not listed in ESTree.def' : '';
  out.push(`| ${code(hermes)} | ${code(snakeCase(hermes))} | ${[note, extra].filter(Boolean).join('; ')} |`);
}
out.push('', "#### Nodes from Flow's own parser", '', '| tree-sitter-flow | Notes |', '| --- | --- |');
for (const [kind, note] of Object.entries(TREE_SITTER_ONLY)) out.push(`| ${code(kind)} | ${note} |`);
out.push('', '#### tree-sitter nodes with no ESTree node', '', '| tree-sitter-flow | Why |', '| --- | --- |');
for (const [kind, note] of Object.entries(IGNORED)) out.push(`| ${code(kind)} | ${note} |`);
console.log(out.join('\n'));
