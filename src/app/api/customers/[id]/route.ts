import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customerId = parseInt(id, 10);

    if (isNaN(customerId)) {
      return NextResponse.json({ error: "Geçersiz müşteri ID" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        debts: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json(
      { error: "Müşteri alınırken hata oluştu" },
      { status: 500 }
    );
  }
}
