import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { normalizeItemName } from "@/lib/normalize";

const invoiceItemSaveSchema = z.object({
  barcode: z.string().nullable().optional(),
  rawName: z.string().min(1),
  normalizedName: z.string().min(1),
  quantity: z.number().positive(),
  unitCostNet: z.number().positive(),
  vatRate: z.number().min(0).max(100).nullable().optional(),
  lineTotal: z.number().positive().nullable().optional(),
});

const invoiceSaveSchema = z.object({
  supplierName: z.string().min(1, "Tedarikçi adı gereklidir"),
  invoiceDate: z.string().min(1, "Fatura tarihi gereklidir"),
  dueDate: z.string().nullable().optional(),
  totalAmount: z.number().positive("Toplam tutar pozitif olmalıdır"),
  imageUrl: z.string().nullable().optional(),
  items: z.array(invoiceItemSaveSchema).min(1, "En az bir ürün bulunmalıdır"),
});

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/faturalar error:", error);
    return NextResponse.json(
      { error: "Faturalar alınırken hata oluştu" },
      { status: 500 }
    );
  }
}

/** Faturayı arşivler; alış fiyatı güncellemesi yapmaz (bunun için /api/products/update-costs) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = invoiceSaveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz fatura verisi", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { supplierName, invoiceDate, dueDate, totalAmount, imageUrl, items } =
      parsed.data;

    const sanitizedItems = items.map((item) => ({
      barcode: item.barcode?.trim() || null,
      rawName: item.rawName.trim(),
      normalizedName: normalizeItemName(item.normalizedName || item.rawName),
      quantity: item.quantity,
      unitCostNet: item.unitCostNet,
      vatRate: item.vatRate ?? null,
      lineTotal: item.lineTotal ?? item.quantity * item.unitCostNet,
    }));

    const invoice = await prisma.invoice.create({
      data: {
        supplierName,
        invoiceDate: new Date(invoiceDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        totalAmount,
        imageUrl: imageUrl || null,
        status: InvoiceStatus.ISLENDI,
        items: {
          create: sanitizedItems,
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/faturalar error:", error);
    return NextResponse.json(
      { error: "Fatura kaydedilirken hata oluştu" },
      { status: 500 }
    );
  }
}
