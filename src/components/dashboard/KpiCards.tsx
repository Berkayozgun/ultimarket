"use client";

import React from "react";
import { formatTRY } from "@/lib/currency";
import { Banknote, ShoppingCart, TrendingUp, Barcode, ArrowUpRight } from "lucide-react";

interface KpiCardsProps {
  summary: {
    totalRevenue: number;
    totalBaskets: number;
    averageOrderValue: number;
    totalItemsScanned: number;
    peakHour: {
      hour: string;
      basketCount: number;
      revenue: number;
    } | null;
  };
  isLoading?: boolean;
}

export function KpiCards({ summary, isLoading }: KpiCardsProps) {
  const cards = [
    {
      id: "revenue",
      title: "GÜNLÜK TOPLAM CİRO",
      value: formatTRY(summary.totalRevenue),
      subtitle: summary.totalBaskets > 0 ? `${summary.totalBaskets} fişten elde edildi` : "Henüz satış yok",
      icon: Banknote,
      accentColor: "emerald",
      badgeText: "Canlı",
      borderGlow: "group-hover:border-emerald-500/50",
      textColor: "text-emerald-400",
      bgBadge: "bg-emerald-950/80 text-emerald-300 border-emerald-800/60",
    },
    {
      id: "baskets",
      title: "TAMAMLANAN SEPET / FİŞ",
      value: `${summary.totalBaskets} Adet`,
      subtitle: summary.peakHour ? `En yoğun: ${summary.peakHour.hour}` : "Tüm kanallar",
      icon: ShoppingCart,
      accentColor: "amber",
      badgeText: "Kapanan",
      borderGlow: "group-hover:border-amber-500/50",
      textColor: "text-amber-400",
      bgBadge: "bg-amber-950/80 text-amber-300 border-amber-800/60",
    },
    {
      id: "aov",
      title: "ORTALAMA SEPET (AOV)",
      value: formatTRY(summary.averageOrderValue),
      subtitle: "Sepet başına düşen ciro",
      icon: TrendingUp,
      accentColor: "cyan",
      badgeText: "Ortalama",
      borderGlow: "group-hover:border-cyan-500/50",
      textColor: "text-cyan-400",
      bgBadge: "bg-cyan-950/80 text-cyan-300 border-cyan-800/60",
    },
    {
      id: "scans",
      title: "OKUTULAN TOPLAM ÜRÜN",
      value: `${summary.totalItemsScanned} Adet`,
      subtitle: summary.totalBaskets > 0 
        ? `Sepet başına ~${(summary.totalItemsScanned / Math.max(1, summary.totalBaskets)).toFixed(1)} ürün`
        : "Kasa tarama hacmi",
      icon: Barcode,
      accentColor: "violet",
      badgeText: "Hacim",
      borderGlow: "group-hover:border-violet-500/50",
      textColor: "text-violet-400",
      bgBadge: "bg-violet-950/80 text-violet-300 border-violet-800/60",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map((c) => {
        const IconComponent = c.icon;
        return (
          <div
            key={c.id}
            className={`group relative bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-4 transition-all duration-150 hover:bg-zinc-900 shadow-md ${c.borderGlow} flex flex-col justify-between`}
          >
            {/* Üst Kısım: Başlık & İkon */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase font-mono">
                {c.title}
              </span>
              <div className="p-2 rounded-lg bg-zinc-800/70 border border-zinc-700/50 text-zinc-300 group-hover:text-zinc-100 transition-colors">
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            {/* Orta Kısım: Büyük Değer */}
            <div className="my-2.5">
              {isLoading ? (
                <div className="h-8 w-28 bg-zinc-800/80 animate-pulse rounded my-1" />
              ) : (
                <div className={`text-2xl font-black font-mono tracking-tight tabular-nums ${c.textColor}`}>
                  {c.value}
                </div>
              )}
            </div>

            {/* Alt Kısım: Açıklama ve Küçük Rozet */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800/60 font-mono">
              <span className="truncate pr-2">{c.subtitle}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded border shrink-0 ${c.bgBadge}`}>
                {c.badgeText}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
