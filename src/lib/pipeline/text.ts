const cache = new Map<string, RegExp>();

/** Case-insensitive whole-term matcher: "git" matches "Git," but not "github"; "node.js" works too. */
export function termRegex(term: string): RegExp {
  const key = term.toLowerCase();
  let re = cache.get(key);
  if (!re) {
    const escaped = key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
    re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    cache.set(key, re);
  }
  return re;
}

export function hasTerm(text: string, term: string): boolean {
  return termRegex(term).test(text);
}

/** Terms from `terms` that occur in `text`, in list order. */
export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => hasTerm(text, t));
}

/** Plain substring match, for phrases like "@gmail.com" where word boundaries do not apply. */
export function findPhrases(text: string, phrases: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p.toLowerCase()));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
