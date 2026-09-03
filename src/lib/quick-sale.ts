import type { LucideIcon } from "lucide-react";
import { Coffee, Croissant, Droplet, ShoppingBag, Wheat } from "lucide-react";

export interface QuickSaleDefinition {
  id: string;
  label: string;
  searchTerms: string[];
  defaultPrice: number;
  barcode: string;
  icon: LucideIcon;
  accent: "amber" | "sky" | "emerald" | "orange" | "rose";
}

export const QUICK_SALE_VIRTUAL_ID_BASE = -10_000;

export const QUICK_SALE_DEFS: QuickSaleDefinition[] = [
  {
    id: "ekmek",
    label: "Ekmek",
    searchTerms: ["ekmek", "somun ekmek", "somun"],
    defaultPrice: 10,
    barcode: "QUICK-EKMEK",
    icon: Wheat,
    accent: "amber",
  },
  {
    id: "su",
    label: "Su 0.5L",
    searchTerms: ["su 0.5", "su 500", "0.5l su", "su"],
    defaultPrice: 5,
    barcode: "QUICK-SU",
    icon: Droplet,
    accent: "sky",
  },
  {
    id: "poset",
    label: "Poşet",
    searchTerms: ["poşet", "poset", "alışveriş poşeti"],
    defaultPrice: 0.5,
    barcode: "QUICK-POSET",
    icon: ShoppingBag,
    accent: "emerald",
  },
  {
    id: "simit",
    label: "Simit",
    searchTerms: ["simit", "gevrek"],
    defaultPrice: 15,
    barcode: "QUICK-SIMIT",
    icon: Croissant,
    accent: "orange",
  },
  {
    id: "cay",
    label: "Çay",
    searchTerms: ["çay", "cay", "sıcak içecek", "sicak icecek"],
    defaultPrice: 8,
    barcode: "QUICK-CAY",
    icon: Coffee,
    accent: "rose",
  },
];

export function getQuickSaleVirtualId(quickSaleId: string): number {
  const index = QUICK_SALE_DEFS.findIndex((d) => d.id === quickSaleId);
  return QUICK_SALE_VIRTUAL_ID_BASE - (index >= 0 ? index : 0);
}

export function isVirtualQuickSaleProductId(productId: number): boolean {
  return productId <= QUICK_SALE_VIRTUAL_ID_BASE;
}

export const QUICK_SALE_ACCENT_STYLES: Record<
  QuickSaleDefinition["accent"],
  { button: string; icon: string; price: string }
> = {
  amber: {
    button:
      "bg-amber-950/50 border-amber-800/60 hover:bg-amber-900/60 hover:border-amber-600/70 active:bg-amber-900/80",
    icon: "text-amber-400",
    price: "text-amber-300/90",
  },
  sky: {
    button:
      "bg-sky-950/50 border-sky-800/60 hover:bg-sky-900/60 hover:border-sky-600/70 active:bg-sky-900/80",
    icon: "text-sky-400",
    price: "text-sky-300/90",
  },
  emerald: {
    button:
      "bg-emerald-950/50 border-emerald-800/60 hover:bg-emerald-900/60 hover:border-emerald-600/70 active:bg-emerald-900/80",
    icon: "text-emerald-400",
    price: "text-emerald-300/90",
  },
  orange: {
    button:
      "bg-orange-950/50 border-orange-800/60 hover:bg-orange-900/60 hover:border-orange-600/70 active:bg-orange-900/80",
    icon: "text-orange-400",
    price: "text-orange-300/90",
  },
  rose: {
    button:
      "bg-rose-950/50 border-rose-800/60 hover:bg-rose-900/60 hover:border-rose-600/70 active:bg-rose-900/80",
    icon: "text-rose-400",
    price: "text-rose-300/90",
  },
};

export interface ResolvedQuickSaleProduct {
  id: number;
  barcode: string;
  name: string;
  sellPrice: number;
}

export function matchProductToQuickSale(
  def: QuickSaleDefinition,
  products: ResolvedQuickSaleProduct[]
): ResolvedQuickSaleProduct | null {
  const normalizedTerms = def.searchTerms.map((t) => t.toLowerCase());

  for (const term of normalizedTerms) {
    const match = products.find((p) => p.name.toLowerCase().includes(term));
    if (match) return match;
  }

  return null;
}

export function getQuickSaleNameFromBarcode(barcode: string): string | null {
  const def = QUICK_SALE_DEFS.find((d) => d.barcode === barcode);
  return def?.label ?? null;
}
