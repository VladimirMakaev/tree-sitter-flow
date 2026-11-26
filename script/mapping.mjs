// The naming table: how Hermes ESTree nodes map to tree-sitter-flow nodes.
//
// JavaScript nodes keep tree-sitter-javascript's names. Flow nodes use the
// snake_case form of their Hermes name. script/convert.mjs uses this table to
// build the tree that tree-sitter-flow should produce for a Hermes AST, and
// the README's naming table is generated from it (npm run mapping-table).
//
// Each entry is `HermesType: treeSitterKind`, or `HermesType: {kind, note}`.
// A `null` kind means that tree-sitter has no node for it: its children attach
// to the parent instead.

export const JAVASCRIPT = {
  Program: {kind: 'program'},
  ExpressionStatement: {kind: 'expression_statement'},
  BlockStatement: {kind: 'statement_block'},
  EmptyStatement: {kind: 'empty_statement'},
  DebuggerStatement: {kind: 'debugger_statement'},
  WithStatement: {kind: 'with_statement'},
  ReturnStatement: {kind: 'return_statement'},
  LabeledStatement: {kind: 'labeled_statement'},
  BreakStatement: {kind: 'break_statement'},
  ContinueStatement: {kind: 'continue_statement'},
  IfStatement: {kind: 'if_statement', note: '`else` adds an `else_clause` wrapper'},
  SwitchStatement: {kind: 'switch_statement', note: 'cases sit in a `switch_body` wrapper'},
  SwitchCase: {kind: 'switch_case', note: '`switch_default` when `test` is null'},
  ThrowStatement: {kind: 'throw_statement'},
  TryStatement: {kind: 'try_statement', note: 'the finalizer sits in a `finally_clause` wrapper'},
  CatchClause: {kind: 'catch_clause'},
  WhileStatement: {kind: 'while_statement'},
  DoWhileStatement: {kind: 'do_statement'},
  ForStatement: {kind: 'for_statement', note: 'a missing init or test is an `empty_statement`'},
  ForInStatement: {kind: 'for_in_statement'},
  ForOfStatement: {kind: 'for_in_statement', note: 'tree-sitter-javascript uses one node for `in` and `of`'},
  FunctionDeclaration: {kind: 'function_declaration', note: '`generator_function_declaration` for generators'},
  VariableDeclaration: {kind: 'lexical_declaration', note: '`variable_declaration` for `var`; none in `for` heads'},
  VariableDeclarator: {kind: 'variable_declarator'},
  ThisExpression: {kind: 'this'},
  Super: {kind: 'super'},
  ArrayExpression: {kind: 'array'},
  ObjectExpression: {kind: 'object'},
  Property: {kind: 'pair', note: 'also `method_definition`, `shorthand_property_identifier` and the `*_pattern` forms'},
  FunctionExpression: {kind: 'function_expression', note: '`generator_function` for generators; none inside methods'},
  ArrowFunctionExpression: {kind: 'arrow_function'},
  ClassDeclaration: {kind: 'class_declaration', note: '`extends` adds a `class_heritage` wrapper'},
  ClassExpression: {kind: 'class'},
  ClassBody: {kind: 'class_body'},
  MethodDefinition: {kind: 'method_definition'},
  PropertyDefinition: {kind: 'field_definition'},
  StaticBlock: {kind: 'class_static_block'},
  Decorator: {kind: 'decorator'},
  UnaryExpression: {kind: 'unary_expression'},
  UpdateExpression: {kind: 'update_expression'},
  BinaryExpression: {kind: 'binary_expression'},
  LogicalExpression: {kind: 'binary_expression'},
  AssignmentExpression: {kind: 'assignment_expression', note: '`augmented_assignment_expression` for `+=` and others'},
  ConditionalExpression: {kind: 'ternary_expression'},
  CallExpression: {kind: 'call_expression'},
  NewExpression: {kind: 'new_expression'},
  MemberExpression: {kind: 'member_expression', note: '`subscript_expression` when computed'},
  ChainExpression: {kind: null, note: 'optional chains are flat in tree-sitter'},
  SequenceExpression: {kind: 'sequence_expression'},
  YieldExpression: {kind: 'yield_expression'},
  AwaitExpression: {kind: 'await_expression'},
  ImportExpression: {kind: 'call_expression', note: 'with an `import` callee'},
  MetaProperty: {kind: 'meta_property'},
  TemplateLiteral: {kind: 'template_string'},
  TaggedTemplateExpression: {kind: 'call_expression'},
  TemplateElement: {kind: null, note: 'template text is a `string_fragment`, which the comparison ignores'},
  SpreadElement: {kind: 'spread_element'},
  RestElement: {kind: 'rest_pattern'},
  AssignmentPattern: {kind: 'assignment_pattern', note: '`object_assignment_pattern` in object shorthand'},
  ObjectPattern: {kind: 'object_pattern'},
  ArrayPattern: {kind: 'array_pattern'},
  Identifier: {kind: 'identifier', note: 'or `property_identifier`, `shorthand_property_identifier(_pattern)`, `statement_identifier`, `undefined`'},
  PrivateIdentifier: {kind: 'private_property_identifier'},
  Literal: {kind: 'string', note: 'or `number`, `regex`, `true`, `false`, `null`'},
  ImportDeclaration: {kind: 'import_statement'},
  ImportSpecifier: {kind: 'import_specifier'},
  ImportDefaultSpecifier: {kind: null, note: 'the local `identifier` sits in `import_clause`'},
  ImportNamespaceSpecifier: {kind: 'namespace_import'},
  ImportAttribute: {kind: 'pair', note: 'inside `import_attribute` and `object`'},
  ExportNamedDeclaration: {kind: 'export_statement'},
  ExportDefaultDeclaration: {kind: 'export_statement'},
  ExportAllDeclaration: {kind: 'export_statement'},
  ExportSpecifier: {kind: 'export_specifier'},
  JSXElement: {kind: 'jsx_element', note: 'none for a self-closing element'},
  JSXFragment: {kind: 'jsx_element'},
  JSXOpeningElement: {kind: 'jsx_opening_element', note: '`jsx_self_closing_element` when self-closing'},
  JSXClosingElement: {kind: 'jsx_closing_element'},
  JSXOpeningFragment: {kind: 'jsx_opening_element'},
  JSXClosingFragment: {kind: 'jsx_closing_element'},
  JSXAttribute: {kind: 'jsx_attribute'},
  JSXSpreadAttribute: {kind: 'jsx_expression', note: 'holding a `spread_element`'},
  JSXSpreadChild: {kind: 'jsx_expression', note: 'holding a `spread_element`'},
  JSXExpressionContainer: {kind: 'jsx_expression'},
  JSXEmptyExpression: {kind: null},
  JSXText: {kind: 'jsx_text', note: 'split around `html_character_reference` nodes'},
  JSXIdentifier: {kind: 'identifier', note: '`property_identifier` for attribute names'},
  JSXMemberExpression: {kind: 'member_expression'},
  JSXNamespacedName: {kind: 'jsx_namespace_name'},
};

// Flow nodes: each maps to the snake_case of its Hermes name, so only notes
// are listed. The key also lists the node's Hermes fields that tree-sitter
// keeps as fields under their snake_case names.
export const FLOW = {
  TypeAnnotation: 'the `: T` part, colon included',
  AnyTypeAnnotation: '', MixedTypeAnnotation: '', EmptyTypeAnnotation: '', VoidTypeAnnotation: '',
  NullLiteralTypeAnnotation: '', NumberTypeAnnotation: '', StringTypeAnnotation: '', BooleanTypeAnnotation: '',
  BigIntTypeAnnotation: '', SymbolTypeAnnotation: '', NeverTypeAnnotation: '', UnknownTypeAnnotation: '',
  UndefinedTypeAnnotation: '', ExistsTypeAnnotation: '', ThisTypeAnnotation: '',
  StringLiteralTypeAnnotation: 'holds a `string`', NumberLiteralTypeAnnotation: 'holds a `number`',
  BigIntLiteralTypeAnnotation: 'holds a `number`', BooleanLiteralTypeAnnotation: 'holds `true` or `false`',
  NullableTypeAnnotation: '', GenericTypeAnnotation: 'also for plain names: `T` is a generic type with an `id`',
  QualifiedTypeIdentifier: '', TypeofTypeAnnotation: '', QualifiedTypeofIdentifier: '', KeyofTypeAnnotation: '',
  TypeOperator: '`renders`, `renders?`, `renders*`, `readonly`, `unique`',
  TupleTypeAnnotation: '', TupleTypeLabeledElement: '', TupleTypeSpreadElement: '',
  ArrayTypeAnnotation: '', IndexedAccessType: '', OptionalIndexedAccessType: '', InferTypeAnnotation: '',
  UnionTypeAnnotation: 'flat list of `types`', IntersectionTypeAnnotation: 'flat list of `types`',
  ConditionalTypeAnnotation: '', TypePredicate: '', InterfaceTypeAnnotation: '',
  FunctionTypeAnnotation: 'also the value of object type methods and declared functions',
  FunctionTypeParam: '', HookTypeAnnotation: '', ComponentTypeAnnotation: '', ComponentTypeParameter: '',
  ObjectTypeAnnotation: '`{| |}` too', ObjectTypeProperty: '', ObjectTypeSpreadProperty: '',
  ObjectTypeIndexer: '', ObjectTypeCallProperty: '', ObjectTypeInternalSlot: '', ObjectTypeMappedTypeProperty: '',
  Variance: '', TypeParameterDeclaration: '', TypeParameter: '`name` is an `identifier` node',
  TypeParameterInstantiation: '', InterfaceExtends: '', ClassImplements: '',
  TypeAlias: '', OpaqueType: '', InterfaceDeclaration: '',
  DeclareTypeAlias: '', DeclareOpaqueType: '', DeclareInterface: '', DeclareClass: '', DeclareFunction: '',
  DeclareHook: '', DeclareComponent: '', DeclareVariable: '', DeclareEnum: '', DeclareModule: '',
  DeclareNamespace: '', DeclareModuleExports: '', DeclareExportDeclaration: '', DeclareExportAllDeclaration: '',
  TypeCastExpression: 'parentheses included', AsExpression: '', AsConstExpression: '',
  InferredPredicate: '', DeclaredPredicate: '',
  EnumDeclaration: '', EnumStringBody: '', EnumNumberBody: '', EnumBooleanBody: '', EnumBigIntBody: '',
  EnumSymbolBody: '', EnumDefaultedMember: '', EnumStringMember: '', EnumNumberMember: '',
  EnumBooleanMember: '', EnumBigIntMember: '',
  ComponentDeclaration: '', ComponentParameter: '', HookDeclaration: '',
  MatchExpression: '', MatchStatement: '', MatchExpressionCase: '', MatchStatementCase: '',
  MatchWildcardPattern: '', MatchLiteralPattern: '', MatchUnaryPattern: '', MatchIdentifierPattern: '',
  MatchBindingPattern: '', MatchObjectPattern: '', MatchArrayPattern: '', MatchOrPattern: '', MatchAsPattern: '',
  MatchMemberPattern: '', MatchInstancePattern: '', MatchObjectPatternProperty: '',
  MatchInstanceObjectPattern: '', MatchRestPattern: '',
  RecordDeclaration: '', RecordDeclarationImplements: '', RecordDeclarationBody: '',
  RecordDeclarationProperty: '', RecordDeclarationStaticProperty: '', RecordExpression: '',
  RecordExpressionProperties: '',
};

export function snakeCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

// Flow nodes that hermes-parser emits although ESTree.def does not list them.
export const HERMES_PARSER_EXTRA = {
  ThisTypeAnnotation: '`this` in types',
};

// Hermes nodes whose tree-sitter name is not the plain snake_case form.
// (None so far: every Flow node uses the snake_case of its Hermes name.)
export const HERMES_TO_TREE_SITTER = {};

// Hermes nodes that tree-sitter-flow does not represent as a node of its own,
// with the reason. They are skipped by the check.
export const HERMES_WITHOUT_NODE = {
  // `x?: T` and `?` in patterns are flags on Identifier in Hermes and a `?`
  // token in tree-sitter.
};

// tree-sitter-flow nodes that Hermes has no counterpart for, with the reason.
export const TREE_SITTER_ONLY = {
  // Nodes that come from Flow's own parser (flow-parser), which hermes-parser
  // does not support; they keep the snake_case of the flow-parser name.
  declare_class_extends_call: 'Flow parser node (DeclareClassExtendsCall) for `declare class A extends M(B)`',
  declare_method_definition: 'Flow parser node (DeclareMethodDefinition) for a class method without a body',
  abstract_method_definition: 'Flow parser node (AbstractMethodDefinition)',
  abstract_property_definition: 'Flow parser node (AbstractPropertyDefinition)',
  tuple_type_element: 'Flow parser node (TupleTypeElement) for an optional unlabeled tuple element `[T?]`',
  import_type: 'Flow parser node (ImportType) for `import("m")` in types',
  template_literal_type_annotation: 'Flow parser node (TemplateLiteralTypeAnnotation)',
  import_equals_declaration: 'Flow parser node (ImportEqualsDeclaration) for `import x = require("m")`',
  external_module_reference: 'Flow parser node (ExternalModuleReference)',
  satisfies_expression: 'Flow parser node (SatisfiesExpression)',
  non_null_expression: 'Flow parser node (NonNullExpression) for `x!`',
  parameter_property: 'Flow parser node (ParameterProperty) for `constructor(private x)`',
};


// tree-sitter nodes that have no ESTree counterpart. The comparison skips
// them; their children are compared as usual.
export const IGNORED = {
  program: 'Hermes reports the Program range from the first token',
  comment: 'comments are not part of the ESTree tree',
  html_comment: 'comments are not part of the ESTree tree',
  hash_bang_line: 'Hermes keeps it outside the body',
  formal_parameters: 'wrapper around parameters; ESTree has a list',
  arguments: 'wrapper around call arguments; ESTree has a list',
  parenthesized_expression: 'ESTree drops parentheses',
  class_heritage: 'wrapper around `extends`; ESTree has `superClass`',
  else_clause: 'wrapper around `else`; ESTree has `alternate`',
  finally_clause: 'wrapper around `finally`; ESTree has `finalizer`',
  switch_body: 'wrapper around cases; ESTree has a list',
  import_clause: 'wrapper around import specifiers; ESTree has a list',
  named_imports: 'wrapper around `{...}` specifiers; ESTree has a list',
  export_clause: 'wrapper around `{...}` specifiers; ESTree has a list',
  namespace_export: 'wrapper around `* as x`; ESTree has `exported`',
  computed_property_name: 'ESTree marks computed keys with a flag',
  optional_chain: 'the `?.` token; ESTree marks it with a flag',
  string_fragment: 'string contents; ESTree has a value',
  escape_sequence: 'string contents; ESTree has a value',
  html_character_reference: 'JSX text contents; ESTree has a value',
  regex_pattern: 'regex contents; ESTree has a value',
  regex_flags: 'regex contents; ESTree has a value',
  template_substitution: 'wrapper around `${...}`; ESTree has a list',
};
