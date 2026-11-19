// ============================================================================
// CSV cells — quoting plus spreadsheet-formula neutralising (B32).
// A customer controls their own name / email. Saved as `=HYPERLINK(...)` or
// `=cmd|...`, the cell used to run as a formula when an admin opened the
// export in Excel / Sheets (OWASP "CSV injection"). Text that starts with a
// formula character gets a leading apostrophe, which spreadsheets show as
// plain text.
// ============================================================================

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell. `text: true` = user-written text that must never run as a formula. */
export function csvCell(value: unknown, opts: { text?: boolean } = {}): string {
  let s = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (opts.text && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
