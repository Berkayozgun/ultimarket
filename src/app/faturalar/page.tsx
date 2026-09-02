"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  History,
  Building,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface InvoiceItem {
  id?: number;
  rawName: string;
  normalizedName: string;
  quantity: number;
  unitCostNet: number;
}

interface PriceAlert {
  normalizedName: string;
  oldCost: number;
  newCost: number;
  pct: number;
}

interface AnalysisData {
  supplierName: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  items: InvoiceItem[];
}

interface SavedInvoice {
  id: number;
  supplierName: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  items: InvoiceItem[];
}

export default function FaturalarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fatura Geçmişi
  const [pastInvoices, setPastInvoices] = useState<SavedInvoice[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(true);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Geçmiş Faturaları Çek
  const fetchPastInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/faturalar");
      if (res.ok) {
        const data = await res.json();
        setPastInvoices(data);
      }
    } catch (err) {
      console.error("Geçmiş fatura çekme hatası:", err);
    } finally {
      setIsLoadingPast(false);
    }
  }, []);

  useEffect(() => {
    fetchPastInvoices();
  }, [fetchPastInvoices]);

  // Dosya Seçme / Fotoğraf Çekme
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setAnalysisResult(null);
    setPriceAlerts([]);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // NIM ile Analiz Et
  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/fatura-analiz", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "NIM kotası / hata, tekrar dene");
        setIsAnalyzing(false);
        return;
      }

      const data = await res.json();
      setAnalysisResult(data.analysis);
      setPriceAlerts(data.priceAlerts || []);
      setSuccessMessage("Fatura başarıyla çözümlendi!");
    } catch (err) {
      console.error("Analiz isteği hatası:", err);
      setErrorMessage("NIM kotası / hata, tekrar dene");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Faturayı Onayla ve Kaydet
  const handleApproveAndSave = async () => {
    if (!analysisResult) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/faturalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisResult),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Fatura kaydedilemedi");
        setIsSaving(false);
        return;
      }

      setSuccessMessage("Fatura onaylandı ve sisteme işlendi!");
      setAnalysisResult(null);
      setPriceAlerts([]);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      await fetchPastInvoices();
    } catch (err) {
      console.error("Fatura kaydetme hatası:", err);
      setErrorMessage("Fatura kaydedilirken ağ hatası oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  // Analizi Reddet
  const handleReject = () => {
    setAnalysisResult(null);
    setPriceAlerts([]);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setErrorMessage(null);
    setSuccessMessage("Fatura reddedildi, kaydedilmedi.");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Başlık Alanı */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-neutral-100 flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-400" />
              <span>Akıllı Fatura ve İrsaliye Asistanı</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Fotoğraf çekin veya fatura yükleyin; NVIDIA NIM Llama Vision ile
              kalemleri ve zamlı fiyatları anında tespit edin.
            </p>
          </div>
          <div className="text-xs font-mono bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded text-neutral-400 self-start md:self-auto">
            NVIDIA NIM: meta/llama-4-maverick
          </div>
        </div>

        {/* Durum Bildirimleri */}
        {errorMessage && (
          <div className="p-3.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Üst Bölüm: Fotoğraf Yükleme / Çekme Alanı */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {!previewUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-8 md:p-12 text-center cursor-pointer flex flex-col items-center justify-center gap-3 active:scale-99"
            >
              <div className="p-4 rounded-full bg-neutral-800 text-emerald-400">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <span className="text-base font-semibold text-neutral-200">
                  Fatura Fotoğrafı Çek veya Görsel Yükle
                </span>
                <p className="text-xs text-neutral-500 mt-1">
                  Telefondan kamerayı açar veya bilgisayardan JPEG, PNG, WebP
                  seçebilirsiniz (Maks. 8MB)
                </p>
              </div>
              <button
                type="button"
                className="mt-2 px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Dosya Seç / Kamera Aç</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5 items-start">
              {/* Önizleme Görseli */}
              <div className="w-full md:w-64 h-64 bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Fatura Önizleme"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Aksiyonlar & Dosya Detayı */}
              <div className="flex-1 flex flex-col justify-between self-stretch gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-neutral-200 truncate">
                      {file?.name}
                    </span>
                    <button
                      onClick={() => {
                        setFile(null);
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                        setAnalysisResult(null);
                        setPriceAlerts([]);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Kaldır
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Boyut: {((file?.size || 0) / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                {!analysisResult && (
                  <div className="pt-4 border-t border-neutral-800 flex flex-wrap gap-3">
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white flex items-center gap-2 active:scale-98"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>NIM Vision Analiz Ediyor...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          <span>Faturayı Analiz Et</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAnalyzing}
                      className="px-4 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300"
                    >
                      Farklı Fotoğraf Çek
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fatura Analiz Sonuçları */}
        {analysisResult && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span>Analiz Sonucu: {analysisResult.supplierName}</span>
              </h2>

              <div className="flex items-center gap-4 text-xs text-neutral-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-neutral-500" />
                  Tarih: <strong>{analysisResult.invoiceDate}</strong>
                </span>
                {analysisResult.dueDate && (
                  <span>
                    Vade: <strong>{analysisResult.dueDate}</strong>
                  </span>
                )}
                <span>
                  Toplam:{" "}
                  <strong className="text-emerald-400 text-sm tabular-nums">
                    {analysisResult.totalAmount.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    ₺
                  </strong>
                </span>
              </div>
            </div>

            {/* FİYAT ARTIŞ UYARILARI (TURUNCU ALAN) */}
            {priceAlerts.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-950/70 border border-amber-500/80 text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span>DİKKAT: Önceki Alışa Göre Fiyat Artışı (Zam) Tespit Edildi!</span>
                </div>
                <div className="divide-y divide-amber-900/60 pt-2">
                  {priceAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-amber-100">
                        {alert.normalizedName}
                      </span>
                      <div className="flex items-center gap-4 tabular-nums">
                        <span className="line-through text-amber-400/70">
                          {alert.oldCost.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ₺
                        </span>
                        <span className="font-bold text-amber-300">
                          →{" "}
                          {alert.newCost.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ₺
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-900 text-amber-200 font-extrabold text-[11px]">
                          +{alert.pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kalemler Tablosu */}
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-neutral-950 text-xs font-semibold text-neutral-400 uppercase">
                <span className="col-span-6">Ürün / Kalem</span>
                <span className="col-span-2 text-center">Adet</span>
                <span className="col-span-2 text-right">Birim Maliyet (₺)</span>
                <span className="col-span-2 text-right">Tutar (₺)</span>
              </div>

              <div className="divide-y divide-neutral-800 bg-neutral-900/60 text-sm">
                {analysisResult.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
                  >
                    <div className="col-span-6">
                      <div className="font-medium text-neutral-200">
                        {item.rawName}
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">
                        {item.normalizedName}
                      </div>
                    </div>

                    <div className="col-span-2 text-center font-bold tabular-nums">
                      {item.quantity}
                    </div>

                    <div className="col-span-2 text-right tabular-nums text-neutral-300">
                      {item.unitCostNet.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="col-span-2 text-right tabular-nums font-bold text-neutral-100">
                      {(item.quantity * item.unitCostNet).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Onay / Reddet Butonları */}
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                onClick={handleReject}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm flex items-center gap-1.5 active:scale-95"
              >
                <XCircle className="w-4 h-4 text-neutral-400" />
                <span>Reddet ve İptal Et</span>
              </button>

              <button
                onClick={handleApproveAndSave}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center gap-2 active:scale-95"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isSaving ? "Kaydediliyor..." : "Onayla ve Kaydet"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Alt Bölüm: Geçmiş Faturalar Listesi */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
            <History className="w-5 h-5 text-neutral-400" />
            <span className="font-bold text-base text-neutral-200">
              İşlenmiş Fatura Geçmişi
            </span>
          </div>

          {isLoadingPast ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Faturalar yükleniyor...
            </div>
          ) : pastInvoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Henüz işlenmiş fatura bulunmamaktadır.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
              {pastInvoices.map((inv) => {
                const isExpanded = expandedInvoiceId === inv.id;
                const invDate = new Date(inv.invoiceDate).toLocaleDateString("tr-TR");

                return (
                  <div key={inv.id} className="bg-neutral-950/70">
                    <div
                      onClick={() =>
                        setExpandedInvoiceId(isExpanded ? null : inv.id)
                      }
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-900/60 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <Building className="w-5 h-5 text-neutral-500" />
                        <div>
                          <div className="font-bold text-sm text-neutral-200">
                            {inv.supplierName}
                          </div>
                          <div className="text-xs text-neutral-500 flex items-center gap-3 mt-0.5">
                            <span>Tarih: {invDate}</span>
                            <span>{inv.items?.length || 0} Kalem Ürün</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-base font-extrabold text-emerald-400 tabular-nums">
                            {inv.totalAmount.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                            })}{" "}
                            ₺
                          </div>
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-bold">
                            {inv.status}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-neutral-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-neutral-400" />
                        )}
                      </div>
                    </div>

                    {/* Genişletilmiş Kalem Detayları */}
                    {isExpanded && inv.items && inv.items.length > 0 && (
                      <div className="px-4 pb-4 pt-1 bg-neutral-900/40 border-t border-neutral-850">
                        <div className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Fatura Kalemleri</span>
                        </div>
                        <div className="divide-y divide-neutral-850 text-xs">
                          {inv.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="py-1.5 flex items-center justify-between"
                            >
                              <div>
                                <span className="text-neutral-200 font-medium">
                                  {it.rawName}
                                </span>
                                <span className="text-neutral-500 ml-2">
                                  ({it.quantity} adet)
                                </span>
                              </div>
                              <span className="font-bold tabular-nums text-neutral-300">
                                {it.unitCostNet.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                ₺/adet
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
