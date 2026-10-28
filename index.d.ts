/**
 * An evaluated item from the default processor: a string (from an unquoted
 * word or a quoted string) or a, possibly nested, Array of items (from a list).
 */
export type Value = string | Value[];

/**
 * What the default processor returns for a section's text: a Map of its
 * key-value pairs.
 */
export type ProcessedSection = Map<string, Value>;

/**
 * A parsed ZOMG document, or one section/subsection of it.
 *
 * Each section's own processed text is stored at the `null` key (only present
 * when the section has any text left after preprocessing); every subheader is
 * stored under its header text, as another `Section`.
 *
 * @typeParam T The type produced by the `processor` option.
 */
export type Section<T = ProcessedSection> = Map<string | null, T | Section<T>>;

/** Settings for {@link parse}. */
export interface ParseOptions<T = ProcessedSection> {
  /**
   * Run on every section text value (including the root text) once parsing is
   * done; its return value replaces the text. Whitespace-only results are then
   * dropped, so the processor never sees them.
   *
   * Defaults to {@link defaultPreprocessor}.
   */
  preprocessor?: (text: string) => string;

  /**
   * Run on each remaining text value after the preprocessor; its return value,
   * of any type, becomes the final value of the section's `null` entry.
   *
   * Defaults to {@link defaultProcessor}.
   */
  processor?: (text: string) => T;
}

/**
 * Default section-text preprocessor: trims the indentation of the first
 * non-blank line from every line, and trims whitespace around the whole text.
 */
export function defaultPreprocessor(text: string): string;

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
 * - `"regular"`: ends at the next `"`; the text is used as is.
 * - `"""formatted multiline"""`: the indentation of the first non-blank line
 *   is removed from every line, then whitespace around the whole string is
 *   trimmed.
 * - `""""formatted multiline, joined""""`: like the above, then the newlines
 *   are removed so the lines run together.
 *
 * @throws {SyntaxError} on an unterminated string or list, a stray `)`, a
 *   nested list inside a list of keys, or a key with no value.
 */
export function defaultProcessor(text: string): ProcessedSection;

/**
 * Parse ZOMG text into a nested Map.
 *
 * @param text The ZOMG text to parse.
 * @param options Parser settings.
 * @typeParam T The type produced by `options.processor`.
 */
export function parse<T = ProcessedSection>(
  text: string,
  options?: ParseOptions<T>,
): Section<T>;

export default parse;