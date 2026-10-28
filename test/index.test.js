import { expect } from 'chai';
import parseDefault, {
    parse,
    defaultPreprocessor,
    defaultProcessor
} from '../index.js';

// Builds a Map from [key, value] entries (for readable assertions).
const m = (...entries) => new Map(entries);

// Skips both default steps so the raw section text can be inspected.
// (Whitespace-only text and empty headers are still pruned.)
const raw = { preprocessor: (text) => text, processor: (text) => text };

// Shorthand for parsing with the default processor only.
const pairs = (text) => defaultProcessor(text);

describe('exports', () => {
    it('exports parse, defaultPreprocessor, and defaultProcessor as functions', () => {
        expect(parse).to.be.a('function');
        expect(defaultPreprocessor).to.be.a('function');
        expect(defaultProcessor).to.be.a('function');
    });

    it('uses parse as the default export', () => {
        expect(parseDefault).to.equal(parse);
    });
});

describe('parse()', () => {
    describe('structure (spec examples, raw text)', () => {
        it('parses simple text in a section', () => {
            const text = '[font settings] {\n\tcolor black\n\tsize 12pt\n}';

            expect(parse(text, raw)).to.deep.equal(
                m(['font settings', m([null, '\n\tcolor black\n\tsize 12pt\n'])])
            );
        });

        it('stores text outside of a section under a root null key', () => {
            const text = 'page-count 12\n\n[print settings] {\n\tcollate yes\n}\n';

            expect(parse(text, raw)).to.deep.equal(
                m(
                    [null, 'page-count 12\n\n\n'],
                    ['print settings', m([null, '\n\tcollate yes\n'])]
                )
            );
        });

        it('parses a subheader and subsection, re-entering the parent', () => {
            const text =
                '[page settings] {\n' +
                '\twidth 8.5in\n' +
                '\theight 11in\n' +
                '\n' +
                '\t[margins] {\n' +
                '\t\ttop 0.5in\n' +
                '\t\tbottom 0.5in\n' +
                '\t\toutside 0.75in\n' +
                '\t\tgutter 1in\n' +
                '\t}\n' +
                '}';

            expect(parse(text, raw)).to.deep.equal(
                m([
                    'page settings',
                    m(
                        [null, '\n\twidth 8.5in\n\theight 11in\n\n\t\n'],
                        [
                            'margins',
                            m([
                                null,
                                '\n\t\ttop 0.5in\n\t\tbottom 0.5in\n\t\toutside 0.75in\n\t\tgutter 1in\n\t'
                            ])
                        ]
                    )
                ])
            );
        });

        describe('repeating and interleaving sections', () => {
            const text =
                'employees 2\n' +
                '\n' +
                '[jim] {\n' +
                '\thire-date 11/22/2024\n' +
                '\tsalary 54,750\n' +
                '}\n' +
                '\n' +
                '[sarah] {\n' +
                '\thire-date 02/04/2026\n' +
                '\n' +
                '\t[disciplinary info] {\n' +
                '\t\ttardies 0\n' +
                '\t}\n' +
                '\n' +
                '\tsalary 56,820\n' +
                '}\n' +
                '\n' +
                '[jim] {\n' +
                '\t[disciplinary info] {\n' +
                '\t\ttardies 12\n' +
                '\t}\n' +
                '}';

            it('matches the spec result', () => {
                expect(parse(text, raw)).to.deep.equal(
                    m(
                        [null, 'employees 2\n\n\n\n\n\n'],
                        [
                            'jim',
                            m(
                                [null, '\n\thire-date 11/22/2024\n\tsalary 54,750\n\n\t\n'],
                                ['disciplinary info', m([null, '\n\t\ttardies 12\n\t'])]
                            )
                        ],
                        [
                            'sarah',
                            m(
                                [null, '\n\thire-date 02/04/2026\n\n\t\n\n\tsalary 56,820\n'],
                                ['disciplinary info', m([null, '\n\t\ttardies 0\n\t'])]
                            )
                        ]
                    )
                );
            });

            it('orders keys by first appearance', () => {
                const result = parse(text, raw);
                expect([...result.keys()]).to.deep.equal([null, 'jim', 'sarah']);
                expect([...result.get('jim').keys()]).to.deep.equal([
                    null,
                    'disciplinary info'
                ]);
            });
        });
    });

    describe('basic behavior', () => {
        it('returns a Map', () => {
            const result = parse('[a] { x }', raw);
            expect(result).to.be.instanceOf(Map);
            expect(result.get('a')).to.be.instanceOf(Map);
        });

        it('returns an empty Map for empty text', () => {
            const result = parse('', raw);
            expect(result).to.be.instanceOf(Map);
            expect(result.size).to.equal(0);
        });

        it('keeps text with no sections under the root null key', () => {
            expect(parse('just some text\nwith lines', raw)).to.deep.equal(
                m([null, 'just some text\nwith lines'])
            );
        });

        it('only creates a root null key when there is root text', () => {
            const result = parse('[a] { x }', raw);
            expect(result.has(null)).to.equal(false);
        });

        it('does not create a null key for an empty section body', () => {
            // An empty body leaves the header empty, so it is pruned as well.
            expect(parse('[a] {}', raw).size).to.equal(0);
        });

        it('appends text after a closed section to the parent', () => {
            expect(parse('before [a] { x } after', raw)).to.deep.equal(
                m([null, 'before  after'], ['a', m([null, ' x '])])
            );
        });

        it('supports deeply nested subsections', () => {
            const result = parse('[a] { [b] { [c] { deep } } }', raw);
            expect(result.get('a').get('b').get('c').get(null)).to.equal(' deep ');
        });

        it('allows sibling subsections', () => {
            const result = parse('[a] { [b] { 1 } [c] { 2 } }', raw);
            // The whitespace around the subsections is pruned from a's own text.
            expect([...result.get('a').keys()]).to.deep.equal(['b', 'c']);
            expect(result.get('a').get('b').get(null)).to.equal(' 1 ');
            expect(result.get('a').get('c').get(null)).to.equal(' 2 ');
        });
    });

    describe('headers', () => {
        it('allows any text inside the brackets', () => {
            const result = parse('[my "odd" header: 1 + 1 = 2!] { x }', raw);
            expect([...result.keys()]).to.deep.equal(['my "odd" header: 1 + 1 = 2!']);
        });

        it('allows an escaped ] inside the header text', () => {
            const result = parse('[a\\]b] { x }', raw);
            expect([...result.keys()]).to.deep.equal(['a]b']);
            expect(result.get('a]b').get(null)).to.equal(' x ');
        });

        it('allows more than one escaped ]', () => {
            const result = parse('[\\]a\\]] { x }', raw);
            expect([...result.keys()]).to.deep.equal([']a]']);
        });

        it('keeps a backslash that does not escape a ]', () => {
            const result = parse('[a\\nb] { x }', raw);
            expect([...result.keys()]).to.deep.equal(['a\\nb']);
        });

        it('allows an empty header', () => {
            const result = parse('[] { x }', raw);
            expect(result.get('').get(null)).to.equal(' x ');
        });

        it('allows whitespace and newlines between the header and the {', () => {
            const result = parse('[a]\n\t \n{x}', raw);
            expect(result.get('a').get(null)).to.equal('x');
        });

        it('treats a header with no section as ordinary text', () => {
            expect(parse('see [note] for more', raw)).to.deep.equal(
                m([null, 'see [note] for more'])
            );
        });

        it('treats an unterminated header as ordinary text', () => {
            expect(parse('a [b c', raw)).to.deep.equal(m([null, 'a [b c']));
        });

        it('treats a [ inside a header as part of the header text', () => {
            const result = parse('[a[b] { x }', raw);
            expect([...result.keys()]).to.deep.equal(['a[b']);
        });
    });

    describe('sections and quotes', () => {
        it('does not close a section at a } inside a quoted string', () => {
            const result = parse('[a] { say "}" ok }', raw);
            expect(result.get('a').get(null)).to.equal(' say "}" ok ');
        });

        it('does not start a header inside a quoted string', () => {
            const result = parse('[a] { "[b] { x }" y }', raw);
            expect([...result.get('a').keys()]).to.deep.equal([null]);
            expect(result.get('a').get(null)).to.equal(' "[b] { x }" y ');
        });

        it('does not end a quoted string at an escaped quote', () => {
            const result = parse('[a] { "x\\"}" y }', raw);
            expect(result.get('a').get(null)).to.equal(' "x\\"}" y ');
        });

        it('lets an unterminated quote run to the end of the text', () => {
            const result = parse('[a] { "oops }', raw);
            expect(result.get('a').get(null)).to.equal(' "oops }');
        });

        it('treats a stray } at the root as ordinary text', () => {
            expect(parse('a } b', raw)).to.deep.equal(m([null, 'a } b']));
        });

        it('ends an unclosed section at the end of the text', () => {
            expect(parse('[a] { x', raw)).to.deep.equal(m(['a', m([null, ' x'])]));
        });

        it('keeps quotes in the section text', () => {
            const result = parse('[a] { "hi there" }', raw);
            expect(result.get('a').get(null)).to.equal(' "hi there" ');
        });
    });

    describe('repeated headers', () => {
        it('appends text from a repeated header', () => {
            const result = parse('[a] { one } [a] { two }', raw);
            expect(result.size).to.equal(1);
            expect(result.get('a').get(null)).to.equal(' one  two ');
        });

        it('merges subheaders from a repeated header', () => {
            const result = parse('[a] { [b] { 1 } } [a] { [c] { 2 } }', raw);
            expect([...result.get('a').keys()]).to.deep.equal(['b', 'c']);
        });

        it('appends to a repeated subheader', () => {
            const result = parse('[a] { [b] { 1 } [b] { 2 } }', raw);
            expect(result.get('a').get('b').get(null)).to.equal(' 1  2 ');
        });

        it('keeps the same header under different parents separate', () => {
            const result = parse('[a] { [x] { 1 } } [b] { [x] { 2 } }', raw);
            expect(result.get('a').get('x').get(null)).to.equal(' 1 ');
            expect(result.get('b').get('x').get(null)).to.equal(' 2 ');
        });
    });

    describe('pruning', () => {
        it('removes a null entry that is only whitespace', () => {
            const result = parse('[a] { \n\t } [b] { x }', raw);
            expect([...result.keys()]).to.deep.equal(['b']);
        });

        it('removes a whitespace-only root text entry', () => {
            const result = parse('\n\n[a] { x }\n', raw);
            expect(result.has(null)).to.equal(false);
            expect([...result.keys()]).to.deep.equal(['a']);
        });

        it('removes a header with no text and no subheaders', () => {
            expect(parse('[a] { } [b] { x }', raw)).to.deep.equal(
                m(['b', m([null, ' x '])])
            );
        });

        it('keeps a header that has no text but has a subheader', () => {
            const result = parse('[a] { [b] { x } }', raw);
            // The text " " around [b] is whitespace-only, so a has no null key.
            expect([...result.get('a').keys()]).to.deep.equal(['b']);
        });

        it('removes a header whose only subheaders are themselves empty', () => {
            expect(parse('[a] { [b] { [c] { } } }', raw).size).to.equal(0);
        });

        it('removes empty subheaders but keeps their non-empty parent', () => {
            const result = parse('[a] { text [b] { } }', raw);
            expect([...result.get('a').keys()]).to.deep.equal([null]);
        });

        it('keeps the root Map even when everything is pruned', () => {
            const result = parse('[a] { }', raw);
            expect(result).to.be.instanceOf(Map);
            expect(result.size).to.equal(0);
        });
    });

    describe('options', () => {
        it('works when options is omitted', () => {
            const result = parse('[a] { x 1 }');
            expect(result.get('a').get(null)).to.deep.equal(m(['x', '1']));
        });

        it('works when options is an empty object', () => {
            const result = parse('[a] { x 1 }', {});
            expect(result.get('a').get(null)).to.deep.equal(m(['x', '1']));
        });

        describe('preprocessor', () => {
            it('defaults to defaultPreprocessor', () => {
                const text = '[a] {\n    one\n      two\n}';
                const result = parse(text, { processor: (t) => t });
                expect(result.get('a').get(null)).to.equal('one\n  two');
            });

            it('replaces each section text with its return value', () => {
                const result = parse('[a] { x } [b] { y }', {
                    preprocessor: (text) => text.trim().toUpperCase(),
                    processor: (text) => text
                });
                expect(result.get('a').get(null)).to.equal('X');
                expect(result.get('b').get(null)).to.equal('Y');
            });

            it('runs on root text and on subsection text', () => {
                const seen = [];
                parse('root [a] { x [b] { y } }', {
                    preprocessor: (text) => {
                        seen.push(text);
                        return text;
                    },
                    processor: (text) => text
                });
                expect(seen.sort()).to.deep.equal(['root ', ' x  ', ' y '].sort());
            });

            it('runs once per section text value', () => {
                let calls = 0;
                parse('[a] { x }[a] { y }[b] { z }', {
                    preprocessor: (text) => {
                        calls++;
                        return text;
                    },
                    processor: (text) => text
                });
                // a (merged), b
                expect(calls).to.equal(2);
            });

            it('drops results that are only whitespace, without running the processor', () => {
                let processed = 0;
                const result = parse('[a] { x } [b] { y }', {
                    preprocessor: (text) => (text.includes('x') ? '  \n ' : text),
                    processor: (text) => {
                        processed++;
                        return text;
                    }
                });
                expect([...result.keys()]).to.deep.equal(['b']);
                expect(processed).to.equal(1);
            });

            it('treats a null or undefined result as empty text', () => {
                const result = parse('[a] { x } [b] { y }', {
                    preprocessor: (text) => (text.includes('x') ? null : undefined),
                    processor: (text) => text
                });
                expect(result.size).to.equal(0);
            });

            it('throws a TypeError when it is not a function', () => {
                expect(() => parse('[a] { x }', { preprocessor: 5 })).to.throw(
                    TypeError,
                    /preprocessor/
                );
            });
        });

        describe('processor', () => {
            it('defaults to defaultProcessor', () => {
                const result = parse('[a] { width 8.5in }');
                expect(result.get('a').get(null)).to.deep.equal(m(['width', '8.5in']));
            });

            it('receives the preprocessed text', () => {
                const seen = [];
                parse('[a] { x }', {
                    preprocessor: () => 'preprocessed',
                    processor: (text) => {
                        seen.push(text);
                        return text;
                    }
                });
                expect(seen).to.deep.equal(['preprocessed']);
            });

            it('stores whatever it returns, including non-strings', () => {
                const result = parse('[n] { 1 } [o] { 2 } [l] { 3 }', {
                    processor: (text) => {
                        const n = Number(text);

                        if (n === 1) {
                            return 42;
                        }

                        if (n === 2) {
                            return { value: n };
                        }

                        return [n, n];
                    }
                });
                expect(result.get('n').get(null)).to.equal(42);
                expect(result.get('o').get(null)).to.deep.equal({ value: 2 });
                expect(result.get('l').get(null)).to.deep.equal([3, 3]);
            });

            it('runs on root text and on subsection text', () => {
                const result = parse('root [a] { x [b] { y } }', {
                    processor: (text) => text.length
                });
                expect(result.get(null)).to.equal(4);
                expect(result.get('a').get(null)).to.equal(1);
                expect(result.get('a').get('b').get(null)).to.equal(1);
            });

            it('lets errors from the processor propagate', () => {
                expect(() =>
                    parse('[a] { x }', {
                        processor: () => {
                            throw new RangeError('boom');
                        }
                    })
                ).to.throw(RangeError, /boom/);
            });

            it('throws a TypeError when it is not a function', () => {
                expect(() => parse('[a] { x }', { processor: 'nope' })).to.throw(
                    TypeError,
                    /processor/
                );
            });
        });
    });

    describe('full pipeline (default preprocessor and processor)', () => {
        it('parses indented sections into key-value Maps', () => {
            const text =
                'title Report\n' +
                '\n' +
                '[page] {\n' +
                '    width 8.5in\n' +
                '    height 11in\n' +
                '\n' +
                '    [margins] {\n' +
                '        (top bottom) 0.5in\n' +
                '        left "0.75 in"\n' +
                '    }\n' +
                '}';

            expect(parse(text)).to.deep.equal(
                m(
                    [null, m(['title', 'Report'])],
                    [
                        'page',
                        m(
                            [null, m(['width', '8.5in'], ['height', '11in'])],
                            [
                                'margins',
                                m([
                                    null,
                                    m(['top', '0.5in'], ['bottom', '0.5in'], ['left', '0.75 in'])
                                ])
                            ]
                        )
                    ]
                )
            );
        });

        it('parses formatted multiline strings inside an indented section', () => {
            const text =
                '[s] {\n' +
                '    code """\n' +
                '        if (x) {\n' +
                '            y;\n' +
                '        }\n' +
                '    """\n' +
                '    note """"\n' +
                '        Here is some regular \n' +
                '        text on multiple lines.\n' +
                '    """"\n' +
                '}';

            expect(parse(text).get('s').get(null)).to.deep.equal(
                m(
                    ['code', 'if (x) {\n    y;\n}'],
                    ['note', 'Here is some regular text on multiple lines.']
                )
            );
        });

        it('throws when a section is not valid key-value text', () => {
            expect(() => parse('[a] { height }')).to.throw(SyntaxError, /Missing value/);
        });

        it('applies the default processor to root text too', () => {
            expect(() => parse('lonely [a] { x 1 }')).to.throw(
                SyntaxError,
                /Missing value/
            );
        });
    });
});

describe('defaultPreprocessor()', () => {
    it('removes the indentation of the first non-blank line from every line', () => {
        expect(defaultPreprocessor('\n    a\n      b\n  c\n\n    d\n')).to.equal(
            'a\n  b\nc\n\nd'
        );
    });

    it('removes exactly as much as the first line is indented', () => {
        expect(defaultPreprocessor('    a\n    b\n        c')).to.equal('a\nb\n    c');
    });

    it('trims less-indented lines only by what they have', () => {
        expect(defaultPreprocessor('        a\n  b\n\tc')).to.equal('a\nb\nc');
    });

    it('uses the first non-blank line, skipping leading blank lines', () => {
        expect(defaultPreprocessor('\n\n   \n  x\n    y')).to.equal('x\n  y');
    });

    it('counts a tab as one whitespace character', () => {
        expect(defaultPreprocessor('\n\twidth 8.5in\n\t\theight 11in\n')).to.equal(
            'width 8.5in\n\theight 11in'
        );
    });

    it('trims whitespace around the whole text', () => {
        expect(defaultPreprocessor('  \n\n  x  \n\n  ')).to.equal('x');
    });

    it('leaves whitespace at the end of lines inside the text alone', () => {
        expect(defaultPreprocessor('a  \nb \nc')).to.equal('a  \nb \nc');
    });

    it('leaves text without indentation unchanged apart from the outer trim', () => {
        expect(defaultPreprocessor('a\nb\nc')).to.equal('a\nb\nc');
    });

    it('returns an empty string for empty or whitespace-only text', () => {
        expect(defaultPreprocessor('')).to.equal('');
        expect(defaultPreprocessor('   \n\t\n  ')).to.equal('');
    });
});

describe('defaultProcessor()', () => {
    describe('key-value pairs', () => {
        it('returns a Map', () => {
            expect(pairs('a b')).to.be.instanceOf(Map);
        });

        it('returns an empty Map for empty text', () => {
            expect(pairs('').size).to.equal(0);
        });

        it('parses basic key-value pairs of unquoted words', () => {
            expect(pairs('bg-color white\nwidth 8.5in\nheight 11in\ncolumns 2')).to.deep.equal(
                m(
                    ['bg-color', 'white'],
                    ['width', '8.5in'],
                    ['height', '11in'],
                    ['columns', '2']
                )
            );
        });

        it('parses quoted and unquoted items', () => {
            const text =
                '"background color" white\n' +
                'width "8.5 inches"\n' +
                'height "11 inches"\n' +
                'columns 2';

            expect(pairs(text)).to.deep.equal(
                m(
                    ['background color', 'white'],
                    ['width', '8.5 inches'],
                    ['height', '11 inches'],
                    ['columns', '2']
                )
            );
        });

        it('allows any whitespace between items, including newlines and tabs', () => {
            expect(pairs('a\n\n\tb   c\r\nd')).to.deep.equal(m(['a', 'b'], ['c', 'd']));
        });

        it('allows a key and its value on separate lines', () => {
            expect(pairs('key\n  value')).to.deep.equal(m(['key', 'value']));
        });

        it('keeps the keys in order of first appearance', () => {
            expect([...pairs('c 1 a 2 b 3').keys()]).to.deep.equal(['c', 'a', 'b']);
        });

        it('overwrites a repeated key with the later value', () => {
            const text = 'steve cool\nbob uncool\nsteve "actually he\'s not cool anymore"';

            const result = pairs(text);
            expect(result).to.deep.equal(
                m(['steve', 'actually he\'s not cool anymore'], ['bob', 'uncool'])
            );
            expect([...result.keys()]).to.deep.equal(['steve', 'bob']);
        });

        it('ends an unquoted word at a parenthesis or quote', () => {
            expect(pairs('k(v)')).to.deep.equal(m(['k', ['v']]));
            expect(pairs('k"v w"')).to.deep.equal(m(['k', 'v w']));
            expect(pairs('k (v)w x')).to.deep.equal(m(['k', ['v']], ['w', 'x']));
        });
    });

    describe('quoted strings', () => {
        it('puts a literal quote in the string for an escaped quote', () => {
            expect(pairs('content "Here is my \\"special sauce\\"."')).to.deep.equal(
                m(['content', 'Here is my "special sauce".'])
            );
        });

        it('keeps any other backslash as written', () => {
            expect(pairs('a "x\\ny" b "C:\\temp" c "p\\\\q"')).to.deep.equal(
                m(['a', 'x\\ny'], ['b', 'C:\\temp'], ['c', 'p\\\\q'])
            );
        });

        it('supports an empty string', () => {
            expect(pairs('a "" b c')).to.deep.equal(m(['a', ''], ['b', 'c']));
        });

        it('allows parentheses and whitespace inside a quoted string', () => {
            expect(pairs('a "(not a list)"')).to.deep.equal(m(['a', '(not a list)']));
        });

        it('allows a quoted string to span lines', () => {
            expect(pairs('a "one\ntwo"')).to.deep.equal(m(['a', 'one\ntwo']));
        });
    });

    describe('lists', () => {
        it('evaluates a list value as an Array', () => {
            expect(pairs('colors (red white blue)')).to.deep.equal(
                m(['colors', ['red', 'white', 'blue']])
            );
        });

        it('supports an empty list value', () => {
            expect(pairs('colors ()')).to.deep.equal(m(['colors', []]));
        });

        it('allows quoted strings inside a list', () => {
            expect(pairs('a ("two words" plain)')).to.deep.equal(
                m(['a', ['two words', 'plain']])
            );
        });

        it('allows whitespace and newlines around and between list items', () => {
            expect(pairs('a (\n  x\n  y\n)')).to.deep.equal(m(['a', ['x', 'y']]));
        });

        it('evaluates nested lists as nested Arrays', () => {
            expect(pairs('people ((1 steve) (2 mike) (3 alice))')).to.deep.equal(
                m(['people', [['1', 'steve'], ['2', 'mike'], ['3', 'alice']]])
            );
        });

        it('supports lists nested more than one level deep', () => {
            expect(pairs('a (x (y (z)))')).to.deep.equal(m(['a', ['x', ['y', ['z']]]]));
        });

        it('treats a list key as a list of keys that all get the value', () => {
            expect(pairs('(top bottom left) 0.5in\nright 0.625in')).to.deep.equal(
                m(
                    ['top', '0.5in'],
                    ['bottom', '0.5in'],
                    ['left', '0.5in'],
                    ['right', '0.625in']
                )
            );
        });

        it('allows quoted strings in a list of keys', () => {
            expect(pairs('("first key" second) v')).to.deep.equal(
                m(['first key', 'v'], ['second', 'v'])
            );
        });

        it('gives each key in a list of keys its own copy of a list value', () => {
            const result = pairs('(a b) (x (y))');
            expect(result.get('a')).to.deep.equal(['x', ['y']]);
            expect(result.get('a')).to.not.equal(result.get('b'));
            result.get('a').push('changed');
            result.get('a')[1].push('changed');
            expect(result.get('b')).to.deep.equal(['x', ['y']]);
        });

        it('consumes the value of an empty list of keys without setting anything', () => {
            expect(pairs('() ignored real value')).to.deep.equal(m(['real', 'value']));
        });

        it('lets a repeated key from a list of keys override an earlier value', () => {
            expect(pairs('a 1 (a b) 2')).to.deep.equal(m(['a', '2'], ['b', '2']));
        });
    });

    describe('formatted multiline strings (""")', () => {
        it('trims indentation to the first line and trims the whole string', () => {
            const text = 'content """\n    if (something) {\n        return 1;\n    }\n"""';

            expect(pairs(text)).to.deep.equal(
                m(['content', 'if (something) {\n    return 1;\n}'])
            );
        });

        it('trims the indentation of a first line on the same line as the quotes', () => {
            expect(pairs('a """first\n  second"""')).to.deep.equal(
                m(['a', 'first\n  second'])
            );
        });

        it('keeps deeper indentation relative to the first line', () => {
            expect(pairs('a """\n  x\n    y\n  z\n"""')).to.deep.equal(
                m(['a', 'x\n  y\nz'])
            );
        });

        it('keeps blank lines and whitespace at the end of lines', () => {
            expect(pairs('a """\n  x  \n\n  y\n"""')).to.deep.equal(m(['a', 'x  \n\ny']));
        });

        it('allows single and double quotes inside', () => {
            expect(pairs('a """say "hi" and "" ok"""')).to.deep.equal(
                m(['a', 'say "hi" and "" ok'])
            );
        });

        it('allows items of other kinds around it', () => {
            expect(pairs('a """x\ny""" b plain c "q"')).to.deep.equal(
                m(['a', 'x\ny'], ['b', 'plain'], ['c', 'q'])
            );
        });

        it('supports an escaped quote, so the delimiter can appear inside', () => {
            expect(pairs('a """has \\""" inside"""')).to.deep.equal(
                m(['a', 'has """ inside'])
            );
        });

        it('keeps any other backslash as written', () => {
            expect(pairs('a """x\\ny"""')).to.deep.equal(m(['a', 'x\\ny']));
        });

        it('works as a key and inside a list', () => {
            expect(pairs('"""k\n  1""" (""" a\n b """ c)')).to.deep.equal(
                m(['k\n  1', ['a\nb', 'c']])
            );
        });
    });

    describe('formatted multiline strings, joined ("""")', () => {
        it('trims indentation and removes the newline at the end of each line', () => {
            const text =
                'content """"\n' +
                '    Here is some regular \n' +
                '    text on multiple lines.\n' +
                '""""';

            expect(pairs(text)).to.deep.equal(
                m(['content', 'Here is some regular text on multiple lines.'])
            );
        });

        it('keeps a literal space at the end of a line (not a newline replacement)', () => {
            expect(pairs('a """"\n  one\n  two \n  three\n""""')).to.deep.equal(
                m(['a', 'onetwo three'])
            );
        });

        it('removes the newline from Windows line endings', () => {
            expect(pairs('a """"\r\n  one\r\n  two\r\n""""')).to.deep.equal(
                m(['a', 'onetwo'])
            );
        });

        it('keeps indentation that is deeper than the first line', () => {
            expect(pairs('a """"\n  one\n    two\n""""')).to.deep.equal(
                m(['a', 'one  two'])
            );
        });

        it('removes blank lines entirely', () => {
            expect(pairs('a """"\n  one\n\n  two\n""""')).to.deep.equal(
                m(['a', 'onetwo'])
            );
        });

        it('allows a triple quote inside, since it needs four to close', () => {
            expect(pairs('a """"x """ y""""')).to.deep.equal(m(['a', 'x """ y']));
        });

        it('supports an escaped quote', () => {
            expect(pairs('a """"say \\"hi\\" now""""')).to.deep.equal(m(['a', 'say "hi" now']));
        });
    });

    describe('errors', () => {
        it('throws when a list of keys has a nested list', () => {
            expect(() => pairs('((nested thing) other stuff) value')).to.throw(
                SyntaxError,
                /nested list/
            );
        });

        it('throws when a nested empty list is in a list of keys', () => {
            expect(() => pairs('(a ()) value')).to.throw(SyntaxError, /nested list/);
        });

        it('throws when a key has no value', () => {
            expect(() => pairs('width 8.5in\nheight')).to.throw(
                SyntaxError,
                /Missing value for key "height"/
            );
        });

        it('throws when a list of keys has no value', () => {
            expect(() => pairs('(a b)')).to.throw(SyntaxError, /Missing value/);
        });

        it('throws for a single lone item', () => {
            expect(() => pairs('lonely')).to.throw(SyntaxError, /Missing value/);
        });

        it('throws for an unterminated quoted string', () => {
            expect(() => pairs('a "oops')).to.throw(SyntaxError, /Unterminated quoted string/);
        });

        it('throws when the last quote is escaped', () => {
            expect(() => pairs('a "oops\\"')).to.throw(
                SyntaxError,
                /Unterminated quoted string/
            );
        });

        it('throws for an unterminated formatted multiline string', () => {
            expect(() => pairs('a """oops')).to.throw(SyntaxError, /Unterminated quoted string/);
            expect(() => pairs('a """"oops"""')).to.throw(
                SyntaxError,
                /Unterminated quoted string/
            );
        });

        it('throws for an unterminated list', () => {
            expect(() => pairs('a (b c')).to.throw(SyntaxError, /Unterminated list/);
        });

        it('throws for an unterminated nested list', () => {
            expect(() => pairs('a (b (c)')).to.throw(SyntaxError, /Unterminated list/);
        });

        it('throws for a stray closing parenthesis', () => {
            expect(() => pairs('a b )')).to.throw(SyntaxError, /Unexpected "\)"/);
        });
    });
});