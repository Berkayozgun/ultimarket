import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { QUICK_SALE_DEFS } from "@/lib/quick-sale";

const legacyQuerySchema = z.object({
  barcode: z.string().trim().optional(),
  q: z.string().trim().optional(),
  quickSale: z.enum(["true", "false"]).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  filter: z.enum(["all", "no-price", "short-name"]).default("all"),
});

const productCreateSchema = z.object({
  barcode: z.string().trim().min(1, "Barkod boş olamaz"),
  name: z.string().trim().min(1, "Ürün adı boş olamaz"),
  sellPrice: z.number().min(0, "Satış fiyatı negatif olamaz"),
  lastCostNet: z.number().min(0, "Alış maliyeti negatif olamaz").nullable().optional(),
});

function buildSearchWhere(search?: string): Prisma.ProductWhereInput {
  if (!search) return {};
  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search } },
    ],
  };
}

function buildFilterWhere(filter: "all" | "no-price" | "short-name"): Prisma.ProductWhereInput {
  switch (filter) {
    case "no-price":
      return { sellPrice: { lte: 0 } };
    case "short-name":
      return {};
    default:
      return {};
  }
}

async function getPaginatedProducts(
  page: number,
  limit: number,
  search?: string,
  filter: "all" | "no-price" | "short-name" = "all"
) {
  const skip = (page - 1) * limit;
  const searchWhere = buildSearchWhere(search);
  const filterWhere = buildFilterWhere(filter);

  if (filter === "short-name") {
    const searchClause = search
      ? Prisma.sql`AND (name ILIKE ${"%" + search + "%"} OR barcode ILIKE ${"%" + search + "%"})`
      : Prisma.empty;

    const [rows, countResult] = await Promise.all([
      prisma.$queryRaw<
        {
          id: number;
          barcode: string;
          name: string;
          sellPrice: number;
          lastCostNet: number | null;
          category: string | null;
          isActive: boolean;
          createdAt: Date;
          updatedAt: Date;
        }[]
      >`
        SELECT id, barcode, name, "sellPrice", "lastCostNet", category, "isActive", "createdAt", "updatedAt"
        FROM "Product"
        WHERE "isActive" = true
          AND char_length(name) < 4
          ${searchClause}
        ORDER BY name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Product"
        WHERE "isActive" = true
          AND char_length(name) < 4
          ${searchClause}
      `,
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return { products: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...searchWhere,
    ...filterWhere,
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const hasListParams =
      searchParams.has("page") ||
      searchParams.has("search") ||
      searchParams.has("filter");

    if (!hasListParams) {
      const parsed = legacyQuerySchema.safeParse({
        barcode: searchParams.get("barcode") || undefined,
        q: searchParams.get("q") || undefined,
        quickSale: searchParams.get("quickSale") || undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Geçersiz arama parametresi" },
          { status: 400 }
        );
      }

      const { barcode, q, quickSale } = parsed.data;

      if (quickSale === "true") {
        const flagged = await prisma.product.findMany({
          where: { isActive: true, isQuickSale: true },
          orderBy: [{ quickSaleOrder: "asc" }, { name: "asc" }],
        });

        if (flagged.length > 0) {
          return NextResponse.json(flagged);
        }

        const searchClauses = QUICK_SALE_DEFS.flatMap((def) =>
          def.searchTerms.map((term) => ({
            name: { contains: term, mode: "insensitive" as const },
          }))
        );

        const candidates = await prisma.product.findMany({
          where: {
            isActive: true,
            OR: searchClauses,
          },
          orderBy: { name: "asc" },
        });

        return NextResponse.json(candidates);
      }

      if (barcode) {
        const product = await prisma.product.findFirst({
          where: { barcode, isActive: true },
        });

        if (!product) {
          return NextResponse.json(
            { error: `Ürün yok: ${barcode}` },
            { status: 404 }
          );
        }

        return NextResponse.json(product);
      }

      if (q) {
        const exactBarcode = await prisma.product.findFirst({
          where: { barcode: q, isActive: true },
        });
        if (exactBarcode) {
          return NextResponse.json([exactBarcode]);
        }

        const products = await prisma.product.findMany({
          where: {
            isActive: true,
            name: { contains: q, mode: "insensitive" },
          },
          orderBy: { name: "asc" },
          take: 10,
        });

        if (products.length === 0) {
          return NextResponse.json(
            { error: `Ürün bulunamadı: ${q}` },
            { status: 404 }
          );
        }

        return NextResponse.json(products);
      }

      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        take: 100,
      });

      return NextResponse.json(products);
    }

    const listParsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") || undefined,
      filter: searchParams.get("filter") || undefined,
    });

    if (!listParsed.success) {
      return NextResponse.json(
        { error: "Geçersiz liste parametreleri", details: listParsed.error.format() },
        { status: 400 }
      );
    }

    const result = await getPaginatedProducts(
      listParsed.data.page,
      listParsed.data.limit,
      listParsed.data.search,
      listParsed.data.filter
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Ürünler alınırken bir hata oluştu" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = productCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { barcode, name, sellPrice, lastCostNet } = parsed.data;

    const existing = await prisma.product.findUnique({ where: { barcode } });
    if (existing) {
      return NextResponse.json(
        { error: `Bu barkod zaten kayıtlı: ${barcode}` },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        barcode,
        name,
        sellPrice,
        lastCostNet: lastCostNet ?? null,
        isActive: true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json(
      { error: "Ürün oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}
