import { NextRequest, NextResponse } from "next/server";
import { getDailyAnalytics } from "@/lib/daily-analytics";
import { prisma } from "@/lib/prisma";
import { broadcastTelemetryEvent } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    const analytics = await getDailyAnalytics(targetDate);
    return NextResponse.json(analytics, { status: 200 });
  } catch (err: unknown) {
    console.error("[Daily Analytics GET Error]:", err);
    return NextResponse.json(
      { error: "Günlük analitik verileri alınamadı", details: (err as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Test ve Canlı Simülasyon Amaçlı Sepet Kapanışı Fırlatma
 * Bu endpoint test ve demo sırasında hemen yeni bir sepet kapanışı oluşturup
 * Supabase broadcast üzerinden paneli canlı tetikler.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "IDLE_TIMEOUT";

    // Rastgele 1-4 adet ürün seçelim
    const sampleProducts = await prisma.product.findMany({
      take: 8,
      where: { isActive: true },
      select: { barcode: true, name: true, sellPrice: true },
    });

    if (sampleProducts.length === 0) {
      return NextResponse.json(
        { error: "Sistemde ürün bulunamadı" },
        { status: 400 }
      );
    }

    const randomCount = Math.floor(Math.random() * 3) + 1;
    const selectedBarcodes: string[] = [];
    for (let i = 0; i < randomCount; i++) {
      const p = sampleProducts[Math.floor(Math.random() * sampleProducts.length)];
      selectedBarcodes.push(p.barcode);
    }

    // Telemetry log oluştur
    const log = await prisma.telemetryLog.create({
      data: {
        event: "BASKET_COMPLETED",
        items: selectedBarcodes,
        count: selectedBarcodes.length,
        reason,
      },
    });

    // Supabase broadcast fırlat
    broadcastTelemetryEvent({
      id: log.id,
      event: "BASKET_COMPLETED",
      items: selectedBarcodes,
      count: selectedBarcodes.length,
      reason,
      timestamp: Date.now(),
      createdAt: log.createdAt.toISOString(),
    }).catch((e) => console.error("Sim broadcast error:", e));

    return NextResponse.json({
      success: true,
      message: "Test sepeti başarıyla kaydedildi ve yayınlandı",
      logId: log.id,
    });
  } catch (err: unknown) {
    console.error("[Daily Analytics POST Error]:", err);
    return NextResponse.json(
      { error: "Test sepeti oluşturulamadı", details: (err as Error).message },
      { status: 500 }
    );
  }
}
