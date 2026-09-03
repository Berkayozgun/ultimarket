import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Ürün adı boş olamaz").optional(),
    barcode: z.string().trim().min(1, "Barkod boş olamaz").optional(),
    sellPrice: z.number().min(0, "Satış fiyatı negatif olamaz").optional(),
    lastCostNet: z.number().min(0, "Alış maliyeti negatif olamaz").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Güncellenecek en az bir alan gerekli",
  });

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = productUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    if (parsed.data.barcode && parsed.data.barcode !== existing.barcode) {
      const duplicate = await prisma.product.findUnique({
        where: { barcode: parsed.data.barcode },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Bu barkod zaten kayıtlı: ${parsed.data.barcode}` },
          { status: 409 }
        );
      }
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: parsed.data,
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Ürün güncellenirken hata oluştu" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { _count: { select: { saleItems: true } } },
    });

    if (!product) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    const invoiceItemCount = await prisma.invoiceItem.count({
      where: { barcode: product.barcode },
    });

    const hasHistory = product._count.saleItems > 0 || invoiceItemCount > 0;

    if (hasHistory) {
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });

      return NextResponse.json({
        id: productId,
        softDeleted: true,
        message: "Ürün geçmiş kayıtlarda yer aldığı için pasif hale getirildi",
      });
    }

    await prisma.product.delete({ where: { id: productId } });

    return NextResponse.json({
      id: productId,
      softDeleted: false,
      message: "Ürün kalıcı olarak silindi",
    });
  } catch (error) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Ürün silinirken hata oluştu" },
      { status: 500 }
    );
  }
}
