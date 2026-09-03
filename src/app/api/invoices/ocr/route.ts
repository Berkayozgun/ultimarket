import { NextRequest, NextResponse } from "next/server";
import {
  analyzeInvoiceFile,
  buildInvoiceParsePreview,
} from "@/lib/invoice-parse";
import { InvoiceParseError, mapNvidiaError } from "@/lib/nvidia";

/** @deprecated /api/invoice/parse kullanın */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Fatura dosyası yüklenmedi" },
        { status: 400 }
      );
    }

    const analysis = await analyzeInvoiceFile(file);
    const preview = await buildInvoiceParsePreview(analysis);

    return NextResponse.json({
      success: true,
      preview,
      analysis,
    });
  } catch (error) {
    if (error instanceof InvoiceParseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const mapped = mapNvidiaError(error);
    console.error("POST /api/invoices/ocr error:", error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
