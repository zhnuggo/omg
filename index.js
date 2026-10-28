/**
 * ZOMG parser.
 *
 * Syntax:
 *   [header text] { section text }
 *
 * - A header starts with `[` and ends with an unescaped `]` (`\]` is a literal `]`).
 * - A header only counts if it is followed (after optional whitespace) by `{`;
 *   otherwise the `[` is treated as ordinary text.
 * - A section ends at the first `}` that is not inside a `"quoted string"`.
 * - Headers inside a section create subsections.
 * - Text outside any section belongs to the root (stored under the `null` key).
 *
 * Result: a Map of header text -> Map, where each Map holds its own text under
 * the `null` key (only present when there is text) and its subheaders under
 * their header text.
 */

/**
 * An evaluated item from the default processor: a string (from an unquoted
 * word or a quoted string) or a, possibly nested, Array of items (from a list).
 * @typedef {string | ValueList} Value
 */

/**
 * A list item: an Array of items.
 * @typedef {Array<Value>} ValueList
 */

/**
 * What the default processor returns for a section's text: a Map of its
 * key-value pairs.
 * @typedef {Map<string, Value>} ProcessedSection
 */

/**
 * A parsed ZOMG document, or one section/subsection of it.
 *
 * Each section's own processed text is stored at the `null` key (only present
 * when the section has any text left after preprocessing); every subheader is
 * stored under its header text, as another `Section`.
 *
 * @template [T=ProcessedSection] The type produced by the `processor` option.
 * @typedef {Map<string | null, T | Section<T>>} Section
 */

/**
 * Settings for {@link parse}.
 *
 * @template [T=ProcessedSection]
 * @typedef {object} ParseOptions
 * @property {(text: string) => string} [preprocessor]
 *   Run on every section text value (including the root text) once parsing is
 *   done; its return value replaces the text. Whitespace-only results are then
 *   dropped, so the processor never sees them. Defaults to
 *   {@link defaultPreprocessor}.
 * @property {(text: string) => T} [processor]
 *   Run on each remaining text value after the preprocessor; its return value,
 *   of any type, becomes the final value of the section's `null` entry.
 *   Defaults to {@link defaultProcessor}.
 */

/**
 * Try to read a header starting at `start` (which must be a `[`).
 * Returns the header text and the index of the section-opening `{`,
 * or null if this isn't a valid header + section opener.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ name: string, braceIndex: number } | null}
 */
function readHeader(text, start) {
    let name = '';
    let i = start + 1;

    for (; i < text.length; i++) {
        const ch = text[i];

        if (ch === '\\' && text[i + 1] === ']') {
            name += ']';
            i++;
        }
        else if (ch === ']') {
            break;
        }
        else {
            name += ch;
        }
    }

    if (i >= text.length) {
        return null;
    } // no closing `]`

    i++; // past `]`

    while (i < text.length && /\s/.test(text[i])) {
        i++;
    }

    if (text[i] !== '{') {
        return null;
    } // header not followed by a section

    return { name, braceIndex: i };
}

/**
 * Removes the indentation of the first non-blank line from every line (up to
 * that many leading whitespace characters, so less-indented lines lose only
 * what they have), then trims whitespace around the whole text. Whitespace at
 * the end of each line is left alone.
 *
 * @param {string} text
 * @returns {string}
 */
function trimIndent(text) {
    const lines = text.split('\n');

    const first = lines.find((line) => line.trim() !== '');

    if (first === undefined) {
        return '';
    }

    const indent = first.length - first.trimStart().length;

    return lines
        .map((line) => {
            let i = 0;

            while (i < indent && i < line.length && /\s/.test(line[i])) {
                i++;
            }

            return line.slice(i);
        })
        .join('\n')
        .trim();
}

/**
 * Default section-text preprocessor: trims the indentation of the first
 * non-blank line from every line, and trims whitespace around the whole text.
 *
 * @param {string} text
 * @returns {string}
 */
export function defaultPreprocessor(text) {
    return trimIndent(text);
}

/**
 * Default section processor: reads whitespace-separated items and pairs them
 * up as key, value, key, value, ...
 *
 * An item is an unquoted word, a string, or a (list of items) that may nest.
 * Words and strings become strings; a list becomes an Array of its evaluated
 * items. A list used as a key is a list of keys (strings only) that all get
 * the following value. A repeated key overwrites its earlier value.
 *
 * Strings come in three forms. In all of them `\"` puts a literal quote in the
 * string and any other backslash is kept as written.
 * - "regular": ends at the next `"`; the text is used as is.
 * - """formatted multiline""": the indentation of the first non-blank line is
 *   removed from every line, then whitespace around the whole string is
 *   trimmed.
 * - """"formatted multiline, joined"""": like the above, then the newlines
 *   are removed so the lines run together.
 *
 * @param {string} text
 * @returns {ProcessedSection}
 * @throws {SyntaxError} on an unterminated string or list, a stray `)`, a
 *   nested list inside a list of keys, or a key with no value.
 */
export function defaultProcessor(text) {
    let pos = 0;

    /** @param {string} ch */
    const isSpace = (ch) => /\s/.test(ch);

    const skipSpace = () => {
        while (pos < text.length && isSpace(text[pos])) {
            pos++;
        }
    };

    const readString = () => {
        const start = pos;
        const delimiter = text.startsWith('""""', pos)
            ? '""""'
            : text.startsWith('"""', pos)
                ? '"""'
                : '"';
        pos += delimiter.length;

        let value = '';

        while (pos < text.length) {
            if (text[pos] === '\\' && text[pos + 1] === '"') {
                value += '"'; // `\"` is the only escape; any other `\` stays as written
                pos += 2;
            }
            else if (text.startsWith(delimiter, pos)) {
                pos += delimiter.length;

                if (delimiter === '"""') {
                    return trimIndent(value);
                }

                if (delimiter === '""""') {
                    return trimIndent(value).replace(/\r?\n/g, '');
                }

                return value;
            }
            else {
                value += text[pos++];
            }
        }

        throw new SyntaxError(`Unterminated quoted string starting at position ${start}`);
    };

    const readWord = () => {
        const start = pos;

        while (pos < text.length && !isSpace(text[pos]) && !'()"'.includes(text[pos])) {
            pos++;
        }

        return text.slice(start, pos);
    };

    /** @returns {ValueList} */
    const readList = () => {
        const start = pos++; // past the opening paren
        const list = [];

        for (;;) {
            skipSpace();

            if (pos >= text.length) {
                throw new SyntaxError(`Unterminated list starting at position ${start}`);
            }

            if (text[pos] === ')') {
                pos++;
                return list;
            }

            list.push(readItem());
        }
    };

    /** @returns {Value} */
    const readItem = () => {
        const ch = text[pos];

        if (ch === '"') {
            return readString();
        }

        if (ch === '(') {
            return readList();
        }

        if (ch === ')') {
            throw new SyntaxError(`Unexpected ")" at position ${pos}`);
        }

        return readWord();
    };

    /** @param {Value} value @returns {Value} */
    const clone = (value) => (Array.isArray(value) ? value.map(clone) : value);

    const result = new Map();

    for (skipSpace(); pos < text.length; skipSpace()) {
        const key = readItem();

        if (Array.isArray(key) && key.some((k) => typeof k !== 'string')) {
            throw new SyntaxError('A list of keys cannot contain a nested list');
        }

        skipSpace();

        if (pos >= text.length) {
            throw new SyntaxError(`Missing value for key ${JSON.stringify(key)}`);
        }

        const value = readItem();

        for (const k of Array.isArray(key) ? key : [key]) {
            result.set(k, clone(value)); // each key gets its own copy of a list value
        }
    }

    return result;
}

/**
 * Parse ZOMG text into a nested Map.
 *
 * @template [T=ProcessedSection] The type produced by `options.processor`.
 * @param {string} text The ZOMG text to parse.
 * @param {ParseOptions<T>} [options] Parser settings.
 * @returns {Section<T>}
 */
export function parse(text, options = {}) {
    const {
        preprocessor = defaultPreprocessor,
        processor = defaultProcessor
    } = options;

    if (typeof preprocessor !== 'function') {
        throw new TypeError('options.preprocessor must be a function');
    }

    if (typeof processor !== 'function') {
        throw new TypeError('options.processor must be a function');
    }

    const result = new Map();
    const stack = [result];
    let buffer = '';
    let inQuote = false;

    const flush = () => {
        if (!buffer) {
            return;
        }

        const current = stack[stack.length - 1];
        current.set(null, (current.get(null) ?? '') + buffer);
        buffer = '';
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuote) {
            buffer += ch;

            if (ch === '\\' && i + 1 < text.length) {
                buffer += text[++i]; // escaped character (e.g. \") stays literal
            }
            else if (ch === '"') {
                inQuote = false;
            }

            continue;
        }

        if (ch === '"') {
            inQuote = true;
            buffer += ch;
        }
        else if (ch === '[') {
            const header = readHeader(text, i);

            if (header) {
                flush();
                const parent = stack[stack.length - 1];
                let child = parent.get(header.name);

                if (!child) {
                    child = new Map();
                    parent.set(header.name, child);
                }

                stack.push(child);
                i = header.braceIndex;
            }
            else {
                buffer += ch;
            }
        }
        else if (ch === '}' && stack.length > 1) {
            flush();
            stack.pop();
        }
        else {
            buffer += ch;
        }
    }

    flush();
    return prune(result, preprocessor, processor);
}

/**
 * Post-process a parsed Map (in place, bottom-up):
 * - runs each `null` text entry through the preprocessor
 * - drops a `null` text entry that is (or becomes) only whitespace
 * - runs each remaining text entry through the processor, which replaces it
 * - drops any header entry left with no text and no subheaders
 *
 * @param {Section<any>} map
 * @param {(text: string) => string} preprocessor
 * @param {(text: string) => any} processor
 * @returns {Section<any>}
 */
function prune(map, preprocessor, processor) {
    for (const [key, value] of [...map]) {
        if (key === null) {
            const preprocessed = String(preprocessor(value) ?? '');

            if (/^\s*$/.test(preprocessed)) {
                map.delete(null);
            }
            else {
                map.set(null, processor(preprocessed));
            }
        }
        else if (prune(value, preprocessor, processor).size === 0) {
            map.delete(key);
        }
    }

    return map;
}

export default parse;
