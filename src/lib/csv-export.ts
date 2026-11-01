/** CSV is for spreadsheets: prefix potentially executable cells with an apostrophe.
 * JSON backups retain the original values. Leading whitespace/control characters
 * are considered because spreadsheet importers may trim them before evaluation.
 */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
