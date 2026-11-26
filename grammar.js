/**
 * @file Flow grammar for tree-sitter
 * @author Vladimir Makaev <vmakaev@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

import JavaScript from 'tree-sitter-javascript/grammar.js';

export default grammar(JavaScript, {
  name: 'flow',
  rules: {},
});
