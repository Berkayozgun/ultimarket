import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customerId = parseInt(id, 10);

    if (isNaN(customerId)) {
      return NextResponse.json({ error: "Geçersiz müşteri ID" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10) || 50,
      200
    );
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    }

    const [transactions, total] = await Promise.all([
      prisma.debtTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.debtTransaction.count({ where: { customerId } }),
    ]);

    return NextResponse.json({ transactions, total, limit, offset });
  } catch (error) {
    console.error("GET /api/customers/[id]/transactions error:", error);
    return NextResponse.json(
      { error: "İşlem geçmişi alınırken hata oluştu" },
      { status: 500 }
    );
  }
}
