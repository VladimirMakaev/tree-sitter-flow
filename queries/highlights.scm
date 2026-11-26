; inherits: javascript
;
; Flow additions to tree-sitter-javascript's highlights.scm. tree-sitter.json lists
; that file first, so the patterns here take precedence.

; Types
;------

(generic_type_annotation
  id: (identifier) @type)

(generic_type_annotation
  id: (qualified_type_identifier
    id: (identifier) @type))

(qualified_type_identifier
  qualification: (identifier) @module)

[
  (any_type_annotation)
  (mixed_type_annotation)
  (empty_type_annotation)
  (void_type_annotation)
  (null_literal_type_annotation)
  (number_type_annotation)
  (string_type_annotation)
  (boolean_type_annotation)
  (big_int_type_annotation)
  (symbol_type_annotation)
  (never_type_annotation)
  (unknown_type_annotation)
  (undefined_type_annotation)
  (exists_type_annotation)
  (this_type_annotation)
] @type.builtin

(type_alias
  id: (identifier) @type.definition)

(opaque_type
  id: (identifier) @type.definition)

(interface_declaration
  id: (identifier) @type.definition)

(declare_type_alias
  id: (identifier) @type.definition)

(declare_opaque_type
  id: (identifier) @type.definition)

(declare_interface
  id: (identifier) @type.definition)

(declare_class
  id: (identifier) @type.definition)

(enum_declaration
  id: (identifier) @type.definition)

(declare_enum
  id: (identifier) @type.definition)

(record_declaration
  id: (identifier) @type.definition)

(type_parameter
  name: (identifier) @type)

(infer_type_annotation
  (type_parameter
    name: (identifier) @type))

; Functions, components and hooks
;--------------------------------

(component_declaration
  id: (identifier) @function)

(declare_component
  id: (identifier) @function)

(hook_declaration
  id: (identifier) @function)

(declare_hook
  id: (identifier) @function)

(declare_function
  id: (identifier) @function)

; Parameters and properties
;--------------------------

(function_type_param
  name: (identifier) @variable.parameter)

(component_parameter
  local: (identifier) @variable.parameter)

(component_type_parameter
  name: (identifier) @variable.parameter)

(object_type_property
  key: (property_identifier) @property)

(record_declaration_property
  key: (property_identifier) @property)

(enum_defaulted_member
  id: (identifier) @constant)

(enum_string_member
  id: (identifier) @constant)

(enum_number_member
  id: (identifier) @constant)

(enum_boolean_member
  id: (identifier) @constant)

(enum_big_int_member
  id: (identifier) @constant)

(match_wildcard_pattern) @variable.builtin

; Keywords
;---------

[
  "type"
  "opaque"
  "declare"
  "interface"
  "implements"
  "mixins"
  "proto"
  "enum"
  "of"
  "component"
  "hook"
  "match"
  "record"
  "keyof"
  "infer"
  "is"
  "implies"
  "asserts"
  "renders"
  "renders?"
  "renders*"
  "readonly"
  "writeonly"
  "module"
  "exports"
  "%checks"
] @keyword

; Operators and punctuation
;--------------------------

(nullable_type_annotation
  "?" @operator)

(union_type_annotation
  "|" @operator)

(intersection_type_annotation
  "&" @operator)

(variance) @operator

(type_parameter_declaration
  "<" @punctuation.bracket
  ">" @punctuation.bracket)

(type_parameter_instantiation
  "<" @punctuation.bracket
  ">" @punctuation.bracket)

(type_annotation
  ":" @punctuation.delimiter)
