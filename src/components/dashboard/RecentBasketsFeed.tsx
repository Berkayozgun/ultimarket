"use client";

import React, { useState } from "react";
import { BasketSummary } from "@/lib/daily-analytics";
import { formatTRY } from "@/lib/currency";
import { BasketDetailModal } from "./BasketDetailModal";
import {
  Clock,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Radio,
} from "lucide-react";

interface RecentBasketsFeedProps {
  baskets: BasketSummary[];
  isLoading?: boolean;
}

export function RecentBasketsFeed({ baskets, isLoading }: RecentBasketsFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalBasket, setModalBasket] = useState<BasketSummary | null>(null);

  const toggleAccordion = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderBadge = (type: string, label: string) => {
    switch (type) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-semibold shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {label}
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold shrink-0">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            {label}
          </span>
        );
      case "danger":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-950/80 border border-red-800/80 text-red-300 font-semibold shrink-0">
            <XCircle className="w-3 h-3 text-red-400" />
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold shrink-0">
            <Info className="w-3 h-3 text-zinc-400" />
            {label}
          </span>
        );
    }
  };

  return (
    <>
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-4 md:p-5 flex flex-col justify-between shadow-lg">
        {/* BAŞLIK & DURUM */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                Son Kapanan Sepetler & Fiş Akışı
              </h3>
              <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800 text-emerald-300">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Canlı Akış
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Kasadan geçen son 15 sepetin durum, kapanış nedeni ve tutar dökümü
            </p>
          </div>
          <div className="text-xs font-mono text-zinc-400">
            Toplam: <span className="text-zinc-200 font-bold">{baskets.length}</span> Sepet
          </div>
        </div>

        {/* SEPETLER LİSTESİ */}
        <div className="divide-y divide-zinc-800/60 my-2 max-h-[460px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-zinc-950/60 rounded-lg animate-pulse border border-zinc-800/40" />
              ))}
            </div>
          ) : baskets.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center font-mono">
              <ShoppingBag className="w-8 h-8 text-zinc-600 mb-2" />
              <span className="text-zinc-300 text-sm font-semibold">
                Henüz Kapanan Sepet Kaydı Yok
              </span>
              <span className="text-zinc-500 text-xs mt-1">
                Kasa işlem tamamlandığında veya zaman aşımıyla sepet kapandığında buraya anlık düşecektir.
              </span>
            </div>
          ) : (
            baskets.map((basket, index) => {
              const isExpanded = expandedId === basket.id;
              const isFirst = index === 0;

              return (
                <div
                  key={basket.id}
                  className={`py-3 transition-colors rounded-lg px-2 group ${
                    isFirst ? "bg-emerald-950/20 border-l-2 border-emerald-500 pl-3" : "hover:bg-zinc-800/30"
                  }`}
                >
                  {/* Satır Başlığı */}
                  <div className="flex items-center justify-between gap-3 font-mono">
                    {/* Sol Kısım: Zaman, ID ve Rozet */}
                    <div
                      className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0"
                      onClick={() => toggleAccordion(basket.id)}
                    >
                      <div className="flex items-center gap-1.5 text-zinc-400 text-xs shrink-0">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-200 font-bold">{basket.timeFormatted}</span>
                      </div>

                      <div className="truncate text-xs font-semibold text-zinc-300 group-hover:text-emerald-300 transition-colors">
                        Sepet #{basket.id.replace("sale-", "S-").replace("telemetry-", "T-")}
                      </div>

                      {renderBadge(basket.reasonType, basket.reasonLabel)}
                    </div>

                    {/* Sağ Kısım: Adet, Tutar ve Eylemler */}
                    <div className="flex items-center gap-3 text-right shrink-0">
                      <div className="hidden sm:block text-[11px] text-zinc-400">
                        <span className="text-zinc-200 font-bold">{basket.itemCount}</span> Ürün
                      </div>

                      <div className="text-sm font-black text-emerald-400 tabular-nums">
                        {formatTRY(basket.totalAmount)}
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Akordeon Toggle */}
                        <button
                          onClick={() => toggleAccordion(basket.id)}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                          title="Hızlı Döküm"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {/* Tam Modal Butonu */}
                        <button
                          onClick={() => setModalBasket(basket)}
                          className="p-1 rounded text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800 transition-colors"
                          title="Ayrıntılı Fiş Detayı"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AKORDEON GENİŞLEYEN DETAY */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80 bg-zinc-950/60 rounded-lg p-3 font-mono text-xs animate-in fade-in duration-100">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Sepetteki Ürünler ({basket.items.length} Kalem)</span>
                        <button
                          onClick={() => setModalBasket(basket)}
                          className="text-emerald-400 hover:underline text-[10px] lowercase font-normal"
                        >
                          tüm detayı aç
                        </button>
                      </div>

                      {basket.items.length === 0 ? (
                        <div className="text-zinc-500 text-xs py-1">
                          Ürün bazlı döküm bulunmuyor.
                        </div>
                      ) : (
                        <div className="space-y-1.5 divide-y divide-zinc-900">
                          {basket.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="pt-1.5 first:pt-0 flex items-center justify-between gap-2"
                            >
                              <div className="truncate">
                                <span className="text-zinc-200 font-medium">
                                  {it.name}
                                </span>
                                <span className="text-zinc-500 text-[10px] ml-2">
                                  ({it.quantity} x {formatTRY(it.unitPrice)})
                                </span>
                              </div>
                              <span className="font-semibold text-emerald-400 tabular-nums shrink-0">
                                {formatTRY(it.totalPrice)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ALT BİLGİ */}
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-800/60">
          <span>Tıklayarak sepet kalemlerini hızlıca inceleyebilirsiniz</span>
          <span>Son 15 İşlem</span>
        </div>
      </div>

      {/* DETAY MODAL */}
      <BasketDetailModal
        basket={modalBasket}
        onClose={() => setModalBasket(null)}
      />
    </>
  );
}
