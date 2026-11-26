// Reports, for each file named on the command line, whether flow-parser and
// hermes-parser accept it, and which node types hermes-parser produces.
// Prints one JSON object per line. Used by run-suites.mjs.

import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const flow = require('flow-parser');
const hermes = require('hermes-parser');

const FLOW_OPTIONS = {
  components: true,
  enums: true,
  esproposal_decorators: true,
  pattern_matching: true,
  records: true,
  types: true,
};

const HERMES_OPTIONS = {
  babel: false,
  enableExperimentalComponentSyntax: true,
  enableExperimentalFlowMatchSyntax: true,
  enableExperimentalFlowRecordSyntax: true,
  flow: 'all',
  sourceType: 'module',
  tokens: false,
};

function collectTypes(node, out) {
  if (Array.isArray(node)) {
    for (const child of node) collectTypes(child, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (typeof node.type === 'string' && node.range) out.add(node.type);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens') continue;
    collectTypes(node[key], out);
  }
}

const argv = process.argv.slice(2);
const hermesOnly = argv[0] === '--hermes-only';
for (const file of hermesOnly ? argv.slice(1) : argv) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  let flowOk = !hermesOnly;
  if (!hermesOnly) {
    try {
      const ast = flow.parse(source, FLOW_OPTIONS);
      if (ast.errors && ast.errors.length > 0) flowOk = false;
    } catch {
      flowOk = false;
    }
  }
  let hermesOk = true;
  const types = new Set();
  try {
    collectTypes(hermes.parse(source, HERMES_OPTIONS), types);
  } catch {
    hermesOk = false;
  }
  const result = {file, flow: flowOk, hermes: hermesOk, types: [...types]};
  if (hermesOnly) result.flowTimedOut = true;
  process.stdout.write(JSON.stringify(result) + '\n');
}
