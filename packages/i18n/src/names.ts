/**
 * Initials from a name: two letters, in the name's own script (Arabic initials for Arabic names,
 * 11 §3 "List row with initials avatar"). Honorifics are skipped.
 */
export function initialsOf(name: string, mode: 'person' | 'place' = 'person'): string {
  const words = name
    .replace(/^(Ms|Mr|Mrs|Dr|أ\.|م\.|د\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    // Arabic definite article: "مركز النور" → "من", not "ما".
    .map((w) => (w.length > 2 ? w.replace(/^ال/, '') : w));
  const first = words[0]?.[0] ?? '';
  // People: first + last name ("SF"). Places: the first two words ("Al Nour Centre" → "AN").
  const second =
    mode === 'place'
      ? (words[1]?.[0] ?? '')
      : words.length > 1
        ? (words[words.length - 1]?.[0] ?? '')
        : '';
  return (first + second).toUpperCase();
}
