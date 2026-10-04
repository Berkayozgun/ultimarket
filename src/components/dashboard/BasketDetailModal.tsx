"use client";

import React from "react";
import { BasketSummary } from "@/lib/daily-analytics";
import { formatTRY } from "@/lib/currency";
import { X, ShoppingBag, Clock, CheckCircle2, AlertTriangle, XCircle, Info, Receipt } from "lucide-react";

interface BasketDetailModalProps {
  basket: BasketSummary | null;
  onClose: () => void;
}

export function BasketDetailModal({ basket, onClose }: BasketDetailModalProps) {
  if (!basket) return null;

  const getReasonBadge = (type: string, label: string) => {
    switch (type) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {label}
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-800 text-amber-300 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            {label}
          </span>
        );
      case "danger":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-300 font-semibold">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            {label}
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-4 md:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">
                  Sepet Detayı #{basket.id.replace("sale-", "").replace("telemetry-", "")}
                </h3>
                {getReasonBadge(basket.reasonType, basket.reasonLabel)}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {basket.timeFormatted}
                </span>
                <span>•</span>
                <span>{basket.itemCount} Kalem / Adet</span>
                <span>•</span>
                <span className="text-zinc-500 uppercase">{basket.source}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY: ÜRÜN KALEMLERİ */}
        <div className="p-4 md:p-5 overflow-y-auto flex-1 divide-y divide-zinc-800/70">
          {basket.items.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Bu sepet için kaydedilmiş detaylı ürün dökümü bulunamadı.
            </div>
          ) : (
            basket.items.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-200 truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Barkod: {item.barcode} • {formatTRY(item.unitPrice)} x {item.quantity}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-400 tabular-nums text-sm">
                    {formatTRY(item.totalPrice)}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {item.quantity} adet
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL FOOTER: TOPLAM TUTAR */}
        <div className="p-4 md:p-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider">
              Sepet Toplam Tutarı
            </div>
            <div className="text-xs text-zinc-500">
              {basket.items.length} farklı barkod
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 tabular-nums">
            {formatTRY(basket.totalAmount)}
          </div>
        </div>
      </div>
    </div>
  );
}
