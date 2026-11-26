// Range checks shared by the test scripts.
//
// - No node takes in the spaces or line breaks after it: every node ends where
//   its last child ends, counting comments but not zero-width tokens such as
//   automatic semicolons.
// - A Flow node (a type tree-sitter-javascript does not have) ends at its last
//   token: no trailing comment either. JavaScript nodes keep
//   tree-sitter-javascript's ranges, which may take in a comment that follows
//   on the same line, as in `x = a // c`.

import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const JS_TYPES = new Set(
  JSON.parse(fs.readFileSync(require.resolve('tree-sitter-javascript/src/node-types.json'), 'utf8'))
    .flatMap(t => [t.type, ...(t.subtypes ?? []).map(s => s.type)]));

function lastChildEnd(node) {
  let end = -1;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.startIndex !== child.endIndex) end = Math.max(end, child.endIndex);
  }
  return end;
}

function lastTokenEnd(node) {
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    if (child.type === 'comment' || child.startIndex === child.endIndex) continue;
    if (child.childCount === 0) return child.endIndex;
    const end = lastTokenEnd(child);
    if (end >= 0) return end;
  }
  return -1;
}

export function rangeProblems(root, limit = 5) {
  const problems = [];
  const stack = [root];
  while (stack.length && problems.length < limit) {
    const node = stack.pop();
    if (node.childCount > 0 && node.type !== 'program' && node.type !== 'ERROR' && !node.hasError) {
      const childEnd = lastChildEnd(node);
      if (childEnd >= 0 && childEnd !== node.endIndex) {
        problems.push({type: node.type, start: node.startIndex, end: node.endIndex, lastToken: childEnd,
          what: 'ends past its last child'});
      } else if (node.isNamed && !JS_TYPES.has(node.type)) {
        const tokenEnd = lastTokenEnd(node);
        if (tokenEnd >= 0 && tokenEnd !== node.endIndex) {
          problems.push({type: node.type, start: node.startIndex, end: node.endIndex, lastToken: tokenEnd,
            what: 'ends past its last token'});
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) stack.push(node.child(i));
  }
  return problems;
}
