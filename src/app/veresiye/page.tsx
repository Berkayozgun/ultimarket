"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  UserPlus,
  PlusCircle,
  CheckCircle,
  History,
  X,
  CreditCard,
  AlertCircle,
  Phone,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { formatTRY } from "@/lib/currency";

interface DebtTransaction {
  id: number;
  customerId: number;
  type: "BORC" | "TAHSILAT";
  amount: number;
  note?: string | null;
  createdAt: string;
}

interface Customer {
  id: number;
  fullName: string;
  phone: string;
  balance: number;
  creditLimit: number;
  updatedAt: string;
  debts?: DebtTransaction[];
}

export default function VeresiyePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDebtorsOnly, setShowDebtorsOnly] = useState(false);

  // Yeni Müşteri Modalı
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState("1000");

  // Borç / Tahsilat Formları
  const [actionType, setActionType] = useState<"borc" | "tahsilat" | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Bildirim mesajı
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  // Müşterileri Çek
  const fetchCustomers = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        sort: "balance",
      });
      if (showDebtorsOnly) params.set("debtOnly", "true");

      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const data: Customer[] = await res.json();
        setCustomers(data);
        setSelectedCustomerId((prev) => {
          if (prev !== null && data.some((c) => c.id === prev)) return prev;
          return data.length > 0 ? data[0].id : null;
        });
      }
    } catch (err) {
      console.error("Customers fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, showDebtorsOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  // Yeni Müşteri Kaydet
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newPhone.trim()) return;

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newFullName.trim(),
          phone: newPhone.trim(),
          creditLimit: parseFloat(newCreditLimit) || 1000,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Müşteri kaydedilemedi");
        return;
      }

      const created = await res.json();
      setShowNewCustomerModal(false);
      setNewFullName("");
      setNewPhone("");
      setNewCreditLimit("1000");
      showFeedback("success", `${created.fullName} başarıyla eklendi`);
      await fetchCustomers();
      setSelectedCustomerId(created.id);
    } catch (err) {
      console.error("Create customer error:", err);
      showFeedback("error", "Müşteri oluşturulurken hata oluştu");
    }
  };

  // Borç Ekle (Ürün Şartsız)
  const handleAddBorc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    const amount = parseFloat(actionAmount);
    if (isNaN(amount) || amount <= 0) {
      setActionError("Geçerli bir tutar girin");
      return;
    }

    try {
      const res = await fetch(`/api/customers/${selectedCustomerId}/borc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          note: actionNote.trim() || "Elden Borç",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setActionError(err.error || "Borç yazılamadı");
        return;
      }

      setActionType(null);
      setActionAmount("");
      setActionNote("");
      setActionError(null);
      showFeedback("success", `${formatTRY(amount)} borç yazıldı`);
      await fetchCustomers();
    } catch (err) {
      console.error("Borç ekleme hatası:", err);
      setActionError("İşlem sırasında hata oluştu");
    }
  };

  // Kısmi veya Tam Tahsilat
  const handleTahsilat = async (amountToCollect?: number) => {
    if (!selectedCustomerId) return;
    const amount = amountToCollect ?? parseFloat(actionAmount);
    if (isNaN(amount) || amount <= 0) {
      setActionError("Geçerli bir tahsilat tutarı girin");
      return;
    }

    try {
      const res = await fetch(`/api/customers/${selectedCustomerId}/tahsilat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          note: actionNote.trim() || (amountToCollect ? "Bakiye Kapatma" : "Tahsilat"),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setActionError(err.error || "Tahsilat yapılamadı");
        return;
      }

      setActionType(null);
      setActionAmount("");
      setActionNote("");
      setActionError(null);
      showFeedback("success", `${formatTRY(amount)} tahsil edildi`);
      await fetchCustomers();
    } catch (err) {
      console.error("Tahsilat hatası:", err);
      setActionError("Tahsilat sırasında hata oluştu");
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const remainingLimit = selectedCustomer
    ? selectedCustomer.creditLimit - selectedCustomer.balance
    : 0;

  const getLastTransactionDate = (customer: Customer) => {
    if (!customer.debts || customer.debts.length === 0) return null;
    return new Date(customer.debts[0].createdAt);
  };

  const formatDate = (date: Date) =>
    date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Geri Bildirim Çubuğu */}
      {feedback && (
        <div
          className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
            feedback.type === "success"
              ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
              : "bg-red-950/80 border-red-800 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Ana Görünüm: Sol Müşteri Listesi + Sağ Detay ve Hareketler */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* SOL: Müşteri Listesi ve Arama */}
        <div className="w-full md:w-96 flex flex-col border-r border-neutral-800 bg-neutral-950 shrink-0">
          {/* Arama ve Yeni Müşteri Butonu */}
          <div className="p-3 border-b border-neutral-800 flex items-center gap-2 bg-neutral-900/60">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Müşteri veya tel ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Yeni</span>
            </button>
          </div>

          <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/40">
            <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDebtorsOnly}
                onChange={(e) => setShowDebtorsOnly(e.target.checked)}
                className="rounded border-neutral-600 bg-neutral-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
              />
              Sadece borçlu müşteriler
            </label>
          </div>

          {/* Müşteri Listesi */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                Yükleniyor...
              </div>
            ) : customers.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                Kayıtlı müşteri bulunamadı
              </div>
            ) : (
              customers.map((c) => {
                const isSelected = c.id === selectedCustomerId;
                const hasDebt = c.balance > 0;
                const remLimit = c.creditLimit - c.balance;
                const lastTx = getLastTransactionDate(c);

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setActionType(null);
                      setActionError(null);
                    }}
                    className={`p-3.5 cursor-pointer select-none ${
                      isSelected
                        ? "bg-neutral-800/90 border-l-4 border-amber-500"
                        : "hover:bg-neutral-900/60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-neutral-100">
                          {c.fullName}
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{c.phone}</span>
                        </div>
                        {lastTx && (
                          <div className="text-[10px] text-neutral-600 flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            <span>Son işlem: {formatDate(lastTx)}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            hasDebt ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {formatTRY(c.balance)}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          Kalan:{" "}
                          <span className="tabular-nums text-neutral-400">
                            {formatTRY(remLimit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SAĞ: Seçili Müşteri Yönetimi & Hareket Geçmişi */}
        <div className="flex-1 flex flex-col min-h-0 bg-neutral-900/30 overflow-y-auto">
          {selectedCustomer ? (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              {/* Müşteri Başlık Kartı */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-neutral-100">
                    {selectedCustomer.fullName}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-neutral-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {selectedCustomer.phone}
                    </span>
                    <span>
                      Toplam Kredi Limiti:{" "}
                      <strong className="text-neutral-200 tabular-nums">
                        {formatTRY(selectedCustomer.creditLimit)}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Bakiye Göstergesi */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-neutral-400 uppercase font-semibold">
                      Toplam Borç
                    </div>
                    <div
                      className={`text-3xl font-black tabular-nums ${
                        selectedCustomer.balance > 0
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {formatTRY(selectedCustomer.balance)}
                    </div>
                  </div>

                  <div className="text-right border-l border-neutral-800 pl-6">
                    <div className="text-xs text-neutral-400 uppercase font-semibold">
                      Kullanılabilir Limit
                    </div>
                    <div className="text-xl font-bold text-neutral-200 tabular-nums">
                      {formatTRY(remainingLimit)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hızlı Eylem Butonları */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Borç Yaz (Ürün Şartsız) */}
                <button
                  onClick={() => {
                    setActionType(actionType === "borc" ? null : "borc");
                    setActionAmount("");
                    setActionNote("");
                    setActionError(null);
                  }}
                  className={`p-3.5 rounded-lg border font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 ${
                    actionType === "borc"
                      ? "bg-amber-600 border-amber-500 text-white"
                      : "bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-amber-400"
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Manuel Borç Ekle</span>
                </button>

                {/* 2. Kısmi Tahsilat */}
                <button
                  disabled={selectedCustomer.balance <= 0}
                  onClick={() => {
                    setActionType(actionType === "tahsilat" ? null : "tahsilat");
                    setActionAmount("");
                    setActionNote("");
                    setActionError(null);
                  }}
                  className={`p-3.5 rounded-lg border font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed ${
                    actionType === "tahsilat"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-emerald-400"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Tahsilat Al</span>
                </button>

                {/* 3. Bakiye Kapat */}
                <button
                  disabled={selectedCustomer.balance <= 0}
                  onClick={() => handleTahsilat(selectedCustomer.balance)}
                  className="p-3.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-98"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Bakiye Kapat ({formatTRY(selectedCustomer.balance)})</span>
                </button>
              </div>

              {/* Borç Yazma / Tahsilat Giriş Formu */}
              {actionType && (
                <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-neutral-200">
                      {actionType === "borc"
                        ? "Manuel Borç Ekle"
                        : "Tahsilat Al"}
                    </span>
                    <button
                      onClick={() => setActionType(null)}
                      className="text-neutral-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {actionError && (
                    <div className="mb-3 p-2 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{actionError}</span>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      if (actionType === "borc") handleAddBorc(e);
                      else {
                        e.preventDefault();
                        handleTahsilat();
                      }
                    }}
                    className="flex flex-col sm:flex-row items-center gap-3"
                  >
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Tutar (₺)"
                      value={actionAmount}
                      onChange={(e) => setActionAmount(e.target.value)}
                      className="w-full sm:w-40 px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 tabular-nums"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Açıklama / Not (Opsiyonel)"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      className="w-full sm:flex-1 px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className={`w-full sm:w-auto px-5 py-2 rounded font-bold text-sm text-white active:scale-95 ${
                        actionType === "borc"
                          ? "bg-amber-600 hover:bg-amber-500"
                          : "bg-emerald-600 hover:bg-emerald-500"
                      }`}
                    >
                      {actionType === "borc" ? "Borcu Kaydet" : "Tahsil Et"}
                    </button>
                  </form>
                </div>
              )}

              {/* Hareketler Listesi (En yeni üstte) */}
              <div className="flex-1 flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-800 flex items-center gap-2 bg-neutral-900/80">
                  <History className="w-4 h-4 text-neutral-400" />
                  <span className="text-sm font-semibold text-neutral-200">
                    Hesap Hareketleri (Son İşlemler)
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-neutral-800">
                  {!selectedCustomer.debts || selectedCustomer.debts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-neutral-500">
                      Bu müşteriye ait henüz hareket kaydı bulunmuyor.
                    </div>
                  ) : (
                    selectedCustomer.debts.map((item) => {
                      const isBorc = item.type === "BORC";
                      const dateStr = formatDate(new Date(item.createdAt));

                      return (
                        <div
                          key={item.id}
                          className="px-5 py-3 flex items-center justify-between text-sm hover:bg-neutral-850/50"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-full ${
                                isBorc
                                  ? "bg-amber-950/80 text-amber-400"
                                  : "bg-emerald-950/80 text-emerald-400"
                              }`}
                            >
                              {isBorc ? (
                                <ArrowDownRight className="w-4 h-4" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-neutral-200 flex items-center gap-2">
                                <span>{isBorc ? "BORÇ YAZILDI" : "TAHSİLAT ALINDI"}</span>
                                <span className="text-xs font-normal text-neutral-500">
                                  {dateStr}
                                </span>
                              </div>
                              <div className="text-xs text-neutral-400 mt-0.5">
                                {item.note || "-"}
                              </div>
                            </div>
                          </div>

                          <div
                            className={`text-base font-bold tabular-nums ${
                              isBorc ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            {isBorc ? "+" : "-"}
                            {formatTRY(item.amount)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
              Lütfen soldaki listeden bir müşteri seçin.
            </div>
          )}
        </div>
      </div>

      {/* Yeni Müşteri Modalı (Pure Div + Tailwind) */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <span className="font-bold text-base text-neutral-100">
                Yeni Veresiye Müşterisi Ekle
              </span>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Hasan Yılmaz"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 block mb-1">
                  Telefon Numarası
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 0532 000 0000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 block mb-1">
                  Kredi Limiti (₺)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="50"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 tabular-nums"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white active:scale-95"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
