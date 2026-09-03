import { formatTRYNumber } from "@/lib/currency";
import { RECEIPT_LINE_WIDTH } from "@/lib/receipt-config";

export function padReceiptNumber(value: number, digits = 4): string {
  return String(value).padStart(digits, "0");
}

export function formatReceiptDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export function formatReceiptTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/** Yıldızlı tutar: *260,00 */
export function formatStarAmount(amount: number): string {
  return `*${formatTRYNumber(amount)}`;
}

/** KDV oranı: %00, %01, %10, %20 */
export function formatVatRate(rate: number): string {
  return `%${String(Math.round(rate)).padStart(2, "0")}`;
}

export function justifyLine(left: string, right: string, width = RECEIPT_LINE_WIDTH): string {
  const trimmedLeft = left.slice(0, width - right.length - 1);
  const spaces = width - trimmedLeft.length - right.length;
  if (spaces < 1) return `${trimmedLeft.slice(0, width - right.length)}${right}`;
  return `${trimmedLeft}${" ".repeat(spaces)}${right}`;
}

/**
 * Ürün satırı: ad (sol), KDV (orta), tutar (sağ)
 * Örn: TÜTÜN MAM.           %00        *260,00
 */
export function formatItemLine(
  name: string,
  vatRate: number,
  lineTotal: number,
  width = RECEIPT_LINE_WIDTH
): string {
  const amountStr = formatStarAmount(lineTotal);
  const vatStr = formatVatRate(vatRate);

  const nameCol = 18;
  const vatCol = 4;
  const amountCol = width - nameCol - vatCol;

  const namePart = name.slice(0, nameCol).padEnd(nameCol);
  const vatPart = vatStr.padStart(vatCol);
  const amountPart = amountStr.padStart(amountCol);

  return `${namePart}${vatPart}${amountPart}`;
}

/** KDV dahil fiyattan KDV tutarını hesapla */
export function calcVatFromGross(gross: number, vatRate: number): number {
  if (vatRate <= 0) return 0;
  return Number((gross - gross / (1 + vatRate / 100)).toFixed(2));
}

/** Ürün adından tahmini KDV oranı */
export function inferVatRate(productName: string): number {
  const upper = productName.toLocaleUpperCase("tr-TR");
  if (
    upper.includes("TÜTÜN") ||
    upper.includes("TUTUN") ||
    upper.includes("SİGARA") ||
    upper.includes("SIGARA")
  ) {
    return 0;
  }
  return 20;
}

export function receiptPaymentLabel(paymentType: "NAKIT" | "KART" | "VERESIYE"): string {
  switch (paymentType) {
    case "NAKIT":
      return "NAKİT";
    case "KART":
      return "EFT-POS";
    case "VERESIYE":
      return "VERESİYE";
  }
}
