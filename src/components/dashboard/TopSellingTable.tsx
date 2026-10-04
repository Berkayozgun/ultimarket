"use client";

import React, { useState, useMemo } from "react";
import { TopProduct } from "@/lib/daily-analytics";
import { formatTRY } from "@/lib/currency";
import { Flame, Trophy, Package, ArrowUpDown, Tag } from "lucide-react";

interface TopSellingTableProps {
  products: TopProduct[];
  isLoading?: boolean;
}

export function TopSellingTable({ products, isLoading }: TopSellingTableProps) {
  const [sortBy, setSortBy] = useState<"quantity" | "revenue">("quantity");

  const sortedList = useMemo(() => {
    return [...products].sort((a, b) => {
      if (sortBy === "revenue") {
        return b.revenue - a.revenue || b.quantity - a.quantity;
      }
      return b.quantity - a.quantity || b.revenue - a.revenue;
    });
  }, [products, sortBy]);

  const maxRevenue = useMemo(() => {
    return Math.max(...products.map((p) => p.revenue), 1);
  }, [products]);

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-4 md:p-5 flex flex-col justify-between shadow-lg">
      {/* BAŞLIK & SIRALAMA SEÇENEĞİ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Günün En Çok Satanları
          </h3>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Dükkanın en çok satan ilk 10 ürünü ve ciro katkıları
          </p>
        </div>

        {/* Sıralama Butonları */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
          <button
            onClick={() => setSortBy("quantity")}
            className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
              sortBy === "quantity"
                ? "bg-zinc-800 text-amber-300 font-semibold shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Package className="w-3 h-3" />
            Adede Göre
          </button>
          <button
            onClick={() => setSortBy("revenue")}
            className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
              sortBy === "revenue"
                ? "bg-zinc-800 text-emerald-300 font-semibold shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Tag className="w-3 h-3" />
            Ciroya Göre
          </button>
        </div>
      </div>

      {/* TABLO / LİSTE ALANI */}
      <div className="overflow-x-auto my-3">
        {isLoading ? (
          <div className="space-y-2 py-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-zinc-950/60 rounded-lg animate-pulse border border-zinc-800/40" />
            ))}
          </div>
        ) : sortedList.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center font-mono">
            <Package className="w-8 h-8 text-zinc-600 mb-2" />
            <span className="text-zinc-300 text-sm font-semibold">
              Henüz Satılan Ürün Yok
            </span>
            <span className="text-zinc-500 text-xs mt-1">
              Kasada satış yapıldıkça en çok satan ürünler burada sıralanır.
            </span>
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800/80 text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-2 w-12 text-center">Sıra</th>
                <th className="py-2.5 px-3">Ürün Adı</th>
                <th className="py-2.5 px-3 text-right">Adet</th>
                <th className="py-2.5 px-3 text-right">Birim Fiyat</th>
                <th className="py-2.5 px-3 text-right">Toplam Ciro</th>
                <th className="py-2.5 px-3 w-36 text-right">Ciro Payı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {sortedList.map((product, idx) => {
                const rank = idx + 1;
                let rankBadge = (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-bold">
                    {rank}
                  </span>
                );
                if (rank === 1) {
                  rankBadge = (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black">
                      1
                    </span>
                  );
                } else if (rank === 2) {
                  rankBadge = (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-300/20 text-zinc-200 border border-zinc-400/40 text-[11px] font-bold">
                      2
                    </span>
                  );
                } else if (rank === 3) {
                  rankBadge = (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-800/30 text-amber-500 border border-amber-700/50 text-[11px] font-bold">
                      3
                    </span>
                  );
                }

                const relativeWidth = Math.min(100, Math.max(5, (product.revenue / maxRevenue) * 100));

                return (
                  <tr
                    key={product.barcode}
                    className="hover:bg-zinc-800/40 transition-colors group"
                  >
                    {/* Sıra */}
                    <td className="py-2.5 px-2 text-center">{rankBadge}</td>

                    {/* Ürün Adı & Barkod */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-zinc-200 group-hover:text-emerald-300 transition-colors">
                        {product.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 tracking-wider">
                        {product.barcode}
                      </div>
                    </td>

                    {/* Satılan Adet */}
                    <td className="py-2.5 px-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-bold text-amber-400 tabular-nums">
                        {product.quantity} Adet
                      </span>
                    </td>

                    {/* Birim Fiyat */}
                    <td className="py-2.5 px-3 text-right text-zinc-400 tabular-nums">
                      {formatTRY(product.unitPrice)}
                    </td>

                    {/* Toplam Ciro */}
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400 tabular-nums">
                      {formatTRY(product.revenue)}
                    </td>

                    {/* Yüzdelik Ciro Payı & Progress Bar */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${relativeWidth}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-zinc-300 font-semibold tabular-nums w-10 text-right">
                          %{product.revenueShare}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ALT BİLGİ */}
      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-800/60">
        <span>Günün kümülatif en yüksek ciro ve hacim üreten kalemleri</span>
        <span>İlk 10 Ürün</span>
      </div>
    </div>
  );
}
