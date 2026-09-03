import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DebtType, PaymentType, Prisma } from "@prisma/client";
import { z } from "zod";
import { getQuickSaleNameFromBarcode } from "@/lib/quick-sale";

const PAYMENT_TYPE_MAP: Record<string, PaymentType> = {
  NAKIT: "NAKIT",
  CASH: "NAKIT",
  KART: "KART",
  CARD: "KART",
  VERESIYE: "VERESIYE",
  CREDIT: "VERESIYE",
};

const saleItemSchema = z
  .object({
    productId: z.number().int().positive().optional(),
    barcode: z.string().trim().optional(),
    name: z.string().trim().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive().optional(),
    price: z.number().positive().optional(),
  })
  .refine((item) => item.productId != null || !!item.barcode, {
    message: "Her kalem için productId veya barcode gerekli",
  });

const saleSchema = z.object({
  paymentType: z.enum([
    "NAKIT",
    "KART",
    "VERESIYE",
    "CASH",
    "CARD",
    "CREDIT",
  ]),
  customerId: z.number().int().positive().optional(),
  totalAmount: z.number().positive().optional(),
  items: z.array(saleItemSchema).min(1, "Sepet boş olamaz"),
});

type ResolvedItem = {
  productId: number;
  quantity: number;
  unitPrice: number;
};

async function resolveSaleItems(
  items: z.infer<typeof saleItemSchema>[]
): Promise<ResolvedItem[] | { error: string; status: number }> {
  const resolved: ResolvedItem[] = [];

  for (const item of items) {
    let productId = item.productId;
    let unitPrice = item.unitPrice ?? item.price;

    if (!productId && item.barcode) {
      let product = await prisma.product.findFirst({
        where: { barcode: item.barcode, isActive: true },
      });

      if (!product && item.barcode.startsWith("QUICK-")) {
        const quickName =
          item.name ?? getQuickSaleNameFromBarcode(item.barcode) ?? item.barcode;
        const sellPrice = unitPrice ?? 0;

        if (sellPrice <= 0) {
          return {
            error: `Hızlı satış ürünü için geçerli fiyat gerekli: ${item.barcode}`,
            status: 400,
          };
        }

        product = await prisma.product.create({
          data: {
            barcode: item.barcode,
            name: quickName,
            sellPrice,
            isActive: true,
            isQuickSale: true,
          },
        });
      }

      if (!product) {
        return {
          error: `Ürün bulunamadı: ${item.barcode}`,
          status: 404,
        };
      }
      productId = product.id;
      if (unitPrice == null) unitPrice = product.sellPrice;
    }

    if (!productId) {
      return { error: "Geçersiz satış kalemi", status: 400 };
    }

    if (unitPrice == null) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        return { error: `Ürün bulunamadı: #${productId}`, status: 404 };
      }
      unitPrice = product.sellPrice;
    }

    resolved.push({
      productId,
      quantity: item.quantity,
      unitPrice,
    });
  }

  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = saleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz satış verisi", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { customerId, items } = parsed.data;
    const paymentType = PAYMENT_TYPE_MAP[parsed.data.paymentType];

    const resolvedItems = await resolveSaleItems(items);
    if ("error" in resolvedItems) {
      return NextResponse.json(
        { error: resolvedItems.error },
        { status: resolvedItems.status }
      );
    }

    const totalAmount = Number(
      resolvedItems
        .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        .toFixed(2)
    );

    if (paymentType === "VERESIYE") {
      if (!customerId) {
        return NextResponse.json(
          { error: "Veresiye satış için müşteri seçilmelidir." },
          { status: 400 }
        );
      }

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        return NextResponse.json(
          { error: "Seçilen müşteri bulunamadı." },
          { status: 404 }
        );
      }

      const remainingLimit = Number(
        (customer.creditLimit - customer.balance).toFixed(2)
      );
      if (customer.balance + totalAmount > customer.creditLimit) {
        return NextResponse.json(
          {
            error: "Kredi limiti aşıldı! Satış yapılamaz.",
            creditLimit: customer.creditLimit,
            currentBalance: customer.balance,
            remainingLimit,
            totalAmount,
          },
          { status: 409 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sale = await tx.sale.create({
        data: {
          totalAmount,
          paymentType,
          customerId: customerId || null,
          items: {
            create: resolvedItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
          customer: true,
        },
      });

      if (paymentType === "VERESIYE" && customerId) {
        await tx.debtTransaction.create({
          data: {
            customerId,
            type: DebtType.BORC,
            amount: totalAmount,
            note: `Veresiye Satış #${sale.id}`,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: totalAmount } },
        });
      }

      return sale;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json(
      { error: "Satış kaydedilirken hata oluştu" },
      { status: 500 }
    );
  }
}
