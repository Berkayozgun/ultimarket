import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DebtType, Prisma } from "@prisma/client";
import { z } from "zod";

const tahsilatSchema = z.object({
  amount: z.number().positive("Tahsilat tutarı 0'dan büyük olmalıdır"),
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
    const parsed = tahsilatSchema.safeParse(body);

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

    // Negatif bakiye kontrolü
    if (amount > customer.balance) {
      return NextResponse.json(
        {
          error: `Tahsilat tutarı mevcut borç bakiyesini (${customer.balance.toLocaleString(
            "tr-TR",
            { minimumFractionDigits: 2 }
          )} ₺) aşamaz.`,
        },
        { status: 400 }
      );
    }

    const newBalance = Number((customer.balance - amount).toFixed(2));

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transaction = await tx.debtTransaction.create({
        data: {
          customerId,
          type: DebtType.TAHSILAT,
          amount,
          note: note || "Tahsilat",
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
    console.error("POST /api/customers/[id]/tahsilat error:", error);
    return NextResponse.json(
      { error: "Tahsilat işlemi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
