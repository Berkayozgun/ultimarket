import { useEffect, useRef } from "react";

type BarcodeCallback = (barcode: string) => void;

interface UseBarcodeOptions {
  onScan: BarcodeCallback;
  enabled?: boolean;
}

export function useBarcode(
  optionsOrCallback: BarcodeCallback | UseBarcodeOptions,
  legacyEnabled = true
) {
  const onScan =
    typeof optionsOrCallback === "function"
      ? optionsOrCallback
      : optionsOrCallback.onScan;

  const enabled =
    typeof optionsOrCallback === "function"
      ? legacyEnabled
      : optionsOrCallback.enabled ?? true;

  const onScanRef = useRef<BarcodeCallback>(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastKeyTime = 0;
    let isFastSequence = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const isEditable = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toUpperCase();
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // F1-F12, Tab, Ctrl, Alt, Meta buffer'a girmez
      if (
        /^F([1-9]|1[0-2])$/.test(e.key) ||
        e.key === "Tab" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }

      const now = performance.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      const targetIsEditable = isEditable(e.target);

      if (e.key === "Enter") {
        const trimmed = buffer.trim();
        // Eğer aralık < 50ms hızlıydı ve en az 6 karakter varsa HID barkod okuyucu
        if (trimmed.length >= 6 && isFastSequence) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(trimmed);
        }
        buffer = "";
        isFastSequence = true;
        return;
      }

      // Sadece tek karakterli harf/rakamları buffer'a al
      if (e.key.length === 1) {
        if (buffer.length === 0) {
          buffer = e.key;
          isFastSequence = true;
        } else {
          // Sonraki tuşlar: Eğer aralık >= 50ms ise bu elle normal yazmadır
          if (diff >= 50) {
            isFastSequence = false;
            if (targetIsEditable) {
              // Hedef input/textarea ve yavaş yazılıyorsa barkod buffer'ını boşalt
              buffer = "";
              return;
            } else {
              buffer = e.key;
              isFastSequence = true;
            }
          } else {
            // Aralık < 50ms: HID barkod okuyucusu adayı
            buffer += e.key;
          }
        }

        // 300ms içinde yeni tuş gelmezse buffer'ı temizle
        timer = setTimeout(() => {
          buffer = "";
          isFastSequence = true;
        }, 300);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [enabled]);
}
