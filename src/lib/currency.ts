const TRY_FORMAT: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const tryFormatter = new Intl.NumberFormat("tr-TR", TRY_FORMAT);

/** Türk Lirası formatı: 1.234,56 ₺ */
export function formatTRY(amount: number): string {
  return tryFormatter.format(amount);
}

/** Sadece sayı kısmı (sembol ayrı gösterilecekse) */
export function formatTRYNumber(amount: number): string {
  return amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
