/**
 * Fatura kalemleri için küçük harf, TR uyumlu, birim ve noktalama temizliği
 */
export function normalizeItemName(name: string): string {
  if (!name) return "";

  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, " ")
    .replace(
      /\b(kg|gr|g|lt|l|ml|cl|adet|koli|paket|teneke|tetrapak|şişe|kutu|çuval|demlik|adetli)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** OCR/PDF çıktısındaki tarihleri ISO (YYYY-MM-DD) formatına çevirir */
export function normalizeInvoiceDate(value: unknown): string | null {
  if (value == null) return null;

  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "null") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const trDayFirst = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (trDayFirst) {
    const [, day, month, year] = trDayFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const yearFirst = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (yearFirst) {
    const [, year, month, day] = yearFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw;
}
