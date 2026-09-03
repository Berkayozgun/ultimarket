"use client";

import { formatTRYNumber } from "@/lib/currency";
import {
  QUICK_SALE_ACCENT_STYLES,
  QUICK_SALE_DEFS,
  type QuickSaleDefinition,
  type ResolvedQuickSaleProduct,
} from "@/lib/quick-sale";
import { Zap } from "lucide-react";

interface QuickSaleGridProps {
  resolvedProducts: Map<string, ResolvedQuickSaleProduct>;
  onQuickSale: (def: QuickSaleDefinition, resolved?: ResolvedQuickSaleProduct) => void;
  disabled?: boolean;
}

export function QuickSaleGrid({
  resolvedProducts,
  onQuickSale,
  disabled = false,
}: QuickSaleGridProps) {
  return (
    <div className="px-4 py-2.5 bg-neutral-900/40 border-b border-neutral-800 shrink-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Hızlı Satış
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {QUICK_SALE_DEFS.map((def) => {
          const resolved = resolvedProducts.get(def.id);
          const displayName = resolved?.name ?? def.label;
          const displayPrice = resolved?.sellPrice ?? def.defaultPrice;
          const styles = QUICK_SALE_ACCENT_STYLES[def.accent];
          const Icon = def.icon;

          return (
            <button
              key={def.id}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                onQuickSale(def, resolved ?? undefined);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 rounded-lg border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${styles.button}`}
              aria-label={`${displayName} ekle — ${formatTRYNumber(displayPrice)} ₺`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${styles.icon}`} strokeWidth={2} />
              <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-100 leading-tight text-center line-clamp-2">
                {displayName}
              </span>
              <span className={`text-[10px] font-bold tabular-nums ${styles.price}`}>
                {formatTRYNumber(displayPrice)} ₺
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
