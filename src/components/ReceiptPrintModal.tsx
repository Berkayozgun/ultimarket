"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Printer, X } from "lucide-react";
import { ReceiptPrint, type ReceiptData } from "@/components/ReceiptPrint";

interface ReceiptPrintModalProps {
  receipt: ReceiptData | null;
  onDismiss: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ReceiptPrintModal({
  receipt,
  onDismiss,
  searchInputRef,
}: ReceiptPrintModalProps) {
  const [printTarget, setPrintTarget] = useState<ReceiptData | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const focusSearch = useCallback(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [searchInputRef]);

  const handleConfirm = useCallback(() => {
    if (!receipt) return;
    setPrintTarget(receipt);
    onDismiss();
  }, [receipt, onDismiss]);

  const handleCancel = useCallback(() => {
    onDismiss();
    focusSearch();
  }, [onDismiss, focusSearch]);

  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => confirmBtnRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [receipt]);

  useEffect(() => {
    if (!receipt) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleConfirm();
        return;
      }

      if (e.key === "Escape" || e.code === "Space") {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [receipt, handleConfirm, handleCancel]);

  useEffect(() => {
    if (!printTarget) return;

    const handleAfterPrint = () => {
      setPrintTarget(null);
      focusSearch();
    };

    window.addEventListener("afterprint", handleAfterPrint);

    const timer = setTimeout(() => {
      window.print();
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printTarget, focusSearch]);

  return (
    <>
      {printTarget && <ReceiptPrint data={printTarget} />}

      {receipt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-modal-title"
            className="w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <h2
                id="receipt-modal-title"
                className="text-lg font-bold text-neutral-100"
              >
                Satış Başarılı
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                Fiş yazdırılsın mı?
              </p>
            </div>

            <div className="px-5 pb-5 flex flex-col gap-2">
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={handleConfirm}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm active:scale-98"
              >
                <Printer className="w-4 h-4" />
                Evet, Yazdır
                <span className="text-[10px] font-mono bg-emerald-800 px-1.5 py-0.5 rounded text-emerald-100 ml-1">
                  Enter
                </span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-sm active:scale-98"
              >
                <X className="w-4 h-4" />
                Hayır / Kapat
                <span className="text-[10px] font-mono bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-400 ml-1">
                  Esc
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
