"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useCartStore, CartItem } from "@/store/cart";
import { useBarcode } from "@/hooks/useBarcode";
import { useKasaKeyboard } from "@/hooks/useKasaKeyboard";
import { formatTRY, formatTRYNumber } from "@/lib/currency";
import { QuickSaleGrid } from "@/components/QuickSaleGrid";
import { ReceiptPrintModal } from "@/components/ReceiptPrintModal";
import { buildReceiptDataFromSale, type ReceiptData } from "@/components/ReceiptPrint";
import {
  QUICK_SALE_DEFS,
  getQuickSaleVirtualId,
  isVirtualQuickSaleProductId,
  matchProductToQuickSale,
  type QuickSaleDefinition,
  type ResolvedQuickSaleProduct,
} from "@/lib/quick-sale";
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
  UserPlus,
  Phone,
} from "lucide-react";

interface Customer {
  id: number;
  fullName: string;
  phone: string;
  balance: number;
  creditLimit: number;
}

interface Product {
  id: number;
  barcode: string;
  name: string;
  sellPrice: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KART: "Kredi Kartı",
  VERESIYE: "Veresiye",
};

export default function KasaPage() {
  const { items, addByProduct, addVirtualQuickItem, inc, dec, remove, clear, getTotal, getItemCount } =
    useCartStore();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [showVeresiyeModal, setShowVeresiyeModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(0);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [cartPulse, setCartPulse] = useState(false);
  const [quickSaleCandidates, setQuickSaleCandidates] = useState<ResolvedQuickSaleProduct[]>([]);
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptData | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const newCustomerNameRef = useRef<HTMLInputElement>(null);

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

  const triggerCartPulse = useCallback(() => {
    setCartPulse(true);
    const timer = setTimeout(() => setCartPulse(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const resolvedQuickSaleProducts = useMemo(() => {
    const map = new Map<string, ResolvedQuickSaleProduct>();
    for (const def of QUICK_SALE_DEFS) {
      const match = matchProductToQuickSale(def, quickSaleCandidates);
      if (match) map.set(def.id, match);
    }
    return map;
  }, [quickSaleCandidates]);

  const addProductToCart = useCallback(
    (product: Product, options?: { silent?: boolean }) => {
      const existingIndex = items.findIndex((i) => i.productId === product.id);
      addByProduct(product);
      setSelectedIndex(existingIndex >= 0 ? existingIndex : items.length);
      if (!options?.silent) {
        showFeedback("success", `${product.name} sepete eklendi`, 1500);
      }
    },
    [addByProduct, items, showFeedback]
  );

  const handleQuickSale = useCallback(
    (def: QuickSaleDefinition, resolved?: ResolvedQuickSaleProduct) => {
      if (resolved) {
        addProductToCart(resolved, { silent: true });
      } else {
        const virtualId = getQuickSaleVirtualId(def.id);
        const existingIndex = items.findIndex((i) => i.productId === virtualId);
        addVirtualQuickItem({
          productId: virtualId,
          barcode: def.barcode,
          name: def.label,
          unitPrice: def.defaultPrice,
        });
        setSelectedIndex(existingIndex >= 0 ? existingIndex : items.length);
      }

      triggerCartPulse();
      showFeedback(
        "success",
        `${resolved?.name ?? def.label} sepete eklendi`,
        1200
      );
      searchInputRef.current?.focus();
    },
    [addProductToCart, addVirtualQuickItem, items, showFeedback, triggerCartPulse]
  );

  const lookupAndAddProduct = useCallback(
    async (query: string, options?: { silent?: boolean }) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      try {
        const barcodeRes = await fetch(
          `/api/products?barcode=${encodeURIComponent(trimmed)}`
        );
        if (barcodeRes.ok) {
          const product = await barcodeRes.json();
          addProductToCart(product, options);
          return;
        }

        const searchRes = await fetch(
          `/api/products?q=${encodeURIComponent(trimmed)}`
        );
        if (!searchRes.ok) {
          showFeedback("error", `Ürün bulunamadı: ${trimmed}`);
          return;
        }

        const results: Product[] = await searchRes.json();
        if (results.length === 0) {
          showFeedback("error", `Ürün bulunamadı: ${trimmed}`);
          return;
        }

        addProductToCart(results[0], options);
        if (results.length > 1) {
          showFeedback(
            "info",
            `${results.length} eşleşme — ilki eklendi: ${results[0].name}`,
            2500
          );
        }
      } catch (err) {
        console.error("Product lookup error:", err);
        showFeedback("error", "Ürün arama hatası");
      }
    },
    [addProductToCart, showFeedback]
  );

  const handleBarcodeScan = useCallback(
    (barcode: string) => lookupAndAddProduct(barcode, { silent: false }),
    [lookupAndAddProduct]
  );

  useBarcode({
    onScan: handleBarcodeScan,
    enabled: !showVeresiyeModal && !pendingReceipt,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    lookupAndAddProduct(searchQuery);
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  const handlePaymentSuccess = useCallback(
    (
      sale: Parameters<typeof buildReceiptDataFromSale>[0],
      total: number,
      paymentLabel: string
    ) => {
      clear();
      setSelectedIndex(0);
      setPendingReceipt(buildReceiptDataFromSale(sale));
      showFeedback("success", `✓ ${formatTRY(total)} — ${paymentLabel}`, 4500);
    },
    [clear, showFeedback]
  );

  const processSale = useCallback(
    async (paymentType: "NAKIT" | "KART") => {
      if (items.length === 0) return;

      const total = getTotal();
      const salePayload = {
        paymentType,
        totalAmount: total,
        items: items.map((i: CartItem) => ({
          barcode: i.barcode,
          name: isVirtualQuickSaleProductId(i.productId) ? i.name : undefined,
          quantity: i.quantity,
          price: i.unitPrice,
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

        const sale = await res.json();
        handlePaymentSuccess(sale, total, PAYMENT_LABELS[paymentType]);
      } catch (err) {
        console.error("Sale error:", err);
        showFeedback("error", "Satış sırasında ağ hatası oluştu");
      }
    },
    [items, getTotal, showFeedback, handlePaymentSuccess]
  );

  const closeVeresiyeModal = useCallback(() => {
    setShowVeresiyeModal(false);
    setCustomerSearch("");
    setShowNewCustomerForm(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
  }, []);

  const processVeresiyeSale = useCallback(async () => {
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
        `Kredi limiti aşıldı! Kalan limit: ${formatTRY(remainingLimit)}`
      );
      return;
    }

    const salePayload = {
      paymentType: "VERESIYE",
      customerId: selectedCustomer.id,
      totalAmount: total,
      items: items.map((i: CartItem) => ({
        barcode: i.barcode,
        name: isVirtualQuickSaleProductId(i.productId) ? i.name : undefined,
        quantity: i.quantity,
        price: i.unitPrice,
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

      const sale = await res.json();
      closeVeresiyeModal();
      handlePaymentSuccess(
        sale,
        total,
        `Veresiye (${selectedCustomer.fullName})`
      );
    } catch (err) {
      console.error("Veresiye sale error:", err);
      showFeedback("error", "Veresiye kaydında hata oluştu");
    }
  }, [customers, selectedCustomerIndex, getTotal, items, showFeedback, closeVeresiyeModal, handlePaymentSuccess]);

  const handleCreateCustomerInModal = useCallback(async () => {
    const fullName = newCustomerName.trim();
    const phone = newCustomerPhone.trim();

    if (!fullName || !phone) {
      showFeedback("error", "Ad soyad ve telefon zorunludur");
      return;
    }

    setIsCreatingCustomer(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          creditLimit: 1000,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Müşteri oluşturulamadı");
        return;
      }

      const created: Customer = await res.json();
      setCustomers([created]);
      setSelectedCustomerIndex(0);
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      showFeedback("success", `${created.fullName} eklendi — Enter ile onaylayın`, 3000);
      customerSearchRef.current?.focus();
    } catch (err) {
      console.error("Create customer error:", err);
      showFeedback("error", "Müşteri oluşturulurken hata oluştu");
    } finally {
      setIsCreatingCustomer(false);
    }
  }, [newCustomerName, newCustomerPhone, showFeedback]);

  const openNewCustomerForm = useCallback(() => {
    const query = customerSearch.trim();
    const looksLikePhone = /^[\d\s+()-]+$/.test(query) && query.replace(/\D/g, "").length >= 5;
    setNewCustomerName(looksLikePhone ? "" : query);
    setNewCustomerPhone(looksLikePhone ? query : "");
    setShowNewCustomerForm(true);
    setTimeout(() => newCustomerNameRef.current?.focus(), 50);
  }, [customerSearch]);

  useKasaKeyboard({
    items,
    selectedIndex,
    setSelectedIndex,
    inc,
    dec,
    remove,
    clear,
    processSale,
    onClear: () => {
      setSelectedIndex(0);
      showFeedback("info", "Sepet temizlendi", 2000);
    },
    showVeresiyeModal,
    showReceiptModal: !!pendingReceipt,
    setShowVeresiyeModal: (open) => {
      if (!open) closeVeresiyeModal();
      else setShowVeresiyeModal(true);
    },
    customers,
    selectedCustomerIndex,
    setSelectedCustomerIndex,
    processVeresiyeSale,
    showNewCustomerForm,
    openNewCustomerForm,
    handleCreateCustomerInModal,
  });

  useEffect(() => {
    let isMounted = true;

    const loadQuickSaleProducts = async () => {
      try {
        const res = await fetch("/api/products?quickSale=true");
        if (res.ok && isMounted) {
          const data: ResolvedQuickSaleProduct[] = await res.json();
          setQuickSaleCandidates(data);
        }
      } catch (error) {
        console.error("Quick sale products fetch error:", error);
      }
    };

    loadQuickSaleProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedIndex >= items.length && items.length > 0) {
      setSelectedIndex(items.length - 1);
    }
    if (items.length === 0) {
      setSelectedIndex(0);
    }
  }, [items.length, selectedIndex]);

  useEffect(() => {
    if (!showVeresiyeModal) return;

    if (showNewCustomerForm) return;

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
  }, [showVeresiyeModal, customerSearch, showNewCustomerForm]);

  useEffect(() => {
    if (showVeresiyeModal && !showNewCustomerForm) {
      setTimeout(() => customerSearchRef.current?.focus(), 50);
    }
  }, [showVeresiyeModal, showNewCustomerForm]);

  const totalAmount = getTotal();
  const selectedCustomer = customers[selectedCustomerIndex];
  const isCustomerLimitExceeded = selectedCustomer
    ? selectedCustomer.balance + totalAmount > selectedCustomer.creditLimit
    : false;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {feedback && (
        <div
          role="status"
          className={`px-4 py-2.5 text-sm font-semibold flex items-center justify-between border-b ${
            feedback.type === "success"
              ? "bg-emerald-950/90 border-emerald-700 text-emerald-200"
              : feedback.type === "error"
                ? "bg-red-950/90 border-red-700 text-red-200"
                : "bg-blue-950/90 border-blue-700 text-blue-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white px-2"
            aria-label="Bildirimi kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 border-r border-neutral-800 bg-neutral-950">
          <div className="px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 shrink-0">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  autoFocus
                  placeholder="Barkod veya ürün adı yazın (Enter)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-medium text-white shrink-0"
              >
                Ekle
              </button>
            </form>
          </div>

          <QuickSaleGrid
            resolvedProducts={resolvedQuickSaleProducts}
            onQuickSale={handleQuickSale}
            disabled={showVeresiyeModal || !!pendingReceipt}
          />

          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-neutral-900/60 border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            <span className="col-span-5">Ürün Adı</span>
            <span className="col-span-2 text-center">Adet</span>
            <span className="col-span-2 text-right">Birim</span>
            <span className="col-span-2 text-right">Tutar</span>
            <span className="col-span-1 text-center">Sil</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3 p-8">
                <BarcodeIcon className="w-16 h-16 opacity-30 stroke-[1.5]" />
                <div className="text-center">
                  <p className="text-lg font-medium text-neutral-400">Sepet Boş</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    Barkod okuyucu ile tarayın veya üstten arama yapın
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
                    <div className="col-span-5 min-w-0 pr-2">
                      <div className="truncate text-neutral-100 font-medium">
                        {item.name}
                      </div>
                      <div className="text-xs font-mono text-neutral-500 truncate">
                        {item.barcode}
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
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
                        type="button"
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

                    <div className="col-span-2 text-right tabular-nums text-neutral-400">
                      {formatTRYNumber(item.unitPrice)}
                    </div>

                    <div className="col-span-2 text-right tabular-nums font-bold text-neutral-100">
                      {formatTRYNumber(rowTotal)}
                    </div>

                    <div className="col-span-1 text-center">
                      <button
                        type="button"
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

          <div className="p-3 bg-neutral-900/60 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400 shrink-0">
            <div className="flex items-center gap-4">
              <span>
                Çeşit: <strong className="text-neutral-200">{items.length}</strong>
              </span>
              <span>
                Adet:{" "}
                <strong
                  className={`text-neutral-200 inline-block transition-transform ${
                    cartPulse ? "scale-125 text-emerald-400" : ""
                  }`}
                >
                  {getItemCount()}
                </strong>
              </span>
            </div>
            <span className="text-neutral-600">
              HID barkod okuyucu otomatik dinleniyor
            </span>
          </div>
        </div>

        <div className="w-full lg:w-96 flex flex-col justify-between p-5 bg-neutral-900/40 shrink-0 border-t lg:border-t-0 border-neutral-800">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-neutral-400 uppercase font-semibold tracking-wider">
              <span>Ödenecek Tutar</span>
              <span className="font-mono bg-neutral-800 px-2 py-0.5 rounded text-neutral-300">
                TRY
              </span>
            </div>

            <div className="my-4 text-right">
              <span className="text-5xl lg:text-6xl font-black tabular-nums tracking-tight text-emerald-400">
                {formatTRYNumber(totalAmount)}
              </span>
              <span className="ml-2 text-2xl font-bold text-emerald-500">₺</span>
            </div>

            <div className="text-xs text-right text-neutral-500">
              {items.length > 0
                ? `${getItemCount()} adet ürün`
                : "Ödeme bekliyor"}
            </div>
          </div>

          <div className="flex flex-col gap-3 my-4">
            <button
              type="button"
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

            <button
              type="button"
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

            <button
              type="button"
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

          <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 space-y-2">
            <div className="flex justify-between items-center">
              <span>Sepeti Temizle</span>
              <button
                type="button"
                onClick={() => {
                  if (items.length > 0) {
                    clear();
                    setSelectedIndex(0);
                    showFeedback("info", "Sepet temizlendi", 2000);
                  }
                }}
                disabled={items.length === 0}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
              >
                Space / Esc
              </button>
            </div>
            <div className="border-t border-neutral-800 pt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-500">
              <div>↑ / ↓ : Satır seç</div>
              <div>+ / − : Adet</div>
              <div>Delete : Satır sil</div>
              <div>Enter : Onayla</div>
            </div>
          </div>
        </div>
      </div>

      {showVeresiyeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookUser className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-base text-neutral-100">
                  Veresiye Müşteri Seç (F4)
                </span>
              </div>
              <button
                type="button"
                onClick={closeVeresiyeModal}
                className="text-neutral-400 hover:text-neutral-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {showNewCustomerForm ? (
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  Hızlı Müşteri Ekle (F5)
                </div>

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Ad Soyad</label>
                  <input
                    ref={newCustomerNameRef}
                    type="text"
                    placeholder="Örn: Hasan Yılmaz"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateCustomerInModal();
                      }
                    }}
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Telefon</label>
                  <input
                    type="text"
                    placeholder="Örn: 0532 000 0000"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateCustomerInModal();
                      }
                    }}
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(false)}
                    className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300"
                  >
                    Geri (Esc)
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCustomerInModal}
                    disabled={isCreatingCustomer}
                    className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-bold text-white"
                  >
                    {isCreatingCustomer ? "Kaydediliyor..." : "Kaydet (Enter)"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-neutral-800 bg-neutral-950 shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      ref={customerSearchRef}
                      type="text"
                      placeholder="Müşteri adı veya telefon (↑↓ seç, Enter onayla)"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-neutral-800">
                  {isSearchingCustomers ? (
                    <div className="p-6 text-center text-sm text-neutral-500">
                      Müşteriler aranıyor...
                    </div>
                  ) : customers.length === 0 ? (
                    <div className="p-6 text-center flex flex-col items-center gap-3">
                      <p className="text-sm text-neutral-500">
                        Eşleşen müşteri bulunamadı.
                      </p>
                      <button
                        type="button"
                        onClick={openNewCustomerForm}
                        className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white flex items-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Yeni Müşteri Ekle (F5)
                      </button>
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
                              <span className="text-xs font-normal text-neutral-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {c.phone}
                              </span>
                            </div>
                            <div className="text-xs text-neutral-400 mt-1 flex gap-3">
                              <span>
                                Borç:{" "}
                                <strong className="text-amber-300 tabular-nums">
                                  {formatTRY(c.balance)}
                                </strong>
                              </span>
                              <span>Limit: {formatTRY(c.creditLimit)}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-neutral-400">Kalan Limit</div>
                            <div
                              className={`text-sm font-bold tabular-nums ${
                                wouldExceed ? "text-red-400" : "text-emerald-400"
                              }`}
                            >
                              {formatTRY(remainingLimit)}
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
                        <span className="text-neutral-400">Sepet: </span>
                        <strong className="text-emerald-400 tabular-nums">
                          {formatTRY(totalAmount)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {isCustomerLimitExceeded && (
                    <div className="px-3 py-2 rounded bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Bu satış müşterinin veresiye limitini aşıyor.</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={openNewCustomerForm}
                      className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-amber-300 flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Yeni Müşteri (F5)
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeVeresiyeModal}
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
                        className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white"
                      >
                        Veresiye Yaz (Enter)
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <ReceiptPrintModal
        receipt={pendingReceipt}
        onDismiss={() => setPendingReceipt(null)}
        searchInputRef={searchInputRef}
      />
    </div>
  );
}
