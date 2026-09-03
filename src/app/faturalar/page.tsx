"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  Layers,
  Link2,
  Loader2,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

interface PreviewRow {
  lineIndex: number;
  barkod: string | null;
  urunAdi: string;
  supplierRawName: string;
  birim: string | null;
  miktar: number;
  birimFiyat: number;
  iskontoOran: number | null;
  iskontoTutar: number | null;
  kdvOran: number | null;
  netBirimAlis: number;
  koliIciAdet: number;
  birimCarpaniGerekli: boolean;
  eslesenUrunId: number | null;
  eslesenUrunAdi: string | null;
  eslesenBarkod: string | null;
  eskiAlisFiyati: number | null;
  eskiKdvAlis: number | null;
  yeniAlisFiyati: number;
  yeniKdvAlis: number | null;
  farkOrani: number | null;
  guvenSkoru: number;
  kolonKaymasiSuphesi: boolean;
  eslestirmeKaynagi: "ogrenilmis" | "barkod" | "fuzzy" | "eslestirilmedi";
  uyari: string | null;
  selected?: boolean;
}

interface InvoicePreview {
  supplierName: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  rows: PreviewRow[];
  matchedCount: number;
  lowConfidenceCount: number;
}

interface CatalogProduct {
  id: number;
  name: string;
  barcode: string;
  sellPrice: number;
  lastCostNet: number | null;
  purchaseVatRate?: number | null;
}

interface SavedInvoice {
  id: number;
  supplierName: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  status: string;
  items: Array<{
    rawName: string;
    quantity: number;
    unitCostNet: number;
  }>;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function formatMoney(value: number) {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function formatPercent(value: number | null) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function computeChangePercent(oldPrice: number | null, newPrice: number) {
  if (oldPrice == null || oldPrice === 0) return null;
  return Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1));
}

function computeSingleUnitCost(netBirimAlis: number, koliIciAdet: number) {
  const divisor = Math.max(1, koliIciAdet);
  return Number((netBirimAlis / divisor).toFixed(4));
}

function normalizeName(name: string) {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FaturalarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pastInvoices, setPastInvoices] = useState<SavedInvoice[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(true);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);

  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPastInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/faturalar");
      if (res.ok) setPastInvoices(await res.json());
    } catch (err) {
      console.error("Geçmiş fatura hatası:", err);
    } finally {
      setIsLoadingPast(false);
    }
  }, []);

  useEffect(() => {
    fetchPastInvoices();
  }, [fetchPastInvoices]);

  useEffect(() => {
    if (pickerRow === null || !productSearch.trim()) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;
    setIsSearchingProducts(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/products?q=${encodeURIComponent(productSearch.trim())}`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : [data]);
        } else if (isMounted) {
          setSearchResults([]);
        }
      } catch {
        if (isMounted) setSearchResults([]);
      } finally {
        if (isMounted) setIsSearchingProducts(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [pickerRow, productSearch]);

  const resetWorkflow = () => {
    setPreview(null);
    setRows([]);
    setPickerRow(null);
    setProductSearch("");
    setSearchResults([]);
  };

  const selectFile = (selected: File) => {
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setErrorMessage("Sadece JPEG, PNG, WebP veya PDF desteklenir");
      return;
    }
    if (selected.size > 8 * 1024 * 1024) {
      setErrorMessage("Dosya boyutu 8MB'dan küçük olmalıdır");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setFile(selected);
    setPreviewUrl(
      selected.type.startsWith("image/")
        ? URL.createObjectURL(selected)
        : null
    );
    resetWorkflow();
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/invoice/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Fatura analizi başarısız oldu");
        return;
      }

      const parsedPreview = data.preview as InvoicePreview;
      setPreview(parsedPreview);
      setRows(
        parsedPreview.rows.map((row) => ({
          ...row,
          selected:
            row.eslesenUrunId != null &&
            (row.eslestirmeKaynagi === "ogrenilmis" || row.guvenSkoru >= 0.7),
        }))
      );
      setSuccessMessage(
        "Fatura okundu. Onaylamadan veritabanına yazılmaz."
      );
    } catch {
      setErrorMessage("Ağ hatası oluştu.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateHeader = <K extends keyof InvoicePreview>(
    key: K,
    value: InvoicePreview[K]
  ) => {
    if (!preview) return;
    setPreview({ ...preview, [key]: value });
  };

  const toggleRow = (lineIndex: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.lineIndex === lineIndex ? { ...row, selected: !row.selected } : row
      )
    );
  };

  const toggleAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.eslesenUrunId != null ? { ...row, selected: checked } : row
      )
    );
  };

  const saveProductMapping = async (
    supplierRawName: string,
    productId: number,
    packQuantity: number
  ) => {
    try {
      await fetch("/api/invoice/save-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierRawName,
          productId,
          packQuantity,
        }),
      });
    } catch (err) {
      console.error("Eşleştirme kaydı hatası:", err);
    }
  };

  const updateRowField = (
    lineIndex: number,
    field: "yeniAlisFiyati" | "yeniKdvAlis" | "urunAdi" | "koliIciAdet",
    value: number | string | null
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.lineIndex !== lineIndex) return row;

        const updated = { ...row, [field]: value } as PreviewRow;

        if (field === "yeniAlisFiyati" && typeof value === "number") {
          updated.farkOrani = computeChangePercent(
            row.eskiAlisFiyati,
            value
          );
        }

        if (field === "koliIciAdet" && typeof value === "number") {
          const packQty = Math.max(1, value);
          updated.koliIciAdet = packQty;
          updated.yeniAlisFiyati = computeSingleUnitCost(
            row.netBirimAlis,
            packQty
          );
          updated.farkOrani = computeChangePercent(
            row.eskiAlisFiyati,
            updated.yeniAlisFiyati
          );
        }

        return updated;
      })
    );
  };

  const assignProduct = async (
    lineIndex: number,
    product: CatalogProduct,
    packQuantity?: number
  ) => {
    const row = rows.find((r) => r.lineIndex === lineIndex);
    if (!row) return;

    const koliIciAdet = packQuantity ?? row.koliIciAdet ?? 1;
    const yeniAlis = computeSingleUnitCost(row.netBirimAlis, koliIciAdet);

    setRows((prev) =>
      prev.map((r) => {
        if (r.lineIndex !== lineIndex) return r;

        return {
          ...r,
          eslesenUrunId: product.id,
          eslesenUrunAdi: product.name,
          eslesenBarkod: product.barcode,
          eskiAlisFiyati: product.lastCostNet,
          eskiKdvAlis: product.purchaseVatRate ?? null,
          koliIciAdet,
          yeniAlisFiyati: yeniAlis,
          farkOrani: computeChangePercent(product.lastCostNet, yeniAlis),
          eslestirmeKaynagi: "ogrenilmis" as const,
          guvenSkoru: 0.95,
          selected: true,
        };
      })
    );

    await saveProductMapping(
      row.supplierRawName || row.barkod || row.urunAdi,
      product.id,
      koliIciAdet
    );

    setPickerRow(null);
    setProductSearch("");
    setSearchResults([]);
  };

  const selectedRows = rows.filter((row) => row.selected && row.eslesenUrunId);
  const allMatchedSelected =
    rows.filter((r) => r.eslesenUrunId != null).length > 0 &&
    rows.filter((r) => r.eslesenUrunId != null).every((r) => r.selected);

  const handleUpdateCosts = async () => {
    if (selectedRows.length === 0) return;

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/products/update-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedRows.map((row) => ({
            urunId: row.eslesenUrunId,
            yeniAlisFiyati: row.yeniAlisFiyati,
            kdvAlis: row.yeniKdvAlis,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Alış fiyatları güncellenemedi");
        return;
      }

      setSuccessMessage(data.message || "Alış fiyatları güncellendi.");
    } catch {
      setErrorMessage("Güncelleme sırasında ağ hatası oluştu");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleArchive = async () => {
    if (!preview) return;

    setIsArchiving(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/faturalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: preview.supplierName,
          invoiceDate: preview.invoiceDate,
          dueDate: preview.dueDate,
          totalAmount: preview.totalAmount,
          items: rows.map((row) => ({
            barcode: row.barkod,
            rawName: row.urunAdi,
            normalizedName: normalizeName(row.urunAdi),
            quantity: row.miktar,
            unitCostNet: row.yeniAlisFiyati,
            vatRate: row.yeniKdvAlis,
            lineTotal: row.miktar * row.yeniAlisFiyati,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Fatura arşivlenemedi");
        return;
      }

      setSuccessMessage("Fatura arşive kaydedildi.");
      await fetchPastInvoices();
    } catch {
      setErrorMessage("Arşivleme sırasında ağ hatası oluştu");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleCancel = () => {
    resetWorkflow();
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSuccessMessage("İşlem iptal edildi.");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto">
      <div className="max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <div className="border-b border-neutral-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              Fatura Giriş & Alış Fiyatı
            </h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
              PDF veya görsel yükleyin, eşleşmeleri onaylayın. Seçtiğiniz
              toptancı kodları bir sonraki faturada otomatik tanınır. Yalnızca
              seçili kalemlerin alış fiyatı güncellenir.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-sm flex items-center gap-2">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {!preview && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) selectFile(selected);
              }}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) selectFile(dropped);
              }}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer flex flex-col items-center gap-3 ${
                isDragging
                  ? "border-emerald-400 bg-emerald-950/20"
                  : "border-neutral-700 hover:border-emerald-500"
              }`}
            >
              <UploadCloud className="w-10 h-10 text-emerald-400" />
              <p className="font-semibold">PDF veya fatura görseli sürükleyin</p>
              <p className="text-xs text-neutral-500">
                JPEG, PNG, WebP, PDF — maks. 8MB
              </p>
            </div>

            {file && (
              <div className="flex flex-col md:flex-row gap-4 items-start">
                {previewUrl && (
                  <div className="w-full md:w-56 h-56 rounded-lg border border-neutral-800 overflow-hidden bg-neutral-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Fatura önizleme"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <p className="text-sm">
                    <span className="text-neutral-400">Dosya: </span>
                    {file.name}
                  </p>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold text-sm flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analiz ediliyor...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Faturayı Analiz Et
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {preview && rows.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-b border-neutral-800 pb-4">
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Tedarikçi
                <input
                  value={preview.supplierName}
                  onChange={(e) =>
                    updateHeader("supplierName", e.target.value)
                  }
                  className="px-3 py-2 rounded bg-neutral-950 border border-neutral-800 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Fatura Tarihi
                <input
                  type="date"
                  value={preview.invoiceDate}
                  onChange={(e) =>
                    updateHeader("invoiceDate", e.target.value)
                  }
                  className="px-3 py-2 rounded bg-neutral-950 border border-neutral-800 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Vade
                <input
                  type="date"
                  value={preview.dueDate || ""}
                  onChange={(e) =>
                    updateHeader("dueDate", e.target.value || null)
                  }
                  className="px-3 py-2 rounded bg-neutral-950 border border-neutral-800 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Toplam (₺)
                <input
                  type="number"
                  step="0.01"
                  value={preview.totalAmount}
                  onChange={(e) =>
                    updateHeader("totalAmount", Number(e.target.value))
                  }
                  className="px-3 py-2 rounded bg-neutral-950 border border-neutral-800 text-sm tabular-nums"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Eşleşen:{" "}
                <strong className="text-emerald-400">
                  {rows.filter((r) => r.eslesenUrunId).length}/{rows.length}
                </strong>
              </span>
              <span>
                Öğrenilmiş:{" "}
                <strong className="text-sky-400">
                  {rows.filter((r) => r.eslestirmeKaynagi === "ogrenilmis").length}
                </strong>
              </span>
              {preview.lowConfidenceCount > 0 && (
                <span className="text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {preview.lowConfidenceCount} düşük güven
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-neutral-800 rounded-lg">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-neutral-950 text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={allMatchedSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Fatura Kalemi</th>
                    <th className="px-3 py-2 text-left">Ürün Eşleştir</th>
                    <th className="px-3 py-2 text-center">Koli İçi</th>
                    <th className="px-3 py-2 text-right">Eski Alış</th>
                    <th className="px-3 py-2 text-right">Yeni Alış</th>
                    <th className="px-3 py-2 text-right">Fark</th>
                    <th className="px-3 py-2 text-center">Güven</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {rows.map((row) => {
                    const lowConfidence = row.guvenSkoru < 0.7;
                    const needsAttention =
                      lowConfidence ||
                      row.kolonKaymasiSuphesi ||
                      row.eslestirmeKaynagi === "eslestirilmedi";
                    const rowClass = needsAttention ? "bg-amber-950/25" : "";
                    const showPicker =
                      pickerRow === row.lineIndex ||
                      row.eslestirmeKaynagi === "eslestirilmedi" ||
                      (row.eslestirmeKaynagi === "fuzzy" && lowConfidence);

                    return (
                      <tr key={row.lineIndex} className={rowClass}>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            disabled={!row.eslesenUrunId}
                            checked={!!row.selected}
                            onChange={() => toggleRow(row.lineIndex)}
                          />
                        </td>
                        <td className="px-3 py-3 align-top min-w-[200px]">
                          <input
                            value={row.urunAdi}
                            onChange={(e) =>
                              updateRowField(
                                row.lineIndex,
                                "urunAdi",
                                e.target.value
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-sm mb-1"
                          />
                          <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
                            {row.barkod && (
                              <span className="font-mono">{row.barkod}</span>
                            )}
                            {row.birim && (
                              <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                                {row.birim}
                              </span>
                            )}
                            {row.supplierRawName && (
                              <span className="font-mono text-neutral-600">
                                Kod: {row.supplierRawName}
                              </span>
                            )}
                          </div>
                          {row.uyari && (
                            <div className="text-[11px] text-amber-300 mt-1 flex gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {row.uyari}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top min-w-[240px]">
                          {row.eslesenUrunAdi && !showPicker ? (
                            <div className="space-y-1">
                              <div className="text-xs text-sky-300 flex items-center gap-1">
                                <Link2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{row.eslesenUrunAdi}</span>
                              </div>
                              <div className="text-[11px] text-neutral-500 font-mono">
                                {row.eslesenBarkod}
                              </div>
                              {row.eslestirmeKaynagi === "ogrenilmis" && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                                  Öğrenilmiş eşleşme
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setPickerRow(row.lineIndex);
                                  setProductSearch(row.eslesenUrunAdi || row.urunAdi);
                                }}
                                className="text-[11px] text-neutral-500 hover:text-amber-300 block"
                              >
                                Değiştir
                              </button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                autoFocus={pickerRow === row.lineIndex}
                                value={
                                  pickerRow === row.lineIndex
                                    ? productSearch
                                    : row.eslesenUrunAdi || ""
                                }
                                onChange={(e) => {
                                  setPickerRow(row.lineIndex);
                                  setProductSearch(e.target.value);
                                }}
                                onFocus={() => {
                                  setPickerRow(row.lineIndex);
                                  if (!productSearch) {
                                    setProductSearch(row.urunAdi);
                                  }
                                }}
                                placeholder="Ürün adı veya barkod ara..."
                                className="w-full px-2 py-1.5 rounded bg-neutral-950 border border-amber-600 text-xs"
                              />
                              {(isSearchingProducts ||
                                searchResults.length > 0) &&
                                pickerRow === row.lineIndex && (
                                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 shadow-lg">
                                    {isSearchingProducts && (
                                      <div className="px-3 py-2 text-xs text-neutral-500 flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Aranıyor...
                                      </div>
                                    )}
                                    {searchResults.map((product) => (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() =>
                                          assignProduct(row.lineIndex, product)
                                        }
                                        className="w-full text-left px-3 py-2 hover:bg-neutral-800 border-b border-neutral-800 last:border-0 text-xs"
                                      >
                                        <div className="font-medium truncate">
                                          {product.name}
                                        </div>
                                        <div className="text-neutral-500 font-mono">
                                          {product.barcode}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              {!row.eslesenUrunId && (
                                <div className="text-[11px] text-red-400 mt-1">
                                  Eşleştirilmedi
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center align-top">
                          <div className="flex flex-col items-center gap-1">
                            {row.birimCarpaniGerekli && (
                              <span className="text-[10px] text-amber-400 uppercase">
                                {row.birim} ×
                              </span>
                            )}
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={row.koliIciAdet}
                              onChange={(e) => {
                                const qty = Math.max(
                                  1,
                                  Number(e.target.value) || 1
                                );
                                updateRowField(row.lineIndex, "koliIciAdet", qty);
                                if (row.eslesenUrunId) {
                                  saveProductMapping(
                                    row.supplierRawName || row.barkod || row.urunAdi,
                                    row.eslesenUrunId,
                                    qty
                                  );
                                }
                              }}
                              className="w-16 px-2 py-1 rounded bg-neutral-950 border border-neutral-700 text-center tabular-nums text-xs"
                              title="Koli/paket içi adet — fiyat bu değere bölünür"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums align-top">
                          {row.eskiAlisFiyati != null
                            ? `${formatMoney(row.eskiAlisFiyati)} ₺`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right align-top">
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.yeniAlisFiyati}
                              onChange={(e) =>
                                updateRowField(
                                  row.lineIndex,
                                  "yeniAlisFiyati",
                                  Number(e.target.value)
                                )
                              }
                              className="w-28 px-2 py-1 rounded bg-neutral-950 border border-neutral-700 text-right tabular-nums"
                            />
                            {row.koliIciAdet > 1 && (
                              <span className="text-[10px] text-neutral-500">
                                {formatMoney(row.netBirimAlis)} ₺ ÷ {row.koliIciAdet}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums font-bold align-top ${
                            row.farkOrani == null
                              ? "text-neutral-400"
                              : row.farkOrani > 0
                                ? "text-red-400"
                                : row.farkOrani < 0
                                  ? "text-emerald-400"
                                  : "text-neutral-300"
                          }`}
                        >
                          {formatPercent(row.farkOrani)}
                        </td>
                        <td className="px-3 py-3 text-center align-top">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                              lowConfidence
                                ? "bg-amber-900 text-amber-200"
                                : row.eslestirmeKaynagi === "ogrenilmis"
                                  ? "bg-sky-900 text-sky-200"
                                  : "bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {lowConfidence && (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {(row.guvenSkoru * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-neutral-800">
              <button
                onClick={handleCancel}
                className="px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                İptal
              </button>
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                className="px-4 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm font-semibold flex items-center gap-2"
              >
                {isArchiving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <History className="w-4 h-4" />
                )}
                Faturayı Arşivle
              </button>
              <button
                onClick={handleUpdateCosts}
                disabled={isUpdating || selectedRows.length === 0}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold text-sm flex items-center gap-2"
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Seçilen Alış Fiyatlarını Güncelle ({selectedRows.length})
              </button>
            </div>
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
            <History className="w-5 h-5 text-neutral-400" />
            <span className="font-bold">Fatura Geçmişi</span>
          </div>

          {isLoadingPast ? (
            <div className="p-6 text-center text-xs text-neutral-500 flex justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Yükleniyor...
            </div>
          ) : pastInvoices.length === 0 ? (
            <p className="p-6 text-center text-xs text-neutral-500">
              Henüz arşivlenmiş fatura yok.
            </p>
          ) : (
            <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
              {pastInvoices.map((inv) => {
                const isExpanded = expandedInvoiceId === inv.id;
                return (
                  <div key={inv.id} className="bg-neutral-950/70">
                    <div
                      onClick={() =>
                        setExpandedInvoiceId(isExpanded ? null : inv.id)
                      }
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-900/60"
                    >
                      <div className="flex items-center gap-3">
                        <Building className="w-5 h-5 text-neutral-500" />
                        <div>
                          <div className="font-bold text-sm">
                            {inv.supplierName}
                          </div>
                          <div className="text-xs text-neutral-500 flex gap-3 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(inv.invoiceDate).toLocaleDateString(
                                "tr-TR"
                              )}
                            </span>
                            <span>{inv.items?.length || 0} kalem</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-emerald-400 tabular-nums">
                          {formatMoney(inv.totalAmount)} ₺
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                    {isExpanded && inv.items?.length > 0 && (
                      <div className="px-4 pb-4 border-t border-neutral-850 bg-neutral-900/40">
                        <div className="text-xs font-semibold text-neutral-400 my-2 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          Kalemler
                        </div>
                        {inv.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="py-1.5 flex justify-between text-xs"
                          >
                            <span>
                              {it.rawName}{" "}
                              <span className="text-neutral-500">
                                ({it.quantity} ad.)
                              </span>
                            </span>
                            <span className="tabular-nums font-bold">
                              {formatMoney(it.unitCostNet)} ₺
                            </span>
                          </div>
                        ))}
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
