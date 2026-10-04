"use client";

import React, { useState } from "react";
import { DailyAnalyticsData } from "@/lib/daily-analytics";
import { useDailyAnalytics } from "@/hooks/useDailyAnalytics";
import { KpiCards } from "./KpiCards";
import { HourlySalesChart } from "./HourlySalesChart";
import { TopSellingTable } from "./TopSellingTable";
import { RecentBasketsFeed } from "./RecentBasketsFeed";
import {
  RefreshCw,
  Sparkles,
  Radio,
  Calendar,
  Clock,
  ArrowRight,
  Store,
  Terminal,
  Play,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface DailyDashboardClientProps {
  initialData: DailyAnalyticsData;
}

export function DailyDashboardClient({ initialData }: DailyDashboardClientProps) {
  const {
    data,
    isLoading,
    isRefreshing,
    isLiveConnected,
    lastUpdated,
    refetch,
    simulateBasket,
  } = useDailyAnalytics({ initialData });

  const [isSimulating, setIsSimulating] = useState(false);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  const analytics = data || initialData;

  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      await simulateBasket("IDLE_TIMEOUT");
      setSimFeedback("Simüle sepet başarıyla işlendi ve panele eklendi!");
      setTimeout(() => setSimFeedback(null), 3000);
    } finally {
      setIsSimulating(false);
    }
  };

  const currentDateFormatted = new Date().toLocaleDateString("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const lastUpdatedFormatted = lastUpdated.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0D0F12] text-zinc-100 font-sans overflow-y-auto min-h-0 p-4 md:p-6 lg:p-8 space-y-6 select-text">
      {/* ÜST BAŞLIK & REALTIME STATUS BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/70 border border-emerald-800/80 text-emerald-400">
              <Store className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-zinc-100 uppercase font-mono">
              Günün Satış Özeti & Analitik Paneli
            </h1>

            {/* Canlı Bağlantı Rozeti */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono">
              <span className="relative flex h-2 w-2">
                {isLiveConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </>
                )}
              </span>
              <span className={isLiveConnected ? "text-emerald-400 font-bold" : "text-amber-400 font-medium"}>
                {isLiveConnected ? "CANLI AKIŞ AKTİF" : "BAĞLANTI BEKLENİYOR"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono mt-1.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              {currentDateFormatted}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              Son Güncelleme: <strong className="text-zinc-300">{lastUpdatedFormatted}</strong>
            </span>
          </div>
        </div>

        {/* SAĞ TARAF: AKSİYONLAR & NAVİGASYON */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Simülasyon Geri Bildirimi */}
          {simFeedback && (
            <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[11px] animate-in fade-in flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {simFeedback}
            </span>
          )}

          {/* Test Sepeti Simüle Et Butonu */}
          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            title="Dükkan akışını test etmek için yapay bir sepet kapanışı tetikler"
          >
            <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>{isSimulating ? "Simüle Ediliyor..." : "Test Sepeti Gönder"}</span>
          </button>

          {/* Manuel Yenile Butonu */}
          <button
            onClick={() => refetch()}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Verileri anında tazele"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>

          {/* Canlı Terminale Git Butonu */}
          <Link
            href="/live-terminal"
            className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 font-semibold"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Canlı Terminal</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 1. BÖLÜM: ÜST KPI KARTLARI */}
      <KpiCards summary={analytics.summary} isLoading={isLoading} />

      {/* 2. BÖLÜM: SAATLİK YOĞUNLUK & SATIŞ GRAFİĞİ */}
      <HourlySalesChart
        hourlyStats={analytics.hourlyStats}
        peakHour={analytics.summary.peakHour}
        isLoading={isLoading}
      />

      {/* 3. BÖLÜM: BENTO GRID (EN ÇOK SATANLAR & SON KAPANAN SEPETLER) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sol Kolon: En Çok Satan Ürünler Tablosu (7 Kolon) */}
        <div className="lg:col-span-7">
          <TopSellingTable
            products={analytics.topProducts}
            isLoading={isLoading}
          />
        </div>

        {/* Sağ Kolon: Son Kapanan Sepetler Canlı Akışı (5 Kolon) */}
        <div className="lg:col-span-5">
          <RecentBasketsFeed
            baskets={analytics.recentBaskets}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
