import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const customerCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalıdır"),
  phone: z.string().trim().min(5, "Telefon en az 5 karakter olmalıdır"),
  creditLimit: z.number().min(0, "Kredi limiti negatif olamaz"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const sort = searchParams.get("sort");
    const debtOnly = searchParams.get("debtOnly") === "true";

    const customers = await prisma.customer.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
        ...(debtOnly ? { balance: { gt: 0 } } : {}),
      },
      include: {
        debts: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
      orderBy:
        sort === "balance"
          ? [{ balance: "desc" }, { fullName: "asc" }]
          : { fullName: "asc" },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: "Müşteriler alınırken hata oluştu" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = customerCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { fullName, phone, creditLimit } = parsed.data;

    const customer = await prisma.customer.create({
      data: {
        fullName,
        phone,
        creditLimit,
        balance: 0,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json(
      { error: "Müşteri oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}
