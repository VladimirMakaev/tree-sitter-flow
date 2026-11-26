# Builds tree-sitter-flow's C sources with the tree-sitter runtime (from a
# tree-sitter source checkout) and runs a parse smoke test.
#   cmake -S test/c -B build/c-test -DTREE_SITTER_DIR=<tree-sitter checkout>
#   cmake --build build/c-test && ctest --test-dir build/c-test -C Debug -V
cmake_minimum_required(VERSION 3.13)
project(tree-sitter-flow-c-test LANGUAGES C)

set(TREE_SITTER_DIR "" CACHE PATH "A tree-sitter source checkout")
if(NOT EXISTS "${TREE_SITTER_DIR}/lib/src/lib.c")
  message(FATAL_ERROR "set TREE_SITTER_DIR to a tree-sitter source checkout")
endif()

set(GRAMMAR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../..")

add_library(tree-sitter-runtime STATIC "${TREE_SITTER_DIR}/lib/src/lib.c")
target_include_directories(tree-sitter-runtime
  PUBLIC "${TREE_SITTER_DIR}/lib/include"
  PRIVATE "${TREE_SITTER_DIR}/lib/src")
set_target_properties(tree-sitter-runtime PROPERTIES C_STANDARD 11)

add_executable(parse parse.c "${GRAMMAR_DIR}/src/parser.c" "${GRAMMAR_DIR}/src/scanner.c")
target_include_directories(parse PRIVATE "${GRAMMAR_DIR}/src")
target_link_libraries(parse PRIVATE tree-sitter-runtime)
set_target_properties(parse PROPERTIES C_STANDARD 11)

enable_testing()
add_test(NAME parse COMMAND parse)
