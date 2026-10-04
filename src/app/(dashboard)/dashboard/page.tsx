import { Metadata } from "next";
import { getDailyAnalytics } from "@/lib/daily-analytics";
import { DailyDashboardClient } from "@/components/dashboard/DailyDashboardClient";

export const metadata: Metadata = {
  title: "Günün Satış Özeti & Analitik Paneli | UltiMarket",
  description: "Anlık ciro, saatlik satış temposu, sepet istatistikleri ve günün en çok satan ürünleri",
};

export const dynamic = "force-dynamic";

export default async function DailyDashboardPage() {
  const initialData = await getDailyAnalytics();

  return <DailyDashboardClient initialData={initialData} />;
}
