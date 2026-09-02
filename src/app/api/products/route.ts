import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  barcode: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      barcode: searchParams.get("barcode") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz arama parametresi" },
        { status: 400 }
      );
    }

    const { barcode } = parsed.data;

    if (barcode) {
      const product = await prisma.product.findFirst({
        where: {
          barcode,
          isActive: true,
        },
      });

      if (!product) {
        return NextResponse.json(
          { error: `Ürün yok: ${barcode}` },
          { status: 404 }
        );
      }

      return NextResponse.json(product);
    }

    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 100,
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Ürünler alınırken bir hata oluştu" },
      { status: 500 }
    );
  }
}
