import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyApprovedPurchaseCosts } from "@/lib/invoice-parse";

const updateCostsSchema = z.object({
  items: z
    .array(
      z.object({
        urunId: z.number().int().positive("Geçerli ürün ID gerekli"),
        yeniAlisFiyati: z
          .number()
          .min(0, "Alış fiyatı negatif olamaz"),
        kdvAlis: z.number().min(0).max(100).nullable().optional(),
      })
    )
    .min(1, "En az bir onaylanmış kalem gerekli"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = updateCostsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz güncelleme verisi", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const updatedCount = await applyApprovedPurchaseCosts(
      parsed.data.items.map((item) => ({
        urunId: item.urunId,
        yeniAlisFiyati: item.yeniAlisFiyati,
        kdvAlis: item.kdvAlis ?? null,
      }))
    );

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `${updatedCount} ürünün alış fiyatı güncellendi. Satış fiyatlarına dokunulmadı.`,
    });
  } catch (error) {
    console.error("POST /api/products/update-costs error:", error);

    if (error instanceof Error && error.message.startsWith("Ürün bulunamadı")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Alış fiyatları güncellenirken hata oluştu" },
      { status: 500 }
    );
  }
}
