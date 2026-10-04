"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DailyAnalyticsData } from "@/lib/daily-analytics";
import { getSupabaseBrowserClient } from "@/lib/supabase";

interface UseDailyAnalyticsOptions {
  initialData?: DailyAnalyticsData | null;
  autoRefreshIntervalMs?: number; // Varsayılan 30 saniye
}

export function useDailyAnalytics({
  initialData = null,
  autoRefreshIntervalMs = 30000,
}: UseDailyAnalyticsOptions = {}) {
  const [data, setData] = useState<DailyAnalyticsData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const res = await fetch("/api/analytics/daily", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error("Analitik verisi alınamadı");
      const json: DailyAnalyticsData = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[useDailyAnalytics] Fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Supabase Realtime dinleyicisi
  useEffect(() => {
    // İlk açılışta eğer initialData yoksa çek
    if (!initialData) {
      fetchAnalytics();
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLiveConnected(false);
      return;
    }

    const channel = supabase.channel("analytics-daily-stream");

    channel
      .on("broadcast", { event: "live_event" }, (payload: any) => {
        const ev = payload?.payload?.event || payload?.event;
        // Eğer sepet kapandıysa veya ürün okunduysa analitiği tazele
        if (
          ev === "BASKET_COMPLETED" ||
          ev === "BASKET_CLOSED" ||
          ev === "ITEM_SCANNED" ||
          ev === "SALE_COMPLETED"
        ) {
          // Debounce ile ardışık okutmalarda sunucuyu boğma
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            fetchAnalytics(true);
          }, 600);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsLiveConnected(true);
        } else if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setIsLiveConnected(false);
        }
      });

    // Periyodik sessiz arka plan yenilemesi (opsiyonel heartbeat)
    const intervalTimer = setInterval(() => {
      fetchAnalytics(true);
    }, autoRefreshIntervalMs);

    return () => {
      clearInterval(intervalTimer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchAnalytics, autoRefreshIntervalMs, initialData]);

  // Demo / Simülasyon tetikleyici
  const simulateBasket = async (reason: "IDLE_TIMEOUT" | "ESC_KEY" = "IDLE_TIMEOUT") => {
    try {
      setIsRefreshing(true);
      await fetch("/api/analytics/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      // Hemen tekrar çek
      await fetchAnalytics(true);
    } catch (err) {
      console.error("[useDailyAnalytics] Simulation error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    data,
    isLoading,
    isRefreshing,
    isLiveConnected,
    lastUpdated,
    refetch: () => fetchAnalytics(false),
    simulateBasket,
  };
}
