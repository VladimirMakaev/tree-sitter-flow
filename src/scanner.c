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
};

// Flow: see classify_angle.
typedef enum {
    ANGLE_OTHER,     // a comparison, or JSX
    ANGLE_ARGUMENTS, // type arguments
    ANGLE_ARROW,     // the type parameters of a generic arrow function
} AngleKind;

static bool classify_angle_impl(TSLexer *lexer, bool after_new, AngleKind *kind);
static bool classify_angle(TSLexer *lexer, bool after_new, AngleKind *kind);

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
static bool asi_after_line_terminator(TSLexer *lexer, bool after_type) {
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
        classify_angle(lexer, true, &kind);
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
                return false;
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

static bool scan_automatic_semicolon(TSLexer *lexer, bool comment_condition, bool *scanned_comment, bool after_type) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    for (;;) {
        if (lexer->lookahead == 0) {
            return true;
        }

        if (lexer->lookahead == '/') {
            WhitespaceResult result = scan_whitespace_and_comments(lexer, scanned_comment, false);
            if (result == REJECT) {
                return false;
            }

            // Flow: a comment that spans a line terminator acts like a newline, so the
            // next token still decides, as in `| A // comment` followed by `| B`.
            if (result == ACCEPT && comment_condition) {
                if (scan_whitespace_and_comments(lexer, scanned_comment, true) == REJECT) {
                    return false;
                }
                return asi_after_line_terminator(lexer, after_type);
            }

            // Flow: after an expression, a `!` on the next line is a prefix negation,
            // not a non-null assertion.
            if (result == ACCEPT) {
                while (iswspace(lexer->lookahead)) {
                    skip(lexer);
                }
                if (lexer->lookahead == '!') {
                    skip(lexer);
                    return lexer->lookahead != '=';
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

    if (scan_whitespace_and_comments(lexer, scanned_comment, true) == REJECT) {
        return false;
    }

    return asi_after_line_terminator(lexer, after_type);
}

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
        // not a conditional expression.
        while (iswspace(lexer->lookahead)) {
            advance(lexer);
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

// Flow: checks whether the text after `&` forms an HTML character reference.
static bool at_character_reference(TSLexer *lexer) {
    advance(lexer);
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
static bool skip_quoted(TSLexer *lexer, int32_t quote) {
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

// Flow: decides whether the `<` at the lookahead opens a type argument list.
// Like Flow's own parser, `a<b>(c)` is a call with type arguments. The scan
// looks for the matching `>` while only accepting characters that can occur in
// a type, then requires `(`, a template literal, `{` or `implements` after it.

static bool classify_angle(TSLexer *lexer, bool after_new, AngleKind *kind) {
    *kind = ANGLE_OTHER;
    bool result = classify_angle_impl(lexer, after_new, kind);
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
    return classify_angle(lexer, after_new, &kind);
}

// Called after a `<`. Scans ahead to classify it; returns true for type
// arguments.
static bool classify_angle_impl(TSLexer *lexer, bool after_new, AngleKind *kind) {

    if (lexer->lookahead == '=') {
        return false;
    }

    unsigned angle = 1;
    unsigned paren = 0;
    unsigned bracket = 0;
    unsigned brace = 0;
    for (unsigned steps = 0; steps < 100000; steps++) {
        int32_t c = lexer->lookahead;
        switch (c) {
            case 0:
                return false;
            case '<':
                angle++;
                advance(lexer);
                break;
            case '>':
                advance(lexer);
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
                if (lexer->lookahead != '>') {
                    return false;
                }
                advance(lexer);
                break;
            case '(':
                paren++;
                advance(lexer);
                break;
            case ')':
                if (paren == 0) {
                    return false;
                }
                paren--;
                advance(lexer);
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
                break;
            case '/':
                if (!skip_trivia(lexer)) {
                    return false;
                }
                break;
            case '!':
            case '%':
            case '^':
            case '~':
            case '@':
            case '+':
                return false;
            default:
                advance(lexer);
                break;
        }
    }
    return false;

after_close:
    if (!skip_trivia(lexer)) {
        return false;
    }
    switch (lexer->lookahead) {
        case '(': {
            // `async <T>(x) => x` is a generic arrow function, not a call, and
            // `a < b > (c: T)` compares with a type cast, as in Flow.
            unsigned depth = 0;
            bool question = false;
            for (unsigned steps = 0; steps < 100000; steps++) {
                int32_t c = lexer->lookahead;
                if (c == 0) {
                    return true;
                }
                if (c == '"' || c == '\'' || c == '`') {
                    if (!skip_quoted(lexer, c)) {
                        return true;
                    }
                    continue;
                }
                if (c == '/') {
                    if (!skip_trivia(lexer)) {
                        return true;
                    }
                    continue;
                }
                advance(lexer);
                if (c == '(' || c == '[' || c == '{') {
                    depth++;
                } else if (c == ')' || c == ']' || c == '}') {
                    if (--depth == 0) {
                        break;
                    }
                } else if (depth == 1 && c == '?') {
                    question = true;
                } else if (depth == 1 && c == ':' && !question) {
                    return false;
                }
            }
            if (!skip_trivia(lexer)) {
                return true;
            }
            if (lexer->lookahead == '=') {
                advance(lexer);
                if (lexer->lookahead == '>') {
                    *kind = ANGLE_ARROW;
                    return false;
                }
                *kind = ANGLE_ARGUMENTS;
                return true;
            }
            if (lexer->lookahead == ':') {
                // A return type: look for `=>` before the expression ends.
                advance(lexer);
                unsigned nest = 0;
                for (unsigned steps = 0; steps < 100000; steps++) {
                    int32_t c = lexer->lookahead;
                    if (c == 0) {
                        return true;
                    }
                    if (c == '"' || c == '\'' || c == '`') {
                        if (!skip_quoted(lexer, c)) {
                            return true;
                        }
                        continue;
                    }
                    if (c == '/') {
                        if (!skip_trivia(lexer)) {
                            return true;
                        }
                        continue;
                    }
                    advance(lexer);
                    if (c == '(' || c == '[' || c == '{' || c == '<') {
                        nest++;
                    } else if (c == ')' || c == ']' || c == '}' || c == '>') {
                        if (nest == 0) {
                            return true;
                        }
                        nest--;
                    } else if (c == '=' && lexer->lookahead == '>') {
                        if (nest == 0) {
                            *kind = ANGLE_ARROW;
                            return false;
                        }
                        advance(lexer);
                    } else if ((c == ';' || c == ',') && nest == 0) {
                        return true;
                    }
                }
                return true;
            }
            return true;
        }
        case '{':
            return true;
        // `new C<T>;` A comparison cannot end right after `>`.
        case ';':
        case ')':
        case ']':
        case '}':
        case ',':
        case 0:
            return after_new;
        case 'i': {
            const char *word = "implements";
            for (unsigned i = 0; word[i]; i++) {
                if (lexer->lookahead != word[i]) {
                    return false;
                }
                advance(lexer);
            }
            return !is_word_char(lexer->lookahead);
        }
        default:
            return false;
    }
}

// Flow: see CLASS_FIELD_SEPARATOR. Called with the lookahead on the next token
// of the same line; the separator is zero-width.
static bool scan_class_field_separator(TSLexer *lexer) {
    int32_t c = lexer->lookahead;
    if (!(iswalpha(c) || c == '_' || c == '$' || c == '#')) {
        return false;
    }
    lexer->result_symbol = CLASS_FIELD_SEPARATOR;
    // Words that continue an expression or a type.
    static const char *const continuations[] = {"in", "instanceof", "as", "satisfies", "extends", "is"};
    char word[16];
    unsigned n = 0;
    while (n < sizeof(word) - 1 && is_word_char(lexer->lookahead)) {
        word[n++] = (char)lexer->lookahead;
        advance(lexer);
    }
    word[n] = 0;
    for (unsigned i = 0; i < sizeof(continuations) / sizeof(continuations[0]); i++) {
        if (strcmp(word, continuations[i]) == 0) {
            return false;
        }
    }
    return true;
}

// Flow: see TYPE_AUTOMATIC_SEMICOLON.
static bool scan_type_automatic_semicolon(TSLexer *lexer) {
    lexer->result_symbol = TYPE_AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);
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
        case '<':
        case '>':
        case ';':
            return false;
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

bool tree_sitter_flow_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
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
        if (scan_type_automatic_semicolon(lexer)) {
            return true;
        }
        if (lexer->lookahead == '<' && (valid_symbols[TYPE_ARGUMENTS_OPEN] || valid_symbols[NEW_TYPE_ARGUMENTS_OPEN])) {
            return scan_type_arguments_open(lexer, valid_symbols[NEW_TYPE_ARGUMENTS_OPEN]);
        }
        return false;
    }

    if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
        bool scanned_comment = false;
        bool ret = scan_automatic_semicolon(lexer, !valid_symbols[LOGICAL_OR], &scanned_comment, valid_symbols[TYPE_LBRACKET]);
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
        if (!ret && valid_symbols[CLASS_FIELD_SEPARATOR] && scan_class_field_separator(lexer)) {
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
