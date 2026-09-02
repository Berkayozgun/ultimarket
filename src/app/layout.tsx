import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Akıllı Kasa | UltiMarket",
  description: "Ultra hafif kasa, veresiye ve fatura asistanı",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full bg-neutral-950 text-neutral-100 antialiased">
      <body className="h-full flex flex-col font-sans select-none bg-neutral-950 text-neutral-100">
        <header className="h-11 border-b border-neutral-800 bg-neutral-900 px-4 flex items-center justify-between text-sm shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-extrabold tracking-wider text-emerald-400">ULTİMARKET</span>
            <span className="text-xs text-neutral-400 font-mono">KASA v1.0</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="px-3 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 font-medium active:scale-98"
            >
              Kasa
            </Link>
            <Link
              href="/veresiye"
              className="px-3 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 font-medium active:scale-98"
            >
              Veresiye
            </Link>
            <Link
              href="/faturalar"
              className="px-3 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 font-medium active:scale-98"
            >
              Fatura Asistanı
            </Link>
          </nav>
        </header>
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
