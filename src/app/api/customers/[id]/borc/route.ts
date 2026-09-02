import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DebtType, Prisma } from "@prisma/client";
import { z } from "zod";

const borcSchema = z.object({
  amount: z.number().positive("Borç tutarı 0'dan büyük olmalıdır"),
  note: z.string().trim().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customerId = parseInt(id, 10);

    if (isNaN(customerId)) {
      return NextResponse.json({ error: "Geçersiz müşteri ID" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = borcSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { amount, note } = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    }

    const remainingLimit = Number((customer.creditLimit - customer.balance).toFixed(2));
    if (customer.balance + amount > customer.creditLimit) {
      return NextResponse.json(
        {
          error: `Kredi limiti aşıldı! Kalan limit: ${remainingLimit.toLocaleString(
            "tr-TR",
            { minimumFractionDigits: 2 }
          )} ₺`,
        },
        { status: 409 }
      );
    }

    const newBalance = Number((customer.balance + amount).toFixed(2));

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transaction = await tx.debtTransaction.create({
        data: {
          customerId,
          type: DebtType.BORC,
          amount,
          note: note || "Elden Borç Kaydı",
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { balance: newBalance },
      });

      return { transaction, customer: updatedCustomer };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/customers/[id]/borc error:", error);
    return NextResponse.json(
      { error: "Borç kaydedilirken hata oluştu" },
      { status: 500 }
    );
  }
}
