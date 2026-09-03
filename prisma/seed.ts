import { PrismaClient, DebtType, InvoiceStatus } from "@prisma/client";
import path from "path";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

const CHUNK_SIZE = 200;
const EXCEL_PATH = path.join(process.cwd(), "prisma/data/test.xlsx");

type ExcelRow = {
  BARKOD_ID?: string | number;
  URUN_ADI?: string;
  URUN_SATIS_FIYAT?: string | number;
};

function parseProductsFromExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

  return rows
    .map((row) => {
      const barcode = String(row.BARKOD_ID ?? "").trim();
      const name = String(row.URUN_ADI ?? "").trim();
      const rawPrice = row.URUN_SATIS_FIYAT;
      const sellPrice =
        rawPrice === undefined || rawPrice === null || rawPrice === ""
          ? 0
          : Number(rawPrice);

      return {
        barcode,
        name,
        sellPrice: Number.isFinite(sellPrice) ? sellPrice : 0,
      };
    })
    .filter((product) => product.barcode.length > 0 && product.name.length > 0);
}

async function seedProductsFromExcel() {
  const products = parseProductsFromExcel();
  let inserted = 0;

  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const result = await prisma.product.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.log(
    `Created ${inserted} products from Excel (${products.length} rows parsed).`,
  );

  return { parsed: products.length, inserted };
}

async function main() {
  console.log("Seeding database...");

  // 1. Temizleme
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.debtTransaction.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.product.deleteMany();

  // 2. Excel'den ürün aktarımı
  await seedProductsFromExcel();

  // 3. 8 Müşteri (Bazıları 0 bakiye, bazıları borçlu)
  const customers = [
    { fullName: "Mehmet Yılmaz", phone: "05321112233", balance: 0, creditLimit: 2500 },
    { fullName: "Ahmet Demir", phone: "05422223344", balance: 650.0, creditLimit: 1500 },
    { fullName: "Ayşe Kaya", phone: "05533334455", balance: 0, creditLimit: 3000 },
    { fullName: "Fatma Şahin", phone: "05054445566", balance: 1250.0, creditLimit: 2000 },
    { fullName: "Mustafa Çelik", phone: "05355556677", balance: 350.0, creditLimit: 1000 },
    { fullName: "Zeynep Aydın", phone: "05446667788", balance: 0, creditLimit: 5000 },
    { fullName: "Hüseyin Yıldırım", phone: "05367778899", balance: 1800.0, creditLimit: 2500 },
    { fullName: "Emine Öztürk", phone: "05558889900", balance: 420.0, creditLimit: 1200 },
  ];

  for (const c of customers) {
    const created = await prisma.customer.create({ data: c });
    if (c.balance > 0) {
      await prisma.debtTransaction.create({
        data: {
          customerId: created.id,
          type: DebtType.BORC,
          amount: c.balance,
          note: "Açılış bakiye borcu",
        },
      });
    }
  }
  console.log(`Created ${customers.length} customers.`);

  // 4. 2 Fatura (Aynı normalizedName, farklı unitCostNet - Zam Testi)
  const inv1 = await prisma.invoice.create({
    data: {
      supplierName: "Özdemir Gıda Toptan Ltd.",
      invoiceDate: new Date("2026-08-10"),
      dueDate: new Date("2026-09-10"),
      totalAmount: 4034.0,
      status: InvoiceStatus.ISLENDI,
      items: {
        create: [
          {
            rawName: "Sütaş Tam Yağlı Süt 1 Lt (Koli)",
            normalizedName: "sutas sut 1l",
            quantity: 60,
            unitCostNet: 30.0,
          },
          {
            rawName: "Filiz Burgu Makarna 500 Gr",
            normalizedName: "filiz burgu makarna 500g",
            quantity: 100,
            unitCostNet: 12.5,
          },
          {
            rawName: "Tat Domates Salçası 830 Gr Teneke",
            normalizedName: "tat salca 830g",
            quantity: 24,
            unitCostNet: 41.0,
          },
        ],
      },
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      supplierName: "Özdemir Gıda Toptan Ltd.",
      invoiceDate: new Date("2026-08-28"),
      dueDate: new Date("2026-09-28"),
      totalAmount: 4424.0,
      status: InvoiceStatus.ISLENDI,
      items: {
        create: [
          {
            rawName: "Sütaş Tam Yağlı Süt 1 L Tetrapak",
            normalizedName: "sutas sut 1l",
            quantity: 60,
            unitCostNet: 34.5,
          },
          {
            rawName: "Tat Domates Salçası 830 Gr",
            normalizedName: "tat salca 830g",
            quantity: 24,
            unitCostNet: 46.0,
          },
          {
            rawName: "Filiz Burgu Makarna 500g",
            normalizedName: "filiz burgu makarna 500g",
            quantity: 100,
            unitCostNet: 12.5,
          },
        ],
      },
    },
  });

  console.log(`Created 2 invoices for price comparison test (IDs: ${inv1.id}, ${inv2.id}).`);
  console.log("Seeding finished successfully.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
