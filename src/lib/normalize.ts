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
