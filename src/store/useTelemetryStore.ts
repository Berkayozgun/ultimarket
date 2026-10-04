import { create } from "zustand";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export interface BasketItem {
  barcode: string;
  name?: string | null;
  price?: number | null;
  scannedAt: number;
}

export interface TelemetryLogItem {
  id: string;
  event: "ITEM_SCANNED" | "BASKET_COMPLETED" | string;
  barcode?: string | null;
  productName?: string | null;
  productPrice?: number | null;
  items?: any; // BASKET_COMPLETED durumunda barkod/ürün listesi
  count?: number | null;
  reason?: string | null; // "IDLE_TIMEOUT" | "ESC_KEY" vb.
  timestamp: number;
  createdAt?: string;
}

interface TelemetryState {
  logs: TelemetryLogItem[];
  currentBasket: BasketItem[];
  isConnected: boolean;
  todayScanCount: number;
  isAudioEnabled: boolean;
  
  // Actions
  addLog: (log: TelemetryLogItem) => void;
  clearLogs: () => void;
  setAudioEnabled: (enabled: boolean) => void;
  initRealtimeSubscription: () => () => void;
  fetchInitialData: () => Promise<void>;
}

// Sesli bildirim için Web Audio API beep üreteci
const playBeep = (freq = 880, type: OscillatorType = "sine", duration = 0.08) => {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.debug("Audio play blocked or unavailable:", e);
  }
};

let activeChannel: any = null;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  logs: [],
  currentBasket: [],
  isConnected: false,
  todayScanCount: 0,
  isAudioEnabled: true,

  setAudioEnabled: (enabled: boolean) => set({ isAudioEnabled: enabled }),

  clearLogs: () => set({ logs: [] }),

  addLog: (log: TelemetryLogItem) => {
    const { isAudioEnabled } = get();

    // Sesli geri bildirim
    if (isAudioEnabled) {
      if (log.event === "ITEM_SCANNED") {
        playBeep(920, "sine", 0.08); // Okutma bipi
      } else if (log.event === "BASKET_COMPLETED") {
        playBeep(440, "triangle", 0.15); // Sepet kapanış sesi
      }
    }

    set((state) => {
      // 1. Log listesini güncelle (en fazla 150 kayıt, en yeni en üstte)
      const updatedLogs = [log, ...state.logs.filter((l) => l.id !== log.id)].slice(0, 150);

      // 2. Event'e göre sepet ve sayaç güncelleme
      let nextBasket = [...state.currentBasket];
      let nextScanCount = state.todayScanCount;

      if (log.event === "ITEM_SCANNED") {
        nextScanCount += 1;
        if (log.barcode) {
          nextBasket.unshift({
            barcode: log.barcode,
            name: log.productName,
            price: log.productPrice,
            scannedAt: log.timestamp || Date.now(),
          });
        }
      } else if (log.event === "BASKET_COMPLETED") {
        // Sepet tamamlandı veya kapandı, sıfırla
        nextBasket = [];
      }

      return {
        logs: updatedLogs,
        currentBasket: nextBasket,
        todayScanCount: nextScanCount,
      };
    });
  },

  fetchInitialData: async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.logs)) {
        set({
          logs: data.logs,
          todayScanCount: data.todayScanCount ?? 0,
        });
      }
    } catch (err) {
      console.error("Failed to fetch initial telemetry data:", err);
    }
  },

  initRealtimeSubscription: () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.warn("[TelemetryStore] Supabase browser client not available.");
      set({ isConnected: false });
      return () => {};
    }

    // Eğer zaten aktif kanal varsa temizle
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      activeChannel = null;
    }

    const channel = supabase.channel("telemetry-stream");
    activeChannel = channel;

    channel
      .on("broadcast", { event: "live_event" }, (payload: any) => {
        const logData = (payload?.payload || payload) as TelemetryLogItem;
        if (logData && logData.event) {
          get().addLog(logData);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          set({ isConnected: true });
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          set({ isConnected: false });
        }
      });

    // Unsubscribe temizleme fonksiyonu
    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
      }
      set({ isConnected: false });
    };
  },
}));
