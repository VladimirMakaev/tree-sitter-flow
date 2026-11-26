; inherits: javascript
;
; Flow additions to tree-sitter-javascript's locals.scm. tree-sitter.json lists
; that file first, so the patterns here take precedence.

; Scopes
;-------

[
  (component_declaration)
  (hook_declaration)
  (match_expression_case)
  (match_statement_case)
] @local.scope

; Definitions
;------------

(component_parameter
  local: (identifier) @local.definition)

(match_binding_pattern
  id: (identifier) @local.definition)

(match_as_pattern
  target: (identifier) @local.definition)

(type_parameter
  name: (identifier) @local.definition)
