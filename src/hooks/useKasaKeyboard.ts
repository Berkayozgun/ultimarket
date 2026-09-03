import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { CartItem } from "@/store/cart";

type PaymentType = "NAKIT" | "KART";

interface UseKasaKeyboardOptions {
  items: CartItem[];
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  inc: (productId: number) => void;
  dec: (productId: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  processSale: (paymentType: PaymentType) => void;
  onClear: () => void;
  showVeresiyeModal: boolean;
  showReceiptModal?: boolean;
  setShowVeresiyeModal: (open: boolean) => void;
  customers: { id: number }[];
  selectedCustomerIndex: number;
  setSelectedCustomerIndex: Dispatch<SetStateAction<number>>;
  processVeresiyeSale: () => void;
  showNewCustomerForm?: boolean;
  openNewCustomerForm?: () => void;
  handleCreateCustomerInModal?: () => void;
  enabled?: boolean;
}

export function useKasaKeyboard({
  items,
  selectedIndex,
  setSelectedIndex,
  inc,
  dec,
  remove,
  clear,
  processSale,
  onClear,
  showVeresiyeModal,
  showReceiptModal = false,
  setShowVeresiyeModal,
  customers,
  selectedCustomerIndex,
  setSelectedCustomerIndex,
  processVeresiyeSale,
  showNewCustomerForm = false,
  openNewCustomerForm,
  handleCreateCustomerInModal,
  enabled = true,
}: UseKasaKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showReceiptModal) return;

      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (showVeresiyeModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowVeresiyeModal(false);
          return;
        }

        if (e.key === "F5") {
          e.preventDefault();
          if (!showNewCustomerForm) openNewCustomerForm?.();
          return;
        }

        if (showNewCustomerForm) {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleCreateCustomerInModal?.();
          }
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
          if (customers.length > 0) {
            processVeresiyeSale();
          } else {
            openNewCustomerForm?.();
          }
        }
        return;
      }

      if (isInput) {
        if (e.key === "F2" || e.key === "F3" || e.key === "F4") {
          e.preventDefault();
        }
        if (e.key === "F2" && items.length > 0) processSale("NAKIT");
        if (e.key === "F3" && items.length > 0) processSale("KART");
        if (e.key === "F4" && items.length > 0) setShowVeresiyeModal(true);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        if (items.length > 0) processSale("NAKIT");
        return;
      }

      if (e.key === "F3") {
        e.preventDefault();
        if (items.length > 0) processSale("KART");
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0) setShowVeresiyeModal(true);
        return;
      }

      if (e.key === "Escape" || e.code === "Space") {
        if (items.length > 0) {
          e.preventDefault();
          clear();
          onClear();
        }
        return;
      }

      if (items.length === 0) return;

      const currentItem = items[selectedIndex] ?? items[0];

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
      } else if (e.key === "Delete") {
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
    enabled,
    showReceiptModal,
    showVeresiyeModal,
    items,
    selectedIndex,
    customers,
    selectedCustomerIndex,
    processSale,
    clear,
    onClear,
    inc,
    dec,
    remove,
    setSelectedIndex,
    setShowVeresiyeModal,
    setSelectedCustomerIndex,
    processVeresiyeSale,
    showNewCustomerForm,
    openNewCustomerForm,
    handleCreateCustomerInModal,
  ]);
}
