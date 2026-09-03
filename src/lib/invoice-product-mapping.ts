import { prisma } from "@/lib/prisma";

/** Toptancı faturasındaki ham stok kodu / ürün adı anahtarı */
export function normalizeSupplierRawName(raw: string): string {
  return raw.trim();
}

/** Fatura satırından eşleştirme anahtarlarını üret (barkod öncelikli) */
export function buildSupplierRawKeys(
  rawName: string,
  barcode?: string | null
): string[] {
  const keys: string[] = [];
  if (barcode?.trim()) keys.push(normalizeSupplierRawName(barcode));
  if (rawName.trim()) keys.push(normalizeSupplierRawName(rawName));
  return [...new Set(keys)];
}

export type MappingLookupResult = {
  supplierRawName: string;
  productId: number;
  packQuantity: number;
};

export async function loadInvoiceProductMappings(): Promise<
  Map<string, MappingLookupResult>
> {
  const rows = await prisma.invoiceProductMapping.findMany({
    select: {
      supplierRawName: true,
      productId: true,
      packQuantity: true,
    },
  });

  const map = new Map<string, MappingLookupResult>();
  for (const row of rows) {
    map.set(row.supplierRawName, {
      supplierRawName: row.supplierRawName,
      productId: row.productId,
      packQuantity: row.packQuantity,
    });
  }
  return map;
}

export function findMappingForItem(
  mappings: Map<string, MappingLookupResult>,
  rawName: string,
  barcode?: string | null
): MappingLookupResult | null {
  for (const key of buildSupplierRawKeys(rawName, barcode)) {
    const hit = mappings.get(key);
    if (hit) return hit;
  }
  return null;
}

export async function saveInvoiceProductMapping(input: {
  supplierRawName: string;
  productId: number;
  packQuantity?: number;
}) {
  const supplierRawName = normalizeSupplierRawName(input.supplierRawName);
  if (!supplierRawName) {
    throw new Error("Toptancı kodu veya ürün adı boş olamaz");
  }

  const packQuantity = Math.max(1, Math.round(input.packQuantity ?? 1));

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });
  if (!product) {
    throw new Error(`Ürün bulunamadı: ${input.productId}`);
  }

  return prisma.invoiceProductMapping.upsert({
    where: { supplierRawName },
    create: {
      supplierRawName,
      productId: input.productId,
      packQuantity,
    },
    update: {
      productId: input.productId,
      packQuantity,
    },
    include: {
      product: {
        select: { id: true, name: true, barcode: true },
      },
    },
  });
}

/** TVA, KL, KOLİ, KASA gibi toptancı birimleri */
const BULK_UNIT_PATTERN = /^(TVA|KL|KOLI|KOLİ|KASA|KTN|KRT)$/i;

export function isBulkInvoiceUnit(unit: string | null | undefined): boolean {
  if (!unit?.trim()) return false;
  const normalized = unit
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/ı/g, "I");
  return BULK_UNIT_PATTERN.test(normalized);
}

/** Net fiyatı koli/paket çarpanına bölerek tekli birim maliyetini hesapla */
export function calculateSingleUnitCost(
  netUnitPrice: number,
  packQuantity: number
): number {
  const divisor = Math.max(1, packQuantity);
  return Number((netUnitPrice / divisor).toFixed(4));
}
