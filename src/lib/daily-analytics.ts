import { prisma } from "@/lib/prisma";

export interface BasketItemDetail {
  barcode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface BasketSummary {
  id: string;
  source: "SALE" | "TELEMETRY";
  timestamp: number;
  timeFormatted: string; // "14:32"
  itemCount: number;
  totalAmount: number;
  reason: string;
  reasonLabel: string;
  reasonType: "success" | "warning" | "danger" | "info";
  items: BasketItemDetail[];
}

export interface HourlyStat {
  hour: string; // "08:00", "09:00", vb.
  hourNum: number;
  revenue: number;
  basketCount: number;
  itemCount: number;
  isPeak?: boolean;
}

export interface TopProduct {
  rank: number;
  barcode: string;
  name: string;
  quantity: number;
  revenue: number;
  revenueShare: number; // Yüzdelik ciro payı (0 - 100)
  unitPrice: number;
}

export interface DailyAnalyticsData {
  summary: {
    totalRevenue: number;
    totalBaskets: number;
    averageOrderValue: number; // AOV = Ciro / Sepet Sayısı
    totalItemsScanned: number;
    peakHour: {
      hour: string;
      basketCount: number;
      revenue: number;
    } | null;
  };
  hourlyStats: HourlyStat[];
  topProducts: TopProduct[];
  recentBaskets: BasketSummary[];
  generatedAt: string;
}

// Yardımcı: Kapanış sebebi etiket ve rozet tipi
export function parseCloseReason(reason?: string | null, paymentType?: string | null): {
  code: string;
  label: string;
  type: "success" | "warning" | "danger" | "info";
} {
  if (paymentType) {
    if (paymentType === "NAKIT") return { code: "NAKIT", label: "Nakit Satış", type: "success" };
    if (paymentType === "KART") return { code: "KART", label: "Kartla Satış", type: "success" };
    if (paymentType === "VERESIYE") return { code: "VERESIYE", label: "Veresiye Satış", type: "info" };
  }

  const r = (reason || "").toUpperCase().trim();
  if (r.includes("TIMEOUT") || r.includes("IDLE")) {
    return { code: "TIMEOUT", label: "Zaman Aşımı", type: "warning" };
  }
  if (r.includes("ESC")) {
    return { code: "ESC_PRESSED", label: "ESC İptal/Kapanış", type: "danger" };
  }
  if (r.includes("PAYMENT") || r.includes("SUCCESS") || r.includes("COMPLETED")) {
    return { code: "COMPLETED", label: "Tamamlandı", type: "success" };
  }
  return { code: r || "NORMAL", label: r || "Kapanış", type: "info" };
}

export async function getDailyAnalytics(targetDate = new Date()): Promise<DailyAnalyticsData> {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Prisma Sale kayıtlarını çek (bugünkü satışlar)
  const sales = await prisma.sale.findMany({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  }).catch((err) => {
    console.error("[getDailyAnalytics] Error fetching sales:", err);
    return [];
  });

  // 2. Prisma TelemetryLog kayıtlarını çek (bugünkü sepet kapanışları ve okutma olayları)
  const telemetryLogs = await prisma.telemetryLog.findMany({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  }).catch((err) => {
    console.error("[getDailyAnalytics] Error fetching telemetry:", err);
    return [];
  });

  // 3. Telemetry'deki tekil barkodları toplayıp ürün bilgisiyle zenginleştirelim
  const basketClosedLogs = telemetryLogs.filter(
    (l) =>
      l.event === "BASKET_COMPLETED" ||
      l.event === "BASKET_CLOSED" ||
      l.event === "BASKET_TIMEOUT"
  );

  const scanLogs = telemetryLogs.filter(
    (l) => l.event === "ITEM_SCANNED" || l.event === "SCAN"
  );

  const allBarcodesSet = new Set<string>();

  // Telemetry items içindeki barkodları topla
  for (const log of basketClosedLogs) {
    if (Array.isArray(log.items)) {
      for (const it of log.items) {
        if (typeof it === "string") {
          allBarcodesSet.add(it);
        } else if (it && typeof it === "object" && "barcode" in it && typeof (it as any).barcode === "string") {
          allBarcodesSet.add((it as any).barcode);
        }
      }
    }
  }

  // Barkod okutma loglarındaki barkodları da ekle
  for (const log of scanLogs) {
    if (log.barcode) allBarcodesSet.add(log.barcode);
  }

  // Ürün bilgilerini çek
  const products = allBarcodesSet.size > 0
    ? await prisma.product.findMany({
        where: { barcode: { in: Array.from(allBarcodesSet) } },
        select: { id: true, barcode: true, name: true, sellPrice: true },
      }).catch(() => [])
    : [];

  const productMap = new Map<string, { barcode: string; name: string; sellPrice: number }>();
  for (const p of products) {
    productMap.set(p.barcode, p);
  }

  // 4. Kapanan sepetleri tek tip BasketSummary listesine dönüştür
  const allBaskets: BasketSummary[] = [];

  // A) Sale kayıtlarından gelenler
  for (const sale of sales) {
    const saleDate = new Date(sale.createdAt);
    const hours = String(saleDate.getHours()).padStart(2, "0");
    const minutes = String(saleDate.getMinutes()).padStart(2, "0");
    const timeFormatted = `${hours}:${minutes}`;

    const itemsDetail: BasketItemDetail[] = sale.items.map((item) => ({
      barcode: item.product.barcode,
      name: item.product.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalPrice: Number((item.quantity * item.unitPrice).toFixed(2)),
    }));

    const reasonInfo = parseCloseReason(null, sale.paymentType);

    allBaskets.push({
      id: `sale-${sale.id}`,
      source: "SALE",
      timestamp: saleDate.getTime(),
      timeFormatted,
      itemCount: itemsDetail.reduce((acc, it) => acc + it.quantity, 0),
      totalAmount: Number(sale.totalAmount.toFixed(2)),
      reason: reasonInfo.code,
      reasonLabel: reasonInfo.label,
      reasonType: reasonInfo.type,
      items: itemsDetail,
    });
  }

  // B) TelemetryLog'dan gelen kapanan sepetler (Eğer Sale olarak kaydedilmemiş veya sepet kapanışı telemetri ile izlenmişse)
  for (const log of basketClosedLogs) {
    const logDate = new Date(log.createdAt);
    const hours = String(logDate.getHours()).padStart(2, "0");
    const minutes = String(logDate.getMinutes()).padStart(2, "0");
    const timeFormatted = `${hours}:${minutes}`;

    const rawItems = Array.isArray(log.items) ? log.items : [];
    const itemCountsMap = new Map<string, number>();

    for (const it of rawItems) {
      let bcode: string | null = null;
      if (typeof it === "string") {
        bcode = it;
      } else if (it && typeof it === "object" && "barcode" in it) {
        bcode = String((it as any).barcode);
      }
      if (bcode) {
        itemCountsMap.set(bcode, (itemCountsMap.get(bcode) || 0) + 1);
      }
    }

    const itemsDetail: BasketItemDetail[] = [];
    let computedTotal = 0;

    for (const [bcode, qty] of itemCountsMap.entries()) {
      const prod = productMap.get(bcode);
      const unitPrice = prod?.sellPrice || 0;
      const lineTotal = Number((unitPrice * qty).toFixed(2));
      computedTotal += lineTotal;
      itemsDetail.push({
        barcode: bcode,
        name: prod?.name || `Barkod #${bcode}`,
        unitPrice,
        quantity: qty,
        totalPrice: lineTotal,
      });
    }

    // Eğer log'da count varsa ama items boşsa
    const count = log.count || itemsDetail.reduce((a, b) => a + b.quantity, 0);
    const reasonInfo = parseCloseReason(log.reason);

    allBaskets.push({
      id: `telemetry-${log.id}`,
      source: "TELEMETRY",
      timestamp: logDate.getTime(),
      timeFormatted,
      itemCount: count,
      totalAmount: Number(computedTotal.toFixed(2)),
      reason: reasonInfo.code,
      reasonLabel: reasonInfo.label,
      reasonType: reasonInfo.type,
      items: itemsDetail,
    });
  }

  // Zamana göre yeniden sırala (en yeni en üstte)
  allBaskets.sort((a, b) => b.timestamp - a.timestamp);

  // 5. Metrikler
  const totalBaskets = allBaskets.length;
  const totalRevenue = Number(
    allBaskets.reduce((acc, b) => acc + b.totalAmount, 0).toFixed(2)
  );
  const averageOrderValue = totalBaskets > 0 ? Number((totalRevenue / totalBaskets).toFixed(2)) : 0;

  // Toplam okutulan ürün sayısı: sepetlerdeki ürünler + tekil scan logları
  const basketItemCountTotal = allBaskets.reduce((acc, b) => acc + b.itemCount, 0);
  const totalItemsScanned = Math.max(basketItemCountTotal, scanLogs.length);

  // 6. Saatlik Dağılım (08:00 - 24:00 arası)
  const hourlyMap = new Map<number, { revenue: number; basketCount: number; itemCount: number }>();
  
  for (let h = 8; h <= 23; h++) {
    hourlyMap.set(h, { revenue: 0, basketCount: 0, itemCount: 0 });
  }

  for (const b of allBaskets) {
    const bHour = new Date(b.timestamp).getHours();
    const curr = hourlyMap.get(bHour) || { revenue: 0, basketCount: 0, itemCount: 0 };
    curr.revenue = Number((curr.revenue + b.totalAmount).toFixed(2));
    curr.basketCount += 1;
    curr.itemCount += b.itemCount;
    hourlyMap.set(bHour, curr);
  }

  let maxBasketHour = -1;
  let maxBaskets = 0;
  let peakHourRevenue = 0;

  const hourlyStats: HourlyStat[] = Array.from(hourlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([h, stat]) => {
      if (stat.basketCount > maxBaskets) {
        maxBaskets = stat.basketCount;
        maxBasketHour = h;
        peakHourRevenue = stat.revenue;
      }
      return {
        hour: `${String(h).padStart(2, "0")}:00`,
        hourNum: h,
        revenue: stat.revenue,
        basketCount: stat.basketCount,
        itemCount: stat.itemCount,
      };
    });

  // Peak saat işaretle
  if (maxBasketHour !== -1 && maxBaskets > 0) {
    const found = hourlyStats.find((s) => s.hourNum === maxBasketHour);
    if (found) found.isPeak = true;
  }

  const peakHour =
    maxBasketHour !== -1 && maxBaskets > 0
      ? {
          hour: `${String(maxBasketHour).padStart(2, "0")}:00 - ${String(
            (maxBasketHour + 1) % 24
          ).padStart(2, "0")}:00`,
          basketCount: maxBaskets,
          revenue: peakHourRevenue,
        }
      : null;

  // 7. En Çok Satan Ürünler (Top Selling Products)
  const productAggMap = new Map<
    string,
    { barcode: string; name: string; quantity: number; revenue: number; unitPrice: number }
  >();

  for (const b of allBaskets) {
    for (const it of b.items) {
      const existing = productAggMap.get(it.barcode) || {
        barcode: it.barcode,
        name: it.name,
        quantity: 0,
        revenue: 0,
        unitPrice: it.unitPrice,
      };
      existing.quantity += it.quantity;
      existing.revenue = Number((existing.revenue + it.totalPrice).toFixed(2));
      if (it.unitPrice > 0) existing.unitPrice = it.unitPrice;
      productAggMap.set(it.barcode, existing);
    }
  }

  const sortedProducts = Array.from(productAggMap.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10);

  const topProducts: TopProduct[] = sortedProducts.map((p, idx) => ({
    rank: idx + 1,
    barcode: p.barcode,
    name: p.name,
    quantity: p.quantity,
    revenue: p.revenue,
    revenueShare: totalRevenue > 0 ? Number(((p.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    unitPrice: p.unitPrice,
  }));

  // 8. Son Kapanan Sepetler (Recent 15 baskets)
  const recentBaskets = allBaskets.slice(0, 15);

  return {
    summary: {
      totalRevenue,
      totalBaskets,
      averageOrderValue,
      totalItemsScanned,
      peakHour,
    },
    hourlyStats,
    topProducts,
    recentBaskets,
    generatedAt: new Date().toISOString(),
  };
}
