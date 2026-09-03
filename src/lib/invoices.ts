import { prisma } from "@/lib/prisma";
import { normalizeItemName } from "@/lib/normalize";
import type { InvoiceOcrItem } from "@/lib/nvidia";

export const MATCH_SCORE_THRESHOLD = 0.65;

/** Toptancı fişi kısaltmaları → genişletilmiş marka/ürün adları */
const INVOICE_ALIASES: Record<string, string> = {
  rot: "rothmans",
  t2000: "tekel 2000",
  t2001: "tekel 2001",
  mltp: "maltepe",
  "d rng": "drange",
  "d-rng": "drange",
  drng: "drange",
  blck: "black",
  uzun: "long",
  long: "uzun",
};

export interface PriceAlert {
  normalizedName: string;
  oldCost: number;
  newCost: number;
  pct: number;
}

export interface ProductMatch {
  itemIndex: number;
  productId: number;
  productName: string;
  barcode: string;
  previousCost: number | null;
  matchScore?: number;
}

function foldTurkish(text: string): string {
  return text
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/İ/g, "i")
    .replace(/Ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/Ö/g, "o")
    .replace(/Ç/g, "c");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Kısaltmaları genişlet, Türkçe karakterleri normalize et */
export function expandInvoiceAliases(name: string): string {
  let expanded = name.toLocaleLowerCase("tr-TR");

  const sortedAliases = Object.keys(INVOICE_ALIASES).sort(
    (a, b) => b.length - a.length
  );

  for (const alias of sortedAliases) {
    const replacement = INVOICE_ALIASES[alias];
    expanded = expanded.replace(
      new RegExp(`\\b${escapeRegex(alias)}\\b`, "gi"),
      replacement
    );
  }

  return foldTurkish(normalizeItemName(expanded));
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function tokenJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Token + Levenshtein birleşik benzerlik skoru (0–1) */
export function computeNameSimilarity(rawA: string, rawB: string): number {
  const a = expandInvoiceAliases(rawA);
  const b = expandInvoiceAliases(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const tokenScore = tokenJaccardSimilarity(a, b);
  const levScore = levenshteinSimilarity(a, b);

  // Kısaltmalı isimlerde token eşleşmesi daha güvenilir
  return Math.max(tokenScore, levScore * 0.92);
}

export async function computePriceAlerts(
  items: InvoiceOcrItem[]
): Promise<PriceAlert[]> {
  const priceAlerts: PriceAlert[] = [];

  for (const item of items) {
    const lastInvoiceItem = await prisma.invoiceItem.findFirst({
      where: {
        OR: [
          { normalizedName: item.normalizedName },
          {
            normalizedName: {
              contains: item.normalizedName,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: { id: "desc" },
    });

    if (lastInvoiceItem && item.unitCostNet > lastInvoiceItem.unitCostNet) {
      const pct = Number(
        (
          ((item.unitCostNet - lastInvoiceItem.unitCostNet) /
            lastInvoiceItem.unitCostNet) *
          100
        ).toFixed(1)
      );

      priceAlerts.push({
        normalizedName: item.normalizedName,
        oldCost: lastInvoiceItem.unitCostNet,
        newCost: item.unitCostNet,
        pct,
      });
    }
  }

  return priceAlerts;
}

export async function matchProductsToItems(
  items: InvoiceOcrItem[]
): Promise<ProductMatch[]> {
  const matches: ProductMatch[] = [];
  const allProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      barcode: true,
      lastCostNet: true,
      purchaseVatRate: true,
    },
  });

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let bestMatch: ProductMatch | null = null;

    if (item.barcode) {
      const byBarcode = allProducts.find((p) => p.barcode === item.barcode);
      if (byBarcode) {
        bestMatch = {
          itemIndex: index,
          productId: byBarcode.id,
          productName: byBarcode.name,
          barcode: byBarcode.barcode,
          previousCost: byBarcode.lastCostNet,
          matchScore: 1,
        };
      }
    }

    if (!bestMatch) {
      const searchName = item.rawName || item.normalizedName;
      let highestScore = 0;
      let bestProduct: (typeof allProducts)[number] | null = null;

      for (const product of allProducts) {
        const score = computeNameSimilarity(searchName, product.name);
        if (score > highestScore) {
          highestScore = score;
          bestProduct = product;
        }
      }

      if (bestProduct && highestScore >= MATCH_SCORE_THRESHOLD) {
        bestMatch = {
          itemIndex: index,
          productId: bestProduct.id,
          productName: bestProduct.name,
          barcode: bestProduct.barcode,
          previousCost: bestProduct.lastCostNet,
          matchScore: Number(highestScore.toFixed(3)),
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  return matches;
}

export async function updateProductCostsFromInvoiceItems(
  items: InvoiceOcrItem[],
  manualMatches?: ProductMatch[]
): Promise<number> {
  const matches = manualMatches ?? (await matchProductsToItems(items));
  let updatedCount = 0;

  for (const match of matches) {
    const item = items[match.itemIndex];
    if (!item) continue;

    await prisma.product.update({
      where: { id: match.productId },
      data: {
        lastCostNet: item.unitCostNet,
        ...(item.vatRate != null ? { purchaseVatRate: item.vatRate } : {}),
      },
    });
    updatedCount++;
  }

  return updatedCount;
}
