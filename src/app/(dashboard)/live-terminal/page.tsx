"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  useTelemetryStore,
  type TelemetryLogItem,
} from "@/store/useTelemetryStore";
import {
  Terminal,
  Volume2,
  VolumeX,
  Trash2,
  Activity,
  ShoppingBag,
  Barcode,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Info,
} from "lucide-react";

export default function LiveTerminalPage() {
  const {
    logs,
    currentBasket,
    isConnected,
    todayScanCount,
    isAudioEnabled,
    addLog,
    clearLogs,
    setAudioEnabled,
    initRealtimeSubscription,
    fetchInitialData,
  } = useTelemetryStore();

  const [filterEvent, setFilterEvent] = useState<string>("ALL");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"stream" | "basket">("stream");
  const [now, setNow] = useState<number>(Date.now());
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Periyodik olarak saniyeyi güncelle (örn. "3 sn önce" hesaplamak için)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime aboneliğini başlat ve ilk verileri çek
  useEffect(() => {
    fetchInitialData();
    const unsubscribe = initRealtimeSubscription();
    return () => {
      unsubscribe();
    };
  }, [initRealtimeSubscription, fetchInitialData]);

  // Zaman farkı formatlayıcı
  const formatTimeAgo = (timestamp: number) => {
    const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (diffSec < 2) return "az önce";
    if (diffSec < 60) return `${diffSec} sn önce`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} sa önce`;
  };

  const formatClock = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toTimeString().split(" ")[0]; // "HH:MM:SS"
  };

  // Test amacıyla simülasyon fırlatma
  const handleSimulateScan = async () => {
    setIsSimulating(true);
    try {
      const sampleBarcodes = [
        { barcode: "8690504001234", name: "Tuborg Gold 50cl", price: 65.0 },
        { barcode: "8690504112233", name: "Efes Pilsen Özel Seri 50cl", price: 68.0 },
        { barcode: "8690637004411", name: "Lays Klasik Mega Boy", price: 42.5 },
        { barcode: "8690555001122", name: "Coca Cola 1L Pet", price: 35.0 },
        { barcode: "8692888990011", name: "Marlboro Touch Blue", price: 75.0 },
      ];
      const randomSample =
        sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];

      const fakeLog: TelemetryLogItem = {
        id: "sim-" + Math.random().toString(36).substring(2, 9),
        event: "ITEM_SCANNED",
        barcode: randomSample.barcode,
        productName: randomSample.name,
        productPrice: randomSample.price,
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
      };

      addLog(fakeLog);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateBasketClose = () => {
    const fakeLog: TelemetryLogItem = {
      id: "sim-" + Math.random().toString(36).substring(2, 9),
      event: "BASKET_COMPLETED",
      count: currentBasket.length || 3,
      reason: "IDLE_TIMEOUT",
      items: currentBasket.map((b) => b.barcode),
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };
    addLog(fakeLog);
  };

  const filteredLogs = useMemo(() => {
    if (filterEvent === "ALL") return logs;
    return logs.filter((l) => l.event === filterEvent);
  }, [logs, filterEvent]);

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 font-mono select-text overflow-hidden p-3 md:p-5 gap-4">
      {/* ÜST PANEL: STATS & CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Kasa Durumu Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3.5 w-3.5">
              {isConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                </>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
                </>
              )}
            </div>
            <div>
              <div className="text-[11px] text-zinc-400 tracking-wider uppercase font-semibold">
                Kasa Ajanı / Realtime
              </div>
              <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
                {isConnected ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    KASA CANLI
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950/80 border border-emerald-800/60 rounded text-emerald-300">
                      SYNC
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    BAĞLANTI BEKLENİYOR
                    <span className="text-[10px] px-1.5 py-0.2 bg-amber-950/80 border border-amber-800/60 rounded text-amber-300">
                      STANDBY
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <Activity className={`w-5 h-5 ${isConnected ? "text-emerald-400" : "text-amber-400"} opacity-80`} />
        </div>

        {/* Anlık Sepet Sayacı Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] text-zinc-400 tracking-wider uppercase font-semibold">
              Anlık Sepet
            </div>
            <div className="text-lg font-bold text-amber-400 flex items-center gap-2 mt-0.5">
              <span>{currentBasket.length} Ürün</span>
              {currentBasket.length > 0 && (
                <span className="text-xs font-normal text-amber-200/80">
                  (Açık İşlem)
                </span>
              )}
            </div>
          </div>
          <div className="p-2 bg-amber-950/40 border border-amber-900/60 rounded-md">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* Günlük Hacim Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] text-zinc-400 tracking-wider uppercase font-semibold">
              Bugünkü Okutulan
            </div>
            <div className="text-lg font-bold text-emerald-400 flex items-center gap-2 mt-0.5">
              <span>{todayScanCount} Adet</span>
              <span className="text-xs font-normal text-zinc-400">Barkod</span>
            </div>
          </div>
          <div className="p-2 bg-emerald-950/40 border border-emerald-900/60 rounded-md">
            <Barcode className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        {/* Kontrol ve Aksiyonlar Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-1.5">
            {/* Ses Toggle */}
            <button
              onClick={() => setAudioEnabled(!isAudioEnabled)}
              title={isAudioEnabled ? "Sesi Kapat" : "Sesi Aç"}
              className={`p-2 rounded border transition-all text-xs flex items-center gap-1.5 ${
                isAudioEnabled
                  ? "bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden lg:inline">{isAudioEnabled ? "Bip Açık" : "Bip Kapalı"}</span>
            </button>

            {/* Temizle Butonu */}
            <button
              onClick={clearLogs}
              title="Konsol Günlüğünü Temizle"
              className="p-2 rounded border border-zinc-800 bg-zinc-800/80 hover:bg-red-950/40 hover:border-red-900 hover:text-red-300 text-zinc-300 transition-all text-xs flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden lg:inline">Temizle</span>
            </button>
          </div>

          {/* Test / Simülasyon Butonları */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSimulateScan}
              disabled={isSimulating}
              className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-emerald-900/70 border border-zinc-700 hover:border-emerald-700 text-[11px] font-semibold text-emerald-300 transition-all flex items-center gap-1"
              title="Ajan simülasyonu için rastgele barkod okutma tetikle"
            >
              <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
              <span>Simüle Et</span>
            </button>

            {currentBasket.length > 0 && (
              <button
                onClick={handleSimulateBasketClose}
                className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-amber-900/70 border border-zinc-700 hover:border-amber-700 text-[11px] font-semibold text-amber-300 transition-all"
                title="Sepeti Kapat Simülasyonu"
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ANA TERMİNAL PENCERESİ */}
      <div className="flex-1 flex flex-col bg-zinc-950/95 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative">
        {/* Terminal Header Bar */}
        <div className="h-10 bg-zinc-900/90 border-b border-zinc-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Mac style dot buttons */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-600/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-600/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/60" />
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-zinc-200">
                kasa_agent@pos: ~/telemetry-stream
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                PORT: 3000
              </span>
            </div>
          </div>

          {/* Sekmeler & Filtre */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs">
              <button
                onClick={() => setActiveTab("stream")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeTab === "stream"
                    ? "bg-zinc-800 text-emerald-300 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Canlı Akış ({filteredLogs.length})
              </button>
              <button
                onClick={() => setActiveTab("basket")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeTab === "basket"
                    ? "bg-zinc-800 text-amber-300 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Açık Sepet ({currentBasket.length})
              </button>
            </div>

            {activeTab === "stream" && (
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Tüm Olaylar</option>
                <option value="ITEM_SCANNED">Sadece Taramalar (SCAN)</option>
                <option value="BASKET_COMPLETED">Sadece Kapanan Sepetler</option>
              </select>
            )}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed space-y-1.5 custom-terminal-scroll">
          {activeTab === "stream" ? (
            filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 py-16 gap-3">
                <Terminal className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
                <p className="font-semibold text-zinc-400 text-sm">
                  Kasa telemetri akışı dinleniyor...
                </p>
                <p className="text-xs text-zinc-600 max-w-md">
                  `kasa_agent.exe` kasada bir barkod okuttuğunda veya sepet tamamlandığında
                  veriler milisaniyesinde burada terminal formatında görünecektir.
                </p>
                <button
                  onClick={handleSimulateScan}
                  className="mt-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-emerald-400 rounded text-xs transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Örnek Olay Gönder (Test)
                </button>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isScan = log.event === "ITEM_SCANNED";
                const isBasketClosed = log.event === "BASKET_COMPLETED";

                return (
                  <div
                    key={log.id}
                    className={`group px-3 py-1.5 rounded border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isScan
                        ? "bg-zinc-950/60 border-zinc-900 hover:border-emerald-900/60 hover:bg-emerald-950/10"
                        : isBasketClosed
                        ? "bg-amber-950/15 border-amber-900/30 hover:border-amber-700/60 hover:bg-amber-950/25"
                        : "bg-zinc-950/60 border-zinc-900"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
                      {/* Zaman Damgası */}
                      <span className="text-zinc-500 font-mono text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-600 inline" />
                        [{formatClock(log.timestamp)}]
                      </span>

                      {/* Event Etiketi */}
                      {isScan && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/60 text-emerald-400 text-[11px] font-bold">
                          [SCAN]
                        </span>
                      )}
                      {isBasketClosed && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-700/60 text-amber-400 text-[11px] font-bold">
                          [BASKET_CLOSED]
                        </span>
                      )}

                      {/* İçerik */}
                      {isScan && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-300 font-semibold tracking-wide">
                            {log.barcode}
                          </span>
                          <span className="text-zinc-600">&rarr;</span>
                          <span
                            className={
                              log.productName
                                ? "text-emerald-300 font-medium"
                                : "text-zinc-500 italic"
                            }
                          >
                            {log.productName || "[Tanımsız Ürün]"}
                          </span>

                          {log.productPrice !== undefined && log.productPrice !== null && (
                            <span className="text-xs px-1.5 py-0.2 bg-zinc-800 text-emerald-400 rounded border border-zinc-700">
                              ₺{Number(log.productPrice).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}

                      {isBasketClosed && (
                        <div className="flex items-center gap-2 text-amber-200">
                          <span className="font-semibold">
                            {log.count ?? (Array.isArray(log.items) ? log.items.length : 0)} ürün
                          </span>
                          <span>ile sepet kapandı</span>
                          <span className="text-xs px-2 py-0.5 bg-amber-900/40 border border-amber-800/80 rounded text-amber-300 font-mono">
                            Sebep: {log.reason || "BASKET_FINISHED"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sağ Taraf: Göreceli Zaman */}
                    <div className="text-[11px] text-zinc-500 shrink-0 sm:text-right font-mono">
                      ({formatTimeAgo(log.timestamp)})
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* AÇIK SEPET LİSTESİ */
            <div className="space-y-2">
              <div className="text-xs text-zinc-400 border-b border-zinc-800 pb-2 flex items-center justify-between">
                <span>Şu An Kasada Açık Olan Sepet İçeriği</span>
                <span className="text-amber-400 font-semibold">
                  Toplam {currentBasket.length} Barkod
                </span>
              </div>

              {currentBasket.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  Şu an kasada açık bir sepet yok. Son işlem tamamlandı veya beklemede.
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {currentBasket.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 px-3 flex items-center justify-between hover:bg-zinc-900/40 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-600 text-xs font-mono">
                          #{currentBasket.length - idx}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-zinc-200">
                            {item.name || "[İsimsiz Ürün]"}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono">
                            Barkod: {item.barcode}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {item.price ? (
                          <div className="text-sm font-bold text-emerald-400">
                            ₺{Number(item.price).toFixed(2)}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-zinc-500">
                          {formatTimeAgo(item.scannedAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Footer Bar */}
        <div className="h-8 bg-zinc-900/70 border-t border-zinc-800 px-4 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              BUFFER: {logs.length}/150
            </span>
            <span>CHANNEL: telemetry-stream</span>
          </div>
          <div>
            <span>ESC / IDLE KONTROLÜ AKTİF</span>
          </div>
        </div>
      </div>
    </div>
  );
}
