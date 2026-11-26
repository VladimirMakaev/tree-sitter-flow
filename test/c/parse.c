// Smoke test for the C library: loads tree-sitter-flow into the tree-sitter
// runtime it is built with, checks the ABI version and parses Flow code.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <tree_sitter/api.h>

const TSLanguage *tree_sitter_flow(void);

static const char *SOURCE =
    "// @flow\n"
    "import type {Node} from 'react';\n"
    "type Props = {+name: ?string, ...};\n"
    "export default component Greeting(name: string = 'x') renders Node {\n"
    "  const f = <T>(x: T): T => x;\n"
    "  return <div>{f(name)}</div>;\n"
    "}\n"
    "enum Status {Active, Off}\n"
    "const s = match (x) { 1 => 'one', _ => 'other' };\n";

int main(void) {
    const TSLanguage *language = tree_sitter_flow();
    uint32_t abi = ts_language_abi_version(language);
    if (abi != 15) {
        fprintf(stderr, "expected ABI 15, got %u\n", abi);
        return 1;
    }
    TSParser *parser = ts_parser_new();
    if (!ts_parser_set_language(parser, language)) {
        fprintf(stderr, "the runtime rejects the language\n");
        return 1;
    }
    TSTree *tree = ts_parser_parse_string(parser, NULL, SOURCE, (uint32_t)strlen(SOURCE));
    TSNode root = ts_tree_root_node(tree);
    char *text = ts_node_string(root);
    printf("%s\n", text);
    int failed = ts_node_has_error(root) || strcmp(ts_node_type(root), "program") != 0 ||
                 ts_node_named_child_count(root) != 6;
    free(text);
    ts_tree_delete(tree);
    ts_parser_delete(parser);
    if (failed) {
        fprintf(stderr, "unexpected tree\n");
        return 1;
    }
    return 0;
}
