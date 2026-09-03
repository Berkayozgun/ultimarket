/**
 * Ürün adı kural tabanlı normalizasyonu (clean-products script + testler için)
 */

const ABBREVIATION_REPLACEMENTS: [RegExp, string][] = [
  [/\bROT\b/gi, "Rothmans"],
  [/\bT2000\b/gi, "Tekel 2000"],
  [/\bT2001\b/gi, "Tekel 2001"],
  [/\bMLTP\b/gi, "Maltepe"],
  [/\bD[\s-]?RNG\b/gi, "D-Range"],
  [/\bBLCK\b/gi, "Black"],
  [/\bKS\.BOX\b/gi, "Kısa Box"],
  [/\bA\.FST-CIK\b/gi, "Antep Fıstıklı Çikolata"],
];

const UNIT_REPLACEMENTS: [RegExp, string][] = [
  [/(\d+)\s*GR\.?/gi, "$1 g"],
  [/(\d+)\s*GR\b/gi, "$1 g"],
  [/(\d+)\s*G\b/gi, "$1 g"],
  [/0\.5\s*LT\b/gi, "500 ml"],
  [/(\d+)\s*ML\b/gi, "$1 ml"],
  [/(\d+)\s*CL\b/gi, "$1 cl"],
];

function replaceLiterUnits(name: string): string {
  return name.replace(/(\d+(?:[.,]\d+)?)\s*LT\b/gi, (_, n: string) => {
    const val = parseFloat(n.replace(",", "."));
    return val < 1 ? `${Math.round(val * 1000)} ml` : `${n.replace(",", ".")} L`;
  });
}

const LOWERCASE_WORDS = new Set([
  "ve", "ile", "için", "de", "da", "den", "dan", "ki", "bir", "the", "of", "and",
]);

function titleCaseWord(word: string, index: number): string {
  if (!word) return word;

  const upper = word.toLocaleUpperCase("tr-TR");
  if (word === upper && word.length <= 5) {
    return word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1).toLocaleLowerCase("tr-TR");
  }

  const lower = word.toLocaleLowerCase("tr-TR");
  if (index > 0 && LOWERCASE_WORDS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}

export function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((word, i) => titleCaseWord(word, i))
    .join(" ");
}

export function normalizeProductName(name: string): string {
  if (!name) return "";

  let result = name
    .replace(/\s{2,}/g, " ")
    .trim();

  for (const [pattern, replacement] of ABBREVIATION_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = toTitleCase(result);

  result = replaceLiterUnits(result);
  for (const [pattern, replacement] of UNIT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

export type SuspicionReason = "short-name" | "no-price" | "negative-price";

export interface SuspiciousProduct {
  id: number;
  barcode: string;
  name: string;
  sellPrice: number;
  reasons: SuspicionReason[];
}

export function detectSuspiciousProducts(
  products: { id: number; barcode: string; name: string; sellPrice: number }[]
): SuspiciousProduct[] {
  return products
    .map((p) => {
      const reasons: SuspicionReason[] = [];
      if (p.name.trim().length < 4) reasons.push("short-name");
      if (p.sellPrice <= 0) reasons.push(p.sellPrice < 0 ? "negative-price" : "no-price");
      return reasons.length > 0 ? { ...p, reasons } : null;
    })
    .filter((p): p is SuspiciousProduct => p !== null);
}

export function needsAiCleanup(name: string, normalized: string): boolean {
  if (name === normalized) return false;
  const hasAbbrev = /\b[A-Z]{2,5}\b/.test(name) || /\b[A-Z]\.[A-Z]/.test(name);
  const hasOddChars = /[._-]{2,}|\.[A-Z]/.test(name);
  return hasAbbrev || hasOddChars;
}
