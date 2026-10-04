import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastTelemetryEvent } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    // 1. Authorization Kontrolü
    const authHeader = req.headers.get("authorization");
    const secretToken = process.env.TELEMETRY_SECRET_TOKEN;

    if (secretToken) {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Unauthorized: Missing or invalid Authorization header" },
          { status: 401 }
        );
      }

      const token = authHeader.replace("Bearer ", "").trim();
      if (token !== secretToken) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid token" },
          { status: 401 }
        );
      }
    }

    // 2. Request Body Ayrıştırma
    const body = await req.json().catch(() => null);
    if (!body || !body.event) {
      return NextResponse.json(
        { error: "Bad Request: 'event' field is required" },
        { status: 400 }
      );
    }

    const { event, data = {}, timestamp } = body;

    let barcode: string | null = null;
    let productName: string | null = null;
    let productPrice: number | null = null;
    let items = data.items ?? null;
    let count: number | null =
      data.count ?? (Array.isArray(items) ? items.length : null);
    const reason: string | null = data.reason ?? null;

    // 3. Event Bazlı Mantık
    if (event === "ITEM_SCANNED") {
      barcode = data.barcode ? String(data.barcode).trim() : null;

      if (barcode) {
        try {
          const product = await prisma.product.findUnique({
            where: { barcode },
            select: { name: true, sellPrice: true },
          });

          if (product) {
            productName = product.name;
            productPrice = product.sellPrice;
          }
        } catch (dbErr) {
          console.error("[Telemetry] Product lookup error:", dbErr);
        }
      }
    }

    // 4. Prisma ile TelemetryLog tablosuna kaydet
    let logEntry;
    try {
      logEntry = await prisma.telemetryLog.create({
        data: {
          event: String(event),
          barcode,
          items: items ? (items as any) : undefined,
          count: count !== null ? Number(count) : undefined,
          reason,
        },
      });
    } catch (saveErr) {
      console.error("[Telemetry] DB save error:", saveErr);
      // Fallback: logEntry olmasa bile realtime broadcast fırlatıp POS'u aksatmamak için
      logEntry = {
        id: "temp-" + Date.now(),
        event: String(event),
        barcode,
        items,
        count,
        reason,
        createdAt: new Date(),
      };
    }

    // 5. Supabase Realtime broadcast fırlat
    // POS'un yanıt süresini minimumda tutmak için broadcast işlemini arka planda tetikliyoruz
    const broadcastPayload = {
      id: logEntry.id,
      event: logEntry.event,
      barcode,
      productName,
      productPrice,
      items,
      count,
      reason,
      timestamp: timestamp || Date.now(),
      createdAt: logEntry.createdAt.toISOString(),
    };

    // Non-blocking realtime push
    broadcastTelemetryEvent(broadcastPayload).catch((bcErr) => {
      console.error("[Telemetry] Realtime broadcast failed:", bcErr);
    });

    return NextResponse.json({ success: true, id: logEntry.id }, { status: 200 });
  } catch (err: any) {
    console.error("[Telemetry API Error]:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err?.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [logs, todayScanCount] = await Promise.all([
      prisma.telemetryLog.findMany({
        take: 150,
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
      prisma.telemetryLog.count({
        where: {
          event: "ITEM_SCANNED",
          createdAt: { gte: today },
        },
      }).catch(() => 0),
    ]);

    // Ürün isimlerini eşleştirmek için barkodları alalım
    const barcodes = Array.from(new Set(logs.map((l) => l.barcode).filter(Boolean))) as string[];
    const products = barcodes.length > 0
      ? await prisma.product.findMany({
          where: { barcode: { in: barcodes } },
          select: { barcode: true, name: true, sellPrice: true },
        }).catch(() => [])
      : [];

    const productMap = new Map(products.map((p) => [p.barcode, p]));

    const formattedLogs = logs.map((log) => {
      const prod = log.barcode ? productMap.get(log.barcode) : null;
      return {
        id: log.id,
        event: log.event,
        barcode: log.barcode,
        productName: prod?.name || null,
        productPrice: prod?.sellPrice || null,
        items: log.items,
        count: log.count,
        reason: log.reason,
        timestamp: new Date(log.createdAt).getTime(),
        createdAt: log.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      logs: formattedLogs,
      todayScanCount,
    });
  } catch (err: any) {
    console.error("[Telemetry GET Error]:", err);
    return NextResponse.json({ logs: [], todayScanCount: 0 });
  }
}
