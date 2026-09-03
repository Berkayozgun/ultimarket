"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  PlusCircle,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
  Loader2,
  CheckCircle,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { formatTRY } from "@/lib/currency";

interface Product {
  id: number;
  barcode: string;
  name: string;
  sellPrice: number;
  lastCostNet: number | null;
  isActive: boolean;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type FilterType = "all" | "no-price" | "short-name";

function calcMargin(sellPrice: number, lastCostNet: number | null): string {
  if (lastCostNet == null || sellPrice <= 0) return "—";
  const margin = ((sellPrice - lastCostNet) / sellPrice) * 100;
  return `${margin.toFixed(1)}%`;
}

function marginColor(sellPrice: number, lastCostNet: number | null): string {
  if (lastCostNet == null || sellPrice <= 0) return "text-neutral-500";
  const margin = ((sellPrice - lastCostNet) / sellPrice) * 100;
  if (margin < 10) return "text-red-400";
  if (margin < 25) return "text-yellow-400";
  return "text-emerald-400";
}

export default function UrunlerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editSellPrice, setEditSellPrice] = useState("");
  const [editLastCostNet, setEditLastCostNet] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSellPrice, setNewSellPrice] = useState("");
  const [newLastCostNet, setNewLastCostNet] = useState("");

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        filter,
      });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Ürünler yüklenemedi");
        return;
      }

      const data: ProductsResponse = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      showFeedback("error", "Bağlantı hatası");
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, searchQuery, showFeedback]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filter]);

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditBarcode(product.barcode);
    setEditSellPrice(String(product.sellPrice));
    setEditLastCostNet(product.lastCostNet != null ? String(product.lastCostNet) : "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        barcode: editBarcode.trim(),
        sellPrice: parseFloat(editSellPrice) || 0,
        lastCostNet: editLastCostNet.trim() ? parseFloat(editLastCostNet) : null,
      };

      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Güncelleme başarısız");
        return;
      }

      showFeedback("success", `"${editName.trim()}" güncellendi`);
      setEditingProduct(null);
      fetchProducts();
    } catch {
      showFeedback("error", "Güncelleme sırasında hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products/${deletingProduct.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Silme işlemi başarısız");
        return;
      }

      const data = await res.json();
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (editingProduct?.id === deletingProduct.id) {
        setEditingProduct(null);
      }
      showFeedback(
        "success",
        data.softDeleted
          ? `"${deletingProduct.name}" pasif hale getirildi`
          : `"${deletingProduct.name}" silindi`
      );
      setDeletingProduct(null);
    } catch {
      showFeedback("error", "Silme sırasında hata oluştu");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarcode.trim() || !newName.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: newBarcode.trim(),
          name: newName.trim(),
          sellPrice: parseFloat(newSellPrice) || 0,
          lastCostNet: newLastCostNet.trim() ? parseFloat(newLastCostNet) : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showFeedback("error", err.error || "Ürün eklenemedi");
        return;
      }

      showFeedback("success", `"${newName.trim()}" eklendi`);
      setShowNewModal(false);
      setNewBarcode("");
      setNewName("");
      setNewSellPrice("");
      setNewLastCostNet("");
      fetchProducts();
    } catch {
      showFeedback("error", "Ürün eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "no-price", label: "Fiyatı Olmayanlar / 0 ₺" },
    { key: "short-name", label: "Kısa/Eksik İsimliler" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Üst bar */}
      <div className="shrink-0 border-b border-neutral-800 bg-neutral-900/50 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold text-neutral-100">Ürün Yönetimi</h1>
          <span className="text-xs text-neutral-500 font-mono tabular-nums">
            {total.toLocaleString("tr-TR")} ürün
          </span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 active:scale-98"
        >
          <PlusCircle className="w-4 h-4" />
          Yeni Ürün Ekle
        </button>
      </div>

      {/* Arama + Filtreler */}
      <div className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3 border-b border-neutral-800">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="İsim veya barkod ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-emerald-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Yükleniyor...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-neutral-500">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-sm">Ürün bulunamadı</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900 border-b border-neutral-800">
              <tr className="text-left text-neutral-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5 font-medium">Barkod</th>
                <th className="px-4 py-2.5 font-medium">Ürün Adı</th>
                <th className="px-4 py-2.5 font-medium text-right">Alış Maliyeti</th>
                <th className="px-4 py-2.5 font-medium text-right">Satış Fiyatı</th>
                <th className="px-4 py-2.5 font-medium text-right">Kâr Marjı</th>
                <th className="px-4 py-2.5 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-neutral-800/50 hover:bg-neutral-900/80"
                >
                  <td className="px-4 py-2 font-mono text-xs text-neutral-400 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <span>{product.barcode}</span>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(product.barcode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Google'da Ara"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex shrink-0 p-0.5 rounded text-neutral-500 opacity-50 hover:opacity-100 hover:text-sky-400 hover:bg-neutral-800 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-neutral-100 max-w-xs truncate" title={product.name}>
                    {product.name}
                    {product.name.trim().length < 4 && (
                      <span className="ml-2 text-[10px] text-yellow-500 font-medium">KISA</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-300">
                    {product.lastCostNet != null ? formatTRY(product.lastCostNet) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-100">
                    {product.sellPrice > 0 ? (
                      formatTRY(product.sellPrice)
                    ) : (
                      <span className="text-red-400">0 ₺</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${marginColor(product.sellPrice, product.lastCostNet)}`}
                  >
                    {calcMargin(product.sellPrice, product.lastCostNet)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(product);
                        }}
                        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-emerald-400"
                        title="Düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProduct(product);
                        }}
                        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-red-400"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="shrink-0 border-t border-neutral-800 px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-neutral-500 text-xs">
            Sayfa {page} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bildirim */}
      {feedback && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-sm font-medium ${
            feedback.type === "success"
              ? "bg-emerald-900/90 text-emerald-200 border border-emerald-700"
              : "bg-red-900/90 text-red-200 border border-red-700"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Silme Onay Diyaloğu */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-sm mx-4">
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0 p-2 rounded-full bg-red-900/40">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-neutral-100">Ürünü Sil</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    <span className="text-neutral-200 font-medium">{deletingProduct.name}</span>{" "}
                    ürününü silmek istediğinize emin misiniz?
                  </p>
                  <p className="mt-1.5 text-xs text-neutral-500">
                    Geçmiş satış veya fatura kaydı varsa ürün pasif hale getirilir.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeletingProduct(null)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProduct}
                  disabled={isDeleting}
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sil
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Düzenleme Modalı */}
      {editingProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <h2 className="text-sm font-bold text-neutral-100">Ürün Düzenle</h2>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded hover:bg-neutral-800 text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Barkod</label>
                <input
                  type="text"
                  value={editBarcode}
                  onChange={(e) => setEditBarcode(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Ürün Adı</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editSellPrice}
                    onChange={(e) => setEditSellPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Alış Maliyeti (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editLastCostNet}
                    onChange={(e) => setEditLastCostNet(e.target.value)}
                    placeholder="Opsiyonel"
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yeni Ürün Modalı */}
      {showNewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <h2 className="text-sm font-bold text-neutral-100">Yeni Ürün Ekle</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1 rounded hover:bg-neutral-800 text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Barkod</label>
                <input
                  type="text"
                  value={newBarcode}
                  onChange={(e) => setNewBarcode(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Ürün Adı</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Alış Maliyeti (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newLastCostNet}
                    onChange={(e) => setNewLastCostNet(e.target.value)}
                    placeholder="Opsiyonel"
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
