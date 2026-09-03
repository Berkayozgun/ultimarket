import OpenAI from "openai";
import { z } from "zod";
import { normalizeItemName, normalizeInvoiceDate } from "@/lib/normalize";

export const invoiceOcrItemSchema = z.object({
  barcode: z.string().nullable().optional(),
  rawName: z.string().min(1, "Ürün adı boş olamaz"),
  normalizedName: z.string().min(1, "Sadeleştirilmiş ürün adı boş olamaz"),
  quantity: z.coerce.number().positive("Miktar pozitif olmalıdır"),
  unit: z.string().nullable().optional(),
  unitCostNet: z.coerce.number().positive("Birim maliyet pozitif olmalıdır"),
  vatRate: z.coerce.number().min(0).max(100).nullable().optional(),
  lineTotal: z.coerce.number().positive().nullable().optional(),
  discountRate: z.coerce.number().min(0).max(100).nullable().optional(),
  discountAmount: z.coerce.number().min(0).nullable().optional(),
});

const isoDateSchema = z.preprocess(
  (value) => normalizeInvoiceDate(value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih okunamadı veya geçersiz")
);

const optionalIsoDateSchema = z.preprocess(
  (value) => normalizeInvoiceDate(value),
  z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vade tarihi okunamadı veya geçersiz"),
      z.null(),
    ])
    .optional()
);

export const invoiceOcrSchema = z.object({
  supplierName: z.string().min(1, "Tedarikçi adı gereklidir"),
  invoiceDate: isoDateSchema,
  dueDate: optionalIsoDateSchema,
  totalAmount: z.coerce.number().positive("Toplam tutar pozitif olmalıdır"),
  items: z.array(invoiceOcrItemSchema).min(1, "Faturada en az 1 ürün bulunmalıdır"),
});

export type InvoiceOcrResult = z.infer<typeof invoiceOcrSchema>;
export type InvoiceOcrItem = z.infer<typeof invoiceOcrItemSchema>;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
const DEFAULT_TEXT_MODEL = "meta/llama-3.3-70b-instruct";

const INVOICE_SYSTEM_PROMPT = `Sen Türkiye'deki market/bakkal toptancı sevk irsaliyesi ve fatura fişlerini analiz eden kıdemli bir muhasebe asistanısın.
Görseldeki belgeyi incele ve SADECE saf JSON formatında bir yanıt ver.
Markdown kod blokları, selamlama, açıklama veya ekstra metin yazma.

BELGE YAPISI:
- Üst kısım: Tedarikçi/satıcı firma adı (örn. "TAR-BAK GIDA"), irsaliye/fatura tarihi
- Orta kısım: Ürün tablosu
- Alt kısım: "Vadesi DD.MM.YYYY tarihine kadardır" gibi vade cümlesi, GENEL TOPLAM tutarı

TABLO KOLONLARI (soldan sağa, karıştırma):
| URUN ADI | MK (Miktar) | BR (Birim) | FIYAT (Birim Fiyat) | TUTAR (Satır Toplamı) |

KRİTİK SÜTUN KURALLARI:
- MK sütunu = quantity (miktar/adet). 0.5, 1.5, 4, 10 gibi değerler ONDALIKLI olabilir; kesinlikle float olarak al.
- BR sütunu = unit (birim kodu: AD, KG, LT, TVA, KL, KOLI, KASA vb.)
- FIYAT sütunu = unitCostNet (birim fiyat, KDV hariç). ASLA satır toplamı değildir.
- TUTAR sütunu = lineTotal (satır toplamı = quantity × unitCostNet). ASLA birim fiyat değildir.
- Doğrulama: unitCostNet × quantity ≈ lineTotal (±0.05 tolerans). Uyuşmuyorsa sütunları yeniden oku.
- MK değerini 1'e yuvarlama; 0.5 karton = quantity: 0.5

ÜST/ALT BİLGİ KURALLARI:
- supplierName: Belgenin en üstündeki satıcı/tedarikçi firma adı (örn. "TAR-BAK GIDA")
- invoiceDate: İrsaliye veya fatura tarihi (YYYY-MM-DD)
- dueDate: Alt kısımdaki "Vadesi ... tarihine kadardır" cümlesindeki vade tarihi (YYYY-MM-DD). Yoksa null.
- totalAmount: Alt kısımdaki GENEL TOPLAM / TOPLAM tutar (KDV dahil veya hariç belgede yazıldığı gibi)

İstenen JSON formatı:
{
  "supplierName": "TAR-BAK GIDA",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD veya null",
  "totalAmount": 18049.53,
  "items": [
    {
      "barcode": "8690123456789 veya null",
      "rawName": "Faturadaki birebir ürün adı (kısaltmalar dahil)",
      "normalizedName": "küçük harf, birim ve noktalama çıkarılmış ürün adı",
      "quantity": 0.5,
      "unit": "KOLI",
      "unitCostNet": 1250.00,
      "vatRate": 10,
      "lineTotal": 625.00,
      "discountRate": 5,
      "discountAmount": null
    }
  ]
}

EK KURALLAR:
- unitCostNet: FIYAT sütunundan, KDV hariç net birim alış fiyatı
- unit: BR sütunundan birim kodu (AD, KG, TVA, KL, KOLI, KASA vb.). Yoksa null
- vatRate: KDV yüzdesi (1, 10, 20). Yoksa null
- lineTotal: TUTAR sütunundan, satır toplamı
- discountRate: İskonto yüzdesi (varsa). Yoksa null
- discountAmount: İskonto tutarı birim başına veya satır (varsa). Yoksa null
- barcode: Varsa string, yoksa null
- normalizedName: kg, lt, adet, koli gibi birimler ve noktalama işaretleri çıkarılmış hali
- Tüm sayısal alanlar ondalıklı olabilir (quantity dahil)`;

export class NvidiaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NvidiaConfigError";
  }
}

export class NvidiaApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NvidiaApiError";
    this.status = status;
  }
}

export class InvoiceParseError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "InvoiceParseError";
    this.status = status;
  }
}

function getNvidiaConfig() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseURL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const visionModel = process.env.NVIDIA_VISION_MODEL || DEFAULT_VISION_MODEL;

  if (!apiKey) {
    throw new NvidiaConfigError(
      "NVIDIA_API_KEY yapılandırılmamış. .env dosyasını kontrol edin."
    );
  }

  return { apiKey, baseURL, visionModel };
}

export function createNvidiaClient() {
  const { apiKey, baseURL } = getNvidiaConfig();
  return new OpenAI({ apiKey, baseURL });
}

export function getNvidiaTextModel(): string {
  return process.env.NVIDIA_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}

export function mapNvidiaError(error: unknown): { message: string; status: number } {
  if (error instanceof NvidiaConfigError) {
    return { message: error.message, status: 500 };
  }
  if (error instanceof InvoiceParseError) {
    return { message: error.message, status: error.status };
  }
  if (error instanceof NvidiaApiError) {
    return { message: error.message, status: error.status };
  }

  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;

  if (status === 429) {
    return {
      message: "NVIDIA API kotası doldu. Lütfen bir süre sonra tekrar deneyin.",
      status: 429,
    };
  }
  if (status === 402) {
    return {
      message: "NVIDIA API ödeme/kredi sorunu. Hesabınızı kontrol edin.",
      status: 402,
    };
  }
  if (status === 401 || status === 403) {
    return {
      message: "NVIDIA API anahtarı geçersiz veya yetkisiz.",
      status: status ?? 401,
    };
  }
  if (status === 410) {
    return {
      message:
        "Kullanılan AI modeli kullanım ömrünü tamamlamış (410). Lütfen .env dosyasından NVIDIA_VISION_MODEL değerini güncelleyin.",
      status: 410,
    };
  }
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return {
      message: "NVIDIA API zaman aşımına uğradı. Tekrar deneyin.",
      status: 504,
    };
  }

  return {
    message: "NVIDIA NIM Vision servisi yanıt veremedi. Lütfen tekrar deneyin.",
    status: 502,
  };
}

export function validateInvoiceImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new InvoiceParseError(
      "Sadece JPEG, PNG ve WebP formatları desteklenmektedir",
      400
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new InvoiceParseError("Dosya boyutu 8MB'dan küçük olmalıdır", 400);
  }
}

export function extractJsonObject(rawContent: string): unknown {
  let cleanJson = rawContent.trim();
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new InvoiceParseError(
      "Fatura verisi okunamadı. Model geçerli JSON döndürmedi."
    );
  }

  cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(cleanJson);
  } catch {
    throw new InvoiceParseError(
      "Fatura verisi okunamadı. JSON formatı geçersiz."
    );
  }
}

function sanitizeInvoiceItems(items: InvoiceOcrItem[]): InvoiceOcrItem[] {
  return items.map((item) => ({
    ...item,
    barcode: item.barcode?.trim() || null,
    normalizedName: normalizeItemName(item.normalizedName || item.rawName),
    vatRate: item.vatRate ?? null,
    lineTotal: item.lineTotal ?? null,
    discountRate: item.discountRate ?? null,
    discountAmount: item.discountAmount ?? null,
  }));
}

export async function analyzeInvoiceImage(file: File): Promise<InvoiceOcrResult> {
  validateInvoiceImage(file);

  const { visionModel } = getNvidiaConfig();
  const client = createNvidiaClient();

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64Data = buffer.toString("base64");
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: visionModel,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        { role: "system", content: INVOICE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Bu sevk irsaliyesi/fatura fişini analiz et. MK/FIYAT/TUTAR sütunlarını karıştırma; tedarikçi, vade ve genel toplamı eksiksiz çıkar. Yalnızca istenen JSON şemasını döndür.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
  } catch (apiError: unknown) {
    console.error("NVIDIA NIM API call failed:", apiError);
    const mapped = mapNvidiaError(apiError);
    throw new NvidiaApiError(mapped.message, mapped.status);
  }

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new NvidiaApiError(
      "NVIDIA modelinden boş yanıt alındı. Tekrar deneyin.",
      502
    );
  }

  const parsedJson = extractJsonObject(rawContent);
  const validation = invoiceOcrSchema.safeParse(parsedJson);
  if (!validation.success) {
    console.error("Zod validation failed for invoice:", validation.error.format());
    const dateError = validation.error.flatten().fieldErrors.invoiceDate?.[0];
    throw new InvoiceParseError(
      dateError
        ? `Fatura tarihi okunamadı: ${dateError}. Tarih alanını elle düzenleyebilirsiniz.`
        : "Fatura verisi doğrulanamadı. Okunan alanlar eksik veya hatalı."
    );
  }

  return {
    ...validation.data,
    items: sanitizeInvoiceItems(validation.data.items),
  };
}
