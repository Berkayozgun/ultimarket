#!/usr/bin/env tsx
/**
 * Ürün adı temizleme ve şüpheli ürün raporlama script'i.
 *
 * Kullanım:
 *   npm run clean-products           # Temizle + raporla
 *   npm run clean-products -- --dry-run   # Sadece raporla, DB'ye yazma
 *   npm run clean-products -- --no-ai       # NVIDIA NIM kullanma
 */

import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  normalizeProductName,
  detectSuspiciousProducts,
  type SuspiciousProduct,
} from "../src/lib/product-clean";

const prisma = new PrismaClient();

const NVIDIA_MODEL =
  process.env.NVIDIA_VISION_MODEL || "meta/llama-3.2-11b-vision-instruct";
const BATCH_SIZE = 15;
const REQUEST_DELAY_MS = 300;
const RETRY_DELAY_MS = 500;

const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const skipAi = args.includes("--no-ai");

const SYSTEM_PROMPT = `Sen Türkiye'deki tekel, bakkal ve süpermarket ürünleri konusunda uzman bir perakende veri mimarısın.
Görevin ham, kısaltılmış veya eksik girilmiş ürün kayıtlarını tam, kurumsal ve profesyonel raf etiketine dönüştürmektir.

Kurallar:
- Marka adını her zaman en başa al (örn: 'Ülker', 'Eti', 'Dimes', 'Kent', 'Rothmans', 'Marlboro', 'Pınar', 'Sütaş').
- Aşırı kısa/jenerik isimlerin barkod veya açıklama ipucundan ne olduğunu çıkar ve tamamla (örn: 'Su' yerine marka/hacim bilgisiyle 'Güroluk Doğal Kaynak Suyu 5 L' veya 'Kek' yerine markasıyla birlikte 'Eti Popkek Kakaolu 60 g').
- Market/tütün kısaltmalarını aç: 'A.FST-CIK' -> 'Antep Fıstıklı Çikolata', 'KS.BOX' -> 'Kısa Box', 'ROT' -> 'Rothmans', 'MLTP' -> 'Maltepe', 'T2000' -> 'Tekel 2000', 'D-RNG' -> 'D-Range'.
- Hatalı yazımları düzelt: 'JACOPS 3,1' -> 'Jacobs 3'ü 1 Arada', 'NESCAFE 3,1,FINDIKLI' -> 'Nescafe 3'ü 1 Arada Fındıklı'.
- Gramaj ve hacimleri standartlaştır: '81GR.' -> '81 g', '0.5LT' -> '500 ml', '1440GR' -> '1.44 kg'.
- Yanıtı kesinlikle saf JSON formatında dizi olarak döndür:
  [{ "id": 1, "cleanName": "Tam Temizlenmiş Profesyonel Ürün Adı" }]
- Markdown codeblock (\`\`\`json) dışında hiçbir metin veya selamlama yazma.`;

interface ProductChange {
  id: number;
  oldName: string;
  newName: string;
  source: "ai" | "kural";
}

interface BatchItem {
  id: number;
  barcode: string;
  rawName: string;
  desc: string;
}

interface AiResultItem {
  id: number;
  cleanName: string;
}

function getNvidiaClient(): OpenAI | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  const baseURL =
    process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  return new OpenAI({ apiKey, baseURL });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAiResponse(rawContent: string): AiResultItem[] {
  let rawText = rawContent.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
  }

  const match = rawText.match(/\[[\s\S]*\]/);
  const jsonStr = match ? match[0] : rawText;

  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error("Model geçerli JSON array döndürmedi");
  }

  return parsed as AiResultItem[];
}

function isJsonParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("json") ||
    msg.includes("unexpected non-whitespace character") ||
    msg.includes("json array")
  );
}

function isNetworkError(err: unknown): boolean {
  const e = err as Error & { status?: number; code?: string };
  if (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504)
    return true;

  const msg = e.message?.toLowerCase() ?? "";
  const code = e.code?.toLowerCase() ?? "";
  const networkPatterns = [
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "enetunreach",
    "socket hang up",
    "network",
    "timeout",
    "fetch failed",
    "connection",
    "aborted",
  ];
  return networkPatterns.some((p) => msg.includes(p) || code.includes(p));
}

function ruleBasedChanges(batch: BatchItem[]): ProductChange[] {
  return batch
    .filter((item) => item.desc !== item.rawName)
    .map((item) => ({
      id: item.id,
      oldName: item.rawName,
      newName: item.desc,
      source: "kural" as const,
    }));
}

function printProgress(batchIndex: number, totalBatches: number) {
  console.log(`Batch ${batchIndex + 1}/${totalBatches} tamamlandı...`);
}

async function applyChanges(changes: ProductChange[]) {
  const toApply = changes.filter((c) => c.newName !== c.oldName);
  if (isDryRun || toApply.length === 0) return;

  await prisma.$transaction(
    toApply.map((c) =>
      prisma.product.update({
        where: { id: c.id },
        data: { name: c.newName },
      })
    )
  );
}

async function callAiBatch(
  client: OpenAI,
  batch: BatchItem[]
): Promise<ProductChange[]> {
  const payload = batch.map((item) => ({
    id: item.id,
    barcode: item.barcode,
    rawName: item.rawName,
    desc: item.desc,
  }));

  const completion = await client.chat.completions.create({
    model: NVIDIA_MODEL,
    temperature: 0,
    max_tokens: 8192,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Model boş yanıt döndürdü");

  const parsed = parseAiResponse(raw);

  const resultById = new Map<number, string>();
  for (const entry of parsed) {
    if (typeof entry?.id !== "number") continue;
    const name = String(entry.cleanName ?? "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (name.length >= 2) resultById.set(entry.id, name);
  }

  return batch.map((item) => {
    const aiName = resultById.get(item.id);
    const newName = aiName && aiName.length >= 2 ? aiName : item.desc;

    return {
      id: item.id,
      oldName: item.rawName,
      newName,
      source: aiName ? ("ai" as const) : ("kural" as const),
    };
  });
}

async function aiNormalizeBatch(
  client: OpenAI,
  batch: BatchItem[]
): Promise<{ changes: ProductChange[]; usedFallback: boolean }> {
  try {
    const changes = await callAiBatch(client, batch);
    return { changes, usedFallback: false };
  } catch (firstErr) {
    if (isJsonParseError(firstErr)) {
      console.warn(
        `\n${YELLOW}⚠ JSON parse hatası: ${(firstErr as Error).message} — kural tabanlı temizlik uygulanıyor.${RESET}`
      );
      return { changes: ruleBasedChanges(batch), usedFallback: true };
    }

    if (isNetworkError(firstErr)) {
      console.warn(
        `\n${YELLOW}⚠ Ağ hatası: ${(firstErr as Error).message} — ${RETRY_DELAY_MS}ms sonra yeniden deneniyor...${RESET}`
      );
      await sleep(RETRY_DELAY_MS);
      try {
        const changes = await callAiBatch(client, batch);
        return { changes, usedFallback: false };
      } catch (retryErr) {
        console.warn(
          `${YELLOW}⚠ Retry başarısız: ${(retryErr as Error).message} — kural tabanlı temizlik uygulanıyor.${RESET}`
        );
        return { changes: ruleBasedChanges(batch), usedFallback: true };
      }
    }

    console.warn(
      `\n${YELLOW}⚠ Batch hatası: ${(firstErr as Error).message} — kural tabanlı temizlik uygulanıyor.${RESET}`
    );
    return { changes: ruleBasedChanges(batch), usedFallback: true };
  }
}

function printSuspiciousTable(suspicious: SuspiciousProduct[]) {
  if (suspicious.length === 0) {
    console.log(`\n${GREEN}✓ Şüpheli ürün bulunamadı.${RESET}`);
    return;
  }

  console.log(
    `\n${BOLD}${RED}━━━ Düzeltilmesi Gereken Şüpheli Ürünler (${suspicious.length}) ━━━${RESET}\n`
  );

  const reasonLabels: Record<string, string> = {
    "short-name": "Kısa İsim",
    "no-price": "Fiyat Yok/0",
    "negative-price": "Negatif Fiyat",
  };

  const colId = 6;
  const colBarcode = 16;
  const colName = 30;
  const colPrice = 12;
  const colReason = 16;

  console.log(
    `${DIM}${"ID".padEnd(colId)} ${"Barkod".padEnd(colBarcode)} ${"Ürün Adı".padEnd(colName)} ${"Fiyat".padEnd(colPrice)} Neden${RESET}`
  );
  console.log(
    `${DIM}${"─".repeat(colId + colBarcode + colName + colPrice + colReason + 4)}${RESET}`
  );

  for (const p of suspicious) {
    const color = p.reasons.includes("negative-price") ? RED : YELLOW;
    const reasons = p.reasons.map((r) => reasonLabels[r]).join(", ");
    const priceStr =
      p.sellPrice <= 0
        ? `${RED}0,00 ₺${RESET}`
        : `${p.sellPrice.toFixed(2)} ₺`;

    console.log(
      `${color}${String(p.id).padEnd(colId)} ${p.barcode.padEnd(colBarcode)} ${p.name.padEnd(colName).slice(0, colName)} ${priceStr.padEnd(colPrice + 9)} ${reasons}${RESET}`
    );
  }
}

function printChangesTable(changes: ProductChange[]) {
  const actual = changes.filter((c) => c.newName !== c.oldName);
  if (actual.length === 0) return;

  console.log(
    `\n${BOLD}${CYAN}━━━ Güncellenen Ürün Adları (${actual.length}) ━━━${RESET}\n`
  );

  const showCount = Math.min(actual.length, 30);
  for (let i = 0; i < showCount; i++) {
    const c = actual[i];
    console.log(
      `  ${DIM}#${c.id}${RESET} [${c.source}] ${YELLOW}${c.oldName}${RESET} → ${GREEN}${c.newName}${RESET}`
    );
  }

  if (actual.length > showCount) {
    console.log(`  ${DIM}... ve ${actual.length - showCount} ürün daha${RESET}`);
  }
}

async function main() {
  const startedAt = Date.now();

  console.log(`${BOLD}Ultimarket Ürün Temizleme Script'i${RESET}`);
  console.log(
    `${DIM}Mod: ${isDryRun ? "DRY-RUN (yazma yok)" : "UYGULA"}${skipAi ? " | AI kapalı" : ""}${RESET}\n`
  );

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });

  console.log(`Toplam ${products.length} aktif ürün taranıyor...\n`);

  const batchItems: BatchItem[] = products.map((p) => ({
    id: p.id,
    barcode: p.barcode,
    rawName: p.name,
    desc: normalizeProductName(p.name),
  }));

  const nvidiaClient = skipAi ? null : getNvidiaClient();
  if (!skipAi && !nvidiaClient) {
    console.log(
      `${YELLOW}⚠ NVIDIA_API_KEY bulunamadı — yalnızca kural tabanlı temizlik uygulanacak.${RESET}\n`
    );
  } else if (nvidiaClient) {
    console.log(
      `${DIM}AI modeli: ${NVIDIA_MODEL} | Batch boyutu: ${BATCH_SIZE} | Gecikme: ${REQUEST_DELAY_MS}ms${RESET}\n`
    );
  }

  const changes: ProductChange[] = [];
  let aiCount = 0;
  let ruleCount = 0;
  let fallbackBatches = 0;

  if (nvidiaClient) {
    const batches = chunk(batchItems, BATCH_SIZE);
    console.log(
      `${products.length} ürün, ${batches.length} batch halinde işlenecek...\n`
    );

    for (let i = 0; i < batches.length; i++) {
      const { changes: batchChanges, usedFallback } = await aiNormalizeBatch(
        nvidiaClient,
        batches[i]
      );

      if (usedFallback) fallbackBatches++;

      for (const change of batchChanges) {
        if (change.source === "ai" && change.newName !== change.oldName)
          aiCount++;
        else if (change.newName !== change.oldName) ruleCount++;
      }

      changes.push(...batchChanges);
      await applyChanges(batchChanges);
      printProgress(i, batches.length);

      if (i < batches.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log("");
    if (fallbackBatches > 0) {
      console.log(
        `${YELLOW}⚠ ${fallbackBatches} batch model hatası nedeniyle kural tabanlı temizlendi.${RESET}`
      );
    }
  } else {
    const ruleChanges = ruleBasedChanges(batchItems);
    changes.push(...ruleChanges);
    ruleCount = ruleChanges.length;
    await applyChanges(ruleChanges);
    console.log(`${ruleChanges.length} ürün kural tabanlı temizlendi.\n`);
  }

  const updatedProducts = products.map((p) => {
    const change = changes.find((c) => c.id === p.id);
    return change ? { ...p, name: change.newName } : p;
  });

  const suspicious = detectSuspiciousProducts(updatedProducts);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const actualChanges = changes.filter((c) => c.newName !== c.oldName);

  console.log(`${BOLD}Özet:${RESET}`);
  console.log(`  Taranan ürün        : ${products.length}`);
  console.log(`  AI ile düzeltilen   : ${aiCount}`);
  console.log(`  Kural ile düzeltilen: ${ruleCount}`);
  console.log(`  Toplam değişiklik   : ${actualChanges.length}`);
  console.log(`  Şüpheli ürün        : ${suspicious.length}`);
  console.log(`  Süre                : ${elapsed}s`);

  printChangesTable(changes);
  printSuspiciousTable(suspicious);

  if (isDryRun && actualChanges.length > 0) {
    console.log(
      `\n${YELLOW}DRY-RUN: ${actualChanges.length} değişiklik uygulanmadı. Uygulamak için --dry-run olmadan çalıştırın.${RESET}`
    );
  } else if (!isDryRun && actualChanges.length > 0) {
    console.log(
      `\n${GREEN}✓ ${actualChanges.length} ürün adı güncellendi.${RESET}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(`${RED}Hata:${RESET}`, err);
  await prisma.$disconnect();
  process.exit(1);
});
