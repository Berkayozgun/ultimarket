import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DebtType, PaymentType, Prisma } from "@prisma/client";
import { z } from "zod";

const saleSchema = z.object({
  paymentType: z.enum(["NAKIT", "KART", "VERESIYE"]),
  customerId: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().positive(),
      })
    )
    .min(1, "Sepet boş olamaz"),
});

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

    const { paymentType, customerId, items } = parsed.data;

    const totalAmount = Number(
      items
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

      const remainingLimit = Number((customer.creditLimit - customer.balance).toFixed(2));
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
          paymentType: paymentType as PaymentType,
          customerId: customerId || null,
          items: {
            create: items.map((i) => ({
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
