"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { HourlyStat } from "@/lib/daily-analytics";
import { formatTRY } from "@/lib/currency";
import { Flame, Clock, BarChart3, TrendingUp, Info } from "lucide-react";

interface HourlySalesChartProps {
  hourlyStats: HourlyStat[];
  peakHour: {
    hour: string;
    basketCount: number;
    revenue: number;
  } | null;
  isLoading?: boolean;
}

export function HourlySalesChart({
  hourlyStats,
  peakHour,
  isLoading,
}: HourlySalesChartProps) {
  const [metricMode, setMetricMode] = useState<"revenue" | "basketCount">("revenue");
  const [chartType, setChartType] = useState<"bar" | "area">("bar");

  const totalRevenueAllHours = hourlyStats.reduce((sum, h) => sum + h.revenue, 0);
  const totalBasketsAllHours = hourlyStats.reduce((sum, h) => sum + h.basketCount, 0);
  const hasData = totalBasketsAllHours > 0 || totalRevenueAllHours > 0;

  // Custom Dark Mode Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: HourlyStat = payload[0].payload;
      return (
        <div className="bg-zinc-900/95 border border-zinc-700/80 rounded-lg p-3 shadow-2xl font-mono text-xs backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 pb-1.5 mb-1.5 border-b border-zinc-800">
            <span className="font-bold text-zinc-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              {label} - {String(data.hourNum + 1).padStart(2, "0")}:00
            </span>
            {data.isPeak && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" /> ZİRVE SAAT
              </span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Toplam Ciro:</span>
              <span className="font-bold text-emerald-400 tabular-nums">
                {formatTRY(data.revenue)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Kapanan Fiş / Sepet:</span>
              <span className="font-bold text-amber-400 tabular-nums">
                {data.basketCount} adet
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Okutulan Ürün:</span>
              <span className="font-bold text-violet-400 tabular-nums">
                {data.itemCount} adet
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-4 md:p-5 flex flex-col justify-between shadow-lg">
      {/* ÜST BAŞLIK & KONTROLLER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Saatlik Yoğunluk & Satış Dağılımı
            </h3>
            {peakHour && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono animate-pulse">
                <Flame className="w-3 h-3 text-amber-400" />
                Zirve: {peakHour.hour} ({peakHour.basketCount} Fiş)
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Dükkanın saatlik ciro akışı ve kasa yoğunluk temposu
          </p>
        </div>

        {/* METRİK SEÇİCİ & GRAFİK TİPİ */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Metrik Toggle: Ciro vs Sepet */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => setMetricMode("revenue")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                metricMode === "revenue"
                  ? "bg-emerald-600 text-white font-bold shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Ciro (₺)
            </button>
            <button
              onClick={() => setMetricMode("basketCount")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                metricMode === "basketCount"
                  ? "bg-amber-600 text-white font-bold shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sepet / Fiş
            </button>
          </div>

          {/* Grafik Tipi: Bar vs Area */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => setChartType("bar")}
              className={`px-2 py-1 rounded-md text-xs transition-all ${
                chartType === "bar"
                  ? "bg-zinc-800 text-zinc-100 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Sütun Grafiği"
            >
              Bar
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`px-2 py-1 rounded-md text-xs transition-all ${
                chartType === "area"
                  ? "bg-zinc-800 text-zinc-100 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Alan Grafiği"
            >
              Alan
            </button>
          </div>
        </div>
      </div>

      {/* GRAFİK ALANI */}
      <div className="w-full h-64 md:h-72 mt-4">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950/40 rounded-lg border border-dashed border-zinc-800">
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Saatlik veriler yükleniyor...
            </div>
          </div>
        ) : !hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/30 rounded-lg border border-dashed border-zinc-800/80 p-6 text-center font-mono">
            <Info className="w-8 h-8 text-zinc-600 mb-2" />
            <span className="text-zinc-300 font-semibold text-sm">
              Bugün Henüz Satış Gerçekleşmedi
            </span>
            <span className="text-zinc-500 text-xs mt-1 max-w-xs">
              Kasada barkod okutup sepet kapandıkça saatlik yoğunluk ve ciro sütunları burada belirecektir.
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart
                data={hourlyStats}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  fontFamily="monospace"
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  fontFamily="monospace"
                  tickFormatter={(val) =>
                    metricMode === "revenue"
                      ? `${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}₺`
                      : `${val}`
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey={metricMode}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                >
                  {hourlyStats.map((entry, index) => {
                    // Peak saat altın/amber, diğerleri moda göre emerald veya cyan
                    let fill = entry.isPeak
                      ? "#f59e0b" // amber-500
                      : metricMode === "revenue"
                      ? "#10b981" // emerald-500
                      : "#f59e0b"; // amber-500
                    if (entry[metricMode] === 0) {
                      fill = "#27272a"; // Boş saat
                    }
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={fill}
                        opacity={entry.isPeak ? 1 : 0.85}
                        className="transition-all duration-150 hover:opacity-100"
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart
                data={hourlyStats}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metricMode === "revenue" ? "#10b981" : "#f59e0b"} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={metricMode === "revenue" ? "#10b981" : "#f59e0b"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  fontFamily="monospace"
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  fontFamily="monospace"
                  tickFormatter={(val) =>
                    metricMode === "revenue"
                      ? `${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}₺`
                      : `${val}`
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey={metricMode}
                  stroke={metricMode === "revenue" ? "#10b981" : "#f59e0b"}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* ALT LEJANT & ÖZET BİLGİ */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 pt-3 border-t border-zinc-800/80 mt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span>Normal Saatler</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
            <span className="text-amber-300 font-semibold">Zirve (Peak) Saati</span>
          </div>
        </div>
        <div className="text-zinc-500">
          Saat aralığı: 08:00 - 24:00 (Yerel Kasa Zamanı)
        </div>
      </div>
    </div>
  );
}
