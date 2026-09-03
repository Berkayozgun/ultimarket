import { prisma } from "@/lib/prisma";
import {
  analyzeInvoiceImage,
  createNvidiaClient,
  getNvidiaTextModel,
  invoiceOcrSchema,
  type InvoiceOcrItem,
  type InvoiceOcrResult,
  InvoiceParseError,
  extractJsonObject,
} from "@/lib/nvidia";
import {
  MATCH_SCORE_THRESHOLD,
  computeNameSimilarity,
} from "@/lib/invoices";
import {
  calculateSingleUnitCost,
  findMappingForItem,
  isBulkInvoiceUnit,
  loadInvoiceProductMappings,
  normalizeSupplierRawName,
} from "@/lib/invoice-product-mapping";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ALLOWED_PDF_TYPE = "application/pdf";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export type EslestirmeKaynagi =
  | "ogrenilmis"
  | "barkod"
  | "fuzzy"
  | "eslestirilmedi";

export interface InvoiceParsePreviewRow {
  lineIndex: number;
  barkod: string | null;
  urunAdi: string;
  supplierRawName: string;
  birim: string | null;
  miktar: number;
  birimFiyat: number;
  iskontoOran: number | null;
  iskontoTutar: number | null;
  kdvOran: number | null;
  netBirimAlis: number;
  koliIciAdet: number;
  birimCarpaniGerekli: boolean;
  eslesenUrunId: number | null;
  eslesenUrunAdi: string | null;
  eslesenBarkod: string | null;
  eskiAlisFiyati: number | null;
  eskiKdvAlis: number | null;
  yeniAlisFiyati: number;
  yeniKdvAlis: number | null;
  farkOrani: number | null;
  guvenSkoru: number;
  kolonKaymasiSuphesi: boolean;
  eslestirmeKaynagi: EslestirmeKaynagi;
  uyari: string | null;
}

export interface InvoiceParsePreview {
  supplierName: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  rows: InvoiceParsePreviewRow[];
  matchedCount: number;
  lowConfidenceCount: number;
}

export function validateInvoiceUpload(file: File) {
  const allowed = [...ALLOWED_IMAGE_TYPES, ALLOWED_PDF_TYPE];
  if (!allowed.includes(file.type)) {
    throw new InvoiceParseError(
      "Sadece JPEG, PNG, WebP veya PDF formatları desteklenmektedir",
      400
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new InvoiceParseError("Dosya boyutu 8MB'dan küçük olmalıdır", 400);
  }
}

/** İskontolar düşüldükten sonraki saf birim alış maliyeti (URUN_ALIS_FIYAT) */
export function calculateNetUnitPurchase(item: {
  birimFiyat: number;
  iskontoOran?: number | null;
  iskontoTutar?: number | null;
}): number {
  let net = item.birimFiyat;

  if (item.iskontoOran != null && item.iskontoOran > 0) {
    net = net * (1 - item.iskontoOran / 100);
  }

  if (item.iskontoTutar != null && item.iskontoTutar > 0) {
    net = net - item.iskontoTutar;
  }

  return Math.max(0, Number(net.toFixed(4)));
}

function detectColumnShift(item: InvoiceOcrItem): boolean {
  if (!item.lineTotal || item.quantity <= 0) return false;

  const expected = item.unitCostNet * item.quantity;
  const tolerance = Math.max(0.05, expected * 0.05);
  if (Math.abs(expected - item.lineTotal) <= tolerance) return false;

  const swapped = item.lineTotal / item.quantity;
  const swappedTolerance = Math.max(0.05, swapped * 0.05);
  return Math.abs(swapped - item.unitCostNet) <= swappedTolerance;
}

function computeLineConfidence(
  item: InvoiceOcrItem,
  matchScore: number | null,
  columnShift: boolean,
  eslestirmeKaynagi: EslestirmeKaynagi
): { score: number; warning: string | null } {
  let score = 0.55;
  const warnings: string[] = [];

  if (columnShift) {
    warnings.push("MK/FIYAT/TUTAR sütun kayması şüphesi");
    score -= 0.25;
  }

  if (item.barcode) score += 0.1;

  if (eslestirmeKaynagi === "ogrenilmis") {
    score = Math.max(score, 0.95);
  } else if (matchScore != null) {
    score = Math.max(score, matchScore);
    if (matchScore < MATCH_SCORE_THRESHOLD) {
      warnings.push("Ürün eşleşmesi düşük güvenilirlikte");
    }
  } else {
    warnings.push("Eşleştirilmedi — ürün seçin veya eşleştirmeyi kaydedin");
    score = Math.min(score, 0.45);
  }

  if (item.unitCostNet <= 0) {
    warnings.push("Birim fiyat okunamadı veya sıfır");
    score = Math.min(score, 0.3);
  }

  return {
    score: Number(Math.min(1, Math.max(0, score)).toFixed(2)),
    warning: warnings.length > 0 ? warnings.join(" · ") : null,
  };
}

function computeChangePercent(
  oldPrice: number | null,
  newPrice: number
): number | null {
  if (oldPrice == null || oldPrice === 0) return null;
  return Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1));
}

function mapOcrItemToPreviewFields(item: InvoiceOcrItem) {
  const iskontoOran = item.discountRate ?? null;
  const iskontoTutar = item.discountAmount ?? null;
  const birim = item.unit?.trim() || null;

  const netBirimAlis = calculateNetUnitPurchase({
    birimFiyat: item.unitCostNet,
    iskontoOran,
    iskontoTutar,
  });

  const supplierRawName = normalizeSupplierRawName(
    item.barcode?.trim() || item.rawName
  );

  return {
    barkod: item.barcode?.trim() || null,
    urunAdi: item.rawName,
    supplierRawName,
    birim,
    miktar: item.quantity,
    birimFiyat: item.unitCostNet,
    iskontoOran,
    iskontoTutar,
    kdvOran: item.vatRate ?? null,
    netBirimAlis,
    birimCarpaniGerekli: isBulkInvoiceUnit(birim),
  };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  const pageCount = Math.min(pdf.numPages, 3);

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((entry) => ("str" in entry ? entry.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n").trim();
  if (!text) {
    throw new InvoiceParseError(
      "PDF metni okunamadı. Faturayı fotoğraf olarak yüklemeyi deneyin.",
      422
    );
  }

  return text;
}

async function analyzeInvoicePdfText(text: string): Promise<InvoiceOcrResult> {
  const client = createNvidiaClient();
  const model = getNvidiaTextModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `Sen Türkiye'deki toptancı fatura/irsaliye metinlerini JSON'a çeviren muhasebe asistanısın.
SADECE saf JSON döndür. Alanlar: supplierName, invoiceDate (YYYY-MM-DD), dueDate, totalAmount, items[].
Her kalem: barcode, rawName, normalizedName, quantity, unit, unitCostNet, vatRate, lineTotal, discountRate, discountAmount.
unit = BR sütunu (AD, KG, TVA, KL, KOLI, KASA vb.). unitCostNet = FIYAT sütunu (birim). lineTotal = TUTAR (satır). discountRate/discountAmount iskonto bilgisi.`,
      },
      {
        role: "user",
        content: `Aşağıdaki fatura metnini analiz et:\n\n${text}`,
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new InvoiceParseError("PDF fatura metni işlenemedi.", 502);
  }

  const parsedJson = extractJsonObject(rawContent);
  const validation = invoiceOcrSchema.safeParse(parsedJson);
  if (!validation.success) {
    throw new InvoiceParseError(
      "PDF fatura verisi doğrulanamadı. Görsel olarak yüklemeyi deneyin.",
      422
    );
  }

  return validation.data;
}

export async function analyzeInvoiceFile(file: File): Promise<InvoiceOcrResult> {
  validateInvoiceUpload(file);

  if (file.type === ALLOWED_PDF_TYPE) {
    const text = await extractPdfText(file);
    return analyzeInvoicePdfText(text);
  }

  return analyzeInvoiceImage(file);
}

export async function buildInvoiceParsePreview(
  analysis: InvoiceOcrResult
): Promise<InvoiceParsePreview> {
  const [products, mappings] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        barcode: true,
        lastCostNet: true,
        purchaseVatRate: true,
      },
    }),
    loadInvoiceProductMappings(),
  ]);

  const rows: InvoiceParsePreviewRow[] = [];

  for (let index = 0; index < analysis.items.length; index++) {
    const item = analysis.items[index];
    const fields = mapOcrItemToPreviewFields(item);
    const columnShift = detectColumnShift(item);

    let matchedProduct: (typeof products)[number] | null = null;
    let matchScore: number | null = null;
    let eslestirmeKaynagi: EslestirmeKaynagi = "eslestirilmedi";
    let koliIciAdet = 1;

    const learnedMapping = findMappingForItem(
      mappings,
      item.rawName,
      fields.barkod
    );

    if (learnedMapping) {
      matchedProduct =
        products.find((p) => p.id === learnedMapping.productId) ?? null;
      if (matchedProduct) {
        eslestirmeKaynagi = "ogrenilmis";
        matchScore = 1;
        koliIciAdet = learnedMapping.packQuantity;
      }
    }

    if (!matchedProduct && fields.barkod) {
      const byBarcode = products.find((p) => p.barcode === fields.barkod);
      if (byBarcode) {
        matchedProduct = byBarcode;
        matchScore = 1;
        eslestirmeKaynagi = "barkod";
      }
    }

    if (!matchedProduct) {
      let highest = 0;
      let best: (typeof products)[number] | null = null;
      const searchName = item.rawName || item.normalizedName;

      for (const product of products) {
        const score = computeNameSimilarity(searchName, product.name);
        if (score > highest) {
          highest = score;
          best = product;
        }
      }

      if (best && highest >= MATCH_SCORE_THRESHOLD) {
        matchedProduct = best;
        matchScore = Number(highest.toFixed(3));
        eslestirmeKaynagi = "fuzzy";
      }
    }

    const { score, warning } = computeLineConfidence(
      item,
      matchScore,
      columnShift,
      eslestirmeKaynagi
    );
    const eskiAlis = matchedProduct?.lastCostNet ?? null;
    const yeniAlis = calculateSingleUnitCost(fields.netBirimAlis, koliIciAdet);

    rows.push({
      lineIndex: index,
      ...fields,
      koliIciAdet,
      eslesenUrunId: matchedProduct?.id ?? null,
      eslesenUrunAdi: matchedProduct?.name ?? null,
      eslesenBarkod: matchedProduct?.barcode ?? null,
      eskiAlisFiyati: eskiAlis,
      eskiKdvAlis: matchedProduct?.purchaseVatRate ?? null,
      yeniAlisFiyati: yeniAlis,
      yeniKdvAlis: fields.kdvOran,
      farkOrani: computeChangePercent(eskiAlis, yeniAlis),
      guvenSkoru: score,
      kolonKaymasiSuphesi: columnShift,
      eslestirmeKaynagi,
      uyari: warning,
    });
  }

  return {
    supplierName: analysis.supplierName,
    invoiceDate: analysis.invoiceDate,
    dueDate: analysis.dueDate ?? null,
    totalAmount: analysis.totalAmount,
    rows,
    matchedCount: rows.filter((row) => row.eslesenUrunId != null).length,
    lowConfidenceCount: rows.filter((row) => row.guvenSkoru < 0.7).length,
  };
}

export interface ApprovedCostUpdate {
  urunId: number;
  yeniAlisFiyati: number;
  kdvAlis: number | null;
}

/** Sadece URUN_ALIS_FIYAT (lastCostNet) ve KDV_ALIS (purchaseVatRate) günceller */
export async function applyApprovedPurchaseCosts(
  items: ApprovedCostUpdate[]
): Promise<number> {
  if (items.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const existing = await tx.product.findUnique({
        where: { id: item.urunId },
        select: { id: true },
      });

      if (!existing) {
        throw new Error(`Ürün bulunamadı: ${item.urunId}`);
      }

      await tx.product.update({
        where: { id: item.urunId },
        data: {
          lastCostNet: item.yeniAlisFiyati,
          ...(item.kdvAlis != null ? { purchaseVatRate: item.kdvAlis } : {}),
        },
      });
    }
  });

  return items.length;
}
