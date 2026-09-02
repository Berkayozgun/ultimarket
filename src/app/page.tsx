"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useCartStore, CartItem } from "@/store/cart";
import { useBarcode } from "@/hooks/useBarcode";
import {
  Banknote,
  CreditCard,
  BookUser,
  Trash2,
  Plus,
  Minus,
  Barcode as BarcodeIcon,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
} from "lucide-react";

interface Customer {
  id: number;
  fullName: string;
  phone: string;
  balance: number;
  creditLimit: number;
}

export default function KasaPage() {
  const { items, addByProduct, inc, dec, remove, clear, getTotal, getItemCount } =
    useCartStore();

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Veresiye Modal Durumu
  const [showVeresiyeModal, setShowVeresiyeModal] = useState<boolean>(false);
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState<number>(0);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState<boolean>(false);

  // Sepet Temizleme Onay Modalı
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Manuel barkod girişi (Fiziksel barkod okuyucu olmayan testler için opsiyonel kutu)
  const [manualBarcode, setManualBarcode] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Bildirim zamanlayıcı
  const showFeedback = useCallback(
    (type: "success" | "error" | "info", message: string, duration = 4000) => {
      setFeedback({ type, message });
      const timer = setTimeout(() => {
        setFeedback((prev) => (prev?.message === message ? null : prev));
      }, duration);
      return () => clearTimeout(timer);
    },
    []
  );

  // Barkod Tarama Mantığı
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      try {
        const res = await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`);
        if (!res.ok) {
          showFeedback("error", `Ürün yok: ${barcode}`);
          return;
        }

        const product = await res.json();
        addByProduct(product);
        setSelectedIndex(items.length); // Yeni eklenen veya seçili ürün
        showFeedback("success", `${product.name} sepete eklendi`);
      } catch (err) {
        console.error("Barcode scan fetch error:", err);
        showFeedback("error", `Barkod okuma hatası: ${barcode}`);
      }
    },
    [addByProduct, items.length, showFeedback]
  );

  // HID Barkod Okuyucu Hook'u
  useBarcode({
    onScan: handleBarcodeScan,
    enabled: !showVeresiyeModal, // Modal açıkken barkod engelle
  });

  // Manuel barkod formu submit
  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    handleBarcodeScan(manualBarcode.trim());
    setManualBarcode("");
  };

  // Satış Tamamlama (NAKIT / KART)
  const processSale = useCallback(
    async (paymentType: "NAKIT" | "KART") => {
      if (items.length === 0) return;

      const total = getTotal();
      const salePayload = {
        paymentType,
        items: items.map((i: CartItem) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      };

      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(salePayload),
        });

        if (!res.ok) {
          const err = await res.json();
          showFeedback("error", err.error || "Satış kaydedilemedi");
          return;
        }

        clear();
        showFeedback(
          "success",
          `Ödendi ${total.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ₺ (${paymentType})`,
          4500
        );
      } catch (err) {
        console.error("Sale error:", err);
        showFeedback("error", "Satış sırasında ağ hatası oluştu");
      }
    },
    [items, getTotal, clear, showFeedback]
  );

  // Veresiye Satışını Kaydet
  const processVeresiyeSale = async () => {
    const selectedCustomer = customers[selectedCustomerIndex];
    if (!selectedCustomer) {
      showFeedback("error", "Lütfen bir müşteri seçin");
      return;
    }

    const total = getTotal();
    const remainingLimit = selectedCustomer.creditLimit - selectedCustomer.balance;

    if (total > remainingLimit) {
      showFeedback(
        "error",
        `Kredi limiti aşıldı! Kalan limit: ${remainingLimit.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
        })} ₺`
      );
      return;
    }

    const salePayload = {
      paymentType: "VERESIYE",
      customerId: selectedCustomer.id,
      items: items.map((i: CartItem) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Veresiye satışı kaydedilemedi");
        return;
      }

      clear();
      setShowVeresiyeModal(false);
      showFeedback(
        "success",
        `Ödendi (Veresiye) ${total.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ₺ - ${selectedCustomer.fullName}`,
        5000
      );
    } catch (err) {
      console.error("Veresiye sale error:", err);
      showFeedback("error", "Veresiye kaydında hata oluştu");
    }
  };

  // Müşterileri Ara
  useEffect(() => {
    if (!showVeresiyeModal) return;

    let isMounted = true;
    setIsSearchingCustomers(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers?q=${encodeURIComponent(customerSearch)}`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          setCustomers(data);
          setSelectedCustomerIndex(0);
        }
      } catch (error) {
        console.error("Fetch customers error:", error);
      } finally {
        if (isMounted) setIsSearchingCustomers(false);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [showVeresiyeModal, customerSearch]);

  // Modal açıldığında arama inputuna odaklan
  useEffect(() => {
    if (showVeresiyeModal) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [showVeresiyeModal]);

  // Klavye Kısayolları (F2, F3, F4, Esc, Space, +, -, Delete, ArrowUp, ArrowDown)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // 1. Veresiye Modalı Açıkken Navigasyon
      if (showVeresiyeModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowVeresiyeModal(false);
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCustomerIndex((prev) =>
            customers.length ? (prev + 1) % customers.length : 0
          );
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCustomerIndex((prev) =>
            customers.length
              ? (prev - 1 + customers.length) % customers.length
              : 0
          );
          return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          processVeresiyeSale();
          return;
        }
        return;
      }

      // 2. Sepet Temizleme Onayı Açıkken
      if (showClearConfirm) {
        if (e.key === "Enter") {
          e.preventDefault();
          clear();
          setShowClearConfirm(false);
          showFeedback("info", "Sepet temizlendi");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowClearConfirm(false);
          return;
        }
        return;
      }

      // Input içindeyken standart F tuşları harici tuşları engelleme
      if (isInput) return;

      // F2: NAKİT
      if (e.key === "F2") {
        e.preventDefault();
        if (items.length > 0) processSale("NAKIT");
        return;
      }

      // F3: KART
      if (e.key === "F3") {
        e.preventDefault();
        if (items.length > 0) processSale("KART");
        return;
      }

      // F4: VERESİYE
      if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0) {
          setShowVeresiyeModal(true);
        }
        return;
      }

      // Sepet Temizleme (Space veya Escape)
      if (e.key === "Escape" || e.code === "Space") {
        if (items.length > 0) {
          e.preventDefault();
          setShowClearConfirm(true);
        }
        return;
      }

      // Sepet satır seçimi ve adet tuşları
      if (items.length === 0) return;

      const currentItem = items[selectedIndex] || items[0];

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "+" || e.key === "Add") {
        e.preventDefault();
        if (currentItem) inc(currentItem.productId);
      } else if (e.key === "-" || e.key === "Subtract") {
        e.preventDefault();
        if (currentItem) dec(currentItem.productId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (currentItem) {
          remove(currentItem.productId);
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    showVeresiyeModal,
    showClearConfirm,
    items,
    selectedIndex,
    customers,
    selectedCustomerIndex,
    processSale,
    clear,
    inc,
    dec,
    remove,
    showFeedback,
  ]);

  const totalAmount = getTotal();
  const selectedCustomer = customers[selectedCustomerIndex];
  const isCustomerLimitExceeded = selectedCustomer
    ? selectedCustomer.balance + totalAmount > selectedCustomer.creditLimit
    : false;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Üst Geri Bildirim ve Bildirim Çubuğu */}
      {feedback && (
        <div
          className={`px-4 py-2 text-sm font-semibold flex items-center justify-between border-b ${
            feedback.type === "success"
              ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
              : feedback.type === "error"
              ? "bg-red-950/80 border-red-800 text-red-300"
              : "bg-blue-950/80 border-blue-800 text-blue-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ana Kasa Gövdesi: Sol Sepet Tablosu + Sağ Özet ve Aksiyonlar */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Sol Alan: Sepet Ürün Tablosu */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-neutral-800 bg-neutral-950">
          {/* Tablo Başlığı */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            <span className="col-span-5">Ürün Adı</span>
            <span className="col-span-2 text-center">Adet</span>
            <span className="col-span-2 text-right">Birim (₺)</span>
            <span className="col-span-2 text-right">Tutar (₺)</span>
            <span className="col-span-1 text-center">Sil</span>
          </div>

          {/* Tablo İçeriği (Kaydırılabilir) */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3 p-8">
                <BarcodeIcon className="w-16 h-16 opacity-30 stroke-[1.5]" />
                <div className="text-center">
                  <p className="text-lg font-medium text-neutral-400">
                    Sepet Boş
                  </p>
                  <p className="text-xs text-neutral-600 mt-1">
                    USB barkod okuyucu ile ürünü tarayın veya klavyeden yazın
                  </p>
                </div>
              </div>
            ) : (
              items.map((item: CartItem, index: number) => {
                const isSelected = index === selectedIndex;
                const rowTotal = item.quantity * item.unitPrice;

                return (
                  <div
                    key={item.productId}
                    onClick={() => setSelectedIndex(index)}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm cursor-pointer select-none ${
                      isSelected
                        ? "bg-neutral-800/90 border-l-4 border-emerald-500 font-medium"
                        : "hover:bg-neutral-900/50"
                    }`}
                  >
                    {/* Ürün Adı & Barkod */}
                    <div className="col-span-5 min-w-0 pr-2">
                      <div className="truncate text-neutral-100 font-medium">
                        {item.name}
                      </div>
                      <div className="text-xs font-mono text-neutral-500 truncate">
                        {item.barcode}
                      </div>
                    </div>

                    {/* Adet Kontrolü */}
                    <div className="col-span-2 flex items-center justify-center gap-1.5">
                      <button
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          dec(item.productId);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-90"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold tabular-nums text-base">
                        {item.quantity}
                      </span>
                      <button
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          inc(item.productId);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-90"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Birim Fiyat */}
                    <div className="col-span-2 text-right tabular-nums text-neutral-400">
                      {item.unitPrice.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    {/* Satır Toplamı */}
                    <div className="col-span-2 text-right tabular-nums font-bold text-neutral-100">
                      {rowTotal.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    {/* Satır Silme */}
                    <div className="col-span-1 text-center">
                      <button
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(item.productId);
                        }}
                        className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 active:scale-90"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Alt Bilgi ve Manuel Barkod Giriş Çubuğu */}
          <div className="p-3 bg-neutral-900/60 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
            <div className="flex items-center gap-4">
              <span>
                Toplam Çeşit:{" "}
                <strong className="text-neutral-200">{items.length}</strong>
              </span>
              <span>
                Toplam Adet:{" "}
                <strong className="text-neutral-200">{getItemCount()}</strong>
              </span>
            </div>

            {/* Test Amaçlı Manuel Barkod Formu */}
            <form
              onSubmit={handleManualBarcodeSubmit}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Barkod gir (Enter)"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-500 text-xs w-44 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
              >
                Ekle
              </button>
            </form>
          </div>
        </div>

        {/* Sağ Alan: Büyük Tutar Ekranı ve Hızlı Ödeme Butonları */}
        <div className="w-full lg:w-96 flex flex-col justify-between p-5 bg-neutral-900/40 shrink-0 border-t lg:border-t-0 border-neutral-800">
          {/* Dev Tutar Göstergesi */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-neutral-400 uppercase font-semibold tracking-wider">
              <span>Ödenecek Tutar</span>
              <span className="font-mono bg-neutral-800 px-2 py-0.5 rounded text-neutral-300">
                TRY (₺)
              </span>
            </div>

            <div className="my-4 text-right">
              <span className="text-5xl lg:text-6xl font-black tabular-nums tracking-tight text-emerald-400">
                {totalAmount.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="ml-2 text-2xl font-bold text-emerald-500">
                ₺
              </span>
            </div>

            <div className="text-xs text-right text-neutral-500">
              {items.length > 0
                ? `${getItemCount()} adet ürün seçildi`
                : "Ödeme bekliyor"}
            </div>
          </div>

          {/* Kasiyer Klavye Kısayolları ve Ödeme Butonları */}
          <div className="flex flex-col gap-3 my-4">
            {/* F2: NAKİT */}
            <button
              onClick={() => processSale("NAKIT")}
              disabled={items.length === 0}
              className="flex items-center justify-between px-5 py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg active:scale-98"
            >
              <div className="flex items-center gap-3">
                <Banknote className="w-6 h-6" />
                <span>NAKİT</span>
              </div>
              <span className="text-xs font-mono bg-emerald-800 px-2.5 py-1 rounded text-emerald-100">
                F2
              </span>
            </button>

            {/* F3: KART */}
            <button
              onClick={() => processSale("KART")}
              disabled={items.length === 0}
              className="flex items-center justify-between px-5 py-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg active:scale-98"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6" />
                <span>KART</span>
              </div>
              <span className="text-xs font-mono bg-blue-800 px-2.5 py-1 rounded text-blue-100">
                F3
              </span>
            </button>

            {/* F4: VERESİYE */}
            <button
              onClick={() => {
                if (items.length > 0) setShowVeresiyeModal(true);
              }}
              disabled={items.length === 0}
              className="flex items-center justify-between px-5 py-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg active:scale-98"
            >
              <div className="flex items-center gap-3">
                <BookUser className="w-6 h-6" />
                <span>VERESİYE</span>
              </div>
              <span className="text-xs font-mono bg-amber-800 px-2.5 py-1 rounded text-amber-100">
                F4
              </span>
            </button>
          </div>

          {/* Temizleme ve Kısayol Yardım Paneli */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 space-y-2">
            <div className="flex justify-between items-center">
              <span>Sepeti Temizle:</span>
              <button
                onClick={() => {
                  if (items.length > 0) setShowClearConfirm(true);
                }}
                disabled={items.length === 0}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
              >
                Space / Esc
              </button>
            </div>
            <div className="border-t border-neutral-800 pt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-500">
              <div>↑ / ↓ : Satır Seç</div>
              <div>+ / - : Adet Değiştir</div>
              <div>Delete : Satır Sil</div>
              <div>Enter : Onayla</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sepet Temizleme Onay Modalı (Pure Tailwind Div) */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
            <div className="text-base font-semibold text-neutral-100">
              Sepet Temizlensin mi?
            </div>
            <p className="text-sm text-neutral-400">
              Tüm ürünler sepetten kaldırılacaktır. Devam etmek istiyor musunuz?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium text-neutral-300"
              >
                İptal (Esc)
              </button>
              <button
                onClick={() => {
                  clear();
                  setShowClearConfirm(false);
                  showFeedback("info", "Sepet temizlendi");
                }}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-sm font-medium text-white"
              >
                Temizle (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Veresiye Müşteri Seçim Modalı (F4) - Pure Div + Tailwind */}
      {showVeresiyeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Başlık */}
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookUser className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-base text-neutral-100">
                  Veresiye Satış Müşterisi Seç (F4)
                </span>
              </div>
              <button
                onClick={() => setShowVeresiyeModal(false)}
                className="text-neutral-400 hover:text-neutral-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Müşteri Arama */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-950 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Müşteri adı veya telefon ara... (Ok tuşları: seç, Enter: onayla)"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Müşteri Listesi (Klavye Ok Tuşları ile gezilebilir) */}
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-800">
              {isSearchingCustomers ? (
                <div className="p-6 text-center text-sm text-neutral-500">
                  Müşteriler aranıyor...
                </div>
              ) : customers.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">
                  Eşleşen müşteri bulunamadı.
                </div>
              ) : (
                customers.map((c, idx) => {
                  const isSelected = idx === selectedCustomerIndex;
                  const remainingLimit = c.creditLimit - c.balance;
                  const wouldExceed = c.balance + totalAmount > c.creditLimit;

                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCustomerIndex(idx)}
                      className={`p-3.5 flex items-center justify-between cursor-pointer select-none ${
                        isSelected
                          ? "bg-neutral-800 border-l-4 border-amber-500"
                          : "hover:bg-neutral-800/40"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-neutral-100 flex items-center gap-2">
                          <span>{c.fullName}</span>
                          <span className="text-xs font-normal text-neutral-400">
                            ({c.phone})
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-1 flex gap-3">
                          <span>
                            Borç:{" "}
                            <strong className="text-amber-300 tabular-nums">
                              {c.balance.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              ₺
                            </strong>
                          </span>
                          <span>
                            Limit:{" "}
                            <span className="tabular-nums">
                              {c.creditLimit.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              ₺
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-neutral-400">
                          Kalan Limit
                        </div>
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            wouldExceed ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {remainingLimit.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ₺
                        </div>
                        {wouldExceed && (
                          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                            Yetersiz Limit
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Seçili Müşteri Özeti ve Satış Onayı */}
            <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex flex-col gap-3 shrink-0">
              {selectedCustomer && (
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-neutral-400">Seçilen: </span>
                    <strong className="text-neutral-200">
                      {selectedCustomer.fullName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-400">Sepet Tutarı: </span>
                    <strong className="text-emerald-400 tabular-nums">
                      {totalAmount.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      ₺
                    </strong>
                  </div>
                </div>
              )}

              {isCustomerLimitExceeded && (
                <div className="px-3 py-2 rounded bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Bu satış seçilen müşterinin veresiye limitini aşıyor.
                    Gönderim engellendi.
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowVeresiyeModal(false)}
                  className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300"
                >
                  İptal (Esc)
                </button>
                <button
                  type="button"
                  onClick={processVeresiyeSale}
                  disabled={
                    !selectedCustomer ||
                    isCustomerLimitExceeded ||
                    items.length === 0
                  }
                  className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white flex items-center gap-1.5"
                >
                  <span>Veresiye Yaz ve Bitir (Enter)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
