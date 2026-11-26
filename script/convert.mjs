// Converts a Hermes ESTree AST into the list of nodes that tree-sitter-flow
// should produce for the same source: kind, range and field name.
//
// Ranges are UTF-16 offsets, as in hermes-parser and node-tree-sitter.
// The node names follow script/mapping.mjs. Nodes listed in IGNORED there are
// never produced.

import {FLOW, snakeCase} from './mapping.mjs';

const SKIP_KEYS = new Set(['type', 'range', 'loc', 'parent', 'comments', 'tokens', 'docblock', 'interpreter']);

export {snakeCase};

// ---------------------------------------------------------------------------
// Source scanning helpers

function isIdentChar(c) {
  return /[\p{ID_Continue}$\u200c\u200d]/u.test(c);
}

class Source {
  constructor(text) {
    this.text = text;
  }

  // Skips whitespace and comments forward from i.
  skip(i) {
    const s = this.text;
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s.startsWith('//', i)) {
        while (i < s.length && s[i] !== '\n') i++;
      } else if (s.startsWith('/*', i)) {
        const j = s.indexOf('*/', i + 2);
        i = j < 0 ? s.length : j + 2;
      } else {
        return i;
      }
    }
  }

  // Skips whitespace backward from i (exclusive end).
  skipBack(i) {
    const s = this.text;
    for (;;) {
      while (i > 0 && /\s/.test(s[i - 1])) i--;
      if (i >= 2 && s.startsWith('*/', i - 2)) {
        const j = s.lastIndexOf('/*', i - 2);
        if (j < 0) return i;
        i = j;
      } else {
        return i;
      }
    }
  }

  // End of the identifier that starts at i, escapes included.
  identifierEnd(i) {
    const s = this.text;
    let j = i;
    while (j < s.length) {
      if (s[j] === '\\' && s[j + 1] === 'u') {
        if (s[j + 2] === '{') {
          const k = s.indexOf('}', j);
          j = k < 0 ? s.length : k + 1;
        } else {
          j += 6;
        }
        continue;
      }
      const cp = s.codePointAt(j);
      const ch = String.fromCodePoint(cp);
      if (j === i ? /[\p{ID_Start}$_@]/u.test(ch) || ch === '@' : isIdentChar(ch) || ch === '@') {
        j += ch.length;
      } else {
        break;
      }
    }
    return j;
  }

  // Index of the next `ch` at bracket depth 0 from i, skipping strings and
  // comments; -1 if none before `limit`.
  find(i, ch, limit = this.text.length) {
    const s = this.text;
    let depth = 0;
    while (i < limit) {
      const c = s[i];
      if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
        i = this.skip(i);
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        i++;
        while (i < limit && s[i] !== c) i += s[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (depth === 0 && c === ch) return i;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      i++;
    }
    return -1;
  }
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hermes range fixups
//
// Each fixup corrects a range that hermes-parser gets wrong while the tree
// itself agrees with flow-parser and Babel. Each is gated on the wrong range
// and counted, and `npm run compare` reports the count as
// "hermes-range-fixup".

// Key after a modifier. In `class A { declare static }` (Babel fixture
// flow/class-properties/declare-field-named-static), Hermes gives the key
// `static` the range of `declare`; flow-parser and Babel put it at `static`.
// Applies only when the range's text is not the name and the name follows
// right after it.
export function fixKeyAfterModifier(text, key) {
  if (key.type !== 'Identifier') return null;
  const [s, e] = key.range;
  const raw = text.slice(s, e);
  if (raw === key.name || raw.includes('\\')) return null;
  let i = e;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (!text.startsWith(key.name, i)) return null;
  if (/[\p{ID_Continue}$]/u.test(text[i + key.name.length] ?? '')) return null;
  return [i, i + key.name.length];
}

export function convert(ast, text, stats = {}) {
  stats['hermes-range-fixup'] ??= 0;
  const src = new Source(text);
  const nodes = [];
  // Hermes quirks: some nodes report a start that tree-sitter cannot share
  // with them, such as decorator expressions that start at the `@`. Starts
  // in this map are moved for the nodes of the current subtree.
  const startRemap = new Map();
  const emit = (kind, start, end, field, parent) => {
    if (startRemap.has(start)) start = startRemap.get(start);
    nodes.push({kind, start, end, field: field ?? null, parent});
    return nodes.length - 1;
  };
  const start = n => n.range[0];
  const end = n => n.range[1];

  // Range of a binding without its type annotation and `?`.
  function bindingEnd(n) {
    if (n.type === 'Identifier') return src.identifierEnd(start(n));
    if ((n.type === 'ObjectPattern' || n.type === 'ArrayPattern') && n.typeAnnotation) {
      let e = src.skipBack(start(n.typeAnnotation));
      if (text[e - 1] === '?') e = src.skipBack(e - 1);
      return e;
    }
    if (n.type === 'RestElement') return bindingEnd(n.argument);
    if (n.type === 'AssignmentPattern') return end(n);
    return end(n);
  }

  // A binding: an identifier or pattern that may carry a type annotation,
  // which tree-sitter puts next to it.
  function binding(n, parent, field, role = 'binding') {
    if (!n) return;
    if (n.type === 'Identifier') {
      const kind = role === 'value' && n.name === 'undefined' ? 'undefined' : 'identifier';
      emit(kind, start(n), bindingEnd(n), field, parent);
      if (n.typeAnnotation) visit(n.typeAnnotation, parent, 'type_annotation');
      return;
    }
    if (n.type === 'ObjectPattern' || n.type === 'ArrayPattern') {
      const id = emit(n.type === 'ObjectPattern' ? 'object_pattern' : 'array_pattern', start(n), bindingEnd(n), field, parent);
      if (n.type === 'ObjectPattern') for (const p of n.properties) patternProperty(p, id);
      else for (const e of n.elements) if (e) patternElement(e, id);
      if (n.typeAnnotation) visit(n.typeAnnotation, parent, 'type_annotation');
      return;
    }
    if (n.type === 'RestElement') {
      const id = emit('rest_pattern', start(n), bindingEnd(n), field, parent);
      binding(n.argument, id, null, 'pattern');
      if (n.argument.typeAnnotation) return;
      if (n.typeAnnotation) visit(n.typeAnnotation, parent, 'type_annotation');
      return;
    }
    if (n.type === 'AssignmentPattern') {
      const id = emit('assignment_pattern', start(n), end(n), field, parent);
      binding(n.left, id, 'left');
      // The left side's annotation is a field of the assignment pattern.
      visit(n.right, id, 'right');
      return;
    }
    visit(n, parent, field);
  }

  function patternElement(e, parent) {
    if (e.type === 'Identifier' && e.typeAnnotation) {
      binding(e, parent, null);
      return;
    }
    binding(e, parent, null, 'pattern');
  }

  function patternProperty(p, parent) {
    if (p.type === 'RestElement') {
      binding(p, parent, null, 'pattern');
      return;
    }
    if (p.shorthand) {
      if (p.value.type === 'AssignmentPattern') {
        const id = emit('object_assignment_pattern', start(p), end(p), null, parent);
        emit('shorthand_property_identifier_pattern', start(p.value.left), end(p.value.left), 'left', id);
        visit(p.value.right, id, 'right');
      } else {
        emit('shorthand_property_identifier_pattern', start(p), end(p), null, parent);
      }
      return;
    }
    const id = emit('pair_pattern', start(p), end(p), null, parent);
    propertyKey(p, id, 'key');
    binding(p.value, id, 'value', 'pattern');
  }

  function propertyKey(p, parent, field) {
    const k = p.key;
    if (p.computed) {
      visit(k, parent, null);
    } else if (k.type === 'Identifier') {
      const fixed = fixKeyAfterModifier(text, k);
      if (fixed) stats['hermes-range-fixup']++;
      const [s, e] = fixed ?? k.range;
      emit('property_identifier', s, e, field, parent);
    } else {
      visit(k, parent, field);
    }
  }

  function params(list, parent) {
    for (const p of list) binding(p, parent, null);
  }

  // The parts of a function that tree-sitter keeps on the function's own
  // node (or on a method_definition).
  function functionParts(f, parent) {
    if (f.typeParameters) visit(f.typeParameters, parent, 'type_parameters');
    params(f.params, parent);
    if (f.returnType) visit(f.returnType, parent, 'return_type');
    if (f.predicate) visit(f.predicate, parent, 'predicate');
    if (f.body) visit(f.body, parent, 'body');
  }

  function functionLike(n, parent, field, ctx = {}) {
    if (n.type === 'ArrowFunctionExpression') {
      const id = emit('arrow_function', start(n), end(n), field, parent);
      const first = n.params[0];
      const parenthesized = n.typeParameters || n.params.length !== 1 ||
        text[src.skip(n.async ? start(n) + 5 : start(n))] === '(';
      if (n.typeParameters) visit(n.typeParameters, id, 'type_parameters');
      if (!parenthesized) emit('identifier', start(first), end(first), 'parameter', id);
      else params(n.params, id);
      if (n.returnType) visit(n.returnType, id, 'return_type');
      if (n.predicate) visit(n.predicate, id, 'predicate');
      visit(n.body, id, 'body');
      return;
    }
    let kind;
    if (n.type === 'FunctionDeclaration' && !ctx.anonymous) {
      kind = n.generator ? 'generator_function_declaration' : 'function_declaration';
    } else {
      kind = n.generator ? 'generator_function' : 'function_expression';
    }
    const id = emit(kind, start(n), end(n), field, parent);
    if (n.id) emit('identifier', start(n.id), end(n.id), 'name', id);
    functionParts(n, id);
  }

  function classLike(n, parent, field, ctx = {}) {
    const kind = n.type === 'ClassDeclaration' && n.id && !ctx.anonymous ? 'class_declaration' : 'class';
    const first = n.decorators?.length ? Math.min(start(n), start(n.decorators[0])) : start(n);
    const id = emit(kind, first, end(n), field, parent);
    for (const d of n.decorators ?? []) visit(d, id, 'decorator');
    if (n.id) emit('identifier', start(n.id), end(n.id), 'name', id);
    if (n.typeParameters) visit(n.typeParameters, id, 'type_parameters');
    if (n.superClass) visit(n.superClass, id, null);
    if (n.superTypeArguments) visit(n.superTypeArguments, id, 'super_type_arguments');
    for (const i of n.implements ?? []) visit(i, id, 'implements');
    visit(n.body, id, 'body');
  }

  // Hermes starts some private members at the key; tree-sitter starts them
  // at the first modifier.
  function modifiersStart(s) {
    for (;;) {
      const b = src.skipBack(s);
      const m = /(?:^|[^\w$])(static|declare|override|readonly|accessor|abstract|public|private|protected|async|get|set|\+|-)$/.exec(text.slice(Math.max(0, b - 12), b));
      if (!m) return s;
      const kwStart = b - m[1].length;
      // Stop at keywords that belong to an earlier member.
      const before = src.skipBack(kwStart);
      if (before > 0 && !/[;{}\s]/.test(text[before - 1]) && !/(static|declare|override|readonly|accessor|abstract|public|private|protected|async|get|set)$/.test(text.slice(0, before))) return s;
      if (text[s] !== '#' && text[s] !== '*' && !/^(get|set|static|async)\b/.test(text.slice(s))) return s;
      s = kwStart;
    }
  }

  function methodLike(n, parent, field) {
    // MethodDefinition, or a method/getter/setter Property.
    const first = n.decorators?.length ? Math.min(start(n), start(n.decorators[0]))
      : n.key?.type === 'PrivateIdentifier' ? modifiersStart(start(n)) : start(n);
    const id = emit('method_definition', first, end(n), field, parent);
    for (const d of n.decorators ?? []) visit(d, id, 'decorator');
    propertyKey(n, id, 'name');
    functionParts(n.value, id);
  }

  function literal(n, parent, field) {
    let kind;
    if (n.regex) kind = 'regex';
    else if (n.bigint !== undefined || typeof n.value === 'bigint') kind = 'number';
    else if (typeof n.value === 'string') kind = 'string';
    else if (typeof n.value === 'number') kind = 'number';
    else if (n.value === true) kind = 'true';
    else if (n.value === false) kind = 'false';
    else if (n.value === null) kind = n.raw && n.raw !== 'null' ? 'number' : 'null';
    else kind = 'string';
    emit(kind, start(n), end(n), field, parent);
  }

  function jsxText(n, parent) {
    // tree-sitter splits text around character references and drops runs of
    // whitespace that start with a line break.
    const re = /&(#([xX][0-9a-fA-F]{1,6}|[0-9]{1,5})|[A-Za-z]{1,30});/g;
    const value = text.slice(start(n), end(n));
    let last = 0;
    const pieces = [];
    for (const m of value.matchAll(re)) {
      pieces.push([last, m.index]);
      last = m.index + m[0].length;
    }
    pieces.push([last, value.length]);
    for (const [a, b] of pieces) {
      if (a === b) continue;
      const piece = value.slice(a, b);
      let sawText = false;
      let atNewline = false;
      for (const c of piece) {
        if (c === '\n') {
          atNewline = true;
        } else {
          atNewline = atNewline && /\s/.test(c);
          if (!atNewline) sawText = true;
        }
      }
      if (sawText) emit('jsx_text', start(n) + a, start(n) + b, null, parent);
    }
  }

  function jsxName(n, parent, field) {
    if (n.type === 'JSXIdentifier') emit('identifier', start(n), end(n), field, parent);
    else if (n.type === 'JSXNamespacedName') {
      const id = emit('jsx_namespace_name', start(n), end(n), field, parent);
      emit('identifier', start(n.namespace), end(n.namespace), null, id);
      emit('identifier', start(n.name), end(n.name), null, id);
    } else if (n.type === 'JSXMemberExpression') {
      const id = emit('member_expression', start(n), end(n), field, parent);
      jsxName(n.object, id, 'object');
      emit('property_identifier', start(n.property), end(n.property), 'property', id);
    }
  }

  function jsxOpening(n, kind, rangeStart, rangeEnd, parent, field) {
    const id = emit(kind, rangeStart, rangeEnd, field, parent);
    if (n.name) jsxName(n.name, id, 'name');
    if (n.typeArguments) visit(n.typeArguments, id, 'type_arguments');
    for (const a of n.attributes ?? []) visit(a, id, 'attribute');
  }

  function forHeadDeclaration(decl, parent) {
    // `for (const x of y)`: tree-sitter has no declaration node.
    const d = decl.declarations[0];
    binding(d.id, parent, 'left', 'pattern');
    if (d.init) visit(d.init, parent, 'value');
  }

  // Flow nodes that hold expressions; identifiers in other Flow nodes name
  // types, so `undefined` there is a plain identifier.
  const HOLDS_EXPRESSIONS = new Set(['TypeCastExpression', 'AsExpression', 'AsConstExpression', 'DeclaredPredicate',
    'MatchExpressionCase', 'MatchStatementCase', 'RecordExpression', 'RecordDeclarationProperty',
    'RecordDeclarationStaticProperty', 'ObjectTypeProperty']);

  function flowDefault(n, parent, field) {
    const kind = snakeCase(n.type);
    const id = emit(kind, start(n), end(n), field, parent);
    const ctx = HOLDS_EXPRESSIONS.has(n.type) ? {} : {role: 'type'};
    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = n[key];
      if (value === null || typeof value !== 'object') continue;
      const f = snakeCase(key);
      if (Array.isArray(value)) for (const v of value) visit(v, id, f, ctx);
      else visit(value, id, f, ctx);
    }
    return id;
  }

  // Visit children of a Flow node with explicit field names.
  function children(n, id, keys) {
    for (const [key, f] of keys) {
      const value = n[key];
      if (!value) continue;
      if (Array.isArray(value)) for (const v of value) visit(v, id, f);
      else visit(value, id, f);
    }
  }

  function visit(n, parent, field, ctx = {}) {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      // ---------------------------------------------------------------- JS
      case 'Program':
        for (const s of n.body) visit(s, parent, null);
        return;
      case 'ExpressionStatement': {
        const id = emit('expression_statement', start(n), end(n), field, parent);
        visit(n.expression, id, null);
        return;
      }
      case 'BlockStatement': {
        const id = emit('statement_block', start(n), end(n), field, parent);
        for (const s of n.body) visit(s, id, null);
        return;
      }
      case 'StaticBlock': {
        // Hermes starts a static block at its `{`.
        const brace = text[start(n)] === '{' ? start(n) : text.indexOf('{', start(n));
        const kw = text.lastIndexOf('static', brace);
        const id = emit('class_static_block', kw, end(n), field, parent);
        const block = emit('statement_block', brace, end(n), 'body', id);
        for (const s of n.body) visit(s, block, null);
        return;
      }
      case 'EmptyStatement':
        emit('empty_statement', start(n), end(n), field, parent);
        return;
      case 'DebuggerStatement':
        emit('debugger_statement', start(n), end(n), field, parent);
        return;
      case 'ReturnStatement':
      case 'ThrowStatement': {
        const id = emit(n.type === 'ReturnStatement' ? 'return_statement' : 'throw_statement', start(n), end(n), field, parent);
        visit(n.argument, id, null);
        return;
      }
      case 'BreakStatement':
      case 'ContinueStatement': {
        const id = emit(n.type === 'BreakStatement' ? 'break_statement' : 'continue_statement', start(n), end(n), field, parent);
        if (n.label) emit('statement_identifier', start(n.label), end(n.label), 'label', id);
        return;
      }
      case 'LabeledStatement': {
        const id = emit('labeled_statement', start(n), end(n), field, parent);
        emit('statement_identifier', start(n.label), end(n.label), 'label', id);
        visit(n.body, id, 'body');
        return;
      }
      case 'IfStatement': {
        const id = emit('if_statement', start(n), end(n), field, parent);
        visit(n.test, id, null);
        visit(n.consequent, id, 'consequence');
        if (n.alternate) visit(n.alternate, id, null);
        return;
      }
      case 'SwitchStatement': {
        const id = emit('switch_statement', start(n), end(n), field, parent);
        visit(n.discriminant, id, null);
        for (const c of n.cases) visit(c, id, null);
        return;
      }
      case 'SwitchCase': {
        const id = emit(n.test ? 'switch_case' : 'switch_default', start(n), end(n), field, parent);
        if (n.test) visit(n.test, id, 'value');
        for (const s of n.consequent) visit(s, id, 'body');
        return;
      }
      case 'TryStatement': {
        const id = emit('try_statement', start(n), end(n), field, parent);
        visit(n.block, id, 'body');
        if (n.handler) visit(n.handler, id, 'handler');
        if (n.finalizer) visit(n.finalizer, id, 'body');
        return;
      }
      case 'CatchClause': {
        const id = emit('catch_clause', start(n), end(n), field, parent);
        if (n.param) binding(n.param, id, 'parameter');
        visit(n.body, id, 'body');
        return;
      }
      case 'WhileStatement': {
        const id = emit('while_statement', start(n), end(n), field, parent);
        visit(n.test, id, null);
        visit(n.body, id, 'body');
        return;
      }
      case 'DoWhileStatement': {
        const id = emit('do_statement', start(n), end(n), field, parent);
        visit(n.body, id, 'body');
        visit(n.test, id, null);
        return;
      }
      case 'WithStatement': {
        const id = emit('with_statement', start(n), end(n), field, parent);
        visit(n.object, id, null);
        visit(n.body, id, 'body');
        return;
      }
      case 'ForStatement': {
        const id = emit('for_statement', start(n), end(n), field, parent);
        const open = src.find(start(n) + 3, '(');
        const close = n.body ? src.skipBack(start(n.body)) - 1 : end(n);
        const semi1 = src.find(n.init ? end(n.init) : open + 1, ';', close);
        if (n.init?.type === 'VariableDeclaration') {
          visitDeclaration(n.init, id, 'initializer', semi1 + 1);
        } else if (n.init) {
          visit(n.init, id, 'initializer');
        } else {
          emit('empty_statement', semi1, semi1 + 1, 'initializer', id);
        }
        const semi2 = src.find(n.test ? end(n.test) : semi1 + 1, ';', close);
        if (n.test) visit(n.test, id, 'condition');
        else emit('empty_statement', semi2, semi2 + 1, 'condition', id);
        if (n.update) visit(n.update, id, 'increment');
        visit(n.body, id, 'body');
        return;
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const id = emit('for_in_statement', start(n), end(n), field, parent);
        if (n.left.type === 'VariableDeclaration') forHeadDeclaration(n.left, id);
        else binding(n.left, id, 'left', 'pattern');
        visit(n.right, id, 'right');
        visit(n.body, id, 'body');
        return;
      }
      case 'VariableDeclaration':
        visitDeclaration(n, parent, field);
        return;
      case 'VariableDeclarator': {
        const id = emit('variable_declarator', start(n), end(n), field, parent);
        binding(n.id, id, 'name');
        if (n.init) visit(n.init, id, 'value');
        return;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        functionLike(n, parent, field, ctx);
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        classLike(n, parent, field, ctx);
        return;
      case 'ClassBody': {
        const id = emit('class_body', start(n), end(n), field, parent);
        for (const m of n.body) visit(m, id, 'member');
        return;
      }
      case 'MethodDefinition':
        methodLike(n, parent, field);
        return;
      case 'PropertyDefinition': {
        const first = n.decorators?.length ? Math.min(start(n), start(n.decorators[0])) : modifiersStart(start(n));
        let last = end(n);
        if (text[last - 1] === ';') last = src.skipBack(last - 1);
        const id = emit('field_definition', first, last, field, parent);
        for (const d of n.decorators ?? []) visit(d, id, 'decorator');
        if (n.variance) visit(n.variance, id, 'variance');
        propertyKey(n, id, 'property');
        if (n.typeAnnotation) visit(n.typeAnnotation, id, 'type_annotation');
        if (n.value) visit(n.value, id, 'value');
        return;
      }
      case 'Decorator': {
        const id = emit('decorator', start(n), end(n), field, parent);
        // Hermes starts the decorator's expression at the `@`.
        startRemap.set(start(n), src.skip(start(n) + 1));
        visit(n.expression, id, null);
        startRemap.delete(start(n));
        return;
      }
      case 'ObjectExpression': {
        const id = emit('object', start(n), end(n), field, parent);
        for (const p of n.properties) visit(p, id, null);
        return;
      }
      case 'Property': {
        if (n.method || n.kind === 'get' || n.kind === 'set') {
          methodLike(n, parent, field);
        } else if (n.shorthand) {
          emit('shorthand_property_identifier', start(n), end(n), field, parent);
        } else {
          const id = emit('pair', start(n), end(n), field, parent);
          propertyKey(n, id, 'key');
          visit(n.value, id, 'value');
        }
        return;
      }
      case 'ArrayExpression': {
        const id = emit('array', start(n), end(n), field, parent);
        for (const e of n.elements) if (e) visit(e, id, null);
        return;
      }
      case 'SpreadElement': {
        const id = emit('spread_element', start(n), end(n), field, parent);
        visit(n.argument, id, null);
        return;
      }
      case 'ObjectPattern':
      case 'ArrayPattern':
      case 'RestElement':
      case 'AssignmentPattern':
        binding(n, parent, field, 'pattern');
        return;
      case 'Identifier':
        // `yield` outside a generator: tree-sitter cannot tell, so it is a
        // yield expression with no argument.
        if (n.name === 'yield' && ctx.role !== 'type' && text.startsWith('yield', start(n))) {
          emit('yield_expression', start(n), end(n), field, parent);
          return;
        }
        emit(n.name === 'undefined' && ctx.role !== 'type' ? 'undefined' : 'identifier', start(n), end(n), field, parent);
        return;
      case 'PrivateIdentifier':
        // Hermes starts a private getter's key at `get`.
        emit('private_property_identifier', text.indexOf('#', start(n)), end(n), field, parent);
        return;
      case 'Literal':
        literal(n, parent, field);
        return;
      case 'ThisExpression':
        emit('this', start(n), end(n), field, parent);
        return;
      case 'Super':
        emit('super', start(n), end(n), field, parent);
        return;
      case 'TemplateLiteral': {
        const id = emit('template_string', start(n), end(n), field, parent);
        for (const e of n.expressions) visit(e, id, null);
        return;
      }
      case 'TaggedTemplateExpression': {
        const id = emit('call_expression', start(n), end(n), field, parent);
        visit(n.tag, id, 'function');
        if (n.typeArguments) visit(n.typeArguments, id, 'type_arguments');
        visit(n.quasi, id, 'arguments');
        return;
      }
      case 'CallExpression': {
        const id = emit('call_expression', start(n), end(n), field, parent);
        visit(n.callee, id, 'function');
        if (n.typeArguments) visit(n.typeArguments, id, 'type_arguments');
        for (const a of n.arguments) visit(a, id, null);
        return;
      }
      case 'ImportExpression': {
        const id = emit('call_expression', start(n), end(n), field, parent);
        emit('import', start(n), start(n) + 'import'.length, 'function', id);
        visit(n.source, id, null);
        if (n.options) visit(n.options, id, null);
        return;
      }
      case 'NewExpression': {
        const id = emit('new_expression', start(n), end(n), field, parent);
        visit(n.callee, id, 'constructor');
        if (n.typeArguments) visit(n.typeArguments, id, 'type_arguments');
        for (const a of n.arguments) visit(a, id, null);
        return;
      }
      case 'MemberExpression': {
        if (n.computed) {
          const id = emit('subscript_expression', start(n), end(n), field, parent);
          visit(n.object, id, 'object');
          visit(n.property, id, 'index');
        } else {
          const id = emit('member_expression', start(n), end(n), field, parent);
          visit(n.object, id, 'object');
          if (n.property.type === 'PrivateIdentifier') visit(n.property, id, 'property');
          else emit('property_identifier', start(n.property), end(n.property), 'property', id);
        }
        return;
      }
      case 'ChainExpression':
        visit(n.expression, parent, field);
        return;
      case 'MetaProperty':
        emit('meta_property', start(n), end(n), field, parent);
        return;
      case 'UnaryExpression': {
        const id = emit('unary_expression', start(n), end(n), field, parent);
        visit(n.argument, id, 'argument');
        return;
      }
      case 'UpdateExpression': {
        const id = emit('update_expression', start(n), end(n), field, parent);
        visit(n.argument, id, 'argument');
        return;
      }
      case 'BinaryExpression':
      case 'LogicalExpression': {
        const id = emit('binary_expression', start(n), end(n), field, parent);
        visit(n.left, id, 'left');
        visit(n.right, id, 'right');
        return;
      }
      case 'AssignmentExpression': {
        const id = emit(n.operator === '=' ? 'assignment_expression' : 'augmented_assignment_expression', start(n), end(n), field, parent);
        binding(n.left, id, 'left', 'value');
        visit(n.right, id, 'right');
        return;
      }
      case 'ConditionalExpression': {
        const id = emit('ternary_expression', start(n), end(n), field, parent);
        visit(n.test, id, 'condition');
        visit(n.consequent, id, 'consequence');
        visit(n.alternate, id, 'alternative');
        return;
      }
      case 'SequenceExpression': {
        const id = emit('sequence_expression', start(n), end(n), field, parent);
        for (const e of n.expressions) visit(e, id, null);
        return;
      }
      case 'AwaitExpression':
      case 'YieldExpression': {
        const id = emit(n.type === 'AwaitExpression' ? 'await_expression' : 'yield_expression', start(n), end(n), field, parent);
        visit(n.argument, id, null);
        return;
      }
      // ------------------------------------------------------------ modules
      case 'ImportDeclaration': {
        const id = emit('import_statement', start(n), end(n), field, parent);
        for (const s of n.specifiers) visit(s, id, null);
        visit(n.source, id, 'source');
        if (n.attributes?.length) importAttributes(n, id);
        return;
      }
      case 'ImportDefaultSpecifier':
        emit('identifier', start(n.local), end(n.local), field, parent);
        return;
      case 'ImportNamespaceSpecifier': {
        const id = emit('namespace_import', start(n), end(n), field, parent);
        emit('identifier', start(n.local), end(n.local), null, id);
        return;
      }
      case 'ImportSpecifier': {
        const id = emit('import_specifier', start(n), end(n), field, parent);
        moduleName(n.imported, id, 'name');
        if (start(n.local) !== start(n.imported)) emit('identifier', start(n.local), end(n.local), 'alias', id);
        return;
      }
      case 'ExportSpecifier': {
        const id = emit('export_specifier', start(n), end(n), field, parent);
        moduleName(n.local, id, 'name');
        if (n.exported && start(n.exported) !== start(n.local)) moduleName(n.exported, id, 'alias');
        return;
      }
      case 'ExportNamedDeclaration': {
        const id = emit('export_statement', start(n), end(n), field, parent);
        if (n.declaration) visit(n.declaration, id, 'declaration');
        for (const s of n.specifiers) visit(s, id, null);
        if (n.source) visit(n.source, id, 'source');
        if (n.attributes?.length) importAttributes(n, id);
        return;
      }
      case 'ExportDefaultDeclaration': {
        const id = emit('export_statement', start(n), end(n), field, parent);
        const d = n.declaration;
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && !d.id) {
          visit(d, id, 'value', {anonymous: true});
        } else if (/Declaration$|^Declare|^TypeAlias$|^OpaqueType$/.test(d.type)) {
          visit(d, id, 'declaration');
        } else {
          visit(d, id, 'value');
        }
        return;
      }
      case 'ExportAllDeclaration': {
        const id = emit('export_statement', start(n), end(n), field, parent);
        if (n.exported) moduleName(n.exported, id, null);
        visit(n.source, id, 'source');
        if (n.attributes?.length) importAttributes(n, id);
        return;
      }
      // ---------------------------------------------------------------- JSX
      case 'JSXElement': {
        if (n.openingElement.selfClosing) {
          jsxOpening(n.openingElement, 'jsx_self_closing_element', start(n), end(n), parent, field);
          return;
        }
        const id = emit('jsx_element', start(n), end(n), field, parent);
        jsxOpening(n.openingElement, 'jsx_opening_element', start(n.openingElement), end(n.openingElement), id, 'open_tag');
        for (const c of n.children) visit(c, id, null);
        const close = emit('jsx_closing_element', start(n.closingElement), end(n.closingElement), 'close_tag', id);
        jsxName(n.closingElement.name, close, 'name');
        return;
      }
      case 'JSXFragment': {
        const id = emit('jsx_element', start(n), end(n), field, parent);
        emit('jsx_opening_element', start(n.openingFragment), end(n.openingFragment), 'open_tag', id);
        for (const c of n.children) visit(c, id, null);
        emit('jsx_closing_element', start(n.closingFragment), end(n.closingFragment), 'close_tag', id);
        return;
      }
      case 'JSXText':
        jsxText(n, parent);
        return;
      case 'JSXExpressionContainer': {
        const id = emit('jsx_expression', start(n), end(n), field, parent);
        if (n.expression.type !== 'JSXEmptyExpression') visit(n.expression, id, null);
        return;
      }
      case 'JSXSpreadAttribute':
      case 'JSXSpreadChild': {
        const id = emit('jsx_expression', start(n), end(n), field, parent);
        const dots = src.skip(start(n) + 1);
        const spread = emit('spread_element', dots, src.skipBack(end(n) - 1), null, id);
        visit(n.argument ?? n.expression, spread, null);
        return;
      }
      case 'JSXAttribute': {
        const id = emit('jsx_attribute', start(n), end(n), field, parent);
        if (n.name.type === 'JSXNamespacedName') jsxName(n.name, id, null);
        else emit('property_identifier', start(n.name), end(n.name), null, id);
        if (n.value) visit(n.value, id, null);
        return;
      }
      // --------------------------------------------------------------- Flow
      case 'TypeAnnotation': {
        const id = emit('type_annotation', start(n), end(n), field, parent);
        visit(n.typeAnnotation, id, null);
        return;
      }
      case 'TypeParameter': {
        const id = emit('type_parameter', start(n), end(n), field, parent);
        if (n.variance) visit(n.variance, id, 'variance');
        const after = n.variance ? end(n.variance) : start(n);
        const at = text.indexOf(n.name, n.const ? src.skip(after + (n.variance ? 0 : 5)) : after);
        emit('identifier', at, at + n.name.length, 'name', id);
        if (n.bound) visit(n.bound, id, 'bound');
        if (n.default) visit(n.default, id, 'default');
        return;
      }
      case 'StringLiteralTypeAnnotation':
      case 'NumberLiteralTypeAnnotation':
      case 'BigIntLiteralTypeAnnotation':
      case 'BooleanLiteralTypeAnnotation': {
        const id = emit(snakeCase(n.type), start(n), end(n), field, parent);
        const inner = {
          StringLiteralTypeAnnotation: 'string',
          NumberLiteralTypeAnnotation: 'number',
          BigIntLiteralTypeAnnotation: 'number',
          BooleanLiteralTypeAnnotation: n.value ? 'true' : 'false',
        }[n.type];
        const s = text[start(n)] === '-' ? src.skip(start(n) + 1) : start(n);
        emit(inner, s, end(n), null, id);
        return;
      }
      case 'ObjectTypeProperty': {
        const id = emit('object_type_property', start(n), end(n), field, parent);
        if (n.variance) visit(n.variance, id, 'variance');
        objectTypeKey(n.key, id);
        if (n.method || n.kind === 'get' || n.kind === 'set') methodValue(n.value, end(n.key), id);
        else visit(n.value, id, 'value');
        if (n.init) visit(n.init, id, 'init');
        return;
      }
      case 'ObjectTypeCallProperty': {
        const id = emit('object_type_call_property', start(n), end(n), field, parent);
        if (n.static) methodValue(n.value, start(n) + 'static'.length, id);
        else visit(n.value, id, 'value');
        return;
      }
      case 'ObjectTypeInternalSlot': {
        const id = emit('object_type_internal_slot', start(n), end(n), field, parent);
        visit(n.id, id, 'id');
        if (n.method) methodValue(n.value, src.find(end(n.id), ']') + 2, id);
        else visit(n.value, id, 'value');
        return;
      }
      case 'HookTypeAnnotation': {
        // Hermes sometimes starts the hook type after the `hook` keyword.
        let s = start(n);
        const b = src.skipBack(s);
        if (text.slice(b - 4, b) === 'hook' && !/[\w$]/.test(text[b - 5] ?? '')) s = b - 4;
        const id = emit('hook_type_annotation', s, end(n), field, parent);
        if (n.typeParameters) {
          startRemap.set(start(n.typeParameters), text.indexOf('<', start(n.typeParameters)));
          visit(n.typeParameters, id, 'type_parameters');
          startRemap.delete(start(n.typeParameters));
        }
        children(n, id, [['params', 'params'], ['rest', 'rest'], ['returnType', 'return_type']]);
        return;
      }
      case 'RecordDeclarationProperty':
      case 'RecordDeclarationStaticProperty': {
        const id = emit(snakeCase(n.type), start(n), end(n), field, parent);
        if (n.variance) visit(n.variance, id, 'variance');
        objectTypeKey(n.key, id);
        visit(n.typeAnnotation, id, 'type_annotation');
        if (n.defaultValue) visit(n.defaultValue, id, 'default_value');
        if (n.value) visit(n.value, id, 'value');
        return;
      }
      case 'DeclareFunction':
      case 'DeclareHook': {
        const id = emit(snakeCase(n.type), start(n), end(n), field, parent);
        emit('identifier', start(n.id), src.identifierEnd(start(n.id)), 'id', id);
        visit(n.id.typeAnnotation, id, 'type_annotation');
        if (n.predicate) visit(n.predicate, id, 'predicate');
        return;
      }
      case 'DeclareVariable': {
        const id = emit('declare_variable', start(n), end(n), field, parent);
        binding(n.id, id, 'id');
        return;
      }
      case 'DeclareExportDeclaration': {
        const id = emit('declare_export_declaration', start(n), end(n), field, parent);
        // Hermes gives some declarations the range of the whole export.
        const d = n.declaration;
        if (d && start(d) === start(n)) {
          const m = /^declare\s+export\s+(default\s+)?/.exec(text.slice(start(n)));
          if (m) startRemap.set(start(n), start(n) + m[0].length);
        }
        children(n, id, [['declaration', 'declaration'], ['specifiers', 'specifiers'], ['source', 'source']]);
        startRemap.delete(start(n));
        return;
      }
      case 'ComponentParameter': {
        const id = emit('component_parameter', start(n), end(n), field, parent);
        visit(n.name, id, 'name');
        let local = n.local;
        if (local.type === 'AssignmentPattern') {
          if (!n.shorthand) binding(local.left, id, 'local');
          else if (local.left.typeAnnotation) visit(local.left.typeAnnotation, id, 'type_annotation');
          visit(local.right, id, 'value');
          return;
        }
        if (n.shorthand) {
          if (local.typeAnnotation) visit(local.typeAnnotation, id, 'type_annotation');
        } else {
          binding(local, id, 'local');
        }
        return;
      }
      case 'ComponentDeclaration': {
        const id = emit('component_declaration', start(n), end(n), field, parent);
        children(n, id, [['id', 'id'], ['typeParameters', 'type_parameters']]);
        for (const p of n.params) {
          if (p.type === 'RestElement') binding(p, id, 'params');
          else visit(p, id, 'params');
        }
        children(n, id, [['rendersType', 'renders_type'], ['body', 'body']]);
        return;
      }
      case 'HookDeclaration': {
        const id = emit('hook_declaration', start(n), end(n), field, parent);
        children(n, id, [['id', 'id'], ['typeParameters', 'type_parameters']]);
        params(n.params, id);
        children(n, id, [['returnType', 'return_type'], ['body', 'body']]);
        return;
      }
      case 'MatchObjectPatternProperty': {
        const id = emit('match_object_pattern_property', start(n), end(n), field, parent);
        if (n.shorthand) {
          if (n.pattern.type === 'MatchBindingPattern') visit(n.pattern, id, 'pattern');
          else emit('property_identifier', start(n.key), end(n.key), 'key', id);
        } else {
          objectTypeKey(n.key, id);
          visit(n.pattern, id, 'pattern');
        }
        return;
      }
      case 'MatchExpression':
      case 'MatchStatement': {
        const id = emit(snakeCase(n.type), start(n), end(n), field, parent);
        const a = n.argument;
        // Hermes gives `match (a, b)` a sequence that includes the parentheses.
        if (a.type === 'SequenceExpression' && text[start(a)] === '(') {
          startRemap.set(start(a), src.skip(start(a) + 1));
          const e = src.skipBack(end(a) - 1);
          const sid = emit('sequence_expression', src.skip(start(a) + 1), e, 'argument', id);
          startRemap.delete(start(a));
          for (const x of a.expressions) visit(x, sid, null);
        } else {
          visit(a, id, 'argument');
        }
        for (const k of n.cases) visit(k, id, 'cases');
        return;
      }
      case 'MatchAsPattern': {
        const id = emit('match_as_pattern', start(n), end(n), field, parent);
        visit(n.pattern, id, 'pattern');
        if (n.target.type === 'Identifier') {
          // Hermes reports the target with the next token's range.
          const m = /\bas\b/.exec(text.slice(end(n.pattern), end(n)));
          const s = src.skip(end(n.pattern) + m.index + 2);
          emit('identifier', s, src.identifierEnd(s), 'target', id);
        } else {
          visit(n.target, id, 'target');
        }
        return;
      }
      case 'InferTypeAnnotation': {
        const id = emit('infer_type_annotation', start(n), end(n), field, parent);
        // Hermes may start the type parameter at `infer`.
        const tp = n.typeParameter;
        if (start(tp) === start(n)) startRemap.set(start(tp), src.skip(start(n) + 'infer'.length));
        visit(tp, id, 'type_parameter');
        startRemap.delete(start(tp));
        return;
      }
      case 'AsExpression': {
        // Hermes reads `a as T + c` as `a as (T + c)`, with a binary expression
        // where the type should be; Flow reads `(a as T) + c`, as tree-sitter.
        const t = n.typeAnnotation;
        if (t.type === 'BinaryExpression' || t.type === 'LogicalExpression') {
          visit({...t, range: [start(n), end(t)], left: {type: 'AsExpression', range: [start(n), end(t.left)],
            expression: n.expression, typeAnnotation: t.left}}, parent, field);
          return;
        }
        flowDefault(n, parent, field);
        return;
      }
      case 'MatchBindingPattern': {
        // Hermes reports the binding's identifier with the next token's range.
        const id = emit('match_binding_pattern', start(n), end(n), field, parent);
        const s = src.skip(start(n) + n.kind.length);
        emit('identifier', s, src.identifierEnd(s), 'id', id);
        return;
      }
      case 'ComponentTypeParameter': {
        // Hermes includes a trailing comma in a rest parameter's range.
        let e = end(n);
        if (text[e - 1] === ',') e = src.skipBack(e - 1);
        const id = emit('component_type_parameter', start(n), e, field, parent);
        children(n, id, [['name', 'name'], ['typeAnnotation', 'type_annotation']]);
        return;
      }
      case 'MatchMemberPattern': {
        const id = emit('match_member_pattern', start(n), end(n), field, parent);
        visit(n.base, id, 'base');
        if (n.property.type === 'Identifier') emit('property_identifier', start(n.property), end(n.property), 'property', id);
        else visit(n.property, id, 'property');
        return;
      }
      case 'ObjectTypeMappedTypeProperty': {
        const id = emit('object_type_mapped_type_property', start(n), end(n), field, parent);
        children(n, id, [['variance', 'variance'], ['keyTparam', 'key_tparam'], ['sourceType', 'source_type'],
          ['nameType', 'name_type'], ['propType', 'prop_type']]);
        return;
      }
      default:
        if (n.type in FLOW) {
          flowDefault(n, parent, field);
          return;
        }
        // An unknown node: emit it under its snake_case name so the
        // comparison reports it.
        flowDefault(n, parent, field);
    }
  }

  function objectTypeKey(k, id) {
    if (k.type === 'Identifier') emit('property_identifier', start(k), end(k), 'key', id);
    else if (k.type === 'PrivateIdentifier') emit('private_property_identifier', start(k), end(k), 'key', id);
    else visit(k, id, 'key');
  }

  function moduleName(n, parent, field) {
    if (n.type === 'Literal') emit('string', start(n), end(n), field, parent);
    // tree-sitter-javascript keeps `default` in specifiers as a keyword token.
    else if (n.name === 'default' && text.startsWith('default', start(n))) return;
    else emit('identifier', start(n), end(n), field, parent);
  }

  // Hermes gives a method's function type the range of the whole property;
  // in tree-sitter it starts at the type parameters or the `(`.
  function methodValue(value, after, parent) {
    const s = value.typeParameters ? start(value.typeParameters) : src.find(after, '(');
    startRemap.set(start(value), s);
    visit(value, parent, 'value');
    startRemap.delete(start(value));
  }

  function importAttributes(n, parent) {
    const first = n.attributes[0];
    const brace = src.skipBack(start(first)) - 1;
    const kw = src.skipBack(brace);
    const open = text.lastIndexOf('{', start(first));
    const close = src.find(end(n.attributes[n.attributes.length - 1]), '}');
    const kwStart = text.slice(0, kw).search(/(with|assert)\s*$/);
    const id = emit('import_attribute', kwStart >= 0 ? kwStart : kw, close + 1, null, parent);
    const obj = emit('object', open, close + 1, null, id);
    for (const a of n.attributes) {
      const pair = emit('pair', start(a), end(a), null, obj);
      if (a.key.type === 'Identifier') emit('property_identifier', start(a.key), end(a.key), 'key', pair);
      else visit(a.key, pair, 'key');
      visit(a.value, pair, 'value');
    }
  }

  function visitDeclaration(n, parent, field, endOverride) {
    const kind = n.kind === 'var' ? 'variable_declaration' : n.kind === 'let' || n.kind === 'const'
      ? 'lexical_declaration' : 'using_declaration';
    const id = emit(kind, start(n), endOverride ?? end(n), field, parent);
    for (const d of n.declarations) visit(d, id, null);
  }

  visit(ast, -1, null);
  return nodes;
}
