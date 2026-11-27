/*
 * External scanner for tree-sitter-flow.
 *
 * Derived from the external scanner of tree-sitter-javascript
 * (https://github.com/tree-sitter/tree-sitter-javascript, src/scanner.c),
 * which is distributed under the following license:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Max Brunsfeld
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Changes for Flow are marked with "Flow:" comments.
 */

#include "tree_sitter/parser.h"

#include <stdio.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
    HTML_COMMENT,
    LOGICAL_OR,
    ESCAPE_SEQUENCE,
    REGEX_PATTERN,
    JSX_TEXT,
    // Flow: automatic semicolon after a body-less function or method signature.
    // Unlike AUTOMATIC_SEMICOLON it is not inserted before a `{` on the next line.
    FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON,
    // Flow: the `<` that opens a type argument list after an expression, as in
    // `f<T>(x)`, `new C<T>()` or `class A extends B<T> {}`.
    TYPE_ARGUMENTS_OPEN,
    // Flow: automatic semicolon at the end of a statement that ends with a type
    // or a module source, such as `type T = A` or `import x from 'y'`. A type
    // cannot continue with `(`, `[` or a template literal, so a line break
    // before those ends the statement.
    TYPE_AUTOMATIC_SEMICOLON,
    // Flow: the `<` that opens type arguments after `new C`, where `new C<T>`
    // may also end without an argument list.
    NEW_TYPE_ARGUMENTS_OPEN,
    // Flow: like Flow's parser, two class fields on one line need no `;`:
    // `class A { x: string y: number }`.
    CLASS_FIELD_SEPARATOR,
    // Flow: the `{` of `match (x) {`, which must be on the line of the `)`.
    // `match(x)` followed by a block on the next line is a call and a block.
    MATCH_LBRACE,
    // Flow: the `[` of `T[]` and `T[K]`. As in Flow's parser, a `[` on a new
    // line never continues a type: `var a: number` then `[]` is two statements.
    TYPE_LBRACKET,
    // Flow: the `<` of type parameters that start a generic arrow function,
    // `<T>(x) => y`. As in Flow's parser, that is never a JSX element.
    TYPE_PARAMETERS_OPEN,
    // Flow: the `<` of type parameters right after `component` or `hook` in a
    // type, which never starts call type arguments: `x as component<T>()`.
    COMPONENT_TYPE_PARAMETERS_OPEN,
    // Flow: zero-width end of a class field that has neither a type nor a
    // value, before a generator method: `class A { get\n *a() {} }`.
    FIELD_NAME_SEPARATOR,
    // Flow: never produced. It is valid right after the block body of an arrow
    // function, where `(`, `[` or a template on the next line cannot continue
    // the expression, so an automatic semicolon is inserted.
    ARROW_BLOCK_END,
    // Flow: never produced. It is valid right after `await`, which may be an
    // identifier ending a class field or the operator of an await expression;
    // no member separator is inserted there.
    AFTER_AWAIT,
    // Flow: a run of text in a JSX attribute string, `"` or `'` quoted.
    JSX_STRING_FRAGMENT_DOUBLE,
    JSX_STRING_FRAGMENT_SINGLE,
    // Flow: never produced. It is valid where a Flow statement may end, such
    // as after a match statement's `}`: an automatic semicolon there comes
    // before a comment that follows, even where an expression could continue.
    STATEMENT_END,
    // Flow: zero-width, after a class member modifier: the member goes on.
    // See scan_modifier_continues.
    MODIFIER_CONTINUES,
    ASYNC_MODIFIER_CONTINUES,
    ACCESSOR_MODIFIER_CONTINUES,
};

// Flow: see classify_angle.
typedef enum {
    ANGLE_OTHER,     // a comparison, or JSX
    ANGLE_ARGUMENTS, // type arguments
    ANGLE_ARROW,     // the type parameters of a generic arrow function
} AngleKind;

// What classify_angle saw: whether the list closed, the character after the
// closing `>` and the first name, for callers that tell type arguments from JSX.
typedef struct {
    bool closed;
    int32_t after_close;
    char name[32];
} AngleInfo;

static bool classify_angle_impl(TSLexer *lexer, bool after_new, bool arrow_context, AngleKind *kind, AngleInfo *info);
static bool classify_angle(TSLexer *lexer, bool after_new, bool arrow_context, AngleKind *kind);
static bool closing_tag_follows(TSLexer *lexer, const char *name);
static bool is_word_char(int32_t c);
static bool skip_balanced(TSLexer *lexer, int32_t close);
static bool skip_unicode_escape(TSLexer *lexer);
static bool skip_quoted(TSLexer *lexer, int32_t quote);

void *tree_sitter_flow_external_scanner_create(void) { return NULL; }

void tree_sitter_flow_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_flow_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0;
}

void tree_sitter_flow_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool scan_template_chars(TSLexer *lexer) {
    lexer->result_symbol = TEMPLATE_CHARS;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        switch (lexer->lookahead) {
            case '`':
                return has_content;
            case '\0':
                return false;
            case '$':
                advance(lexer);
                if (lexer->lookahead == '{') {
                    return has_content;
                }
                break;
            case '\\':
                return has_content;
            default:
                advance(lexer);
        }
    }
}

typedef enum {
    REJECT,     // Semicolon is illegal, ie a syntax error occurred
    NO_NEWLINE, // Unclear if semicolon will be legal, continue
    ACCEPT,     // Semicolon is legal, assuming a comment was encountered
} WhitespaceResult;

/**
 * @param consume If false, only consume enough to check if comment indicates semicolon-legality
 */
static WhitespaceResult scan_whitespace_and_comments(TSLexer *lexer, bool *scanned_comment, bool consume) {
    bool saw_block_newline = false;

    for (;;) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }

        if (lexer->lookahead == '/') {
            skip(lexer);

            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
                       lexer->lookahead != 0x2029) {
                    skip(lexer);
                }
                *scanned_comment = true;
            } else if (lexer->lookahead == '*') {
                skip(lexer);
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            *scanned_comment = true;

                            if (lexer->lookahead != '/' && !consume) {
                                return saw_block_newline ? ACCEPT : NO_NEWLINE;
                            }

                            break;
                        }
                    } else if (lexer->lookahead == '\n' || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
                        saw_block_newline = true;
                        skip(lexer);
                    } else {
                        skip(lexer);
                    }
                }
            } else {
                return REJECT;
            }
        } else {
            return ACCEPT;
        }
    }
}

// Decides whether a semicolon is inserted before the token at the lookahead,
// once a line terminator has been seen.
// Flow: after `in` at the start of a line, whether it names a new class member
// rather than being the `in` operator: `in: T`, `in?: T`, `in = 1` and, after
// a class field name, a method with a Flow type, `in(): T {}`. Neither the
// operator nor its right operand can start with `:` or `=`.
static bool in_starts_member(TSLexer *lexer, bool field_name) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        skip(lexer);
    }
    int32_t c = lexer->lookahead;
    if (c == ':') {
        return true;
    }
    if (c == '?') {
        skip(lexer);
        return lexer->lookahead == ':';
    }
    if (c == '=') {
        skip(lexer);
        return lexer->lookahead != '=' && lexer->lookahead != '>';
    }
    if (!field_name) {
        return false;
    }
    if (c == '<') {
        return true;
    }
    if (c != '(') {
        return false;
    }
    skip(lexer);
    if (!skip_balanced(lexer, ')')) {
        return false;
    }
    while (iswspace(lexer->lookahead)) {
        skip(lexer);
    }
    return lexer->lookahead == ':';
}

static bool asi_after_line_terminator(TSLexer *lexer, bool after_type, bool field_name, bool after_arrow_block) {
    // Flow: an arrow function cannot be called or indexed directly, so after
    // its block body `(`, `[` and a template on the next line start a new
    // statement: `(a: A) => {}` then `(b: B) => {}`. `<` cannot continue it
    // either: `<T>() => {}` on the next line is another arrow function. The
    // same holds after the
    // return type of a body-less signature, `declare function f(): T`.
    if (after_arrow_block &&
        (lexer->lookahead == '(' || lexer->lookahead == '[' || lexer->lookahead == '`' || lexer->lookahead == '<')) {
        return true;
    }
    // Flow: after a type, a member with a variance sigil on the next line,
    // `+b: T` or `-b?: T`, starts a new member: `a: number` then `+b: number`.
    if (after_type && (lexer->lookahead == '+' || lexer->lookahead == '-')) {
        skip(lexer);
        if (!(iswalpha(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '$')) {
            return false;
        }
        while (is_word_char(lexer->lookahead)) {
            skip(lexer);
        }
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
            skip(lexer);
        }
        if (lexer->lookahead == '?') {
            skip(lexer);
        }
        return lexer->lookahead == ':';
    }
    // Flow: a class field with neither a type nor a value ends at a line break
    // before a generator method: `get` then `*a() {}`.
    if (field_name && lexer->lookahead == '*') {
        lexer->result_symbol = FIELD_NAME_SEPARATOR;
        return true;
    }
    // Flow: after a type, a `[` on a new line starts a new statement.
    if (after_type && lexer->lookahead == '[') {
        return true;
    }
    // Flow: a line that starts with `<` and a name begins type arguments of
    // the previous line's call (`f` then `<T>(x)`), a generic arrow function or
    // a JSX element. Only the first continues the statement.
    if (lexer->lookahead == '<') {
        skip(lexer);
        if (!(iswalpha(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '$')) {
            return false;
        }
        AngleKind kind;
        classify_angle(lexer, true, false, &kind);
        return kind != ANGLE_ARGUMENTS;
    }
    switch (lexer->lookahead) {
        case '`':
        case ',':
        case ':':
        case ';':
        case '*':
        case '%':
        case '>':
        case '<':
        case '=':
        case '[':
        case '(':
        case '?':
        case '^':
        case '|':
        case '&':
        case '/':
            return false;

        // Insert a semicolon before decimals literals but not otherwise.
        case '.':
            skip(lexer);
            return iswdigit(lexer->lookahead);

        // Insert a semicolon before `--` and `++`, but not before binary `+` or `-`.
        case '+':
            skip(lexer);
            return lexer->lookahead == '+';
        case '-':
            skip(lexer);
            return lexer->lookahead == '-';

        // Don't insert a semicolon before `!=`, but do insert one before a unary `!`.
        case '!':
            skip(lexer);
            return lexer->lookahead != '=';

        // Don't insert a semicolon before `in` or `instanceof`, but do insert one
        // before an identifier.
        case 'i':
            skip(lexer);

            if (lexer->lookahead != 'n') {
                return true;
            }
            skip(lexer);

            if (!iswalpha(lexer->lookahead)) {
                // Flow: a class member named `in` with a Flow type starts a new
                // member, as in Flow's parser: `static async` then `in: T`.
                return in_starts_member(lexer, field_name);
            }

            for (unsigned i = 0; i < 8; i++) {
                if (lexer->lookahead != "stanceof"[i]) {
                    return true;
                }
                skip(lexer);
            }

            if (!iswalpha(lexer->lookahead)) {
                return false;
            }
            break;

        default:
            break;
    }

    return true;
}

// `marked`: the end of a zero-width token was already marked before skipped
// whitespace, so the token stays right after the previous token.
static bool scan_automatic_semicolon(TSLexer *lexer, bool comment_condition, bool *scanned_comment, bool after_type,
                                     bool field_name, bool after_arrow_block, bool signature_only, bool marked,
                                     bool *crossed_line) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    *crossed_line = false;
    if (!marked) {
        lexer->mark_end(lexer);
    }

    for (;;) {
        if (lexer->lookahead == 0) {
            return true;
        }

        if (lexer->lookahead == '/') {
            WhitespaceResult result = scan_whitespace_and_comments(lexer, scanned_comment, false);
            if (result == REJECT) {
                return false;
            }

            // Flow: after a type, a comment that spans a line terminator acts like a
            // newline, so the next token still decides, as in `| A // comment`
            // followed by `| B`.
            if (result == ACCEPT && comment_condition) {
                *crossed_line = true;
                if (scan_whitespace_and_comments(lexer, scanned_comment, true) == REJECT) {
                    return false;
                }
                // As in tree-sitter-javascript, where no expression can go on,
                // the semicolon goes before the comment unless a `,` or `=`
                // follows: in `let a // c` then `;`, the `;` is an empty
                // statement. Unlike there, the next token decides also after a
                // block comment followed by spaces: `let a /* c\n */ = 1`.
                if (!after_type && !field_name && !signature_only) {
                    return lexer->lookahead != ',' && lexer->lookahead != '=';
                }
                return asi_after_line_terminator(lexer, after_type, field_name, after_arrow_block);
            }

            // Flow: after an expression, a `!` after a comment that spans a line
            // terminator is a prefix negation, not a non-null assertion. Only
            // spaces are skipped here: a line break that follows is handled
            // below, as in tree-sitter-javascript.
            if (result == ACCEPT) {
                bool skipped = false;
                while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
                    skip(lexer);
                    skipped = true;
                }
                if (lexer->lookahead == '!') {
                    skip(lexer);
                    return lexer->lookahead != '=';
                }
                // Another comment may follow: `} /* a\n */ /* b\n */`.
                if (skipped) {
                    continue;
                }
            }
        }

        if (lexer->lookahead == '}') {
            return true;
        }

        if (lexer->is_at_included_range_start(lexer)) {
            return true;
        }

        if (lexer->lookahead == '\n' || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
            break;
        }

        if (!iswspace(lexer->lookahead)) {
            return false;
        }

        skip(lexer);
    }

    skip(lexer);
    *crossed_line = true;

    if (scan_whitespace_and_comments(lexer, scanned_comment, true) == REJECT) {
        return false;
    }

    return asi_after_line_terminator(lexer, after_type, field_name, after_arrow_block);
}

static bool skip_trivia(TSLexer *lexer);

static bool scan_ternary_qmark(TSLexer *lexer) {
    for (;;) {
        if (!iswspace(lexer->lookahead)) {
            break;
        }
        skip(lexer);
    }

    if (lexer->lookahead == '?') {
        advance(lexer);

        if (lexer->lookahead == '?') {
            return false;
        }

        lexer->mark_end(lexer);
        lexer->result_symbol = TERNARY_QMARK;

        // Flow: `?` followed by `:`, `)` or `,` marks an optional parameter,
        // not a conditional expression, also with comments in between.
        if (!skip_trivia(lexer)) {
            // A regular expression or a division.
            return true;
        }
        if (lexer->lookahead == ':' || lexer->lookahead == ')' || lexer->lookahead == ',' ||
            lexer->lookahead == '=') {
            return false;
        }

        if (lexer->lookahead == '.') {
            advance(lexer);
            if (iswdigit(lexer->lookahead)) {
                return true;
            }
            return false;
        }
        return true;
    }
    return false;
}

static bool scan_html_comment(TSLexer *lexer) {
    while (iswspace(lexer->lookahead) || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
        skip(lexer);
    }

    const char *comment_start = "<!--";
    const char *comment_end = "-->";

    if (lexer->lookahead == '<') {
        for (unsigned i = 0; i < 4; i++) {
            if (lexer->lookahead != comment_start[i]) {
                return false;
            }
            advance(lexer);
        }
    } else if (lexer->lookahead == '-') {
        for (unsigned i = 0; i < 3; i++) {
            if (lexer->lookahead != comment_end[i]) {
                return false;
            }
            advance(lexer);
        }
    } else {
        return false;
    }

    while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
           lexer->lookahead != 0x2029) {
        advance(lexer);
    }

    lexer->result_symbol = HTML_COMMENT;
    lexer->mark_end(lexer);

    return true;
}

// Flow: whether a character reference, `&amp;`, `&#163;` or `&#xA3;`,
// starts at the `&` just consumed. Consumes what it reads.
static bool scan_character_reference_rest(TSLexer *lexer) {
    unsigned n = 0;
    if (lexer->lookahead == '#') {
        advance(lexer);
        if (lexer->lookahead == 'x' || lexer->lookahead == 'X') {
            advance(lexer);
            while (iswxdigit(lexer->lookahead) && n < 6) {
                advance(lexer);
                n++;
            }
        } else {
            while (iswdigit(lexer->lookahead) && n < 5) {
                advance(lexer);
                n++;
            }
        }
    } else {
        while (((lexer->lookahead >= 'a' && lexer->lookahead <= 'z') ||
                (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z')) &&
               n < 30) {
            advance(lexer);
            n++;
        }
    }
    return n > 0 && lexer->lookahead == ';';
}

// Flow: checks whether the text after `&` forms an HTML character reference.
static bool at_character_reference(TSLexer *lexer) {
    advance(lexer);
    return scan_character_reference_rest(lexer);
}

static bool scan_jsx_text(TSLexer *lexer) {
    // saw_text will be true if we see any non-whitespace content, or any whitespace content that is not a newline and
    // does not immediately follow a newline.
    bool saw_text = false;
    // at_newline will be true if we are currently at a newline, or if we are at whitespace that is not a newline but
    // immediately follows a newline.
    bool at_newline = false;

    // Flow: like Flow's parser, `>` and `}` inside JSX text are plain text, and
    // so is an `&` that does not start a character reference.
    lexer->mark_end(lexer);
    while (lexer->lookahead != 0 && lexer->lookahead != '<' && lexer->lookahead != '{') {
        if (lexer->lookahead == '&') {
            lexer->mark_end(lexer);
            if (at_character_reference(lexer)) {
                lexer->result_symbol = JSX_TEXT;
                return saw_text;
            }
            saw_text = true;
            at_newline = false;
            lexer->mark_end(lexer);
            continue;
        }
        bool is_wspace = iswspace(lexer->lookahead);
        if (lexer->lookahead == '\n') {
            at_newline = true;
        } else {
            // If at_newline is already true, and we see some whitespace, then it must stay true.
            // Otherwise, it should be false.
            //
            // See the table below to determine the logic for computing `saw_text`.
            //
            // |------------------------------------|
            // | at_newline | is_wspace | saw_text  |
            // |------------|-----------|-----------|
            // | false (0)  | false (0) | true  (1) |
            // | false (0)  | true  (1) | true  (1) |
            // | true  (1)  | false (0) | true  (1) |
            // | true  (1)  | true  (1) | false (0) |
            // |------------------------------------|

            at_newline &= is_wspace;
            if (!at_newline) {
                saw_text = true;
            }
        }

        advance(lexer);
        lexer->mark_end(lexer);
    }

    lexer->result_symbol = JSX_TEXT;
    return saw_text;
}

// Flow: skips a string or template literal body inside a type argument list.
static bool skip_template(TSLexer *lexer);
static bool skip_quoted(TSLexer *lexer, int32_t quote);

// Flow: skips to the `close` that matches, past nested brackets, strings,
// template literals and comments. The lookahead is after the opening bracket.
static bool skip_balanced(TSLexer *lexer, int32_t close) {
    unsigned depth = 0;
    for (unsigned steps = 0; steps < 100000; steps++) {
        int32_t c = lexer->lookahead;
        if (c == 0) {
            return false;
        }
        if (c == '"' || c == '\'') {
            if (!skip_quoted(lexer, c)) {
                return false;
            }
            continue;
        }
        if (c == '`') {
            if (!skip_template(lexer)) {
                return false;
            }
            continue;
        }
        if (c == '/') {
            advance(lexer);
            if (lexer->lookahead == '/') {
                while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
                    advance(lexer);
                }
            } else if (lexer->lookahead == '*') {
                advance(lexer);
                for (;;) {
                    if (lexer->lookahead == 0) {
                        return false;
                    }
                    int32_t d = lexer->lookahead;
                    advance(lexer);
                    if (d == '*' && lexer->lookahead == '/') {
                        advance(lexer);
                        break;
                    }
                }
            }
            continue;
        }
        if (c == '(' || c == '[' || c == '{') {
            depth++;
        } else if (c == ')' || c == ']' || c == '}') {
            if (depth == 0) {
                if (c != close) {
                    return false;
                }
                advance(lexer);
                return true;
            }
            depth--;
        }
        advance(lexer);
    }
    return false;
}

// Flow: skips a template literal, `${...}` substitutions and nested templates
// included. The lookahead is the opening backtick.
static bool skip_template(TSLexer *lexer) {
    advance(lexer);
    for (unsigned steps = 0; steps < 100000; steps++) {
        int32_t c = lexer->lookahead;
        if (c == 0) {
            return false;
        }
        if (c == '\\') {
            advance(lexer);
            if (lexer->lookahead != 0) {
                advance(lexer);
            }
            continue;
        }
        advance(lexer);
        if (c == '`') {
            return true;
        }
        if (c == '$' && lexer->lookahead == '{') {
            advance(lexer);
            if (!skip_balanced(lexer, '}')) {
                return false;
            }
        }
    }
    return false;
}

static bool skip_quoted(TSLexer *lexer, int32_t quote) {
    if (quote == '`') {
        return skip_template(lexer);
    }
    advance(lexer);
    while (lexer->lookahead != 0) {
        if (lexer->lookahead == '\\') {
            advance(lexer);
            if (lexer->lookahead != 0) {
                advance(lexer);
            }
            continue;
        }
        if (lexer->lookahead == quote) {
            advance(lexer);
            return true;
        }
        if (quote != '`' && lexer->lookahead == '\n') {
            return false;
        }
        advance(lexer);
    }
    return false;
}

// Flow: skips whitespace and comments. Returns false on a `/` that does not
// start a comment.
static bool skip_trivia(TSLexer *lexer) {
    for (;;) {
        while (iswspace(lexer->lookahead)) {
            advance(lexer);
        }
        if (lexer->lookahead != '/') {
            return true;
        }
        advance(lexer);
        if (lexer->lookahead == '/') {
            while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
                advance(lexer);
            }
        } else if (lexer->lookahead == '*') {
            advance(lexer);
            for (;;) {
                if (lexer->lookahead == 0) {
                    return false;
                }
                if (lexer->lookahead == '*') {
                    advance(lexer);
                    if (lexer->lookahead == '/') {
                        advance(lexer);
                        break;
                    }
                } else {
                    advance(lexer);
                }
            }
        } else {
            return false;
        }
    }
}

static bool is_word_char(int32_t c) { return iswalnum(c) || c == '_' || c == '$'; }

// Flow: consumes `word` and checks that it ends there.
static bool scan_word(TSLexer *lexer, const char *word) {
    for (unsigned i = 0; word[i]; i++) {
        if (lexer->lookahead != word[i]) {
            return false;
        }
        advance(lexer);
    }
    return !is_word_char(lexer->lookahead);
}

// Flow: whether a type can have `(` right after this word: component and
// hook types, type operators, constructor types and `import('a')` types.
static bool type_word_before_paren(const char *word) {
    static const char *const words[] = {"component", "hook",  "renders", "keyof",   "extends", "is",
                                        "implies",   "asserts", "readonly", "infer", "new",     "typeof",
                                        "import"};
    for (unsigned i = 0; i < sizeof(words) / sizeof(words[0]); i++) {
        if (strcmp(word, words[i]) == 0) {
            return true;
        }
    }
    return false;
}

// Flow: skips the rest of a regular expression literal after its opening `/`,
// classes and escapes included, then its flags. Returns false at a line end.
static bool skip_regex_body(TSLexer *lexer) {
    bool in_class = false;
    for (unsigned steps = 0; steps < 4096; steps++) {
        int32_t c = lexer->lookahead;
        if (c == 0 || c == '\n' || c == '\r') {
            return false;
        }
        advance(lexer);
        if (c == '\\') {
            if (lexer->lookahead == 0 || lexer->lookahead == '\n') {
                return false;
            }
            advance(lexer);
        } else if (c == '[') {
            in_class = true;
        } else if (c == ']') {
            in_class = false;
        } else if (c == '/' && !in_class) {
            while (is_word_char(lexer->lookahead)) {
                advance(lexer);
            }
            return true;
        }
    }
    return false;
}

// Flow: decides whether the `<` at the lookahead opens a type argument list.
// Like Flow's own parser, `a<b>(c)` is a call with type arguments. The scan
// looks for the matching `>` while only accepting characters that can occur in
// a type, then requires `(`, a template literal, `{` or `implements` after it.

static bool classify_angle(TSLexer *lexer, bool after_new, bool arrow_context, AngleKind *kind) {
    *kind = ANGLE_OTHER;
    bool result = classify_angle_impl(lexer, after_new, arrow_context, kind, NULL);
    if (result) {
        *kind = ANGLE_ARGUMENTS;
    }
    return result;
}

static bool scan_type_arguments_open(TSLexer *lexer, bool after_new) {
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = after_new ? NEW_TYPE_ARGUMENTS_OPEN : TYPE_ARGUMENTS_OPEN;
    AngleKind kind;
    return classify_angle(lexer, after_new, false, &kind);
}

// Called after a `<`. Scans ahead to classify it; returns true for type
// arguments.

// Flow: whether a closing tag `</name` follows on the same line.
// `<T>(x) => y` is a generic arrow function unless it can be a JSX element
// with that text: `<T>() => 3</T>` is JSX, as in Flow's parser and Hermes.
static bool closing_tag_follows(TSLexer *lexer, const char *name) {
    if (name[0] == 0) {
        return false;
    }
    // Look on the same line only, up to a `;`: `(<T>() => 3</T>)`. This keeps
    // the lookahead short for the common generic arrow function.
    for (unsigned steps = 0; steps < 1024 && lexer->lookahead != 0; steps++) {
        if (lexer->lookahead == '\n' || lexer->lookahead == ';') {
            return false;
        }
        if (lexer->lookahead != '<') {
            advance(lexer);
            continue;
        }
        advance(lexer);
        if (lexer->lookahead != '/') {
            continue;
        }
        advance(lexer);
        while (iswspace(lexer->lookahead)) {
            advance(lexer);
        }
        unsigned i = 0;
        while (name[i] != 0 && lexer->lookahead == name[i]) {
            advance(lexer);
            i++;
        }
        if (name[i] == 0 && !is_word_char(lexer->lookahead)) {
            return true;
        }
    }
    return false;
}

static bool is_type_end(int32_t c) {
    return c == 'a' || c == ')' || c == ']' || c == '}' || c == '>' || c == '*' || c == '"';
}

// Flow: scans what follows a `<`, without consuming the `<` itself (the token
// end is marked before), and classifies it:
//   - ANGLE_ARGUMENTS: type arguments, `f<T>(x)`, `new C<T>`, `B<T> {`;
//   - ANGLE_ARROW: the type parameters of a generic arrow function,
//     `<T>(x) => y` or `<T>(x): R => y`;
//   - ANGLE_OTHER: anything else, such as a comparison or a JSX element.
// Returns true for ANGLE_ARGUMENTS.
static bool classify_angle_impl(TSLexer *lexer, bool after_new, bool arrow_context, AngleKind *kind, AngleInfo *info) {
    if (lexer->lookahead == '=') {
        return false;
    }

    unsigned angle = 1;
    unsigned paren = 0;
    unsigned bracket = 0;
    unsigned brace = 0;
    // Syntax that type parameters take and type arguments do not, such as a
    // default `<T = D>` or a bound `<T: B>`.
    bool params_only = false;
    // `extends` at the top level: the `?` and `:` of a conditional type follow.
    bool conditional = false;
    // The last significant character, with every word or number as `a`.
    int32_t prev = '<';
    // The first word, which a JSX reading would take as the tag name.
    char name[32] = {0};
    // The last word, to tell `renders?` and `extends 1` apart.
    char last_word[16] = {0};
    // Whether the content is empty, `<>`: never type parameters.
    bool empty = true;
    // The `<` just seen opens type parameters, which start with a name.
    bool expect_parameter = false;
    // For each open parenthesis, whether a `:` appeared at its own level.
    // A type in parentheses with a `:` is a function type, followed by `=>`,
    // unless it is the parameter list of a component type.
    uint32_t paren_colon = 0;
    uint32_t paren_component = 0;
    // The angle depth at each open parenthesis, so that the commas of
    // `(A<B, C>)` do not count.
    unsigned paren_angle[32] = {0};
    // The angle depth of a component type's type parameters,
    // `component<T>(a: T)`, and whether they just closed.
    unsigned component_angle = 0;
    bool component_params_next = false;
    for (unsigned steps = 0; steps < 100000; steps++) {
        int32_t c = lexer->lookahead;
        bool top = paren == 0 && bracket == 0 && brace == 0;
        if (c == 0) {
            return false;
        }
        if (iswspace(c)) {
            advance(lexer);
            continue;
        }
        if (c != '>' && c != '/') {
            empty = false;
        }
        if (expect_parameter && !(iswalpha(c) || c == '_' || c == '$' || c > 127 || c == '+' || c == '-')) {
            return false;
        }
        expect_parameter = false;
        if (iswdigit(c)) {
            // A number follows an operator or an opening bracket in a type, or
            // `extends` and `is`: `A<1 | 2>`, `T extends 0 ? A : B`. After a
            // value it is an operand of an expression: `b << 16 >> 0`.
            if (is_type_end(prev) && !(prev == 'a' && (strcmp(last_word, "extends") == 0 || strcmp(last_word, "is") == 0))) {
                return false;
            }
        }
        if (iswalpha(c) || c == '_' || c == '$' || c > 127 || iswdigit(c)) {
            bool first = prev == '<' && angle == 1 && name[0] == 0;
            char word[32];
            unsigned length = 0;
            while (is_word_char(lexer->lookahead) || lexer->lookahead == '.') {
                if (length < sizeof(word) - 1) {
                    word[length] = (char)lexer->lookahead;
                }
                length++;
                advance(lexer);
            }
            word[length < sizeof(word) ? length : sizeof(word) - 1] = 0;
            if (first && length < sizeof(name)) {
                strcpy(name, word);
            }
            if (length < sizeof(last_word)) {
                strcpy(last_word, word);
            } else {
                last_word[0] = 0;
            }
            if (top && length == 7 && strcmp(word, "extends") == 0) {
                conditional = true;
            }
            prev = 'a';
            continue;
        }
        switch (c) {
            case '<':
                // After a type, `<` opens type arguments; elsewhere, as in
                // `A<<T>(x: T) => T>`, it opens type parameters.
                expect_parameter = !is_type_end(prev);
                angle++;
                if (prev == 'a' && strcmp(last_word, "component") == 0) {
                    component_angle = angle;
                }
                advance(lexer);
                break;
            case '>':
                advance(lexer);
                if (component_angle == angle) {
                    component_angle = 0;
                    component_params_next = true;
                    angle--;
                    prev = '>';
                    continue;
                }
                angle--;
                if (angle == 0) {
                    if (paren != 0 || bracket != 0 || brace != 0) {
                        return false;
                    }
                    goto after_close;
                }
                break;
            case '=':
                advance(lexer);
                if (lexer->lookahead == '>') {
                    // The arrow of a function type.
                    advance(lexer);
                    prev = '=';
                    continue;
                }
                if (!top) {
                    return false;
                }
                params_only = true;
                break;
            case '(':
                // In a type, a name is followed by `(` only in a component or
                // hook type, after a type operator or in an object type method:
                // in `a < f(b) > (c)`, the `<` compares.
                if (prev == 'a' && brace == 0 && !type_word_before_paren(last_word)) {
                    return false;
                }
                if (paren < 32) {
                    paren_angle[paren] = angle;
                    paren_colon &= ~(1u << paren);
                    paren_component &= ~(1u << paren);
                    if ((prev == 'a' && strcmp(last_word, "component") == 0) || (prev == '>' && component_params_next)) {
                        paren_component |= 1u << paren;
                    }
                }
                paren++;
                advance(lexer);
                // `()` is a parameter list.
                if (!skip_trivia(lexer)) {
                    return false;
                }
                if (lexer->lookahead == ')' && paren <= 32) {
                    paren_colon |= 1u << (paren - 1);
                }
                prev = '(';
                continue;
            case ')':
                if (paren == 0) {
                    return false;
                }
                paren--;
                advance(lexer);
                if (paren < 32 && (paren_colon & (1u << paren)) && !(paren_component & (1u << paren)) && brace == 0 &&
                    bracket == 0) {
                    // `(a: T)` must be the parameters of a function type.
                    if (!skip_trivia(lexer)) {
                        return false;
                    }
                    if (lexer->lookahead != '=') {
                        return false;
                    }
                    advance(lexer);
                    if (lexer->lookahead != '>') {
                        return false;
                    }
                    advance(lexer);
                    prev = '=';
                    continue;
                }
                break;
            case '[':
                bracket++;
                advance(lexer);
                break;
            case ']':
                if (bracket == 0) {
                    return false;
                }
                bracket--;
                advance(lexer);
                break;
            case '{':
                brace++;
                advance(lexer);
                break;
            case '}':
                if (brace == 0) {
                    return false;
                }
                brace--;
                advance(lexer);
                break;
            case ';':
                if (brace == 0) {
                    return false;
                }
                advance(lexer);
                break;
            case '&':
            case '|':
                advance(lexer);
                if (lexer->lookahead == c && brace == 0) {
                    return false;
                }
                break;
            case '"':
            case '\'':
            case '`':
                if (!skip_quoted(lexer, c)) {
                    return false;
                }
                prev = '"';
                continue;
            case '/':
                if (!skip_trivia(lexer)) {
                    return false;
                }
                continue;
            case ',':
                // A comma in parentheses separates the parameters of a
                // function type: `(a, b) => c`, but in `a < (b, c) > (d)` the
                // `<` compares.
                if (paren > 0 && paren <= 32 && brace == 0 && bracket == 0 && angle == paren_angle[paren - 1]) {
                    paren_colon |= 1u << (paren - 1);
                }
                advance(lexer);
                break;
            case '-':
                // A negative number literal type, `-1`.
                advance(lexer);
                if (iswdigit(lexer->lookahead)) {
                    break;
                }
                // fall through: a variance sigil.
                if (prev == '{' || prev == ',' || prev == ';' || prev == '[' || prev == '<') {
                    if (top) {
                        params_only = true;
                    }
                    break;
                }
                return false;
            case '+':
                // A variance sigil: `{+a: T}`, `[+a: T]`, `<+T>`.
                if (prev == '{' || prev == ',' || prev == ';' || prev == '[' || prev == '<') {
                    if (top) {
                        params_only = true;
                    }
                    advance(lexer);
                    break;
                }
                return false;
            case '?':
                advance(lexer);
                // `T?.[K]`, an optional indexed access.
                if (lexer->lookahead == '.') {
                    advance(lexer);
                    prev = '.';
                    continue;
                }
                // `renders? T`.
                if (prev == 'a' && strcmp(last_word, "renders") == 0) {
                    break;
                }
                // `?T` follows an operator or an opening bracket. After a type,
                // `?` is only valid in a conditional type, `A extends B ? C : D`;
                // in `(b) < (c) ? d : e`, the `<` compares.
                if (top && is_type_end(prev) && !conditional) {
                    return false;
                }
                break;
            case ':':
                // At the top level, `:` is a bound or belongs to a conditional type.
                if (top && !conditional) {
                    params_only = true;
                }
                if (paren > 0 && paren <= 32 && brace == 0 && bracket == 0) {
                    paren_colon |= 1u << (paren - 1);
                }
                advance(lexer);
                break;
            case '@':
                // `@@iterator` keys in object types.
                if (brace == 0) {
                    return false;
                }
                advance(lexer);
                break;
            case '!':
            case '%':
            case '^':
            case '~':
                return false;
            default:
                advance(lexer);
                break;
        }
        prev = c;
        if (c != '>') {
            component_params_next = false;
        }
    }
    return false;

after_close:
    if (!skip_trivia(lexer)) {
        return false;
    }
    if (info) {
        info->closed = true;
        info->after_close = lexer->lookahead;
        strcpy(info->name, name);
    }
    // `f<>(...)`, `B<> {`, `B<> implements I`: empty type arguments. Type
    // parameters cannot be empty. In a type, `A<>` takes the `<` token.
    if (empty) {
        switch (lexer->lookahead) {
            case '(':
            case '`':
            case '{':
                return true;
            case 'i':
                return scan_word(lexer, "implements");
            default:
                return after_new && lexer->lookahead != '=';
        }
    }
    switch (lexer->lookahead) {
        case '(': {
            // Scan the argument or parameter list. `a < b > (c: T)` compares
            // with a type cast, as in Flow, but a `:` after a `)` starts the
            // return type of a function in the arguments: `f<A>((): B => c)`.
            advance(lexer);
            unsigned depth = 1;
            bool question = false;
            bool cast_colon = false;
            bool after_paren = false;
            // The last significant character, with words and numbers as `a`,
            // to tell a regular expression from a division.
            int32_t last = '(';
            for (unsigned steps = 0; steps < 100000; steps++) {
                int32_t c = lexer->lookahead;
                if (c == 0) {
                    return !cast_colon && !params_only;
                }
                if (iswspace(c)) {
                    advance(lexer);
                    continue;
                }
                if (c == '"' || c == '\'' || c == '`') {
                    if (!skip_quoted(lexer, c)) {
                        return !cast_colon && !params_only;
                    }
                    after_paren = false;
                    last = '"';
                    continue;
                }
                if (c == '/') {
                    if (!skip_trivia(lexer)) {
                        // A division, or a regular expression after an operator
                        // or an opening bracket: `f<T>(/:/)`.
                        if (!(last == 'a' || last == ')' || last == ']' || last == '}' || last == '"')) {
                            if (!skip_regex_body(lexer)) {
                                return !cast_colon && !params_only;
                            }
                            last = 'a';
                        } else {
                            last = '/';
                        }
                        after_paren = false;
                    }
                    continue;
                }
                last = is_word_char(c) ? 'a' : c;
                advance(lexer);
                if (c == '(' || c == '[' || c == '{') {
                    depth++;
                    after_paren = false;
                } else if (c == ')' || c == ']' || c == '}') {
                    if (--depth == 0) {
                        break;
                    }
                    after_paren = depth == 1 && c == ')';
                } else if (depth == 1 && c == '?') {
                    question = true;
                    after_paren = false;
                } else if (depth == 1 && c == ':') {
                    if (!question && !after_paren) {
                        cast_colon = true;
                    }
                    after_paren = false;
                } else {
                    after_paren = false;
                }
            }
            bool arguments = !cast_colon && !params_only;
            // After an expression, type arguments followed by an argument list
            // make a call, whatever follows: `c ? f<T>() : d => e`, as in Flow's
            // parser. Only a generic arrow function looks further.
            if (!skip_trivia(lexer)) {
                return arguments;
            }
            if (!arrow_context) {
                // A call cannot be followed by `=>`: in `(a) <T>(b) => c`, which
                // Flow rejects, the `<` compares, as in tree-sitter-javascript.
                if (lexer->lookahead == '=') {
                    advance(lexer);
                    if (lexer->lookahead == '>') {
                        return false;
                    }
                }
                return arguments;
            }
            if (lexer->lookahead == '=') {
                advance(lexer);
                if (lexer->lookahead == '>') {
                    advance(lexer);
                    *kind = closing_tag_follows(lexer, name) ? ANGLE_OTHER : ANGLE_ARROW;
                    return false;
                }
                return arguments;
            }
            if (lexer->lookahead == ':') {
                // A return type: look for `=>` before the expression ends. A
                // `{` right after a type is a function body.
                advance(lexer);
                unsigned nest = 0;
                int32_t last = ':';
                for (unsigned steps = 0; steps < 100000; steps++) {
                    int32_t c = lexer->lookahead;
                    if (c == 0) {
                        return arguments;
                    }
                    if (iswspace(c)) {
                        advance(lexer);
                        continue;
                    }
                    if (c == '"' || c == '\'' || c == '`') {
                        if (!skip_quoted(lexer, c)) {
                            return arguments;
                        }
                        last = '"';
                        continue;
                    }
                    if (c == '/') {
                        if (!skip_trivia(lexer)) {
                            return arguments;
                        }
                        continue;
                    }
                    if (c == '{' && nest == 0 && is_type_end(last)) {
                        return arguments;
                    }
                    advance(lexer);
                    if (c == '(' || c == '[' || c == '{' || c == '<') {
                        nest++;
                    } else if (c == ')' || c == ']' || c == '}' || c == '>') {
                        if (nest == 0) {
                            return arguments;
                        }
                        nest--;
                    } else if (c == '=' && lexer->lookahead == '>') {
                        if (nest == 0) {
                            advance(lexer);
                            *kind = closing_tag_follows(lexer, name) ? ANGLE_OTHER : ANGLE_ARROW;
                            return false;
                        }
                        advance(lexer);
                    } else if ((c == ';' || c == ',') && nest == 0) {
                        return arguments;
                    }
                    last = is_word_char(c) ? 'a' : c;
                }
                return arguments;
            }
            return arguments;
        }
        case '{':
            return !params_only;
        // `new C<T>;` A comparison cannot end right after `>`.
        case ';':
        case ')':
        case ']':
        case '}':
        case ',':
        case 0:
            return after_new && !params_only;
        case 'i':
            return scan_word(lexer, "implements") && !params_only;
        default:
            return false;
    }
}

// Flow: see CLASS_FIELD_SEPARATOR. Called with the lookahead on the next token
// of the same line; the separator is zero-width.
// Flow: the end of a class field before another member on the same line,
// `class A { x: T y() {} }` or `class A { a = 1 b() {} }`, as in Flow's parser.
// The lookahead is the first character after the field.
// Flow: consumes a number key, `1`, `.1`, `1.`, `1e-3`, `0x1`, `1n`, `1_000`.
static void skip_number(TSLexer *lexer) {
    if (lexer->lookahead == '.') {
        advance(lexer);
    }
    for (;;) {
        int32_t d = lexer->lookahead;
        if (d == 'e' || d == 'E') {
            advance(lexer);
            if (lexer->lookahead == '+' || lexer->lookahead == '-') {
                advance(lexer);
            }
            continue;
        }
        if (!(is_word_char(d) || d == '.')) {
            return;
        }
        advance(lexer);
    }
}

// Flow: whether what follows a class member key starts the rest of a member:
// `(`, `:`, `<`, `?`, `!`, or `=` that is not `=>` or `==`.
static bool member_rest_follows(TSLexer *lexer) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        advance(lexer);
    }
    int32_t c = lexer->lookahead;
    if (c == '=') {
        // `c => d` is an arrow function, `a = async c => c`.
        advance(lexer);
        return lexer->lookahead != '>' && lexer->lookahead != '=';
    }
    return c == '(' || c == ':' || c == '<' || c == '?' || c == '!';
}

// Flow: whether a word continues an expression or a type rather than naming a
// member. `function` continues `async`: `a = async function* () {}`.
static bool is_continuation_word(const char *word) {
    static const char *const continuations[] = {"in", "instanceof", "as", "satisfies", "extends", "is", "function"};
    for (unsigned i = 0; i < sizeof(continuations) / sizeof(continuations[0]); i++) {
        if (strcmp(word, continuations[i]) == 0) {
            return true;
        }
    }
    return false;
}

// Flow: consumes a name, with `\u` escapes and non-ASCII characters, into
// `word` (empty when escaped or too long). Returns false on a bad escape.
static bool scan_member_name(TSLexer *lexer, char *word, unsigned size) {
    unsigned n = 0;
    bool plain = true;
    for (;;) {
        int32_t d = lexer->lookahead;
        if (d == '\\') {
            advance(lexer);
            if (!skip_unicode_escape(lexer)) {
                return false;
            }
            plain = false;
            continue;
        }
        if (!(is_word_char(d) || d > 127)) {
            break;
        }
        if (n < size - 1) {
            word[n] = (char)d;
        }
        n++;
        advance(lexer);
    }
    if (!plain || n >= size) {
        n = 0;
    }
    word[n] = 0;
    return true;
}

static bool scan_class_field_separator(TSLexer *lexer, const bool *valid_symbols) {
    int32_t c = lexer->lookahead;
    // After a type, nothing goes on with `+`, `-`, `in` or `instanceof`.
    bool after_type = valid_symbols[TYPE_LBRACKET];
    lexer->result_symbol = CLASS_FIELD_SEPARATOR;
    if (c == '*') {
        // A generator method, unless an expression may continue: `a = b * c`.
        return !valid_symbols[LOGICAL_OR];
    }
    if ((c == '+' || c == '-') && after_type) {
        // A variance sigil: `a: T +b: T`.
        return true;
    }
    // A string or a number key, `'b'() {}` or `1: T`: neither an expression
    // nor a type goes on with one.
    if (c == '"' || c == '\'' || iswdigit(c) || c == '.') {
        if (c == '.') {
            advance(lexer);
            if (!iswdigit(lexer->lookahead)) {
                return false;
            }
            skip_number(lexer);
        } else if (c == '"' || c == '\'') {
            if (!skip_quoted(lexer, c)) {
                return false;
            }
        } else {
            skip_number(lexer);
        }
        return member_rest_follows(lexer);
    }
    // A name, with `\u` escapes and non-ASCII characters too.
    if (!(iswalpha(c) || c == '_' || c == '$' || c == '#' || c == '\\' || c > 127)) {
        return false;
    }
    char word[16];
    if (c == '#') {
        advance(lexer);
    }
    if (!scan_member_name(lexer, word, sizeof(word))) {
        return false;
    }
    if (is_continuation_word(word)) {
        // After a type, `in` and `instanceof` name a member: `a: T in: U`.
        bool named = after_type && (strcmp(word, "in") == 0 || strcmp(word, "instanceof") == 0);
        if (!named || !member_rest_follows(lexer)) {
            return false;
        }
        return true;
    }
    // The word must start a member: a name followed by `(`, `:`, `=`, `<`,
    // `?`, `!` or another key. Otherwise it may belong to the type, as in
    // `(x) => implies x is T` or `(x) => asserts x;`.
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        advance(lexer);
    }
    c = lexer->lookahead;
    if (c == '\\' || c > 127 || c == '"' || c == '\'' || c == '#' || c == '*' || c == '[' || c == '+' || c == '-') {
        return true;
    }
    if (c == '.') {
        advance(lexer);
        return iswdigit(lexer->lookahead);
    }
    if (is_word_char(c)) {
        if (!scan_member_name(lexer, word, sizeof(word))) {
            return false;
        }
        if (is_continuation_word(word)) {
            // `static in: T` names a member `in`.
            return (strcmp(word, "in") == 0 || strcmp(word, "instanceof") == 0) && member_rest_follows(lexer);
        }
        return true;
    }
    if (c == '=') {
        // `c => d` is an arrow function, `a = async c => c`.
        advance(lexer);
        return lexer->lookahead != '>' && lexer->lookahead != '=';
    }
    return c == '(' || c == ':' || c == '<' || c == '?' || c == '!';
}


// Flow: see TYPE_AUTOMATIC_SEMICOLON.
static bool scan_type_automatic_semicolon(TSLexer *lexer, bool marked) {
    lexer->result_symbol = TYPE_AUTOMATIC_SEMICOLON;
    if (!marked) {
        lexer->mark_end(lexer);
    }
    bool saw_newline = false;
    for (;;) {
        int32_t c = lexer->lookahead;
        if (c == 0 || c == '}') {
            return true;
        }
        if (c == '\n' || c == 0x2028 || c == 0x2029) {
            saw_newline = true;
            skip(lexer);
            continue;
        }
        if (iswspace(c)) {
            skip(lexer);
            continue;
        }
        if (c == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
                       lexer->lookahead != 0x2029) {
                    skip(lexer);
                }
                continue;
            }
            if (lexer->lookahead == '*') {
                skip(lexer);
                for (;;) {
                    if (lexer->lookahead == 0) {
                        return true;
                    }
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                    } else {
                        if (lexer->lookahead == '\n' || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
                            saw_newline = true;
                        }
                        skip(lexer);
                    }
                }
                continue;
            }
            // A regular expression or a division on the next line.
            return saw_newline;
        }
        break;
    }
    if (lexer->is_at_included_range_start(lexer)) {
        return true;
    }
    if (!saw_newline) {
        return false;
    }
    switch (lexer->lookahead) {
        // These continue a type on the next line.
        case '|':
        case '&':
        case '.':
        case '?':
        case '=':
        case ',':
        case ':':
        case '>':
        case ';':
            return false;
        case '<': {
            // Type arguments or parameters on the next line continue the
            // statement, `Array\n<T>` or `opaque type A\n<T> = B`, but a JSX
            // element starts a new one: `import A from 'a'\n<A />`.
            skip(lexer);
            AngleKind kind = ANGLE_OTHER;
            AngleInfo info = {false, 0, {0}};
            classify_angle_impl(lexer, true, false, &kind, &info);
            if (!info.closed) {
                return true;
            }
            switch (info.after_close) {
                case '{':
                case '(':
                    return closing_tag_follows(lexer, info.name);
                case '=':
                case ':':
                case '|':
                case '&':
                case '[':
                case ';':
                case ',':
                case ')':
                case '>':
                case '.':
                case '?':
                case 0:
                case 'e':
                case 's':
                case 'i':
                case 'm':
                    return false;
                default:
                    return true;
            }
        }
        case 'e':
        case 'i': {
            // `extends` (conditional types) and `implements` continue the statement.
            const char *word = lexer->lookahead == 'e' ? "extends" : "implements";
            for (unsigned i = 0; word[i]; i++) {
                if (lexer->lookahead != word[i]) {
                    return true;
                }
                skip(lexer);
            }
            return is_word_char(lexer->lookahead);
        }
        case 's': {
            // The lower bound of an opaque type, `opaque type A\n  super B`,
            // continues it; `super(...)`, `super.x` and `super[x]` do not.
            const char *word = "super";
            for (unsigned i = 0; word[i]; i++) {
                if (lexer->lookahead != word[i]) {
                    return true;
                }
                skip(lexer);
            }
            if (is_word_char(lexer->lookahead)) {
                return true;
            }
            while (iswspace(lexer->lookahead)) {
                skip(lexer);
            }
            return lexer->lookahead == '(' || lexer->lookahead == '.' || lexer->lookahead == '[' ||
                   lexer->lookahead == ';' || lexer->lookahead == '}' || lexer->lookahead == 0;
        }
        default:
            return true;
    }
}

static bool scan_match_lbrace(TSLexer *lexer) {
    // Only spaces may separate `)` and `{`; anything else is left to the
    // other scanners.
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\f' ||
           lexer->lookahead == '\v' || lexer->lookahead == 0xa0 || lexer->lookahead == 0xfeff) {
        skip(lexer);
    }
    if (lexer->lookahead != '{') {
        return false;
    }
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = MATCH_LBRACE;
    return true;
}

static bool scan_type_lbracket(TSLexer *lexer) {
    // Only spaces may come before the `[`; a line break ends the type.
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\f' ||
           lexer->lookahead == '\v' || lexer->lookahead == 0xa0 || lexer->lookahead == 0xfeff) {
        skip(lexer);
    }
    if (lexer->lookahead != '[') {
        return false;
    }
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = TYPE_LBRACKET;
    return true;
}

// Flow: at a `<` where type parameters may start. Returns TYPE_PARAMETERS_OPEN
// for a generic arrow function, or TYPE_ARGUMENTS_OPEN when type arguments are
// valid too and follow, as in `async<T>(x)`.
static bool scan_type_parameters_open(TSLexer *lexer, const bool *valid_symbols) {
    advance(lexer);
    lexer->mark_end(lexer);
    if (lexer->lookahead == '!') {
        // `<!--` starts an HTML comment.
        if (!valid_symbols[HTML_COMMENT] || valid_symbols[LOGICAL_OR] || valid_symbols[ESCAPE_SEQUENCE] ||
            valid_symbols[REGEX_PATTERN]) {
            return false;
        }
        for (unsigned i = 0; i < 3; i++) {
            if (lexer->lookahead != "!--"[i]) {
                return false;
            }
            advance(lexer);
        }
        while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
               lexer->lookahead != 0x2029) {
            advance(lexer);
        }
        lexer->result_symbol = HTML_COMMENT;
        lexer->mark_end(lexer);
        return true;
    }
    AngleKind kind;
    bool arguments = classify_angle(lexer, valid_symbols[NEW_TYPE_ARGUMENTS_OPEN], true, &kind);
    if (kind == ANGLE_ARROW) {
        lexer->result_symbol = TYPE_PARAMETERS_OPEN;
        return true;
    }
    if (arguments && (valid_symbols[TYPE_ARGUMENTS_OPEN] || valid_symbols[NEW_TYPE_ARGUMENTS_OPEN])) {
        lexer->result_symbol = valid_symbols[NEW_TYPE_ARGUMENTS_OPEN] ? NEW_TYPE_ARGUMENTS_OPEN : TYPE_ARGUMENTS_OPEN;
        return true;
    }
    return false;
}

// Flow: a JSX attribute string fragment. Like tree-sitter-javascript's
// `([^"&]|&[^#A-Za-z])+`, it stops before a character reference, but an `&`
// that starts none is text, as in Flow's parser: `"a&b"` is one fragment.
static bool scan_jsx_string_fragment(TSLexer *lexer, int32_t quote) {
    bool has_content = false;
    for (;;) {
        int32_t c = lexer->lookahead;
        if (c == 0 || c == quote) {
            lexer->mark_end(lexer);
            return has_content;
        }
        if (c != '&') {
            advance(lexer);
            has_content = true;
            continue;
        }
        // The fragment may end before this `&`.
        lexer->mark_end(lexer);
        advance(lexer);
        int32_t next = lexer->lookahead;
        if (next == '#' || (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z')) {
            if (scan_character_reference_rest(lexer)) {
                // The fragment ends before the reference.
                return has_content;
            }
        } else if (next != 0 && next != quote) {
            // `&` and the character after it, as in tree-sitter-javascript.
            advance(lexer);
        }
        has_content = true;
    }
}

// Flow: whether a class member with a Flow type starts here: a key, then
// `:` (after `?` or `!`), `<`, or a parameter list and `:`. Consumes it.
// Flow: consumes a `\u` escape in an identifier, `\u2118` or `\u{6F}`, after
// its `\`. Returns false when it is not one.
static bool skip_unicode_escape(TSLexer *lexer) {
    if (lexer->lookahead != 'u') {
        return false;
    }
    advance(lexer);
    if (lexer->lookahead == '{') {
        advance(lexer);
        unsigned n = 0;
        while (iswxdigit(lexer->lookahead) && n < 8) {
            advance(lexer);
            n++;
        }
        if (n == 0 || lexer->lookahead != '}') {
            return false;
        }
        advance(lexer);
        return true;
    }
    for (unsigned i = 0; i < 4; i++) {
        if (!iswxdigit(lexer->lookahead)) {
            return false;
        }
        advance(lexer);
    }
    return true;
}

// Flow: whether a class member key can start with this character: a name,
// with a `\u` escape or non-ASCII characters too, a private name, a string, a
// number (`.1` included) or a computed key. Like tree-sitter-javascript's
// identifier token, any non-ASCII character counts.
static bool is_member_key_start(int32_t c) {
    return iswalpha(c) || c == '_' || c == '$' || c > 127 || c == '\\' || c == '#' || c == '[' || c == '"' ||
           c == '\'' || iswdigit(c) || c == '.';
}

static bool typed_member_follows(TSLexer *lexer, bool *in_word, bool *method) {
    *in_word = false;
    *method = false;
    int32_t c = lexer->lookahead;
    if (c == '#') {
        advance(lexer);
        c = lexer->lookahead;
    }
    if (iswalpha(c) || c == '_' || c == '$' || c > 127 || c == '\\') {
        char word[16];
        unsigned n = 0;
        for (;;) {
            int32_t d = lexer->lookahead;
            if (d == '\\') {
                advance(lexer);
                if (!skip_unicode_escape(lexer)) {
                    return false;
                }
                // An escaped name is never the keyword `in`.
                n = sizeof(word);
                continue;
            }
            if (!(is_word_char(d) || d > 127)) {
                break;
            }
            if (n < sizeof(word) - 1) {
                word[n] = (char)d;
            }
            n++;
            advance(lexer);
        }
        word[n < sizeof(word) ? n : sizeof(word) - 1] = 0;
        *in_word = n < sizeof(word) && (strcmp(word, "in") == 0 || strcmp(word, "instanceof") == 0);
    } else if (c == '[') {
        advance(lexer);
        if (!skip_balanced(lexer, ']')) {
            return false;
        }
    } else if (c == '"' || c == '\'') {
        if (!skip_quoted(lexer, c)) {
            return false;
        }
    } else if (iswdigit(c) || c == '.') {
        // A number: `1`, `.1`, `1.`, `1e3`, `1e-3`, `0x1`, `1n`, `1_000`.
        if (c == '.') {
            advance(lexer);
            if (!iswdigit(lexer->lookahead)) {
                return false;
            }
        }
        for (;;) {
            int32_t d = lexer->lookahead;
            if (d == 'e' || d == 'E') {
                advance(lexer);
                if (lexer->lookahead == '+' || lexer->lookahead == '-') {
                    advance(lexer);
                }
                continue;
            }
            if (!(is_word_char(d) || d == '.')) {
                break;
            }
            advance(lexer);
        }
    } else {
        return false;
    }
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        advance(lexer);
    }
    if (lexer->lookahead == '?' || lexer->lookahead == '!') {
        advance(lexer);
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
            advance(lexer);
        }
    }
    if (lexer->lookahead == ':' || lexer->lookahead == '<') {
        return true;
    }
    if (lexer->lookahead != '(') {
        return false;
    }
    *method = true;
    // A parameter with a type, `(c: T)` or `(c?: T)`, or a return type.
    advance(lexer);
    unsigned depth = 0;
    unsigned conditionals = 0;
    for (unsigned steps = 0; steps < 100000; steps++) {
        int32_t d = lexer->lookahead;
        if (d == 0) {
            return false;
        }
        if (d == '"' || d == '\'') {
            if (!skip_quoted(lexer, d)) {
                return false;
            }
            continue;
        }
        if (d == '`') {
            if (!skip_template(lexer)) {
                return false;
            }
            continue;
        }
        advance(lexer);
        if (d == '(' || d == '[' || d == '{') {
            depth++;
        } else if (d == ')' || d == ']' || d == '}') {
            if (depth == 0) {
                break;
            }
            depth--;
        } else if (depth == 0 && d == '?') {
            if (lexer->lookahead == ':') {
                return true;
            }
            if (lexer->lookahead != '.') {
                conditionals++;
            }
        } else if (depth == 0 && d == ':') {
            if (conditionals == 0) {
                return true;
            }
            conditionals--;
        }
    }
    if (!skip_trivia(lexer)) {
        return false;
    }
    return lexer->lookahead == ':';
}

// Flow: after a class member modifier, whether the member goes on, which
// MODIFIER_CONTINUES (ASYNC_MODIFIER_CONTINUES after `async`) says. On the same
// line it does before a key or `*`. After a line break it does, as in
// tree-sitter-javascript, where no automatic semicolon is inserted: before
// `[`, before `*` after `async`, and before `in`. It also does before a member
// with a Flow type, as in Flow's parser: `declare` then `b: T`. Otherwise the
// modifier is a field of its own and, where one is valid, an automatic
// semicolon follows it.
static bool scan_modifier_continues(TSLexer *lexer, const bool *valid_symbols) {
    bool after_async = valid_symbols[ASYNC_MODIFIER_CONTINUES];
    bool after_accessor = valid_symbols[ACCESSOR_MODIFIER_CONTINUES];
    lexer->mark_end(lexer);
    bool newline = false;
    for (;;) {
        int32_t c = lexer->lookahead;
        if (c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029) {
            newline = true;
            skip(lexer);
        } else if (iswspace(c)) {
            skip(lexer);
        } else if (c == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
                    skip(lexer);
                }
            } else if (lexer->lookahead == '*') {
                skip(lexer);
                for (;;) {
                    if (lexer->lookahead == 0) {
                        return false;
                    }
                    if (lexer->lookahead == '\n') {
                        newline = true;
                    }
                    int32_t d = lexer->lookahead;
                    skip(lexer);
                    if (d == '*' && lexer->lookahead == '/') {
                        skip(lexer);
                        break;
                    }
                }
            } else {
                return false;
            }
        } else {
            break;
        }
    }
    int32_t c = lexer->lookahead;
    bool key = is_member_key_start(c);
    lexer->result_symbol = after_async      ? ASYNC_MODIFIER_CONTINUES
                           : after_accessor ? ACCESSOR_MODIFIER_CONTINUES
                                            : MODIFIER_CONTINUES;
    // A variance sigil, `static +b: T`, also on the next line: a field cannot
    // start with `+`.
    if ((c == '+' || c == '-') && !after_async && !after_accessor) {
        return true;
    }
    if (!newline) {
        if (key || c == '*') {
            return true;
        }
        // The modifier is a field that ends here: `class A { get }`.
        if (valid_symbols[AUTOMATIC_SEMICOLON] && (c == '}' || c == 0)) {
            lexer->result_symbol = AUTOMATIC_SEMICOLON;
            return true;
        }
        return false;
    }
    if (after_async) {
        // As in tree-sitter-javascript, `async` goes on after a line break only
        // where no automatic semicolon is inserted: before `*`, a computed
        // method key, or `in`. In Flow's parser, never.
        if (c == '*') {
            return true;
        }
        if (c == '[') {
            advance(lexer);
            return skip_balanced(lexer, ']') && skip_trivia(lexer) &&
                   (lexer->lookahead == '(' || lexer->lookahead == '<');
        }
        if (c == 'i') {
            // `async` then `in() {}` is an async method in
            // tree-sitter-javascript; with a Flow type, `in(): T {}`, or as a
            // field, `in = 1`, `async` is a field of its own, as in Flow's
            // parser.
            bool in_word = false;
            bool method = false;
            bool typed = typed_member_follows(lexer, &in_word, &method);
            if (in_word && method && !typed) {
                return true;
            }
            if (valid_symbols[AUTOMATIC_SEMICOLON]) {
                lexer->result_symbol = AUTOMATIC_SEMICOLON;
                return true;
            }
            return false;
        }
        if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FIELD_NAME_SEPARATOR]) {
            lexer->result_symbol = AUTOMATIC_SEMICOLON;
            return asi_after_line_terminator(lexer, valid_symbols[TYPE_LBRACKET], valid_symbols[FIELD_NAME_SEPARATOR],
                                             false) &&
                   (lexer->result_symbol == FIELD_NAME_SEPARATOR || valid_symbols[AUTOMATIC_SEMICOLON]);
        }
        return false;
    }
    // After a line break, `*` goes on, as in tree-sitter-javascript, except
    // after `get` and `set`: `get` then `*a() {}` is a field and a method.
    if (c == '[' || (c == '*' && !after_accessor)) {
        return true;
    }
    if (!key) {
        // The modifier is a field that ends at the line break, as in
        // `get` then `*a() {}`, or `set` then `}`.
        if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FIELD_NAME_SEPARATOR]) {
            lexer->result_symbol = AUTOMATIC_SEMICOLON;
            return asi_after_line_terminator(lexer, valid_symbols[TYPE_LBRACKET], valid_symbols[FIELD_NAME_SEPARATOR],
                                             false) &&
                   (lexer->result_symbol == FIELD_NAME_SEPARATOR || valid_symbols[AUTOMATIC_SEMICOLON]);
        }
        return false;
    }
    bool in_word = false;
    bool method = false;
    if (typed_member_follows(lexer, &in_word, &method) || in_word) {
        return true;
    }
    // The modifier is a field: insert its semicolon here when one is valid.
    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        lexer->result_symbol = AUTOMATIC_SEMICOLON;
        return true;
    }
    return false;
}

bool tree_sitter_flow_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
    // During error recovery every symbol is valid; the member scan stays out.
    bool recovering = valid_symbols[TEMPLATE_CHARS] && valid_symbols[JSX_TEXT];
    if ((valid_symbols[MODIFIER_CONTINUES] || valid_symbols[ASYNC_MODIFIER_CONTINUES] ||
         valid_symbols[ACCESSOR_MODIFIER_CONTINUES]) &&
        !recovering) {
        return scan_modifier_continues(lexer, valid_symbols);
    }
    // Inside a JSX string no automatic semicolon is valid; during error
    // recovery every symbol is, and the string scan must not run there.
    if ((valid_symbols[JSX_STRING_FRAGMENT_DOUBLE] || valid_symbols[JSX_STRING_FRAGMENT_SINGLE]) &&
        !valid_symbols[AUTOMATIC_SEMICOLON]) {
        bool doubled = valid_symbols[JSX_STRING_FRAGMENT_DOUBLE];
        lexer->result_symbol = doubled ? JSX_STRING_FRAGMENT_DOUBLE : JSX_STRING_FRAGMENT_SINGLE;
        return scan_jsx_string_fragment(lexer, doubled ? '"' : '\'');
    }
    // Zero-width tokens, such as automatic semicolons and member separators,
    // end where the scan starts, right after the previous token, whatever the
    // scans below skip: `{ a(); } // b` and `type A = B // c` must not take the
    // spaces or the comment. So the end is marked before anything is skipped.
    // Every token that consumes characters marks its own end.
    bool marked = false;
    if (iswspace(lexer->lookahead)) {
        lexer->mark_end(lexer);
        marked = true;
    }
    if (valid_symbols[COMPONENT_TYPE_PARAMETERS_OPEN] && !valid_symbols[TEMPLATE_CHARS]) {
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
            skip(lexer);
        }
        if (lexer->lookahead == '<') {
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = COMPONENT_TYPE_PARAMETERS_OPEN;
            return true;
        }
    }
    if (valid_symbols[TYPE_PARAMETERS_OPEN] && !valid_symbols[TEMPLATE_CHARS] && !valid_symbols[JSX_TEXT]) {
        // Line breaks matter for automatic semicolons, so only skip them when
        // no semicolon or member separator can be inserted here.
        bool line_breaks_matter = valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[TYPE_AUTOMATIC_SEMICOLON] ||
                                  valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON] ||
                                  valid_symbols[CLASS_FIELD_SEPARATOR] || valid_symbols[FIELD_NAME_SEPARATOR];
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
               (!line_breaks_matter && iswspace(lexer->lookahead))) {
            skip(lexer);
        }
        if (lexer->lookahead == '<') {
            return scan_type_parameters_open(lexer, valid_symbols);
        }
    }
    if (valid_symbols[TYPE_LBRACKET] && !valid_symbols[TEMPLATE_CHARS] && scan_type_lbracket(lexer)) {
        return true;
    }
    if (valid_symbols[MATCH_LBRACE] && !valid_symbols[TEMPLATE_CHARS]) {
        if (scan_match_lbrace(lexer)) {
            return true;
        }
        if (!valid_symbols[AUTOMATIC_SEMICOLON] && !valid_symbols[TYPE_ARGUMENTS_OPEN]) {
            return false;
        }
    }

    if (valid_symbols[TEMPLATE_CHARS]) {
        if (valid_symbols[AUTOMATIC_SEMICOLON]) {
            return false;
        }
        return scan_template_chars(lexer);
    }

    if (valid_symbols[JSX_TEXT] && scan_jsx_text(lexer)) {
        return true;
    }

    if (valid_symbols[TYPE_AUTOMATIC_SEMICOLON] && !valid_symbols[TEMPLATE_CHARS]) {
        if (scan_type_automatic_semicolon(lexer, marked)) {
            return true;
        }
        if (lexer->lookahead == '<' && (valid_symbols[TYPE_ARGUMENTS_OPEN] || valid_symbols[NEW_TYPE_ARGUMENTS_OPEN])) {
            return scan_type_arguments_open(lexer, valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]);
        }
        return false;
    }

    if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
        bool scanned_comment = false;
        bool crossed_line = false;
        bool ret = scan_automatic_semicolon(lexer, !valid_symbols[LOGICAL_OR] || valid_symbols[STATEMENT_END],
                                            &scanned_comment, valid_symbols[TYPE_LBRACKET],
                                            valid_symbols[FIELD_NAME_SEPARATOR],
                                            // After an arrow function's block body or a body-less
                                            // signature, `(` on the next line cannot continue.
                                            valid_symbols[ARROW_BLOCK_END] ||
                                                (valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON] &&
                                                 !valid_symbols[AUTOMATIC_SEMICOLON]),
                                            valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON] &&
                                                !valid_symbols[AUTOMATIC_SEMICOLON],
                                            marked, &crossed_line);
        // Flow: a body-less signature ends at the end of the file, also after
        // a comment. tree-sitter-javascript's automatic semicolon does not,
        // which takes the comment into the statement; Flow declarations end
        // at their last token.
        if (!ret && !valid_symbols[AUTOMATIC_SEMICOLON] && lexer->lookahead == 0) {
            ret = true;
        }
        // Flow: a signature followed by `{` on the next line is a definition.
        if (ret && !valid_symbols[AUTOMATIC_SEMICOLON]) {
            if (lexer->lookahead == '{') {
                return false;
            }
            lexer->result_symbol = FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON;
        }
        if (!ret && !scanned_comment && valid_symbols[TERNARY_QMARK] && lexer->lookahead == '?') {
            return scan_ternary_qmark(lexer);
        }
        // The separator only joins members on one line; across a line break,
        // automatic semicolons decide, and the scan above consumed the line.
        if (!ret && !crossed_line && valid_symbols[CLASS_FIELD_SEPARATOR] && !valid_symbols[AFTER_AWAIT] &&
            scan_class_field_separator(lexer, valid_symbols)) {
            return true;
        }
        if (!ret && (valid_symbols[TYPE_ARGUMENTS_OPEN] || valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]) &&
            lexer->lookahead == '<') {
            return scan_type_arguments_open(lexer, valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]);
        }
        return ret;
    }

    if (valid_symbols[TYPE_ARGUMENTS_OPEN] || valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }
        if (lexer->lookahead == '<') {
            return scan_type_arguments_open(lexer, valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]);
        }
    }

    if (valid_symbols[TERNARY_QMARK]) {
        return scan_ternary_qmark(lexer);
    }

    if (valid_symbols[HTML_COMMENT] && !valid_symbols[LOGICAL_OR] && !valid_symbols[ESCAPE_SEQUENCE] &&
        !valid_symbols[REGEX_PATTERN]) {
        return scan_html_comment(lexer);
    }

    return false;
}
