; inherits: javascript
;
; Flow additions to tree-sitter-javascript's tags.scm. tree-sitter.json lists
; that file first, so the patterns here take precedence.

(type_alias
  id: (identifier) @name) @definition.type

(opaque_type
  id: (identifier) @name) @definition.type

(interface_declaration
  id: (identifier) @name) @definition.interface

(enum_declaration
  id: (identifier) @name) @definition.enum

(record_declaration
  id: (identifier) @name) @definition.class

(component_declaration
  id: (identifier) @name) @definition.function

(hook_declaration
  id: (identifier) @name) @definition.function

(declare_function
  id: (identifier) @name) @definition.function

(declare_class
  id: (identifier) @name) @definition.class

(declare_component
  id: (identifier) @name) @definition.function

(declare_hook
  id: (identifier) @name) @definition.function

(declare_module
  id: (_) @name) @definition.module

(generic_type_annotation
  id: (identifier) @name) @reference.type

(class_implements
  id: (identifier) @name) @reference.implementation
