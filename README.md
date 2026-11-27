# tree-sitter-flow

[![CI](https://github.com/VladimirMakaev/tree-sitter-flow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/VladimirMakaev/tree-sitter-flow/actions/workflows/ci.yml)

A [tree-sitter](https://tree-sitter.github.io/) grammar for
[Flow](https://flow.org/), the type system for JavaScript.

It extends [tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript)
the way [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)
does: every JavaScript node keeps its tree-sitter-javascript name and shape,
and Flow nodes are named after [Hermes](https://github.com/facebook/hermes)'
ESTree nodes. The parser is generated with tree-sitter CLI 0.27.2 at its
native ABI 15, so it loads in tree-sitter runtimes 0.25 and later, for example
ast-grep 0.51, Neovim 0.11 and py-tree-sitter 0.25 and later.

## Supported syntax

- **Type annotations** on variables, parameters (optional, default, rest,
  destructuring, `this`), return types, class fields, `catch` and `for` heads.
- **Types**: primitives, literals, `?T`, `T[]`, tuples (labeled, variance,
  spread, optional), unions and intersections (leading `|` and `&`), function
  types (named and unnamed parameters, rest, `this`, `T => U`), constructor
  types (`new () => T`, `abstract new () => T`), generics,
  qualified names, `typeof`, `keyof`, indexed access `T[K]` and `T?.[K]`,
  conditional types with `infer`, type guards (`x is T`, `implies x is T`,
  `asserts x`), object types (exact `{| |}`, inexact `...`, spread, indexers,
  call properties, internal slots, getters and setters, methods, variance
  including `+readonly`, `@@iterator` and other `@@name` keys), mapped types, inline `interface {}` types, `renders`,
  `renders?` and `renders*`, component types, hook types, `$ReadOnly` and other
  utility types, `%checks` predicates.
- **Generics**: type parameters with bounds, variance, defaults and `const`;
  type arguments on calls, `new`, optional calls, class heritage and JSX;
  generic arrow functions.
- **Expressions**: type casts `(x: T)`, `as`, `as const`.
- **Classes**: abstract class declarations and expressions, `abstract` and
  `abstract override` members, fields without `;` before another member on the
  same line (`a: T b() {}`, `a = 1 b() {}`), as Flow's parser accepts.
- **Declarations**: `type`, `opaque type`, `interface`, `declare` (`var`, `let`,
  `const`, `function`, `class`, `module`, `module.exports`, `export`, `type`,
  `opaque type`, `interface`, `namespace`, `enum`, `component`, `hook`),
  `import type`, `import typeof`, `export type`. Declared classes also take the
  members Flow's parser accepts and its checker reports: keys without a type,
  typed properties with an initializer and computed accessors. `declare const`
  takes a destructuring pattern, and declared namespaces take nested
  namespaces.
- **Patterns**: type annotations inside destructuring patterns
  (`{a: b: T}`) and destructuring patterns as compound assignment targets
  (`[a] += 1`), which Flow's parser takes and its checker reports.
- **Components and hooks**: `component` declarations with string-named, renamed,
  optional, defaulted and rest parameters and `renders` clauses; `hook`
  declarations; `declare component` and `declare hook`.
- **Match**: `match` expressions and statements with literal, wildcard,
  identifier, member, binding (`const x`), object, array, rest, or, as, instance
  and unary patterns, and `if` guards.
- **Enums**: `enum` with string, number, boolean, bigint and symbol bodies,
  explicit `of` types, defaulted members and `...`; `declare enum`.
- **Records**: `record` declarations with defaults, static members, methods,
  type parameters and `implements`; record expressions `R {a: 1}`.
- **TypeScript-style syntax that Flow parses**: `x!`, `satisfies`, `readonly`
  and accessibility modifiers, `abstract` members, `import x = require()`,
  template literal types.

Contextual keywords (`type`, `opaque`, `declare`, `component`, `hook`, `match`,
`renders`, `as`, `using`, `enum`, `record`, `of`, `source`, `defer`, ...) stay
usable as identifiers, property names, imported names and JSX element names.

`<T>(x) => y` in an expression is a generic arrow function, also where a JSX
element could start. As in Flow's parser and Hermes, it is a JSX element when
the element can close: the external scanner reads it as one when a matching
closing tag `</T` follows on the same line.

After an expression, `<` ... `>` followed by an argument list is a call with
type arguments when the content is a type, as in Flow's parser:
`c ? f<T>() : d => e` calls `f`. It stays a comparison when the content cannot
be a type, as in `a < (b, c) > (d)`, `a < -b > (c)` or `a < f(b) > (c)`, or
when the argument list cannot be one, as in `a < b > (c: T)`.

In a JSX attribute string, an `&` that starts no character reference is
text, as in Flow's parser: `<a b="c&d" />` has one string fragment, and
`&amp;` or `&#xA3;` stays an `html_character_reference`.

`await (a)(b)` awaits the call, as in Flow's parser: Flow code is in ES
modules, where `await` is a keyword. tree-sitter-javascript reads it as a call
of a function named `await`.

## Naming

JavaScript constructs use tree-sitter-javascript's node and field names, so
queries written for JavaScript keep working: `arrow_function`, `call_expression`
with field `function`, `statement_block`, `pair`, `string` and so on.

Flow nodes use the snake_case of the Hermes ESTree type
([ESTree.def](https://github.com/facebook/hermes/blob/main/include/hermes/AST/ESTree.def)),
and their fields the snake_case of the Hermes field names:

```js
const id = <T>(x: T): T => x;
```

```
(lexical_declaration
  (variable_declarator
    name: (identifier)
    value: (arrow_function
      type_parameters: (type_parameter_declaration
        params: (type_parameter name: (identifier)))
      parameters: (formal_parameters
        (identifier)
        type_annotation: (type_annotation
          (generic_type_annotation id: (identifier))))
      return_type: (type_annotation
        (generic_type_annotation id: (identifier)))
      body: (identifier))))
```

Where the shapes differ:

- A type annotation on a binding is a sibling of the name, in field
  `type_annotation` of the enclosing node (`formal_parameters`,
  `variable_declarator`, `assignment_pattern`, `catch_clause`, ...). Hermes
  hangs it on the Identifier.
- Every type reference is a `generic_type_annotation`, and identifiers inside
  types are `identifier`; object type keys are `property_identifier`.
- tree-sitter-javascript's wrappers (`formal_parameters`, `arguments`,
  `parenthesized_expression`, `class_heritage`, ...) and its token-level nodes
  (`string_fragment`, `escape_sequence`, ...) have no ESTree counterpart.
- Constructs that hermes-parser 0.37 does not support take the snake_case of
  flow-parser's ESTree name, listed under "Nodes from Flow's own parser" below:
  `constructor_type_annotation` for `new () => T`, for example.
- A computed key in an object type, `[K](): T`, holds a type, where flow-parser
  has an expression. For keys like `[K]` and `[A.b]` the two readings cover the
  same text, and a type keeps object types free of expression syntax.

The table below is generated from [`script/mapping.mjs`](script/mapping.mjs)
(`npm run mapping-table`), which the Hermes comparison also uses.
`script/naming.mjs` checks in CI that every Flow node of the grammar is named
after a Hermes node or listed with a reason.

<details>
<summary>Naming table</summary>

#### JavaScript nodes

| Hermes ESTree | tree-sitter-flow | Notes |
| --- | --- | --- |
| `Program` | `program` |  |
| `ExpressionStatement` | `expression_statement` |  |
| `BlockStatement` | `statement_block` |  |
| `EmptyStatement` | `empty_statement` |  |
| `DebuggerStatement` | `debugger_statement` |  |
| `WithStatement` | `with_statement` |  |
| `ReturnStatement` | `return_statement` |  |
| `LabeledStatement` | `labeled_statement` |  |
| `BreakStatement` | `break_statement` |  |
| `ContinueStatement` | `continue_statement` |  |
| `IfStatement` | `if_statement` | `else` adds an `else_clause` wrapper |
| `SwitchStatement` | `switch_statement` | cases sit in a `switch_body` wrapper |
| `SwitchCase` | `switch_case` | `switch_default` when `test` is null |
| `ThrowStatement` | `throw_statement` |  |
| `TryStatement` | `try_statement` | the finalizer sits in a `finally_clause` wrapper |
| `CatchClause` | `catch_clause` |  |
| `WhileStatement` | `while_statement` |  |
| `DoWhileStatement` | `do_statement` |  |
| `ForStatement` | `for_statement` | a missing init or test is an `empty_statement` |
| `ForInStatement` | `for_in_statement` |  |
| `ForOfStatement` | `for_in_statement` | tree-sitter-javascript uses one node for `in` and `of` |
| `FunctionDeclaration` | `function_declaration` | `generator_function_declaration` for generators |
| `VariableDeclaration` | `lexical_declaration` | `variable_declaration` for `var`; none in `for` heads |
| `VariableDeclarator` | `variable_declarator` |  |
| `ThisExpression` | `this` |  |
| `Super` | `super` |  |
| `ArrayExpression` | `array` |  |
| `ObjectExpression` | `object` |  |
| `Property` | `pair` | also `method_definition`, `shorthand_property_identifier` and the `*_pattern` forms |
| `FunctionExpression` | `function_expression` | `generator_function` for generators; none inside methods |
| `ArrowFunctionExpression` | `arrow_function` |  |
| `ClassDeclaration` | `class_declaration` | `extends` adds a `class_heritage` wrapper |
| `ClassExpression` | `class` |  |
| `ClassBody` | `class_body` |  |
| `MethodDefinition` | `method_definition` |  |
| `PropertyDefinition` | `field_definition` |  |
| `StaticBlock` | `class_static_block` |  |
| `Decorator` | `decorator` |  |
| `UnaryExpression` | `unary_expression` |  |
| `UpdateExpression` | `update_expression` |  |
| `BinaryExpression` | `binary_expression` |  |
| `LogicalExpression` | `binary_expression` |  |
| `AssignmentExpression` | `assignment_expression` | `augmented_assignment_expression` for `+=` and others |
| `ConditionalExpression` | `ternary_expression` |  |
| `CallExpression` | `call_expression` |  |
| `NewExpression` | `new_expression` |  |
| `MemberExpression` | `member_expression` | `subscript_expression` when computed |
| `ChainExpression` | (none) | optional chains are flat in tree-sitter |
| `SequenceExpression` | `sequence_expression` |  |
| `YieldExpression` | `yield_expression` |  |
| `AwaitExpression` | `await_expression` |  |
| `ImportExpression` | `call_expression` | with an `import` callee |
| `MetaProperty` | `meta_property` |  |
| `TemplateLiteral` | `template_string` |  |
| `TaggedTemplateExpression` | `call_expression` |  |
| `TemplateElement` | (none) | template text is a `string_fragment`, which the comparison ignores |
| `SpreadElement` | `spread_element` |  |
| `RestElement` | `rest_pattern` |  |
| `AssignmentPattern` | `assignment_pattern` | `object_assignment_pattern` in object shorthand |
| `ObjectPattern` | `object_pattern` |  |
| `ArrayPattern` | `array_pattern` |  |
| `Identifier` | `identifier` | or `property_identifier`, `shorthand_property_identifier(_pattern)`, `statement_identifier`, `undefined` |
| `PrivateIdentifier` | `private_property_identifier` |  |
| `Literal` | `string` | or `number`, `regex`, `true`, `false`, `null` |
| `ImportDeclaration` | `import_statement` |  |
| `ImportSpecifier` | `import_specifier` |  |
| `ImportDefaultSpecifier` | (none) | the local `identifier` sits in `import_clause` |
| `ImportNamespaceSpecifier` | `namespace_import` |  |
| `ImportAttribute` | `pair` | inside `import_attribute` and `object` |
| `ExportNamedDeclaration` | `export_statement` |  |
| `ExportDefaultDeclaration` | `export_statement` |  |
| `ExportAllDeclaration` | `export_statement` |  |
| `ExportSpecifier` | `export_specifier` |  |
| `JSXElement` | `jsx_element` | none for a self-closing element |
| `JSXFragment` | `jsx_element` |  |
| `JSXOpeningElement` | `jsx_opening_element` | `jsx_self_closing_element` when self-closing |
| `JSXClosingElement` | `jsx_closing_element` |  |
| `JSXOpeningFragment` | `jsx_opening_element` |  |
| `JSXClosingFragment` | `jsx_closing_element` |  |
| `JSXAttribute` | `jsx_attribute` |  |
| `JSXSpreadAttribute` | `jsx_expression` | holding a `spread_element` |
| `JSXSpreadChild` | `jsx_expression` | holding a `spread_element` |
| `JSXExpressionContainer` | `jsx_expression` |  |
| `JSXEmptyExpression` | (none) |  |
| `JSXText` | `jsx_text` | split around `html_character_reference` nodes |
| `JSXIdentifier` | `identifier` | `property_identifier` for attribute names |
| `JSXMemberExpression` | `member_expression` |  |
| `JSXNamespacedName` | `jsx_namespace_name` |  |

#### Flow nodes

| Hermes ESTree | tree-sitter-flow | Notes |
| --- | --- | --- |
| `TypeAnnotation` | `type_annotation` | the `: T` part, colon included |
| `AnyTypeAnnotation` | `any_type_annotation` |  |
| `MixedTypeAnnotation` | `mixed_type_annotation` |  |
| `EmptyTypeAnnotation` | `empty_type_annotation` |  |
| `VoidTypeAnnotation` | `void_type_annotation` |  |
| `NullLiteralTypeAnnotation` | `null_literal_type_annotation` |  |
| `NumberTypeAnnotation` | `number_type_annotation` |  |
| `StringTypeAnnotation` | `string_type_annotation` |  |
| `BooleanTypeAnnotation` | `boolean_type_annotation` |  |
| `BigIntTypeAnnotation` | `big_int_type_annotation` |  |
| `SymbolTypeAnnotation` | `symbol_type_annotation` |  |
| `NeverTypeAnnotation` | `never_type_annotation` |  |
| `UnknownTypeAnnotation` | `unknown_type_annotation` |  |
| `UndefinedTypeAnnotation` | `undefined_type_annotation` |  |
| `ExistsTypeAnnotation` | `exists_type_annotation` |  |
| `ThisTypeAnnotation` | `this_type_annotation` | emitted by hermes-parser, not listed in ESTree.def |
| `StringLiteralTypeAnnotation` | `string_literal_type_annotation` | holds a `string` |
| `NumberLiteralTypeAnnotation` | `number_literal_type_annotation` | holds a `number` |
| `BigIntLiteralTypeAnnotation` | `big_int_literal_type_annotation` | holds a `number` |
| `BooleanLiteralTypeAnnotation` | `boolean_literal_type_annotation` | holds `true` or `false` |
| `NullableTypeAnnotation` | `nullable_type_annotation` |  |
| `GenericTypeAnnotation` | `generic_type_annotation` | also for plain names: `T` is a generic type with an `id` |
| `QualifiedTypeIdentifier` | `qualified_type_identifier` |  |
| `TypeofTypeAnnotation` | `typeof_type_annotation` |  |
| `QualifiedTypeofIdentifier` | `qualified_typeof_identifier` |  |
| `KeyofTypeAnnotation` | `keyof_type_annotation` |  |
| `TypeOperator` | `type_operator` | `renders`, `renders?`, `renders*`, `readonly`, `unique` |
| `TupleTypeAnnotation` | `tuple_type_annotation` |  |
| `TupleTypeLabeledElement` | `tuple_type_labeled_element` |  |
| `TupleTypeSpreadElement` | `tuple_type_spread_element` |  |
| `ArrayTypeAnnotation` | `array_type_annotation` |  |
| `IndexedAccessType` | `indexed_access_type` |  |
| `OptionalIndexedAccessType` | `optional_indexed_access_type` |  |
| `InferTypeAnnotation` | `infer_type_annotation` |  |
| `UnionTypeAnnotation` | `union_type_annotation` | flat list of `types` |
| `IntersectionTypeAnnotation` | `intersection_type_annotation` | flat list of `types` |
| `ConditionalTypeAnnotation` | `conditional_type_annotation` |  |
| `TypePredicate` | `type_predicate` |  |
| `InterfaceTypeAnnotation` | `interface_type_annotation` |  |
| `FunctionTypeAnnotation` | `function_type_annotation` | also the value of object type methods and declared functions |
| `FunctionTypeParam` | `function_type_param` |  |
| `HookTypeAnnotation` | `hook_type_annotation` |  |
| `ComponentTypeAnnotation` | `component_type_annotation` |  |
| `ComponentTypeParameter` | `component_type_parameter` |  |
| `ObjectTypeAnnotation` | `object_type_annotation` | `{| |}` too |
| `ObjectTypeProperty` | `object_type_property` |  |
| `ObjectTypeSpreadProperty` | `object_type_spread_property` |  |
| `ObjectTypeIndexer` | `object_type_indexer` |  |
| `ObjectTypeCallProperty` | `object_type_call_property` |  |
| `ObjectTypeInternalSlot` | `object_type_internal_slot` |  |
| `ObjectTypeMappedTypeProperty` | `object_type_mapped_type_property` |  |
| `Variance` | `variance` |  |
| `TypeParameterDeclaration` | `type_parameter_declaration` |  |
| `TypeParameter` | `type_parameter` | `name` is an `identifier` node |
| `TypeParameterInstantiation` | `type_parameter_instantiation` |  |
| `InterfaceExtends` | `interface_extends` |  |
| `ClassImplements` | `class_implements` |  |
| `TypeAlias` | `type_alias` |  |
| `OpaqueType` | `opaque_type` |  |
| `InterfaceDeclaration` | `interface_declaration` |  |
| `DeclareTypeAlias` | `declare_type_alias` |  |
| `DeclareOpaqueType` | `declare_opaque_type` |  |
| `DeclareInterface` | `declare_interface` |  |
| `DeclareClass` | `declare_class` |  |
| `DeclareFunction` | `declare_function` |  |
| `DeclareHook` | `declare_hook` |  |
| `DeclareComponent` | `declare_component` |  |
| `DeclareVariable` | `declare_variable` |  |
| `DeclareEnum` | `declare_enum` |  |
| `DeclareModule` | `declare_module` |  |
| `DeclareNamespace` | `declare_namespace` |  |
| `DeclareModuleExports` | `declare_module_exports` |  |
| `DeclareExportDeclaration` | `declare_export_declaration` |  |
| `DeclareExportAllDeclaration` | `declare_export_all_declaration` |  |
| `TypeCastExpression` | `type_cast_expression` | parentheses included |
| `AsExpression` | `as_expression` |  |
| `AsConstExpression` | `as_const_expression` |  |
| `InferredPredicate` | `inferred_predicate` |  |
| `DeclaredPredicate` | `declared_predicate` |  |
| `EnumDeclaration` | `enum_declaration` |  |
| `EnumStringBody` | `enum_string_body` |  |
| `EnumNumberBody` | `enum_number_body` |  |
| `EnumBooleanBody` | `enum_boolean_body` |  |
| `EnumBigIntBody` | `enum_big_int_body` |  |
| `EnumSymbolBody` | `enum_symbol_body` |  |
| `EnumDefaultedMember` | `enum_defaulted_member` |  |
| `EnumStringMember` | `enum_string_member` |  |
| `EnumNumberMember` | `enum_number_member` |  |
| `EnumBooleanMember` | `enum_boolean_member` |  |
| `EnumBigIntMember` | `enum_big_int_member` |  |
| `ComponentDeclaration` | `component_declaration` |  |
| `ComponentParameter` | `component_parameter` |  |
| `HookDeclaration` | `hook_declaration` |  |
| `MatchExpression` | `match_expression` |  |
| `MatchStatement` | `match_statement` |  |
| `MatchExpressionCase` | `match_expression_case` |  |
| `MatchStatementCase` | `match_statement_case` |  |
| `MatchWildcardPattern` | `match_wildcard_pattern` |  |
| `MatchLiteralPattern` | `match_literal_pattern` |  |
| `MatchUnaryPattern` | `match_unary_pattern` |  |
| `MatchIdentifierPattern` | `match_identifier_pattern` |  |
| `MatchBindingPattern` | `match_binding_pattern` |  |
| `MatchObjectPattern` | `match_object_pattern` |  |
| `MatchArrayPattern` | `match_array_pattern` |  |
| `MatchOrPattern` | `match_or_pattern` |  |
| `MatchAsPattern` | `match_as_pattern` |  |
| `MatchMemberPattern` | `match_member_pattern` |  |
| `MatchInstancePattern` | `match_instance_pattern` |  |
| `MatchObjectPatternProperty` | `match_object_pattern_property` |  |
| `MatchInstanceObjectPattern` | `match_instance_object_pattern` |  |
| `MatchRestPattern` | `match_rest_pattern` |  |
| `RecordDeclaration` | `record_declaration` |  |
| `RecordDeclarationImplements` | `record_declaration_implements` |  |
| `RecordDeclarationBody` | `record_declaration_body` |  |
| `RecordDeclarationProperty` | `record_declaration_property` |  |
| `RecordDeclarationStaticProperty` | `record_declaration_static_property` |  |
| `RecordExpression` | `record_expression` |  |
| `RecordExpressionProperties` | `record_expression_properties` |  |

#### Nodes from Flow's own parser

| tree-sitter-flow | Notes |
| --- | --- |
| `declare_class_extends_call` | Flow parser node (DeclareClassExtendsCall) for `declare class A extends M(B)` |
| `declare_method_definition` | Flow parser node (DeclareMethodDefinition) for a class method without a body |
| `abstract_method_definition` | Flow parser node (AbstractMethodDefinition) |
| `abstract_property_definition` | Flow parser node (AbstractPropertyDefinition) |
| `tuple_type_element` | Flow parser node (TupleTypeElement) for an optional unlabeled tuple element `[T?]` |
| `import_type` | Flow parser node (ImportType) for `import("m")` in types |
| `template_literal_type_annotation` | Flow parser node (TemplateLiteralTypeAnnotation) |
| `import_equals_declaration` | Flow parser node (ImportEqualsDeclaration) for `import x = require("m")` |
| `external_module_reference` | Flow parser node (ExternalModuleReference) |
| `satisfies_expression` | Flow parser node (SatisfiesExpression) |
| `non_null_expression` | Flow parser node (NonNullExpression) for `x!` |
| `parameter_property` | Flow parser node (ParameterProperty) for `constructor(private x)` |
| `constructor_type_annotation` | Flow parser node (ConstructorTypeAnnotation) for `new () => T` |

#### tree-sitter nodes with no ESTree node

| tree-sitter-flow | Why |
| --- | --- |
| `program` | Hermes reports the Program range from the first token |
| `comment` | comments are not part of the ESTree tree |
| `html_comment` | comments are not part of the ESTree tree |
| `hash_bang_line` | Hermes keeps it outside the body |
| `formal_parameters` | wrapper around parameters; ESTree has a list |
| `arguments` | wrapper around call arguments; ESTree has a list |
| `parenthesized_expression` | ESTree drops parentheses |
| `class_heritage` | wrapper around `extends`; ESTree has `superClass` |
| `else_clause` | wrapper around `else`; ESTree has `alternate` |
| `finally_clause` | wrapper around `finally`; ESTree has `finalizer` |
| `switch_body` | wrapper around cases; ESTree has a list |
| `import_clause` | wrapper around import specifiers; ESTree has a list |
| `named_imports` | wrapper around `{...}` specifiers; ESTree has a list |
| `export_clause` | wrapper around `{...}` specifiers; ESTree has a list |
| `namespace_export` | wrapper around `* as x`; ESTree has `exported` |
| `computed_property_name` | ESTree marks computed keys with a flag |
| `optional_chain` | the `?.` token; ESTree marks it with a flag |
| `string_fragment` | string contents; ESTree has a value |
| `escape_sequence` | string contents; ESTree has a value |
| `html_character_reference` | JSX text contents; ESTree has a value |
| `regex_pattern` | regex contents; ESTree has a value |
| `regex_flags` | regex contents; ESTree has a value |
| `template_substitution` | wrapper around `${...}`; ESTree has a list |

</details>

## Usage

### ast-grep

Build the parser as a shared library:

```sh
tree-sitter build --output flow.so
```

and add it to `sgconfig.yml`:

```yaml
customLanguages:
  flow:
    libraryPath: flow.so
    extensions: [js, flow]
```

ast-grep 0.51 and later only load custom languages that you allow:

```sh
ast-grep run --custom-languages allow -l flow -p 'type $T = $V'
ast-grep run --custom-languages allow -l flow -p '($E: any)'
```

`$` is valid in JavaScript identifiers, so no `expandoChar` is needed.

### Node

The Node binding works with the npm `tree-sitter` package 0.25.1, the newest
Node binding of tree-sitter that is available.

```js
import Parser from 'tree-sitter';
import Flow from 'tree-sitter-flow';

const parser = new Parser();
parser.setLanguage(Flow);
const tree = parser.parse('type A = ?string;');
```

### Rust

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_flow::LANGUAGE.into())?;
let tree = parser.parse("type A = ?string;", None);
```

### Python

```python
import tree_sitter_flow
from tree_sitter import Language, Parser

parser = Parser(Language(tree_sitter_flow.language()))
tree = parser.parse(b"type A = ?string;")
```

### Runtime versions

| Binding | tree-sitter runtime |
| --- | --- |
| C | 0.27.2 (tested in CI) |
| Rust | `tree-sitter` crate 0.27.2 (dev-dependency) |
| Python | `tree-sitter~=0.27` (the `core` extra; CI tests 0.27.0) |
| Node | `tree-sitter` 0.25.1, the newest npm release |
| Go | `go-tree-sitter` v0.24.0, the newest release |
| Swift | `swift-tree-sitter` 0.25.0, the newest release |

`node script/check-versions.mjs` fails in CI when any of these pins, the CLI
version or the ABI drifts.

Keywords stay contextual: a JavaScript keyword reads as an identifier wherever
the keyword itself is not valid, so `a?.default` and `<A default />` parse.
`grammar.js` replaces tree-sitter-javascript's reserved-word sets with empty
ones for that reason; in this grammar's ABI 15 parse table they would reserve
the keywords after `?.` and in JSX attributes.

### Queries

`queries/` holds highlights, locals, tags and injections. Each adds Flow
patterns to tree-sitter-javascript's query of the same name, which
`tree-sitter.json` applies first; the files start with `; inherits: javascript`
for editors that read that directive.

## Testing

All numbers are from the pinned suites below, with tree-sitter CLI 0.27.2.

### Every file that Flow accepts parses

A file is in a suite when npm `flow-parser` 0.342.0 or `hermes-parser` 0.37.0
accepts it; the decision is made by running both parsers on each file
(`npm run suites`). Clean means no `ERROR` and no `MISSING` node.

| Suite | Clean | Total |
| --- | ---: | ---: |
| Flow parser tests (`src/parser/test/flow`, valid inputs) | 1206 | 1206 |
| Hermes (`test/Parser/flow`) | 140 | 140 |
| Babel Flow fixtures | 623 | 623 |
| flow-typed `definitions/` | 2556 | 2556 |
| react `@flow` files | 1048 | 1048 |
| react-native `@flow` files | 2151 | 2151 |
| Flow's type checker tests (`tests/`, all JavaScript files) | 5039 | 5039 |
| prettier's Flow formatting tests | 1998 | 1998 |
| relay `packages/` | 2785 | 2785 |
| metro | 570 | 570 |
| stylex | 536 | 536 |

For the last five suites every JavaScript file is a candidate, with or without
`@flow`.

Inputs that both reference parsers reject, and how many of them produce an
`ERROR` or `MISSING` node: Flow parser tests 269 of 563, Hermes 41 of 57,
Babel 117 of 192, flow-typed 2 of 2, Flow's type checker tests 172 of 232,
prettier 23 of 26.

### Hermes comparison

`npm run compare` parses every input with `hermes-parser`, converts the Hermes
ESTree into the tree tree-sitter-flow should produce
([`script/convert.mjs`](script/convert.mjs), names from
[`script/mapping.mjs`](script/mapping.mjs)), parses it with the Node binding
and compares:

- node kinds and ranges (UTF-16 offsets) of all named nodes, except the
  tree-sitter nodes listed in `IGNORED` in `script/mapping.mjs`;
- field names, where both sides have one.

It prints each mismatch with its path, line and column, the expected and
actual node paths and a source excerpt, then a summary per suite. It exits
non-zero on any mismatch.

```sh
npm install
npm run compare                                   # every suite
npm run compare -- --suite corpus --suite hermes  # some suites
npm run compare -- --json                         # machine-readable output
npm run compare -- --max-errors 20                # print at most 20 mismatches
```

Suites: `corpus` (this repository's `test/corpus`), `flow-parser`, `hermes`,
`babel`, `flow-typed`, `react`, `react-native`. The public suites are fetched
into `.cache/suites` at their pinned commits on first use.

| Suite | Compared | Matched | Mismatched | Known differences |
| --- | ---: | ---: | ---: | ---: |
| corpus | 189 | 181 | 0 | 8 |
| flow-parser | 1024 | 1024 | 0 | 0 |
| hermes | 126 | 126 | 0 | 0 |
| babel | 579 | 576 | 0 | 3 |
| flow-typed | 2524 | 2521 | 0 | 3 |
| react | 1048 | 1048 | 0 | 0 |
| react-native | 2147 | 2147 | 0 | 0 |
| flow-tests | 4792 | 4791 | 0 | 1 |
| prettier | 1960 | 1959 | 0 | 1 |
| relay | 2785 | 2785 | 0 | 0 |
| metro | 570 | 570 | 0 | 0 |
| stylex | 536 | 536 | 0 | 0 |

The known differences are listed with the verdicts of flow-parser,
hermes-parser and @babel/parser in
[`script/known-differences.txt`](script/known-differences.txt). In five
inputs Hermes' tree is wrong and tree-sitter-flow follows flow-parser or
Babel: `declare function f(): %checks;`, arrow functions in conditionals in a
Babel fixture and in prettier's tests, `(async) <T>(b) => c`, and
`readonly [T]`, which Hermes and Babel read as an indexed access and
flow-parser as a `readonly` tuple. `f.g<typeof import('a')>('a')` is a call
with a type argument in flow-parser and tree-sitter-flow, and comparisons
around a dynamic import in Hermes and Babel. In five more, an arrow function
body that is a block holding only a labeled statement, `e => { label: 42 }`,
is an object, as in tree-sitter-javascript, where the three parsers read a
block: plain JavaScript keeps tree-sitter-javascript's tree. For the same
reason, a `;` after a comment and a line break where no expression can go on
(`let a // c` then `;`) is an empty statement, and a class member modifier
alone on its line before a member without a Flow type (`static` then
`b() {}`) is a field, as in tree-sitter-javascript; the three parsers end the
statement at the `;` and read the modifier. Before a member with a Flow type
(`declare` then `b: T`), the modifier applies, as in flow-parser and Babel;
Hermes reads a field there.

`npm run compare` also checks every node's range (script/ranges.mjs): no node
takes in the spaces or line breaks after it, and a Flow node ends at its last
token, before any comment that follows.

The converter also corrects Hermes range bugs where the tree agrees with
flow-parser, each gated on the wrong range and counted in the
`hermes-range-fixup` column: a class field key after `declare`, class members
with a private key that Hermes starts after their modifiers (`static #a`),
match case bodies and record property defaults in parentheses, and conditional
types whose check type is in parentheses (`(A) extends B ? C : D`).

For the corpus, `npm run compare` also checks the cases hermes-parser rejects
(constructs it does not support yet, such as constructor types): flow-parser
must accept each of them. 29 of the 218 corpus cases are such cases.

### Generated snippets around `<`

[`script/generated.mjs`](script/generated.mjs) (`npm run generated`) builds a
fixed set of snippets that combine 73 type argument forms, 38 argument lists
and 40 contexts (statements, conditionals, casts, `as`, class fields, `new`,
`extends` and `implements`, JSX), plus comparison chains with parenthesized,
shifted and negated operands and generic arrow functions next to JSX. Every
pair of forms is covered, plus a fixed-seed sample of 4,000 triples. 42 Flow
declarations and statements without a final `;` are also followed by comments
in ten placements, or none, and by five kinds of following line, a `;` after a
line break included. 17 class member modifiers, and `abstract`, come before 8
members with a Flow type, on the same line and on the next. Of the 16,306
snippets, flow-parser accepts 15,806. Each of them must parse with no `ERROR`
or `MISSING` node, read every `<` and every class member as flow-parser does
(the same number of calls with type arguments, comparisons, arrow functions,
JSX elements, type casts, class fields and class methods) and pass the range
checks of `script/ranges.mjs`. All 15,806 do.

### JavaScript CST identity

[`script/js-identity.mjs`](script/js-identity.mjs) (`npm run js-identity`)
checks that plain JavaScript gets exactly tree-sitter-javascript's tree: every
node, named or anonymous, with the same type, field and byte range. An input is
plain JavaScript when tree-sitter-javascript 0.25.0 parses it with no `ERROR`
or `MISSING` node.

| Inputs | Plain JavaScript | Identical | Intentional differences | Other differences |
| --- | ---: | ---: | ---: | ---: |
| tree-sitter-javascript corpus | 115 | 115 | 0 | 0 |
| Files without `@flow` in react, react-native, relay, metro, stylex and prettier's tests | 2097 | 2089 | 8 | 0 |
| Generated JavaScript snippets | 8294 | 8251 | 43 | 0 |

The generated snippets cover 58 expressions in 38 statements; 28 statements
with and without `;` followed by comments in thirteen placements (`//` and
multi-line `/* */` after `}`, after expression statements and after
declarations, several block comments in a row included) and four kinds of
following line; 16 class member modifiers before 16 kinds of member, alone on
their line or not, in classes and object literals; and a `;` after a comment
and a line break for 14 kinds of statement.

The intentional differences, each recognized from the two trees:

- **`await (a)(b)`** awaits the call, as in Flow's parser: Flow code is in ES
  modules, where `await` is a keyword. tree-sitter-javascript calls a function
  named `await`.
- **An arrow function's block body ends the expression.** An arrow function
  cannot be called, indexed or compared directly, so `(`, `[`, a template or
  `<` on the next line after `=> {}` starts a new statement, as in Flow's
  parser.
- **Call type arguments.** `f<T>(x)` and `a < (b) > (c)` are calls with type
  arguments in Flow, where tree-sitter-javascript compares twice.

### JavaScript

tree-sitter-javascript's own corpus at its pinned version passes:
115 of 116 tests (`bash script/js-corpus.sh`). The one excluded test, "Extra
complex literals in expressions", is invalid JavaScript that checks error
recovery; tree-sitter-flow recovers with a different tree.

### Corpus, queries and bindings

`tree-sitter test` runs 218 corpus tests, 19 highlight assertions and 7 tag
assertions. `test/corpus/regressions.txt` puts the regression cases of the
other corpus files into one file, so that they also parse in each other's
context. CI builds and tests the Node, Rust, Python, Go and C (CMake)
bindings on Linux, macOS and Windows, and Swift on macOS; the C test parses
with the tree-sitter 0.27.2 runtime.

### Performance

Parsing the 5755 real-code files of flow-typed, react and react-native
(33.5 MB) takes 4.26 s with tree-sitter-flow and 16.93 s with
tree-sitter-javascript, which spends most of its time recovering from Flow
syntax errors (6.6 s on one file). Parse time is linear: each of the 10 slowest
files, repeated 8 times, takes 7.6 to 8.1 times as long.

| File | Bytes | ms | 8x / 1x |
| --- | ---: | ---: | ---: |
| react/packages/react-devtools-shared/src/backend/fiber/renderer.js | 290563 | 29.68 | 7.77 |
| react/packages/react-server/src/ReactFlightServer.js | 272123 | 29.38 | 7.77 |
| react/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js | 239852 | 27.94 | 7.58 |
| react-native/packages/react-native/flow/dom.js.flow | 194764 | 27.41 | 8.12 |
| react-native/flow-typed/npm/babel-types_v7.x.x.js | 241584 | 27.30 | 8.11 |
| react-native/flow-typed/environment/node.js | 174456 | 27.20 | 7.81 |
| react/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js | 244327 | 25.57 | 7.84 |
| react/packages/react-server/src/ReactFizzServer.js | 234497 | 24.65 | 7.85 |
| react/packages/react-client/src/ReactFlightClient.js | 205375 | 23.22 | 7.82 |
| react-native/packages/react-native/src/private/webapis/intersectionobserver/__tests__/IntersectionObserver-itest.js | 164221 | 21.71 | 7.89 |

### Running the tests

```sh
npm install
tree-sitter test                    # corpus, highlight and tag tests
npm run suites:fetch                # fetch the public suites
npm run suites -- --check --perf    # parse rate, naming check, performance
npm run compare                     # Hermes comparison
npm run generated                   # generated snippets around `<`
npm run js-identity                 # plain JavaScript trees vs tree-sitter-javascript
bash script/js-corpus.sh            # tree-sitter-javascript's corpus
```

### Pinned suites

Fetched by [`script/fetch-suites.sh`](script/fetch-suites.sh), never vendored:

| Repository | Commit | Paths |
| --- | --- | --- |
| facebook/flow | `cd7afc31797c5055890fca501ee0e7cde967ce98` | `src/parser/test/flow/` |
| facebook/hermes | `abd48fb5f5f2fb03496e4391b5ec97b731e406df` | `test/Parser/flow/`, `include/hermes/AST/ESTree.def` |
| babel/babel | `f8345b3dcc7b53142ebaea61ec405259de75e14a` | `packages/babel-parser/test/fixtures/flow/` |
| flow-typed/flow-typed | `c75b7b3fbf3a4c78eee6d0a3349957f808455a91` | `definitions/` |
| facebook/react | `edae846a9a17442c00429f2b15375afbfa0376c9` | `packages/` |
| facebook/react-native | `c3b3eaa37842f6e3cd876978d21ad390a7beb68b` | `*.js`, `*.js.flow` |
| tree-sitter/tree-sitter-javascript | `44c892e0be055ac465d5eeddae6d3e194424e7de` (v0.25.0) | `test/corpus/` |
| facebook/flow | `cd7afc31797c5055890fca501ee0e7cde967ce98` | `tests/` |
| prettier/prettier | `da84d5342bf0cc285136c73709468525bb9c1b01` | `tests/format/flow/`, `tests/format/flow-repo/` |
| facebook/relay | `b875363226015c5ae2663510167b62e6d383462d` | `packages/` |
| facebook/metro | `bd367be2178d42c3548698781e5d12fddaf3447c` | `packages/`, `flow-typed/` |
| facebook/stylex | `7cf34d14a74971e7307ed73a452640a00a1165e8` | `packages/`, `flow-typed/` |

### CI

[`ci.yml`](.github/workflows/ci.yml) runs on pushes and pull requests to
`main`:

| Job | Checks |
| --- | --- |
| Generated parser is up to date | `tree-sitter generate` (CLI 0.27.2, ABI 15) leaves `src/` unchanged; package version, CLI, runtime and ABI pins agree |
| Tests and bindings | `tree-sitter test`; Node, Rust, Python (py-tree-sitter 0.27), Go, C (CMake, runtime 0.27.2) on Linux, macOS, Windows; Swift on macOS |
| Rust crate | `cargo package --locked`, tests of the packaged crate, `cargo publish --dry-run` |
| Parse rate on public suites | every Flow-accepted file parses clean, naming check, linear parse time |
| tree-sitter-javascript corpus | no JavaScript regressions |
| Hermes comparison | `npm run compare` on every suite: no mismatch outside the documented list |
| JavaScript CST identity | `npm run js-identity`: plain JavaScript gets tree-sitter-javascript's exact tree |
| Generated snippets | `npm run generated`: every `<` read as flow-parser reads it |

The Hermes comparison and JavaScript CST identity jobs are meant to be
required checks for `main`.

## Releasing

The version lives in `package.json`, `package-lock.json`, `tree-sitter.json`,
`Cargo.toml`, `Cargo.lock`, `pyproject.toml`, `CMakeLists.txt`, `Makefile` and
the metadata of the ABI 15 parser in `src/parser.c`; CI fails when they differ
(`node script/check-versions.mjs`).

**A. From GitHub.** Actions → Release → Run workflow, and enter the version
without a `v` (for example `0.2.0`).
[`release.yml`](.github/workflows/release.yml) checks that the version is
semver, greater than the current one and not tagged yet, then:

1. runs `tree-sitter version <x>`, `cargo update -p tree-sitter-flow`,
   `npm install --package-lock-only --ignore-scripts` and `tree-sitter generate`,
   which writes the new version into the parser's metadata;
2. checks the versions, that regenerating changed nothing but that metadata,
   and `tree-sitter test`;
3. commits "Release v<x>" as `github-actions[bot]`, creates the annotated tag
   `v<x>`, pushes both to `main` and creates the GitHub release with generated
   notes;
4. publishes the crate to crates.io from the tag, in the `crates` environment,
   with the `CARGO_REGISTRY_TOKEN` secret.

With `dry-run` checked, it does steps 1 and 2, makes the commit and the tag
locally and prints the commit, but pushes, releases and publishes nothing.

**B. By hand.**

```sh
tree-sitter version 0.2.0
cargo update -p tree-sitter-flow
npm install --package-lock-only --ignore-scripts
tree-sitter generate
git commit -am "Release v0.2.0"
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin main v0.2.0
```

Pushing the tag starts [`publish.yml`](.github/workflows/publish.yml), which
checks that the tag matches the crate version and publishes the crate. Tags
pushed by the Release workflow do not start it, since GitHub does not start
workflows for pushes made with `GITHUB_TOKEN`; that workflow publishes the
crate itself. Both skip a version that is already on crates.io, so a version
is never published twice.

**Branch protection.** The Release workflow pushes its commit straight to
`main`. If `main` gets branch protection, allow `github-actions[bot]` to bypass
it, or have the workflow open a pull request with a GitHub App or a
fine-grained token instead: pull requests opened with `GITHUB_TOKEN` do not
run CI.

## License

MIT, see [LICENSE](LICENSE).

### Third-party notices

- `src/scanner.c` is derived from the external scanner of
  [tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript),
  Copyright (c) 2014 Max Brunsfeld, MIT License. The file keeps that notice;
  changes for Flow are marked with `Flow:` comments.
- `grammar.js` extends tree-sitter-javascript's grammar, which is loaded from
  the `tree-sitter-javascript` npm package at build time and is not copied.
- `src/tree_sitter/*.h`, `src/parser.c` and the binding scaffolding in
  `bindings/`, `Cargo.toml`, `pyproject.toml`, `setup.py`, `binding.gyp`,
  `Makefile`, `CMakeLists.txt`, `Package.swift` and `go.mod` are generated by
  the [tree-sitter](https://github.com/tree-sitter/tree-sitter) CLI
  (MIT License).
