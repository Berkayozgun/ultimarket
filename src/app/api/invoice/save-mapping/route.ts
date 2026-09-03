import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveInvoiceProductMapping } from "@/lib/invoice-product-mapping";

const saveMappingSchema = z.object({
  supplierRawName: z.string().trim().min(1, "Toptancı kodu veya ürün adı gerekli"),
  productId: z.number().int().positive("Geçerli bir ürün seçin"),
  packQuantity: z.number().int().min(1).default(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = saveMappingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const mapping = await saveInvoiceProductMapping(parsed.data);

    return NextResponse.json({
      success: true,
      mapping: {
        id: mapping.id,
        supplierRawName: mapping.supplierRawName,
        productId: mapping.productId,
        packQuantity: mapping.packQuantity,
        product: mapping.product,
      },
    });
  } catch (error) {
    console.error("POST /api/invoice/save-mapping error:", error);
    const message =
      error instanceof Error ? error.message : "Eşleştirme kaydedilemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
