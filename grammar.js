/**
 * @file Flow grammar for tree-sitter
 * @author Vladimir Makaev <vmakaev@gmail.com>
 * @license MIT
 *
 * Extends tree-sitter-javascript. Constructs that tree-sitter-javascript
 * already has keep its node and field names. Flow-specific nodes and fields
 * use the snake_case form of the Hermes ESTree node and field names.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

import JavaScript from 'tree-sitter-javascript/grammar.js';

// Contextual keywords that stay usable as identifiers.
const CONTEXTUAL_KEYWORDS = [
  'type',
  'opaque',
  'declare',
  'interface',
  'component',
  'hook',
  'match',
  'renders',
  'enum',
  'record',
  'of',
  'abstract',
  'readonly',
  'writeonly',
  'private',
  'protected',
  'public',
  'override',
  'implements',
  'module',
  'namespace',
  'satisfies',
  'accessor',
  'proto',
  'mixins',
  'defer',
  'source',
  'require',
  'out',
];

// Words that are keywords inside types and that may still name a
// parameter, a label or a key there.
const TYPE_KEYWORDS = [
  'any', 'mixed', 'empty', 'string', 'number', 'boolean', 'bool', 'bigint',
  'symbol', 'never', 'unknown', 'keyof', 'infer', 'renders', 'unique', 'is',
  'asserts', 'implies', 'readonly', 'writeonly', 'interface', 'component',
  'hook', 'typeof', 'void', 'null', 'true', 'false', 'in', 'out',
];

function isConflict(conflict, names) {
  return conflict.length === names.length && conflict.every((rule, i) => rule.name === names[i]);
}

export default grammar(JavaScript, {
  name: 'flow',

  externals: ($, previous) => previous.concat([
    $._function_signature_automatic_semicolon,
    $._type_arguments_open,
    $._type_automatic_semicolon,
    $._new_type_arguments_open,
    $._class_field_separator,
    $._match_lbrace,
    $._type_lbracket,
  ]),

  precedences: ($, previous) => previous.concat([
    // `as` binds tighter than equality and looser than relational operators.
    ['binary_relation', 'as', 'binary_equality', 'bitwise_and', 'bitwise_xor', 'bitwise_or',
      'logical_and', 'logical_or', 'ternary', $.sequence_expression, $.arrow_function],
    ['member', 'non_null', 'call'],
    // Types, from tightest to loosest.
    [
      'type_primary',
      'type_postfix',
      'type_prefix',
      'type_anon_function',
      'type_intersection',
      'type_union',
      'type_conditional',
      'type_function',
    ],
    ['match_or', 'match_as'],
  ]),

  // Two of tree-sitter-javascript's conflicts do not arise in this grammar.
  conflicts: ($, previous) => previous.filter(c => !isConflict(c, ['primary_expression', 'method_definition']) &&
    !isConflict(c, ['variable_declarator', '_for_header'])).concat([
    [$.object_type_property, $._static_call_property],
    [$.primary_expression, $.ternary_expression],
    [$.statement, $.match_statement_case],
    [$._postfix_type, $.optional_indexed_access_type],
    [$._postfix_type, $.indexed_access_type],
    [$.type_operator, $._qualified_id, $._component_type_parameter_body],
    [$._renders_operator, $._qualified_id, $._component_type_parameter_body],
    [$._qualified_id, $._component_type_parameter_body],
    [$.field_definition, $._typed_field_definition, $.abstract_property_definition, $._method_modifiers, $.abstract_method_definition],
    [$.type_operator, $._type_parameter_variance],
    [$.generic_type_annotation, $.type_parameter],
    [$._qualified_id, $.object_type_indexer],
    [$.unknown_type_annotation, $.tuple_type_labeled_element],
    [$.never_type_annotation, $.tuple_type_labeled_element],
    [$.empty_type_annotation, $.tuple_type_labeled_element],
    [$.mixed_type_annotation, $.tuple_type_labeled_element],
    [$.any_type_annotation, $.tuple_type_labeled_element],
    [$.symbol_type_annotation, $.tuple_type_labeled_element],
    [$.big_int_type_annotation, $.tuple_type_labeled_element],
    [$.boolean_type_annotation, $.tuple_type_labeled_element],
    [$.number_type_annotation, $.tuple_type_labeled_element],
    [$.string_type_annotation, $.tuple_type_labeled_element],
    [$.type_operator, $._qualified_id, $.tuple_type_labeled_element],
    [$._renders_operator, $._qualified_id, $.tuple_type_labeled_element],
    [$.generic_type_annotation, $._qualified_id, $.tuple_type_labeled_element],
    [$._qualified_id, $.tuple_type_labeled_element],
    [$.null_literal_type_annotation, $.tuple_type_labeled_element],
    [$.false, $.tuple_type_labeled_element],
    [$.true, $.tuple_type_labeled_element],
    [$.void_type_annotation, $.tuple_type_labeled_element],
    [$.type_operator, $._qualified_id, $.function_type_param],
    [$._renders_operator, $._qualified_id, $.function_type_param],
    [$._qualified_id, $.function_type_param],
    [$.type_predicate, $._predicate_parameter],
    [$._predicate_parameter, $.infer_type_annotation],
    [$._predicate_parameter, $.keyof_type_annotation],
    [$._predicate_parameter, $.typeof_type_annotation],
    [$.expression_statement, $.sequence_expression, $.match_expression_case],
    [$._infer_type_parameter],
    [$._for_header, $._for_binding],
    [$.variable_declarator, $._for_binding],
    [$._type_parameter_variance],
    [$._computed_object_type_key, $.object_type_indexer],
    [$._typeof_argument, $.qualified_typeof_identifier],
    [$._primary_type, $.qualified_type_identifier],
    [$.sequence_expression, $.match_expression_case],
    [$.match_expression, $.match_statement],
    [$.record_declaration_static_property, $._method_modifiers],
    [$._property_name, $.record_declaration_property],
    [$.type_operator, $.variance],
    [$.generic_type_annotation, $._qualified_id],
    [$._parenthesized_type, $.function_type_param],
    [$.object_type_property, $.object_type_indexer, $.object_type_internal_slot],
    [$.object_type_mapped_type_property, $.variance],
    [$.jsx_namespace_name, $.generic_type_annotation],
    [$._anon_function_type, $._anon_function_param],
    [$._predicate_parameter, $.type_operator],
    [$._renders_operator, $._predicate_parameter],
    [$.arrow_function, $.non_null_expression],
    [$.jsx_opening_element, $.type_parameter],
    [$.primary_expression, $.formal_parameters],
    [$.primary_expression, $.parameter_property],
    [$.await_expression, $.satisfies_expression],
    [$.await_expression, $.non_null_expression],
    [$.await_expression, $.as_expression, $.as_const_expression],
    [$.primary_expression, $.match_expression],
    [$._method_modifiers],
    [$.primary_expression, $._property_name, $.match_expression, $.match_statement],
    [$.primary_expression, $.arrow_function, $._method_modifiers],
    [$.arrow_function, $.hook_declaration, $._method_modifiers],
    [$.arrow_function, $.component_declaration, $._method_modifiers],
    [$.primary_expression, $._method_modifiers],
    [$.arrow_function, $._method_modifiers],
    [$.primary_expression, $.match_expression, $.match_statement],
    [$.primary_expression, $.interface_declaration],
    [$.primary_expression, $.record_expression],
    [$.primary_expression, $.type_alias],
  ]),

  inline: ($, previous) => previous.concat([
    $._type_keyword_identifier,
    $._keyword_identifier,
    $._type_name_keyword,
    $._type_identifier,
    $._object_type_key,
    $._declare_export_declaration,
  ]),

  rules: {
    // ------------------------------------------------------------------
    // Statements and declarations
    // ------------------------------------------------------------------

    statement: ($, previous) => choice(
      previous,
      $.match_statement,
    ),

    declaration: ($, previous) => choice(
      previous,
      $.type_alias,
      $.opaque_type,
      $.interface_declaration,
      $.enum_declaration,
      $.component_declaration,
      $.hook_declaration,
      $.record_declaration,
      $.declare_type_alias,
      $.declare_opaque_type,
      $.declare_interface,
      $.declare_class,
      $.declare_function,
      $.declare_hook,
      $.declare_component,
      $.declare_variable,
      $.declare_enum,
      $.declare_module,
      $.declare_module_exports,
      $.declare_namespace,
      $.declare_export_declaration,
      $.declare_export_all_declaration,
      $.import_equals_declaration,
    ),

    // End of a statement that ends with a type or a module source.
    _type_semicolon: $ => choice(';', $._type_automatic_semicolon),

    _semicolon_or_signature: $ => choice(
      ';',
      $._function_signature_automatic_semicolon,
    ),

    type_alias: $ => seq(
      'type',
      field('id', choice($._type_identifier, alias($._iterator_name, $.identifier))),
      field('type_parameters', optional($.type_parameter_declaration)),
      '=',
      field('right', $._type),
      $._type_semicolon,
    ),

    opaque_type: $ => seq(
      'opaque',
      'type',
      $._opaque_type_rest,
      optional(seq('=', field('impltype', $._type))),
      $._type_semicolon,
    ),

    _opaque_type_rest: $ => seq(
      field('id', $._type_identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional(seq(':', field('supertype', $._type))),
      optional(seq('super', field('lower_bound', $._union_type))),
      optional(seq('extends', field('upper_bound', $._type))),
    ),

    interface_declaration: $ => seq(
      choice('interface', alias($._escaped_interface, 'interface')),
      $._interface_rest,
    ),

    // `interf\u{61}ce`: an escaped keyword, which Hermes accepts.
    _escaped_interface: _ => token(prec(1, /interf(\\u0061|\\u\{0*61\})ce/)),

    _interface_rest: $ => seq(
      field('id', $._type_identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional(seq('extends', commaSep1(field('extends', $.interface_extends)))),
      field('body', $.object_type_annotation),
    ),

    interface_extends: $ => seq(
      field('id', choice($._type_identifier, $.qualified_type_identifier)),
      field('type_parameters', optional($.type_parameter_instantiation)),
    ),

    // declare ...

    declare_type_alias: $ => seq('declare', $._declare_type_alias),
    _declare_type_alias: $ => seq(
      'type',
      field('id', $._type_identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      '=',
      field('right', $._type),
      $._type_semicolon,
    ),

    declare_opaque_type: $ => seq('declare', $._declare_opaque_type),
    _declare_opaque_type: $ => seq(
      'opaque',
      'type',
      $._opaque_type_rest,
      optional(seq('=', field('impltype', $._type))),
      $._type_semicolon,
    ),

    declare_interface: $ => seq('declare', 'interface', $._interface_rest),

    declare_class: $ => seq('declare', $._declare_class),
    _declare_class: $ => seq(
      optional('abstract'),
      'class',
      field('id', $._type_identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional(seq('extends', field('extends', choice($.interface_extends, $.declare_class_extends_call)))),
      optional(seq('mixins', commaSep1(field('mixins', $.interface_extends)))),
      optional(seq('implements', commaSep1(field('implements', $.class_implements)))),
      field('body', alias($._declare_class_body, $.object_type_annotation)),
    ),

    // `declare class A extends Mixin(B) {}`
    declare_class_extends_call: $ => seq(
      field('callee', choice($.identifier, $.qualified_type_identifier)),
      optional(field('type_parameters', $.type_parameter_instantiation)),
      '(',
      field('argument', choice($.interface_extends, $.declare_class_extends_call)),
      ')',
    ),

    declare_function: $ => seq('declare', $._declare_function),
    _declare_function: $ => seq(
      'function',
      field('id', $.identifier),
      field('type_annotation', $._declared_function_type),
      optional(field('predicate', $._predicate)),
      $._semicolon_or_signature,
    ),

    declare_hook: $ => seq('declare', $._declare_hook),
    _declare_hook: $ => seq(
      'hook',
      field('id', $.identifier),
      field('type_annotation', $._declared_hook_type),
      optional(field('predicate', $._predicate)),
      $._semicolon_or_signature,
    ),

    // As in Hermes, the signature of a declared function is a type annotation
    // that holds a function type.
    _declared_function_type: $ => alias($._declared_function_type_inner, $.type_annotation),
    _declared_function_type_inner: $ => alias($._function_type_signature, $.function_type_annotation),
    _declared_hook_type: $ => alias($._declared_hook_type_inner, $.type_annotation),
    _declared_hook_type_inner: $ => alias($._function_type_signature, $.hook_type_annotation),

    declare_component: $ => seq('declare', $._declare_component),
    _declare_component: $ => seq(
      'component',
      field('id', $.identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      $._component_type_params,
      optional(field('renders_type', $._declaration_renders_type)),
      $._semicolon_or_signature,
    ),

    declare_variable: $ => seq('declare', $._declare_variable),
    _declare_variable: $ => seq(
      field('kind', choice('var', 'let', 'const')),
      commaSep1(seq(
        field('id', $.identifier),
        optional(field('type_annotation', $.type_annotation)),
        optional(seq('=', field('init', $.expression))),
      )),
      $._type_semicolon,
    ),

    declare_enum: $ => seq('declare', $._enum),

    declare_module: $ => prec.right(seq(
      'declare',
      'module',
      field('id', choice($.string, $.identifier)),
      optional(field('body', $.statement_block)),
    )),

    declare_module_exports: $ => seq(
      'declare',
      'module',
      '.',
      'exports',
      field('type_annotation', $.type_annotation),
      $._type_semicolon,
    ),

    declare_namespace: $ => seq(
      'declare',
      choice(
        $._declare_namespace,
        seq(field('id', alias('global', $.identifier)), field('body', $.statement_block)),
      ),
    ),

    _declare_namespace: $ => seq(
      'namespace',
      field('id', $.identifier),
      field('body', $.statement_block),
    ),

    declare_export_declaration: $ => seq(
      'declare',
      'export',
      choice(
        seq(
          field('default', 'default'),
          choice(
            field('declaration', choice(
              alias($._declare_function, $.declare_function),
              alias($._declare_class, $.declare_class),
              alias($._declare_component, $.declare_component),
              alias($._declare_hook, $.declare_hook),
            )),
            seq(field('declaration', $._type), $._type_semicolon),
          ),
        ),
        field('declaration', $._declare_export_declaration),
        seq(
          field('export_kind', optional('type')),
          $.export_clause,
          optional($._from_clause),
          $._semicolon,
        ),
      ),
    ),

    _declare_export_declaration: $ => choice(
      alias($._declare_function, $.declare_function),
      alias($._declare_class, $.declare_class),
      alias($._declare_component, $.declare_component),
      alias($._declare_hook, $.declare_hook),
      alias($._declare_variable, $.declare_variable),
      // Hermes reports these as TypeAlias and InterfaceDeclaration.
      $.type_alias,
      alias($._declare_opaque_type, $.declare_opaque_type),
      $.interface_declaration,
      alias($._enum, $.declare_enum),
      alias($._declare_namespace, $.declare_namespace),
    ),

    declare_export_all_declaration: $ => seq(
      'declare',
      'export',
      '*',
      optional(seq('as', $._module_export_name)),
      $._from_clause,
      $._type_semicolon,
    ),

    // import Foo = require('foo');
    import_equals_declaration: $ => seq(
      'import',
      optional(field('import_kind', 'type')),
      field('id', $._import_identifier),
      '=',
      field('module_reference', choice(
        $.external_module_reference,
        $.identifier,
        $.qualified_type_identifier,
      )),
      $._type_semicolon,
    ),

    external_module_reference: $ => seq(
      'require',
      '(',
      field('expression', $.string),
      ')',
    ),

    // Enums

    enum_declaration: $ => $._enum,

    _enum: $ => seq(
      optional('const'),
      'enum',
      field('id', $.identifier),
      field('body', choice(
        $.enum_string_body,
        $.enum_number_body,
        $.enum_boolean_body,
        $.enum_big_int_body,
        $.enum_symbol_body,
      )),
    ),

    // The body kind follows the explicit `of` type, or else the first member.
    // Later members of any kind are accepted, as Flow's parser does.
    enum_string_body: $ => choice(
      seq('of', 'string', enumMembers($._enum_member)),
      enumMembersFirst(choice($.enum_defaulted_member, $.enum_string_member), $._enum_member),
      seq('{', optional(seq('...', optional(','))), '}'),
    ),

    enum_number_body: $ => choice(
      seq('of', 'number', enumMembers($._enum_member)),
      enumMembersFirst($.enum_number_member, $._enum_member),
    ),

    enum_boolean_body: $ => choice(
      seq('of', 'boolean', enumMembers($._enum_member)),
      enumMembersFirst($.enum_boolean_member, $._enum_member),
    ),

    enum_big_int_body: $ => choice(
      seq('of', 'bigint', enumMembers($._enum_member)),
      enumMembersFirst($.enum_big_int_member, $._enum_member),
    ),

    enum_symbol_body: $ => seq(
      'of',
      'symbol',
      enumMembers($._enum_member),
    ),

    _enum_member: $ => choice(
      $.enum_defaulted_member,
      $.enum_string_member,
      $.enum_number_member,
      $.enum_boolean_member,
      $.enum_big_int_member,
    ),

    enum_defaulted_member: $ => field('id', $._enum_member_id),
    enum_string_member: $ => seq(field('id', $._enum_member_id), '=', field('init', $.string)),
    enum_number_member: $ => seq(field('id', $._enum_member_id), '=', field('init', choice($.number, alias($._negative_number, $.number)))),
    enum_boolean_member: $ => seq(field('id', $._enum_member_id), '=', field('init', choice($.true, $.false))),
    enum_big_int_member: $ => seq(field('id', $._enum_member_id), '=', field('init', alias($._bigint, $.number))),

    _enum_member_id: $ => choice(alias(choice($.identifier, $._reserved_identifier), $.identifier), $.string),

    _negative_number: _ => token(seq('-', /\s*/, choice(
      /\d[\d_]*(\.[\d_]*)?([eE][+-]?\d[\d_]*)?/,
      /\.\d[\d_]*([eE][+-]?\d[\d_]*)?/,
      /0[xX][\da-fA-F_]+/,
      /0[bB][01_]+/,
      /0[oO][0-7_]+/,
    ))),

    // Components and hooks

    component_declaration: $ => seq(
      optional('async'),
      'component',
      field('id', $.identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      '(',
      optional(seq(
        commaSep1(choice(
          field('params', $.component_parameter),
          seq(field('params', $.rest_pattern), optional(field('type_annotation', $.type_annotation))),
        )),
        optional(','),
      )),
      ')',
      optional(field('renders_type', $._declaration_renders_type)),
      choice(
        field('body', $.statement_block),
        $._semicolon_or_signature,
      ),
    ),

    component_parameter: $ => seq(
      field('name', choice($.identifier, alias($._reserved_identifier, $.identifier), $.string, alias($._keyword_identifier, $.identifier))),
      optional(seq('as', field('local', choice($.identifier, alias($._reserved_identifier, $.identifier), $._destructuring_pattern)))),
      optional('?'),
      optional(field('type_annotation', $.type_annotation)),
      optional($._initializer),
    ),

    hook_declaration: $ => seq(
      optional('async'),
      'hook',
      field('id', $.identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      field('params', $.formal_parameters),
      optional(field('return_type', $.type_annotation)),
      field('body', $.statement_block),
    ),

    _renders_type: $ => alias($._renders_operator, $.type_operator),

    // In component declarations, as in Hermes, `renders A | B` renders the union.
    _declaration_renders_type: $ => alias($._declaration_renders_operator, $.type_operator),
    _declaration_renders_operator: $ => prec.right(seq(
      field('operator', choice(
        'renders',
        alias(seq('renders', token.immediate('?')), 'renders?'),
        alias(seq('renders', token.immediate('*')), 'renders*'),
      )),
      field('type_annotation', $._union_type),
    )),
    _renders_operator: $ => prec.right(seq(
      field('operator', choice(
        'renders',
        alias(seq('renders', token.immediate('?')), 'renders?'),
        alias(seq('renders', token.immediate('*')), 'renders*'),
      )),
      field('type_annotation', $._prefix_type),
    )),

    // Records

    record_declaration: $ => seq(
      'record',
      field('id', $.identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional(seq('implements', commaSep1(field('implements', $.record_declaration_implements)))),
      optional('='),
      field('body', $.record_declaration_body),
    ),

    record_declaration_implements: $ => seq(
      field('id', $._type_identifier),
      field('type_arguments', optional($.type_parameter_instantiation)),
    ),

    record_declaration_body: $ => seq(
      '{',
      repeat(choice(
        seq(field('elements', choice($.record_declaration_property, $.record_declaration_static_property)), choice(',', ';', $._automatic_semicolon)),
        field('elements', $.method_definition),
      )),
      '}',
    ),

    record_declaration_property: $ => seq(
      optional(field('variance', $.variance)),
      field('key', $._object_type_key),
      optional('?'),
      field('type_annotation', $.type_annotation),
      optional(seq('=', field('default_value', $.expression))),
    ),

    record_declaration_static_property: $ => seq(
      'static',
      optional(field('variance', $.variance)),
      field('key', $._object_type_key),
      field('type_annotation', $.type_annotation),
      optional(seq('=', field('value', $.expression))),
    ),

    record_expression: $ => prec.dynamic(1, seq(
      field('record_constructor', choice($.identifier, $.member_expression)),
      field('type_arguments', optional($._call_type_arguments)),
      field('properties', $.record_expression_properties),
    )),

    record_expression_properties: $ => seq(
      '{',
      commaSep(optional(field('properties', choice(
        $.pair,
        $.spread_element,
        alias(choice($.identifier, $._reserved_identifier), $.shorthand_property_identifier),
      )))),
      '}',
    ),

    // Match

    // `match(x)` followed by a block on the next line is a call and a block:
    // the scanner only accepts a `{` on the line of the `)`.
    match_expression: $ => seq(
      'match',
      '(',
      field('argument', $._expressions),
      ')',
      alias($._match_lbrace, '{'),
      optional(seq(
        sepBy1(choice(',', ';'), field('cases', $.match_expression_case)),
        optional(choice(',', ';')),
      )),
      '}',
    ),

    match_expression_case: $ => seq(
      optional('case'),
      field('pattern', $._match_pattern),
      optional(seq('if', '(', field('guard', $.expression), ')')),
      choice('=>', ':'),
      field('body', $.expression),
    ),

    match_statement: $ => prec.dynamic(1, seq(
      'match',
      '(',
      field('argument', $._expressions),
      ')',
      alias($._match_lbrace, '{'),
      repeat(seq(field('cases', $.match_statement_case), optional(','))),
      '}',
      optional($._automatic_semicolon),
    )),

    match_statement_case: $ => prec.right(seq(
      optional('case'),
      field('pattern', $._match_pattern),
      optional(seq('if', '(', field('guard', $.expression), ')')),
      choice('=>', ':'),
      // `{` starts a block here, as at the start of any statement.
      field('body', choice(prec.dynamic(2, $.statement_block), $.statement)),
    )),

    _match_pattern: $ => choice(
      $._match_or_operand,
      $.match_or_pattern,
      $.match_as_pattern,
    ),

    _match_or_operand: $ => choice(
      $.match_wildcard_pattern,
      $.match_literal_pattern,
      $.match_unary_pattern,
      $.match_identifier_pattern,
      $.match_member_pattern,
      $.match_binding_pattern,
      $.match_object_pattern,
      $.match_array_pattern,
      $.match_instance_pattern,
      $._parenthesized_match_pattern,
    ),

    _parenthesized_match_pattern: $ => seq('(', $._match_pattern, ')'),

    match_wildcard_pattern: _ => '_',

    match_literal_pattern: $ => field('literal', choice(
      $.string,
      $.number,
      $.true,
      $.false,
      $.null,
    )),

    match_unary_pattern: $ => seq(
      field('operator', choice('-', '+')),
      field('argument', $.number),
    ),

    match_identifier_pattern: $ => field('id', choice($.identifier, alias($.undefined, $.identifier))),

    match_member_pattern: $ => seq(
      field('base', choice($.match_identifier_pattern, $.match_member_pattern)),
      choice(
        seq('.', field('property', alias($.identifier, $.property_identifier))),
        seq('[', field('property', choice($.string, $.number)), ']'),
      ),
    ),

    match_binding_pattern: $ => seq(
      field('kind', choice('const', 'let', 'var')),
      field('id', $.identifier),
    ),

    match_object_pattern: $ => seq('{', optional($._match_object_pattern_contents), '}'),

    match_instance_object_pattern: $ => seq('{', optional($._match_object_pattern_contents), '}'),

    _match_object_pattern_contents: $ => choice(
      seq(
        commaSep1(field('properties', $.match_object_pattern_property)),
        optional(seq(',', field('rest', $.match_rest_pattern))),
        optional(','),
      ),
      seq(field('rest', $.match_rest_pattern), optional(',')),
    ),

    match_object_pattern_property: $ => choice(
      seq(
        field('key', choice($._match_key_identifier, $.string, $.number)),
        ':',
        field('pattern', $._match_pattern),
      ),
      field('pattern', $.match_binding_pattern),
      field('key', $._match_key_identifier),
    ),

    _match_key_identifier: $ => reserved('properties', alias(choice($.identifier, $._reserved_identifier), $.property_identifier)),

    match_rest_pattern: $ => seq('...', optional(field('argument', $.match_binding_pattern))),

    match_array_pattern: $ => seq(
      '[',
      choice(
        seq(
          commaSep1(field('elements', $._match_pattern)),
          optional(seq(',', field('rest', $.match_rest_pattern))),
          optional(','),
        ),
        seq(field('rest', $.match_rest_pattern), optional(',')),
        seq(),
      ),
      ']',
    ),

    match_or_pattern: $ => prec.left('match_or', seq(
      optional('|'),
      field('patterns', $._match_or_operand),
      repeat1(seq('|', field('patterns', $._match_or_operand))),
    )),

    match_as_pattern: $ => prec.left('match_as', seq(
      field('pattern', choice($._match_or_operand, $.match_or_pattern)),
      'as',
      field('target', choice($.identifier, $.match_binding_pattern)),
    )),

    match_instance_pattern: $ => seq(
      field('target_constructor', choice($.match_identifier_pattern, $.match_member_pattern)),
      field('properties', $.match_instance_object_pattern),
    ),

    // ------------------------------------------------------------------
    // JavaScript statements extended with Flow syntax
    // ------------------------------------------------------------------

    import_statement: $ => seq(
      'import',
      optional(field('import_kind', choice('type', 'typeof'))),
      choice(
        seq($.import_clause, $._from_clause),
        field('source', $.string),
      ),
      optional($.import_attribute),
      $._type_semicolon,
    ),

    _import_identifier: $ => choice(
      $.identifier,
      alias(choice('type', 'typeof', 'defer', 'source', 'of', 'opaque', 'declare'), $.identifier),
    ),

    import_clause: $ => choice(
      $.namespace_import,
      $.named_imports,
      seq(
        $._import_identifier,
        optional(seq(
          ',',
          choice(
            $.namespace_import,
            $.named_imports,
          ),
        )),
      ),
    ),

    namespace_import: $ => seq(
      optional(field('phase', 'defer')),
      '*', 'as', $._import_identifier,
    ),

    import_specifier: $ => choice(
      seq(
        optional(field('import_kind', choice('type', 'typeof'))),
        choice(
          field('name', $._import_identifier),
          seq(
            field('name', choice($._module_export_name, alias(choice('type', 'typeof'), $.identifier))),
            'as',
            field('alias', $._import_identifier),
          ),
        ),
      ),
      // `import {type as}`: a type named `as`
      seq(
        field('import_kind', choice('type', 'typeof')),
        field('name', alias('as', $.identifier)),
        optional(seq('as', field('alias', $._import_identifier))),
      ),
    ),

    import_attribute: $ => seq(choice('with', 'assert'), $.object),

    export_statement: $ => choice(
      seq(
        'export',
        choice(
          seq('*', $._from_clause),
          seq($.namespace_export, $._from_clause),
          seq($.export_clause, $._from_clause),
          $.export_clause,
        ),
        optional($.import_attribute),
        $._semicolon,
      ),
      seq(
        repeat(field('decorator', $.decorator)),
        'export',
        choice(
          field('declaration', $.declaration),
          seq(
            'default',
            choice(
              field('declaration', $.declaration),
              seq(
                field('value', $.expression),
                $._semicolon,
              ),
            ),
          ),
        ),
      ),
      seq(
        'export',
        field('export_kind', 'type'),
        choice(
          seq($.export_clause, optional($._from_clause)),
          seq('*', $._from_clause),
        ),
        optional($.import_attribute),
        $._semicolon,
      ),
      seq('export', '=', field('value', $.expression), $._semicolon),
      seq('export', 'as', 'namespace', field('id', $.identifier), $._semicolon),
      seq(
        'export',
        'default',
        field('value', alias($._function_signature_expression, $.function_expression)),
        $._semicolon_or_signature,
      ),
      seq(
        'export',
        'declare',
        'default',
        field('declaration', choice(
          alias($._declare_function, $.declare_function),
          alias($._declare_class, $.declare_class),
        )),
      ),
    ),

    export_specifier: $ => choice(
      seq(
        optional(field('export_kind', choice('type', 'typeof'))),
        field('name', choice($._module_export_name, alias(choice('type', 'typeof'), $.identifier))),
        optional(seq(
          'as',
          field('alias', choice($._module_export_name, alias(choice('type', 'typeof', 'as'), $.identifier))),
        )),
      ),
      // `export {type as}`: a type named `as`
      seq(
        field('export_kind', choice('type', 'typeof')),
        field('name', alias('as', $.identifier)),
        optional(seq(
          'as',
          field('alias', choice($._module_export_name, alias(choice('type', 'typeof', 'as'), $.identifier))),
        )),
      ),
    ),

    variable_declarator: $ => seq(
      field('name', choice(
        $.identifier,
        alias('of', $.identifier),
        alias($._reserved_identifier, $.identifier),
        alias($._iterator_name, $.identifier),
        $._destructuring_pattern,
      )),
      optional('!'),
      optional(field('type_annotation', $.type_annotation)),
      optional($._initializer),
    ),

    _for_header: $ => seq(
      '(',
      choice(
        field('left', choice(
          $._lhs_expression,
          $.parenthesized_expression,
        )),
        seq(
          field('kind', 'var'),
          field('left', $._for_binding),
          optional(field('type_annotation', $.type_annotation)),
          optional($._initializer),
        ),
        seq(
          field('kind', choice('let', 'const')),
          field('left', $._for_binding),
          optional(field('type_annotation', $.type_annotation)),
          optional($._automatic_semicolon),
        ),
        seq(
          field('kind', choice(
            'using',
            seq('await', 'using'),
          )),
          field('left', $._for_binding),
          optional(field('type_annotation', $.type_annotation)),
          optional($._automatic_semicolon),
        ),
      ),
      field('operator', choice('in', 'of')),
      field('right', $._expressions),
      ')',
    ),

    _for_binding: $ => choice(
      $.identifier,
      alias('of', $.identifier),
      alias($._reserved_identifier, $.identifier),
      $._destructuring_pattern,
    ),

    catch_clause: $ => seq(
      'catch',
      optional(seq(
        '(',
        field('parameter', choice($.identifier, $._destructuring_pattern)),
        optional(field('type_annotation', $.type_annotation)),
        ')',
      )),
      field('body', $.statement_block),
    ),

    // ------------------------------------------------------------------
    // Functions
    // ------------------------------------------------------------------

    _call_signature: $ => seq(
      field('type_parameters', optional($.type_parameter_declaration)),
      field('parameters', $.formal_parameters),
      optional($._return_type),
    ),

    _return_type: $ => choice(
      seq(
        field('return_type', $.type_annotation),
        optional(field('predicate', $._predicate)),
      ),
      seq(':', field('predicate', $._predicate)),
    ),

    _predicate: $ => choice($.inferred_predicate, $.declared_predicate),
    inferred_predicate: _ => '%checks',
    declared_predicate: $ => seq('%checks', '(', field('value', $.expression), ')'),

    function_declaration: $ => prec.right('declaration', seq(
      optional('async'),
      'function',
      field('name', $.identifier),
      $._call_signature,
      choice(
        seq(field('body', $.statement_block), optional($._automatic_semicolon)),
        prec.dynamic(-1, choice($._function_signature_automatic_semicolon, ';')),
      ),
    )),

    _formal_parameter: $ => choice(
      seq(
        $.pattern,
        optional('?'),
        optional(field('type_annotation', $.type_annotation)),
      ),
      $.assignment_pattern,
      seq(alias($.this, $.identifier), field('type_annotation', $.type_annotation)),
      $.parameter_property,
    ),

    // constructor(private x: T)
    parameter_property: $ => seq(
      repeat1(choice(
        field('ts_accessibility', choice('private', 'protected', 'public')),
        field('variance', alias('readonly', $.variance)),
        'override',
      )),
      field('key', choice($.identifier, $._destructuring_pattern)),
      optional('?'),
      optional(field('type_annotation', $.type_annotation)),
      optional($._initializer),
    ),

    assignment_pattern: $ => seq(
      field('left', $.pattern),
      optional('?'),
      optional(field('type_annotation', $.type_annotation)),
      '=',
      field('right', $.expression),
    ),

    // ------------------------------------------------------------------
    // Expressions
    // ------------------------------------------------------------------

    expression: ($, previous) => choice(
      previous,
      $.as_expression,
      $.as_const_expression,
      $.satisfies_expression,
      $.match_expression,
    ),

    // `import.defer(...)` and `import.source(...)` phase imports.
    meta_property: _ => choice(
      seq('new', '.', 'target'),
      seq('import', '.', choice('meta', 'defer', 'source')),
    ),

    // `=> {` always starts a block, as in JavaScript.
    arrow_function: $ => seq(
      optional('async'),
      choice(
        field('parameter', choice(
          alias($._reserved_identifier, $.identifier),
          $.identifier,
        )),
        $._call_signature,
      ),
      '=>',
      // A label inside the block has dynamic precedence -1, hence 2.
      field('body', choice(
        $.expression,
        prec.dynamic(2, $.statement_block),
      )),
    ),

    // In `a ? (b) : c => (d) : e => f`, Hermes reads the parenthesized
    // consequent `(b)` rather than an arrow function `(b): c => (d)` with a
    // return type, whenever the conditional still completes.
    ternary_expression: $ => prec.right('ternary', seq(
      field('condition', $.expression),
      alias($._ternary_qmark, '?'),
      field('consequence', choice($.expression, prec.dynamic(1, $.parenthesized_expression))),
      ':',
      field('alternative', $.expression),
    )),

    _lhs_expression: ($, previous) => choice(previous, $.non_null_expression),

    // `[(a)] = b` and `({a: (b)} = c)` assign to parenthesized targets.
    pattern: $ => prec.dynamic(-1, choice(
      $._lhs_expression,
      $.rest_pattern,
      $.parenthesized_expression,
    )),

    array_pattern: $ => seq(
      '[',
      commaSep(optional(choice(
        $.pattern,
        $.assignment_pattern,
        seq($.pattern, field('type_annotation', $.type_annotation)),
      ))),
      ']',
    ),

    _augmented_assignment_lhs: ($, previous) => choice(previous, $.non_null_expression),

    primary_expression: ($, previous) => choice(
      previous,
      $.type_cast_expression,
      $.non_null_expression,
      $.record_expression,
    ),

    type_cast_expression: $ => prec.dynamic(-3, seq(
      '(',
      field('expression', $.expression),
      field('type_annotation', $.type_annotation),
      ')',
    )),

    as_expression: $ => prec.left('as', seq(
      field('expression', $.expression),
      'as',
      field('type_annotation', $._type),
    )),

    as_const_expression: $ => prec.left('as', seq(
      field('expression', $.expression),
      'as',
      'const',
    )),

    satisfies_expression: $ => prec.left('as', seq(
      field('expression', $.expression),
      'satisfies',
      field('type_annotation', $._type),
    )),

    non_null_expression: $ => prec.left('non_null', seq(
      field('argument', $.expression),
      '!',
    )),

    call_expression: $ => choice(
      prec('call', seq(
        field('function', choice($.expression, $.import)),
        field('type_arguments', optional($._call_type_arguments)),
        field('arguments', $.arguments),
      )),
      prec('template_call', seq(
        field('function', choice($.primary_expression, $.new_expression)),
        field('arguments', $.template_string),
      )),
      prec('member', seq(
        field('function', $.primary_expression),
        field('optional_chain', $.optional_chain),
        field('type_arguments', optional($._call_type_arguments)),
        field('arguments', $.arguments),
      )),
    ),

    new_expression: $ => prec.right('new', seq(
      'new',
      field('constructor', choice($.primary_expression, $.new_expression)),
      field('type_arguments', optional($._new_type_arguments)),
      field('arguments', optional(prec.dynamic(1, $.arguments))),
    )),

    // Flow's `@@iterator` and `@@asyncIterator` names.
    _iterator_name: _ => token(choice('@@iterator', '@@asyncIterator')),

    _property_name: ($, previous) => choice(
      previous,
      alias($._iterator_name, $.property_identifier),
    ),

    _reserved_identifier: ($, previous) => choice(
      previous,
      ...CONTEXTUAL_KEYWORDS,
    ),

    // Words that are keywords in JavaScript but may name component
    // parameters, object type keys and similar Flow positions.
    _type_keyword_identifier: _ => choice(...TYPE_KEYWORDS),

    _keyword_identifier: _ => choice(
      'case', 'function', 'class', 'default', 'new', 'delete', 'void', 'typeof',
      'with', 'in', 'instanceof', 'import', 'export', 'extends', 'super', 'this',
      'null', 'true', 'false', 'if', 'else', 'for', 'while', 'do', 'switch',
      'return', 'throw', 'try', 'catch', 'finally', 'var', 'const', 'break',
      'continue', 'debugger',
    ),

    // Reserved words are valid JSX attribute names: `<Route default />`.
    _jsx_attribute_name: $ => reserved('properties', choice(
      alias($._jsx_identifier, $.property_identifier),
      $.jsx_namespace_name,
    )),

    // Any identifier name may be exported: `export { a as import }`.
    _module_export_name: $ => reserved('properties', choice(
      $.identifier,
      $.string,
      'default',
    )),

    decorator: $ => seq(
      '@',
      choice(
        $.identifier,
        alias($.decorator_member_expression, $.member_expression),
        alias($.decorator_call_expression, $.call_expression),
        alias($.decorator_parenthesized_expression, $.parenthesized_expression),
      ),
    ),

    decorator_member_expression: $ => prec('member', seq(
      field('object', choice(
        $.identifier,
        alias($.decorator_member_expression, $.member_expression),
      )),
      '.',
      field('property', choice(
        alias($.identifier, $.property_identifier),
        $.private_property_identifier,
      )),
    )),

    decorator_parenthesized_expression: $ => seq('(', $._expressions, ')'),

    jsx_opening_element: $ => prec.dynamic(-1, seq(
      '<',
      optional(seq(
        field('name', $._jsx_element_name),
        optional(field('type_arguments', $.type_parameter_instantiation)),
        repeat(field('attribute', $._jsx_attribute)),
      )),
      '>',
    )),

    jsx_self_closing_element: $ => seq(
      '<',
      field('name', $._jsx_element_name),
      optional(field('type_arguments', $.type_parameter_instantiation)),
      repeat(field('attribute', $._jsx_attribute)),
      '/>',
    ),

    // ------------------------------------------------------------------
    // Classes
    // ------------------------------------------------------------------

    class: $ => prec('literal', seq(
      repeat(field('decorator', $.decorator)),
      'class',
      field('name', optional($.identifier)),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional($.class_heritage),
      optional($._class_implements),
      field('body', $.class_body),
    )),

    class_declaration: $ => prec('declaration', seq(
      repeat(field('decorator', $.decorator)),
      optional('abstract'),
      'class',
      field('name', $.identifier),
      field('type_parameters', optional($.type_parameter_declaration)),
      optional($.class_heritage),
      optional($._class_implements),
      field('body', $.class_body),
      optional($._automatic_semicolon),
    )),

    class_heritage: $ => seq(
      'extends',
      $.expression,
      optional(field('super_type_arguments', $._call_type_arguments)),
    ),

    _class_implements: $ => seq(
      'implements',
      commaSep1(field('implements', $.class_implements)),
    ),

    class_implements: $ => seq(
      field('id', choice($._type_identifier, $.qualified_type_identifier)),
      field('type_parameters', optional($.type_parameter_instantiation)),
    ),

    class_body: $ => seq(
      '{',
      repeat(choice(
        seq(field('member', $.method_definition), optional(';')),
        seq(field('member', choice($.declare_method_definition, $.abstract_method_definition)), $._semicolon_or_signature),
        seq(field('member', choice($.field_definition, $.abstract_property_definition)), $._semicolon),
        // `class A { x: string y: number }`
        seq(field('member', alias($._typed_field_definition, $.field_definition)), $._class_field_separator),
        field('member', $.class_static_block),
        ';',
      )),
      '}',
    ),

    _class_member_modifiers: $ => repeat1(choice(
      field('ts_accessibility', choice('private', 'protected', 'public')),
      'static',
      'declare',
      'override',
      'accessor',
    )),

    field_definition: $ => seq(
      repeat(field('decorator', $.decorator)),
      optional($._class_member_modifiers),
      optional(field('variance', $.variance)),
      field('property', $._property_name),
      optional(choice('?', '!')),
      optional(field('type_annotation', $.type_annotation)),
      optional($._initializer),
    ),

    _typed_field_definition: $ => seq(
      repeat(field('decorator', $.decorator)),
      optional($._class_member_modifiers),
      optional(field('variance', $.variance)),
      field('property', $._property_name),
      optional(choice('?', '!')),
      field('type_annotation', $.type_annotation),
    ),

    abstract_property_definition: $ => seq(
      repeat(field('decorator', $.decorator)),
      optional($._class_member_modifiers),
      'abstract',
      optional(field('variance', $.variance)),
      field('property', $._property_name),
      optional('?'),
      optional(field('type_annotation', $.type_annotation)),
    ),

    method_definition: $ => prec.left(seq(
      repeat(field('decorator', $.decorator)),
      optional($._method_modifiers),
      field('name', $._property_name),
      optional('?'),
      $._call_signature,
      field('body', $.statement_block),
    )),

    _method_modifiers: $ => choice(
      seq(
        repeat1(choice(
          field('ts_accessibility', choice('private', 'protected', 'public')),
          'static',
          alias(token(seq('static', /\s+/, 'get', /\s*\n/)), 'static get'),
          'override',
          'async',
        )),
        optional(choice('get', 'set', '*')),
      ),
      choice('get', 'set', '*'),
    ),

    // `export default function (): T;` without a body, in declaration files.
    _function_signature_expression: $ => seq(
      optional('async'),
      'function',
      $._call_signature,
    ),

    // A class method without a body: `method(x: number): void;`
    declare_method_definition: $ => seq(
      repeat(field('decorator', $.decorator)),
      optional($._method_modifiers),
      field('name', $._property_name),
      optional('?'),
      $._call_signature,
    ),

    abstract_method_definition: $ => seq(
      repeat(field('decorator', $.decorator)),
      optional($._class_member_modifiers),
      'abstract',
      optional(choice('get', 'set', '*')),
      field('name', $._property_name),
      optional('?'),
      $._call_signature,
    ),

    // ------------------------------------------------------------------
    // Type annotations
    // ------------------------------------------------------------------

    type_annotation: $ => seq(
      ':',
      choice($._type, $.type_predicate),
    ),

    type_predicate: $ => choice(
      seq(
        field('parameter_name', $._predicate_parameter),
        'is',
        field('type_annotation', $._type),
      ),
      seq(
        field('kind', choice('asserts', 'implies')),
        field('parameter_name', $._predicate_parameter),
        optional(seq('is', field('type_annotation', $._type))),
      ),
    ),

    _predicate_parameter: $ => choice(
      $.identifier,
      alias($.this, $.identifier),
      alias($._reserved_identifier, $.identifier),
      alias($._type_keyword_identifier, $.identifier),
    ),

    _type: $ => choice(
      prec('type_function', $._union_type),
      $.conditional_type_annotation,
    ),

    _union_type: $ => choice(
      $.union_type_annotation,
      prec('type_conditional', $._intersection_type),
      prec('type_conditional', seq('|', $._intersection_type)),
    ),

    union_type_annotation: $ => prec.right('type_union', seq(
      optional('|'),
      field('types', $._intersection_type),
      repeat1(seq('|', field('types', $._intersection_type))),
    )),

    _intersection_type: $ => choice(
      $.intersection_type_annotation,
      prec('type_union', $._anon_function_type),
      prec('type_union', seq('&', $._anon_function_type)),
    ),

    intersection_type_annotation: $ => prec.right('type_intersection', seq(
      optional('&'),
      field('types', $._anon_function_type),
      repeat1(seq('&', field('types', $._anon_function_type))),
    )),

    // `string => void`: a function type with one unparenthesized parameter.
    _anon_function_type: $ => choice(
      prec('type_intersection', $._prefix_type),
      alias($._anon_function, $.function_type_annotation),
    ),

    _anon_function: $ => prec.dynamic(-1, prec.right('type_function', seq(
      field('params', alias($._anon_function_param, $.function_type_param)),
      '=>',
      field('return_type', $._return_type_type),
    ))),

    _anon_function_param: $ => field('type_annotation', $._prefix_type),

    _prefix_type: $ => choice(
      $.nullable_type_annotation,
      $.keyof_type_annotation,
      $.type_operator,
      prec('type_prefix', $._postfix_type),
    ),

    nullable_type_annotation: $ => prec('type_prefix', seq(
      '?',
      field('type_annotation', $._prefix_type),
    )),

    keyof_type_annotation: $ => prec('type_prefix', seq(
      'keyof',
      field('argument', $._prefix_type),
    )),

    type_operator: $ => choice(
      $._renders_operator,
      prec('type_prefix', seq(
        field('operator', choice('readonly', 'unique')),
        field('type_annotation', $._prefix_type),
      )),
    ),

    _postfix_type: $ => choice(
      $.array_type_annotation,
      $.indexed_access_type,
      $.optional_indexed_access_type,
      prec('type_postfix', $._primary_type),
    ),

    // `_type_lbracket` is a `[` on the line of the type.
    array_type_annotation: $ => prec('type_postfix', seq(
      field('element_type', $._postfix_type),
      alias($._type_lbracket, '['),
      ']',
    )),

    indexed_access_type: $ => prec('type_postfix', seq(
      field('object_type', choice(
        $.array_type_annotation,
        $.indexed_access_type,
        prec('type_postfix', $._primary_type),
      )),
      alias($._type_lbracket, '['),
      field('index_type', $._type),
      ']',
    )),

    // As in Hermes, every access after `?.[` in a chain is optional too:
    // in `T?.[A][B]`, `[B]` is an optional indexed access.
    optional_indexed_access_type: $ => prec('type_postfix', choice(
      seq(
        field('object_type', $._postfix_type),
        '?.',
        '[',
        field('index_type', $._type),
        ']',
      ),
      seq(
        field('object_type', $.optional_indexed_access_type),
        alias($._type_lbracket, '['),
        field('index_type', $._type),
        ']',
      ),
    )),

    _primary_type: $ => choice(
      $.any_type_annotation,
      $.mixed_type_annotation,
      $.empty_type_annotation,
      $.void_type_annotation,
      $.null_literal_type_annotation,
      $.number_type_annotation,
      $.big_int_type_annotation,
      $.string_type_annotation,
      $.boolean_type_annotation,
      $.symbol_type_annotation,
      $.never_type_annotation,
      $.unknown_type_annotation,
      $.undefined_type_annotation,
      $.exists_type_annotation,
      $.this_type_annotation,
      $.string_literal_type_annotation,
      $.number_literal_type_annotation,
      $.big_int_literal_type_annotation,
      $.boolean_literal_type_annotation,
      $.template_literal_type_annotation,
      $.generic_type_annotation,
      $.typeof_type_annotation,
      $.object_type_annotation,
      $.interface_type_annotation,
      $.tuple_type_annotation,
      $.infer_type_annotation,
      $.component_type_annotation,
      $.hook_type_annotation,
      $.function_type_annotation,
      $.import_type,
      $._parenthesized_type,
    ),

    _parenthesized_type: $ => prec('type_primary', seq('(', $._type, ')')),

    any_type_annotation: _ => 'any',
    mixed_type_annotation: _ => 'mixed',
    empty_type_annotation: _ => 'empty',
    void_type_annotation: _ => 'void',
    null_literal_type_annotation: _ => 'null',
    number_type_annotation: _ => 'number',
    big_int_type_annotation: _ => 'bigint',
    string_type_annotation: _ => 'string',
    boolean_type_annotation: _ => choice('boolean', 'bool'),
    symbol_type_annotation: _ => 'symbol',
    never_type_annotation: _ => 'never',
    unknown_type_annotation: _ => 'unknown',
    undefined_type_annotation: _ => 'undefined',
    exists_type_annotation: _ => '*',
    this_type_annotation: _ => 'this',

    string_literal_type_annotation: $ => $.string,
    number_literal_type_annotation: $ => seq(optional('-'), $.number),
    big_int_literal_type_annotation: $ => seq(optional('-'), alias($._bigint, $.number)),
    _bigint: _ => token(prec(2, /(0[xX][\da-fA-F](_?[\da-fA-F])*|0[bB][01](_?[01])*|0[oO][0-7](_?[0-7])*|\d(_?\d)*)n/)),
    boolean_literal_type_annotation: $ => choice($.true, $.false),

    template_literal_type_annotation: $ => seq(
      '`',
      repeat(choice(
        alias($._template_chars, $.string_fragment),
        $.escape_sequence,
        seq('${', field('types', $._type), '}'),
      )),
      '`',
    ),

    generic_type_annotation: $ => prec.right(seq(
      field('id', choice($._type_identifier, $.qualified_type_identifier)),
      optional(field('type_parameters', $.type_parameter_instantiation)),
    )),

    _type_identifier: $ => choice($.identifier, alias($._type_name_keyword, $.identifier)),

    // Contextual words that can name a type.
    _type_name_keyword: _ => choice(
      'type', 'opaque', 'declare', 'component', 'hook', 'match', 'record', 'of',
      'abstract', 'private', 'protected', 'public', 'override', 'module',
      'namespace', 'is', 'asserts', 'implies', 'satisfies', 'accessor', 'proto',
      'mixins', 'defer', 'source', 'require', 'out', 'get', 'set', 'async',
      'await', 'static', 'let', 'writeonly',
    ),

    qualified_type_identifier: $ => seq(
      field('qualification', choice($._type_identifier, $.qualified_type_identifier, $.import_type)),
      '.',
      field('id', $._qualified_id),
    ),

    _qualified_id: $ => reserved('properties', choice($.identifier, alias($._reserved_identifier, $.identifier))),

    typeof_type_annotation: $ => prec.right(seq(
      'typeof',
      choice(
        $._typeof_argument,
        seq('(', $._typeof_argument, ')'),
      ),
      optional(field('type_arguments', $.type_parameter_instantiation)),
    )),

    _typeof_argument: $ => field('argument', choice(
      $._type_identifier,
      alias($.this, $.identifier),
      $.qualified_typeof_identifier,
      $.import_type,
    )),

    qualified_typeof_identifier: $ => seq(
      field('qualification', choice(
        $._type_identifier,
        alias($.this, $.identifier),
        $.qualified_typeof_identifier,
        $.import_type,
      )),
      '.',
      field('id', $._qualified_id),
    ),

    import_type: $ => seq('import', '(', field('source', $.string), ')'),

    object_type_annotation: $ => seq(
      choice('{', '{|'),
      optional(seq(
        sepBy1($._object_type_separator, $._object_type_member),
        optional($._object_type_separator),
      )),
      choice('}', '|}'),
    ),

    // The body of a declared class, which also takes static call properties.
    _declare_class_body: $ => seq(
      choice('{', '{|'),
      optional(seq(
        sepBy1($._object_type_separator, choice(
          $._object_type_member,
          field('call_properties', alias($._static_call_property, $.object_type_call_property)),
        )),
        optional($._object_type_separator),
      )),
      choice('}', '|}'),
    ),

    _object_type_separator: $ => choice(',', ';', $._automatic_semicolon),

    _object_type_member: $ => choice(
      field('properties', choice(
        $.object_type_property,
        $.object_type_spread_property,
        $.object_type_mapped_type_property,
      )),
      field('indexers', $.object_type_indexer),
      field('call_properties', $.object_type_call_property),
      field('internal_slots', $.object_type_internal_slot),
      '...',
    ),

    _object_type_key: $ => reserved('properties', choice(
      alias(choice($.identifier, $._reserved_identifier, $._iterator_name), $.property_identifier),
      $.private_property_identifier,
      $.string,
      $.number,
      alias($._bigint, $.number),
    )),

    _object_type_modifiers: $ => repeat1(choice(
      field('ts_accessibility', choice('private', 'protected', 'public')),
      'static',
      'proto',
      'declare',
      'override',
      'abstract',
    )),

    object_type_property: $ => choice(
      // key: value. `[K]: T` is an indexer, so a computed key only takes an
      // initializer, `readonly [K] = v`, or a method signature.
      seq(
        optional($._object_type_modifiers),
        optional(field('variance', $.variance)),
        field('key', $._object_type_key),
        optional('?'),
        choice(
          seq(':', field('value', $._type)),
          seq('=', field('init', $.expression)),
        ),
      ),
      seq(
        optional($._object_type_modifiers),
        optional(field('variance', $.variance)),
        field('key', alias($._computed_object_type_key, $.computed_property_name)),
        '=',
        field('init', $.expression),
      ),
      // key without a type (declare class members)
      prec(-1, seq(
        $._object_type_modifiers,
        optional(field('variance', $.variance)),
        field('key', $._object_type_key),
        optional('?'),
      )),
      prec(-1, field('key', $.private_property_identifier)),
      // method
      seq(
        optional($._object_type_modifiers),
        field('key', choice($._object_type_key, alias($._computed_object_type_key, $.computed_property_name))),
        optional('?'),
        field('value', alias($._function_type_signature, $.function_type_annotation)),
      ),
      // getter or setter
      seq(
        optional($._object_type_modifiers),
        field('kind', choice('get', 'set')),
        field('key', $._object_type_key),
        field('value', alias($._function_type_signature, $.function_type_annotation)),
      ),
    ),

    _computed_object_type_key: $ => seq('[', $._type, ']'),

    object_type_spread_property: $ => seq('...', field('argument', $._type)),

    object_type_indexer: $ => seq(
      optional($._object_type_modifiers),
      optional(field('variance', $.variance)),
      '[',
      optional(seq(field('id', choice($._qualified_id, alias($._type_keyword_identifier, $.identifier))), ':')),
      field('key', $._type),
      ']',
      optional('?'),
      ':',
      field('value', $._type),
    ),

    object_type_mapped_type_property: $ => seq(
      optional(choice(
        seq(field('variance_op', choice('+', '-')), field('variance', alias('readonly', $.variance))),
        field('variance', $.variance),
      )),
      '[',
      field('key_tparam', alias($._mapped_type_key, $.type_parameter)),
      'in',
      field('source_type', $._type),
      optional(seq('as', field('name_type', $._type))),
      ']',
      optional(field('optional', choice('?', '+?', '-?'))),
      ':',
      field('prop_type', $._type),
    ),

    _mapped_type_key: $ => field('name', $._type_identifier),

    object_type_call_property: $ => field('value', alias($._function_type_signature, $.function_type_annotation)),

    // In a declared class, `static (): T` and `static(): T` are static call
    // properties, as in flow-parser, Hermes and Babel. Elsewhere `static` is
    // a key.
    _static_call_property: $ => prec.dynamic(1, seq(
      'static',
      field('value', alias($._function_type_signature, $.function_type_annotation)),
    )),

    object_type_internal_slot: $ => prec.dynamic(1, seq(
      optional('static'),
      '[',
      '[',
      field('id', $.identifier),
      ']',
      ']',
      optional('?'),
      choice(
        seq(':', field('value', $._type)),
        field('value', alias($._function_type_signature, $.function_type_annotation)),
      ),
    )),

    variance: _ => choice('+', '-', 'readonly', 'writeonly'),

    // Type parameters also take TypeScript-style `in` and `out`.
    _type_parameter_variance: $ => alias(
      choice('+', '-', 'readonly', 'writeonly', 'in', 'out', seq('in', 'out')),
      $.variance,
    ),

    interface_type_annotation: $ => seq(
      'interface',
      optional(seq('extends', commaSep1(field('extends', $.interface_extends)))),
      field('body', $.object_type_annotation),
    ),

    tuple_type_annotation: $ => seq(
      '[',
      optional(seq(
        commaSep1(choice(
          field('element_types', choice(
            $._type,
            $.tuple_type_labeled_element,
            $.tuple_type_spread_element,
            $.tuple_type_element,
          )),
          '...',
        )),
        optional(','),
      )),
      ']',
    ),

    tuple_type_labeled_element: $ => seq(
      optional(field('variance', $.variance)),
      field('label', choice($._qualified_id, alias($._type_keyword_identifier, $.identifier))),
      optional('?'),
      ':',
      field('element_type', $._type),
    ),

    tuple_type_spread_element: $ => seq(
      '...',
      optional(seq(field('label', $._qualified_id), ':')),
      field('type_annotation', $._type),
    ),

    tuple_type_element: $ => seq(
      field('element_type', $._type),
      '?',
    ),

    infer_type_annotation: $ => prec.right(seq(
      'infer',
      field('type_parameter', alias($._infer_type_parameter, $.type_parameter)),
    )),

    _infer_type_parameter: $ => seq(
      field('name', $._type_identifier),
      // As in Hermes, the bound of an inferred type is the type itself.
      optional(seq('extends', field('bound', $._prefix_type))),
    ),

    conditional_type_annotation: $ => prec.right('type_conditional', seq(
      field('check_type', $._union_type),
      'extends',
      field('extends_type', $._union_type),
      '?',
      field('true_type', $._type),
      ':',
      field('false_type', $._type),
    )),

    function_type_annotation: $ => prec.right('type_function', seq(
      field('type_parameters', optional($.type_parameter_declaration)),
      $._function_type_params,
      '=>',
      field('return_type', $._return_type_type),
    )),

    _return_type_type: $ => choice($._type, $.type_predicate),

    // `<T>(x: T): R`, used by methods and declared functions.
    _function_type_signature: $ => prec.right(seq(
      field('type_parameters', optional($.type_parameter_declaration)),
      $._function_type_params,
      optional(seq(':', optional(field('return_type', $._return_type_type)))),
    )),

    _function_type_params: $ => seq(
      '(',
      optional(seq(
        commaSep1(choice(
          field('params', $.function_type_param),
          seq('...', field('rest', choice($.function_type_param, alias($._rest_destructuring, $.array_pattern)))),
          field('this', alias($._this_function_type_param, $.function_type_param)),
        )),
        optional(','),
      )),
      ')',
    ),

    _rest_destructuring: $ => seq(
      '[',
      commaSep(field('elements', $.identifier)),
      ']',
      field('type_annotation', $.type_annotation),
    ),

    function_type_param: $ => choice(
      // `(renders?: T) => R`: as in Hermes, `renders?` is only the maybe
      // renders operator when the `?` follows directly, as here.
      seq(
        field('name', alias('renders', $.identifier)),
        token.immediate('?'),
        ':',
        field('type_annotation', $._type),
      ),
      seq(
        field('name', choice(
          $._qualified_id,
          alias($._type_keyword_identifier, $.identifier),
        )),
        optional('?'),
        ':',
        field('type_annotation', $._type),
      ),
      field('type_annotation', $._type),
    ),

    // As in Hermes, the `this` parameter has no name node.
    _this_function_type_param: $ => seq(
      'this',
      ':',
      field('type_annotation', $._type),
    ),

    hook_type_annotation: $ => prec.right('type_function', seq(
      'hook',
      field('type_parameters', optional($.type_parameter_declaration)),
      $._function_type_params,
      '=>',
      field('return_type', $._return_type_type),
    )),

    component_type_annotation: $ => prec.right(seq(
      'component',
      field('type_parameters', optional($.type_parameter_declaration)),
      $._component_type_params,
      optional(field('renders_type', $._renders_type)),
    )),

    _component_type_params: $ => seq(
      '(',
      optional(seq(
        commaSep1(choice(
          field('params', $.component_type_parameter),
          field('rest', alias($._rest_component_type_parameter, $.component_type_parameter)),
        )),
        optional(','),
      )),
      ')',
    ),

    _rest_component_type_parameter: $ => seq('...', $._component_type_parameter_body),

    component_type_parameter: $ => $._component_type_parameter_body,

    _component_type_parameter_body: $ => choice(
      seq(
        field('name', choice(
          $._qualified_id,
          alias($._type_keyword_identifier, $.identifier),
          $.string,
        )),
        optional(seq('as', field('local', choice($.identifier, $._destructuring_pattern)))),
        optional('?'),
        ':',
        field('type_annotation', $._type),
        optional($._initializer),
      ),
      field('type_annotation', $._type),
    ),

    type_parameter_declaration: $ => seq(
      '<',
      commaSep1(field('params', $.type_parameter)),
      optional(','),
      '>',
    ),

    type_parameter: $ => seq(
      optional('const'),
      optional(field('variance', $._type_parameter_variance)),
      field('name', choice($._type_identifier, alias(choice('in', 'out'), $.identifier))),
      optional(field('bound', choice(
        $.type_annotation,
        alias($._extends_bound, $.type_annotation),
      ))),
      optional(seq('=', field('default', $._type))),
    ),

    _extends_bound: $ => seq('extends', $._type),

    // Type arguments after an expression; the external scanner decides
    // whether `<` opens them.
    _call_type_arguments: $ => alias($._call_type_arguments_inner, $.type_parameter_instantiation),
    _call_type_arguments_inner: $ => seq(
      alias($._type_arguments_open, '<'),
      optional(seq(
        commaSep1(field('params', $._type)),
        optional(',',),
      )),
      '>',
    ),

    _new_type_arguments: $ => alias($._new_type_arguments_inner, $.type_parameter_instantiation),
    _new_type_arguments_inner: $ => seq(
      alias($._new_type_arguments_open, '<'),
      optional(seq(
        commaSep1(field('params', $._type)),
        optional(','),
      )),
      '>',
    ),

    type_parameter_instantiation: $ => seq(
      '<',
      optional(seq(
        commaSep1(field('params', $._type)),
        optional(','),
      )),
      '>',
    ),
  },
});

/**
 * Enum body members: `{A, B, ...}`.
 *
 * @param {RuleOrLiteral} member
 * @returns {SeqRule}
 */
function enumMembers(member) {
  return seq(
    '{',
    optional(seq(
      sepBy1(',', choice(field('members', member), '...')),
      optional(','),
    )),
    '}',
  );
}

/**
 * Enum body members with at least one leading member.
 *
 * @param {RuleOrLiteral} member
 * @returns {SeqRule}
 */
function enumMembersFirst(first, rest) {
  return seq(
    '{',
    field('members', first),
    repeat(seq(',', choice(field('members', rest), '...'))),
    optional(','),
    '}',
  );
}

/**
 * Creates a rule to match one or more of the rules separated by a comma.
 *
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return sepBy1(',', rule);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma.
 *
 * @param {RuleOrLiteral} rule
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a separator.
 *
 * @param {RuleOrLiteral} sep
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}
