/** Coerce an optional id/string field: empty/whitespace clears it to null. */
export const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};
