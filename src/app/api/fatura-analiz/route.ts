import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { z } from "zod";
import { normalizeItemName } from "@/lib/normalize";

const invoiceItemSchema = z.object({
  rawName: z.string().min(1, "Ürün adı boş olamaz"),
  normalizedName: z.string().min(1, "Sadeleştirilmiş ürün adı boş olamaz"),
  quantity: z.number().int().positive("Adet pozitif tam sayı olmalıdır"),
  unitCostNet: z.number().positive("Birim maliyet pozitif olmalıdır"),
});

const invoiceAnalysisSchema = z.object({
  supplierName: z.string().min(1, "Tedarikçi adı gereklidir"),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalıdır"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Vade tarihi YYYY-MM-DD formatında olmalıdır")
    .nullable()
    .optional(),
  totalAmount: z.number().positive("Toplam tutar pozitif olmalıdır"),
  items: z.array(invoiceItemSchema).min(1, "Faturada en az 1 ürün bulunmalıdır"),
});

export type InvoiceAnalysisResult = z.infer<typeof invoiceAnalysisSchema>;

export interface PriceAlert {
  normalizedName: string;
  oldCost: number;
  newCost: number;
  pct: number;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Fatura dosyası yüklenmedi" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Sadece JPEG, PNG ve WebP formatları desteklenmektedir" },
        { status: 400 }
      );
    }

    const maxBytes = 8 * 1024 * 1024; // 8MB
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Dosya boyutu 8MB'dan küçük olmalıdır" },
        { status: 400 }
      );
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    const baseURL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
    const visionModel =
      process.env.NVIDIA_VISION_MODEL || "meta/llama-4-maverick-17b-128e-instruct";
    // Yedek model (yorum olarak bırak): meta/llama-3.2-11b-vision-instruct

    if (!apiKey) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY yapılandırılmamış. .env dosyasını kontrol edin." },
        { status: 500 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const client = new OpenAI({
      apiKey,
      baseURL,
    });

    const promptText = `Sen market ve bakkal faturalarını analiz eden kıdemli bir muhasebe asistanısın.
Görseldeki faturayı incele ve SADECE JSON formatında bir yanıt ver.
Markdown kod blokları haricinde hiçbir selamlama, özet veya ekstra metin yazma.

İstenen JSON formatı şeması:
{
  "supplierName": "Toptancı / Tedarikçi Şirket Adı",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD veya null",
  "totalAmount": 1250.50,
  "items": [
    {
      "rawName": "Faturadaki birebir ürün adı",
      "normalizedName": "küçük harf, türkçe karakter, adet/koli/kg birimleri ve noktalama işaretleri çıkarılmış ürün adı",
      "quantity": 10,
      "unitCostNet": 25.50
    }
  ]
}

Kurallar:
- unitCostNet KDV hariç veya net maliyet tutarıdır.
- normalizedName içinde '.', ',', 'kg', 'lt' gibi ibareler bulunmamalıdır.
- Eğer vade tarihi yoksa dueDate null olmalıdır.`;

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: visionModel,
        temperature: 0,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
      });
    } catch (apiError: unknown) {
      console.error("NVIDIA NIM API call failed:", apiError);
      const status = (apiError as { status?: number })?.status;
      if (status === 429 || status === 402) {
        return NextResponse.json(
          { error: "NIM kotası / hata, tekrar dene" },
          { status: status }
        );
      }
      return NextResponse.json(
        { error: "NIM kotası / hata, tekrar dene" },
        { status: 502 }
      );
    }

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        { error: "NIM kotası / hata, tekrar dene" },
        { status: 502 }
      );
    }

    // Markdown fence soy ve JSON bul
    let cleanJson = rawContent.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const firstBrace = cleanJson.indexOf("{");
    const lastBrace = cleanJson.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      return NextResponse.json(
        { error: "Fatura verisi doğrulanamadı (422)" },
        { status: 422 }
      );
    }

    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanJson);
    } catch {
      return NextResponse.json(
        { error: "Fatura verisi doğrulanamadı (422)" },
        { status: 422 }
      );
    }

    const validation = invoiceAnalysisSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.error("Zod validation failed for invoice:", validation.error.format());
      return NextResponse.json(
        { error: "Fatura verisi doğrulanamadı (422)" },
        { status: 422 }
      );
    }

    const analysisData = validation.data;

    // Normalizasyonu temizle ve doğrula
    const sanitizedItems = analysisData.items.map((item) => ({
      ...item,
      normalizedName: normalizeItemName(item.normalizedName || item.rawName),
    }));

    // Zam karşılaştırması (priceAlerts: yeni maliyet > son fatura maliyeti)
    const priceAlerts: PriceAlert[] = [];

    for (const item of sanitizedItems) {
      const lastInvoiceItem = await prisma.invoiceItem.findFirst({
        where: {
          OR: [
            { normalizedName: item.normalizedName },
            { normalizedName: { contains: item.normalizedName, mode: "insensitive" } },
          ],
        },
        orderBy: {
          id: "desc",
        },
        include: {
          invoice: true,
        },
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

    // Ham model çıktısını basma, sadece doğrulanmış analizi dön
    return NextResponse.json({
      success: true,
      analysis: {
        ...analysisData,
        items: sanitizedItems,
      },
      priceAlerts,
    });
  } catch (error) {
    console.error("POST /api/fatura-analiz error:", error);
    return NextResponse.json(
      { error: "NIM kotası / hata, tekrar dene" },
      { status: 500 }
    );
  }
}
