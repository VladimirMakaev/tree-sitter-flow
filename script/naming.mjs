// Naming check: compares the Flow-specific node types that hermes-parser
// produces with the node types of tree-sitter-flow, file by file, and checks
// that every Flow node of the grammar is named after a Hermes node.
//
// The tables live in script/mapping.mjs.
//
// Hermes' list of Flow nodes comes from include/hermes/AST/ESTree.def. A
// Hermes node `FooBar` maps to the tree-sitter node `foo_bar` unless
// HERMES_TO_TREE_SITTER says otherwise. A tree-sitter node counts as
// Flow-specific when tree-sitter-javascript does not define it.

import {FLOW, HERMES_PARSER_EXTRA, HERMES_TO_TREE_SITTER, HERMES_WITHOUT_NODE, IGNORED, TREE_SITTER_ONLY, snakeCase}
  from './mapping.mjs';

export {snakeCase};

// Standard ESTree names that hermes-parser emits and ESTree.def spells differently.
const STANDARD_ESTREE = new Set([
  'Literal', 'ChainExpression', 'PropertyDefinition', 'PrivateIdentifier', 'Block', 'Line',
  'StaticBlock', 'ImportExpression', 'InterpreterDirective', 'Program', 'ImportAttribute',
]);

export function mapHermesName(name) {
  return HERMES_TO_TREE_SITTER[name] ?? snakeCase(name);
}

// Returns {flow, javascript, other} sets of node names from ESTree.def.
export function parseEstreeDef(text) {
  const flow = new Set();
  const javascript = new Set();
  const other = new Set();
  const lines = text.split('\n');
  const regionOfLine = [];
  const stack = [];
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = /^#\s*(?:if|ifdef|ifndef)\s+(.*)$/.exec(line))) stack.push(m[1].trim());
    else if (/^#\s*endif/.test(line)) stack.pop();
    else if (/^#\s*else/.test(line)) stack.push(`!${stack.pop()}`);
    if (stack.some(c => c.includes('HERMES_PARSE_FLOW'))) regionOfLine.push('flow');
    else if (stack.some(c => c.includes('HERMES_PARSE_TS') || c.includes('ESTREE_DEFINE_COVER_NODES'))) regionOfLine.push('other');
    else regionOfLine.push('javascript');
  }
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = offset => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  for (const m of text.matchAll(/ESTREE_NODE_\d+_ARGS\(\s*(\w+)/g)) {
    const region = regionOfLine[lineOf(m.index)];
    (region === 'flow' ? flow : region === 'other' ? other : javascript).add(m[1]);
  }
  return {flow, javascript, other};
}

export function checkNames({files, hermesTypes, treeSitterTypes, estreeDef, flowNodeTypes, javascriptNodeTypes, rel}) {
  const def = parseEstreeDef(estreeDef);
  const jsNames = new Set(javascriptNodeTypes.filter(n => n.named).map(n => n.type));
  const tsNames = new Set(flowNodeTypes.filter(n => n.named).map(n => n.type));
  const tsFlowNames = new Set([...tsNames].filter(n => !jsNames.has(n)));

  const isHermesFlow = t => def.flow.has(t) ||
    (!def.javascript.has(t) && !def.other.has(t) && !STANDARD_ESTREE.has(t) && !t.startsWith('JSX'));
  const seen = new Map();
  const missing = new Map();
  const extra = new Map();
  const bump = (map, key, file) => {
    const e = map.get(key) ?? {count: 0, example: rel(file)};
    e.count++;
    map.set(key, e);
  };

  for (const file of files) {
    const hermes = new Set();
    for (const t of hermesTypes(file)) {
      if (!isHermesFlow(t) || t in HERMES_WITHOUT_NODE) continue;
      seen.set(t, (seen.get(t) ?? 0) + 1);
      hermes.add(mapHermesName(t));
    }
    const ts = new Set([...treeSitterTypes(file)].filter(t => tsFlowNames.has(t)));
    for (const t of hermes) if (!ts.has(t)) bump(missing, t, file);
    for (const t of ts) if (!hermes.has(t) && !(t in TREE_SITTER_ONLY)) bump(extra, t, file);
  }

  const problems = [];
  for (const t of [...seen.keys()].sort()) {
    const name = mapHermesName(t);
    if (!tsNames.has(name)) problems.push(`Hermes ${t} has no tree-sitter node \`${name}\``);
  }
  for (const [t, e] of [...missing].sort()) {
    if (!tsNames.has(t)) continue;
    problems.push(`\`${t}\` missing in ${e.count} file(s) where Hermes has it, e.g. ${e.example}`);
  }
  for (const [t, e] of [...extra].sort()) {
    problems.push(`\`${t}\` present in ${e.count} file(s) where Hermes has no matching node, e.g. ${e.example}`);
  }
  const unseenFlow = [...def.flow].filter(t => !seen.has(t)).sort();
  return {
    files: files.length,
    hermesFlowTypes: seen.size,
    mapped: [...seen.keys()].filter(t => tsNames.has(mapHermesName(t))).length,
    problems,
    notes: unseenFlow.length ? [`ESTree.def Flow nodes not seen in the suites: ${unseenFlow.join(', ')}`] : [],
    table: [...seen.keys()].sort().map(t => ({hermes: t, treeSitter: mapHermesName(t), files: seen.get(t)})),
  };
}

// Every named node of tree-sitter-flow that tree-sitter-javascript does not
// define must be a Hermes Flow node (snake_case), or be listed in
// TREE_SITTER_ONLY with a reason. Every Hermes Flow node that the grammar has
// must be in the FLOW table, which the README's naming table comes from.
export function checkNodeTypes({estreeDef, flowNodeTypes, javascriptNodeTypes}) {
  const def = parseEstreeDef(estreeDef);
  const hermesFlow = new Map();
  for (const t of [...def.flow, ...Object.keys(HERMES_PARSER_EXTRA)]) hermesFlow.set(mapHermesName(t), t);
  const jsNames = new Set(javascriptNodeTypes.filter(n => n.named).map(n => n.type));
  const problems = [];
  const flowNodes = flowNodeTypes.filter(n => n.named && !jsNames.has(n.type)).map(n => n.type);
  for (const t of flowNodes) {
    if (hermesFlow.has(t)) {
      if (!(hermesFlow.get(t) in FLOW)) problems.push(`\`${t}\` (Hermes ${hermesFlow.get(t)}) is missing from FLOW in script/mapping.mjs`);
    } else if (!(t in TREE_SITTER_ONLY)) {
      problems.push(`\`${t}\` is neither the snake_case of a Hermes Flow node nor listed in TREE_SITTER_ONLY`);
    }
  }
  const allNames = new Set(flowNodeTypes.filter(n => n.named).map(n => n.type));
  for (const t of Object.keys(IGNORED)) {
    if (!allNames.has(t)) problems.push(`IGNORED lists \`${t}\`, which the grammar does not have`);
  }
  for (const t of Object.keys(TREE_SITTER_ONLY)) {
    if (!flowNodes.includes(t) && !jsNames.has(t)) problems.push(`TREE_SITTER_ONLY lists \`${t}\`, which the grammar does not have`);
  }
  return {flowNodes: flowNodes.length, problems};
}
