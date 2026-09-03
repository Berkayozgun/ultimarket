"use client";

import "./receipt-print.css";
import { RECEIPT_STORE } from "@/lib/receipt-config";
import {
  calcVatFromGross,
  formatReceiptDate,
  formatReceiptTime,
  formatStarAmount,
  inferVatRate,
  padReceiptNumber,
  receiptPaymentLabel,
} from "@/lib/receipt-format";
import { formatTRYNumber } from "@/lib/currency";

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

export interface ReceiptData {
  saleId: number;
  date: Date;
  paymentType: "NAKIT" | "KART" | "VERESIYE";
  items: ReceiptLineItem[];
  ekuNo?: number;
  zNo?: number;
}

interface ReceiptPrintProps {
  data: ReceiptData | null;
}

function getEkuNo(): number {
  if (typeof window === "undefined") return 1;
  const stored = localStorage.getItem("ultimarket-eku-no");
  return stored ? parseInt(stored, 10) || 1 : 1;
}

function getZNo(): number {
  if (typeof window === "undefined") return 1;
  const stored = localStorage.getItem("ultimarket-z-no");
  return stored ? parseInt(stored, 10) || 1 : 1;
}

export function ReceiptPrint({ data }: ReceiptPrintProps) {
  if (!data) return null;

  const { saleId, date, paymentType, items } = data;
  const ekuNo = data.ekuNo ?? getEkuNo();
  const zNo = data.zNo ?? getZNo();

  const lines = items.map((item) => {
    const vatRate = item.vatRate ?? inferVatRate(item.name);
    const lineTotal = item.quantity * item.unitPrice;
    return { ...item, vatRate, lineTotal };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const totalVat = lines.reduce(
    (sum, l) => sum + calcVatFromGross(l.lineTotal, l.vatRate),
    0
  );
  const paymentLabel = receiptPaymentLabel(paymentType);
  const receiptNo = padReceiptNumber(saleId);
  const dateStr = formatReceiptDate(date);
  const timeStr = formatReceiptTime(date);

  return (
    <div
      id="thermal-receipt"
      className="thermal-receipt-container text-left tracking-[0.5px]"
      aria-hidden="true"
    >
      <div className="receipt-header text-left">
        <div className="receipt-title tracking-wide text-left">{RECEIPT_STORE.name}</div>
        <div className="receipt-header-meta text-left">{RECEIPT_STORE.owner}</div>
        {RECEIPT_STORE.addressLines.map((line) => (
          <div key={line} className="receipt-header-meta text-left">
            {line}
          </div>
        ))}
        <div className="receipt-header-meta text-left">
          {RECEIPT_STORE.taxOffice} {RECEIPT_STORE.taxNumber}
        </div>
      </div>

      <div className="receipt-spacer" />

      <div className="receipt-row receipt-meta flex w-full items-center justify-between">
        <span>TARİH: {dateStr}</span>
        <span>FİŞ NO: {receiptNo}</span>
      </div>
      <div className="receipt-meta text-left">SAAT: {timeStr}</div>

      <div className="receipt-spacer" />

      {lines.map((item, index) => (
        <div key={`${item.name}-${index}`} className="receipt-item">
          <div className="receipt-row receipt-item-line flex w-full items-center justify-between tracking-wide">
            <span>{item.name}</span>
            <span>{formatStarAmount(item.lineTotal)}</span>
          </div>
          {item.quantity > 1 && (
            <div className="receipt-item-qty text-left">
              {item.quantity} Adet x {formatTRYNumber(item.unitPrice)}
            </div>
          )}
        </div>
      ))}

      <div className="receipt-spacer" />

      <div className="receipt-row receipt-vat flex w-full items-center justify-between">
        <span>KDV</span>
        <span>{formatStarAmount(totalVat)}</span>
      </div>

      <div className="receipt-row receipt-total flex w-full items-center justify-between">
        <span>TOP</span>
        <span>{formatStarAmount(subtotal)}</span>
      </div>

      <div className="receipt-row receipt-payment flex w-full items-center justify-between">
        <span>{paymentLabel}</span>
        <span>{formatStarAmount(subtotal)}</span>
      </div>

      <div className="receipt-spacer" />

      <div className="receipt-divider w-full border-t-2 border-black" />

      <div className="receipt-footer text-left">
        <div className="receipt-footer-text text-left">MALİ DEĞERİ YOKTUR</div>
        <div className="receipt-footer-text text-left">BİLGİ FİŞİDİR</div>
        <div className="receipt-thanks text-left">
          Bizi Tercih Ettiğiniz İçin Teşekkür Ederiz
        </div>
      </div>

      <div className="receipt-divider w-full border-t-2 border-black" />

      <div className="receipt-row receipt-meta flex w-full items-center justify-between">
        <span>EKÜ NO: {padReceiptNumber(ekuNo)}</span>
        <span>Z NO: {padReceiptNumber(zNo)}</span>
      </div>
    </div>
  );
}

/** Satış API yanıtından fiş verisi oluştur */
export function buildReceiptDataFromSale(sale: {
  id: number;
  paymentType: "NAKIT" | "KART" | "VERESIYE";
  createdAt: string;
  items: Array<{
    quantity: number;
    unitPrice: number;
    product: { name: string };
  }>;
}): ReceiptData {
  return {
    saleId: sale.id,
    date: new Date(sale.createdAt),
    paymentType: sale.paymentType,
    items: sale.items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}
