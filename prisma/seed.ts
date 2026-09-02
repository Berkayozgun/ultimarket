import { PrismaClient, PaymentType, DebtType, InvoiceStatus } from "@prisma/client";

const prisma = new PrismaClient();

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

  // 2. 25 Türkçe Market Ürünü
  const products = [
    { barcode: "8690504018087", name: "Çaykur Rize Turist Çay 500g", sellPrice: 110.0, category: "Gıda" },
    { barcode: "8690637012345", name: "Sütaş Tam Yağlı Süt 1L", sellPrice: 42.5, category: "Süt & Kahvaltılık" },
    { barcode: "8690504123456", name: "Doğuş Karadeniz Çay 1000g", sellPrice: 165.0, category: "Gıda" },
    { barcode: "8690526012345", name: "Torku Toz Şeker 1kg", sellPrice: 45.0, category: "Gıda" },
    { barcode: "8690765432109", name: "Pınar Klasik Sucuk 225g", sellPrice: 185.0, category: "Et & Şarküteri" },
    { barcode: "8690123456789", name: "Beypazarı Doğal Maden Suyu 200ml", sellPrice: 8.5, category: "İçecek" },
    { barcode: "8690987654321", name: "Kızılay Maden Suyu 200ml", sellPrice: 8.0, category: "İçecek" },
    { barcode: "8690504443322", name: "Ülker Çikolatalı Gofret 36g", sellPrice: 12.0, category: "Atıştırmalık" },
    { barcode: "8690504443339", name: "Eti Karam Gurme Bitter 50g", sellPrice: 22.5, category: "Atıştırmalık" },
    { barcode: "8690504443346", name: "Eti Burçak Bisküvi 131g", sellPrice: 18.0, category: "Atıştırmalık" },
    { barcode: "8690504443353", name: "Ülker Biskrem Kakaolu 150g", sellPrice: 20.0, category: "Atıştırmalık" },
    { barcode: "8691234567890", name: "Coca-Cola 1L", sellPrice: 38.0, category: "İçecek" },
    { barcode: "8691234567891", name: "Fanta Portakal 1L", sellPrice: 38.0, category: "İçecek" },
    { barcode: "8690888777665", name: "Hayat Su 1.5L", sellPrice: 14.0, category: "İçecek" },
    { barcode: "8690888777672", name: "Erikli Doğal Kaynak Suyu 0.5L", sellPrice: 7.5, category: "İçecek" },
    { barcode: "8690555444333", name: "Lipton Doğu Karadeniz Demlik 48'li", sellPrice: 85.0, category: "Gıda" },
    { barcode: "8690666555444", name: "Filiz Burgu Makarna 500g", sellPrice: 19.5, category: "Gıda" },
    { barcode: "8690666555451", name: "Barilla Spaghetti No:5 500g", sellPrice: 36.0, category: "Gıda" },
    { barcode: "8690777666555", name: "Tat Domates Salçası 830g", sellPrice: 58.0, category: "Gıda" },
    { barcode: "8690111222333", name: "Komili Riviera Zeytinyağı 1L", sellPrice: 320.0, category: "Yağ" },
    { barcode: "8690111222440", name: "Yudum Ayçiçek Yağı 1L", sellPrice: 78.5, category: "Yağ" },
    { barcode: "8690333222111", name: "Uno Ekmek 550g", sellPrice: 35.0, category: "Fırın" },
    { barcode: "8690444333222", name: "Dimes Şeftali Nektarı 1L", sellPrice: 36.5, category: "İçecek" },
    { barcode: "8690888999000", name: "Solo Tuvalet Kağıdı 16'lı", sellPrice: 165.0, category: "Temizlik" },
    { barcode: "8690888999111", name: "Fairy Bulaşık Deterjanı 650ml", sellPrice: 65.0, category: "Temizlik" },
  ];

  for (const product of products) {
    await prisma.product.create({ data: product });
  }
  console.log(`Created ${products.length} products.`);

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
            unitCostNet: 34.5, // 30.00 -> 34.50 (+%15 zam)
          },
          {
            rawName: "Tat Domates Salçası 830 Gr",
            normalizedName: "tat salca 830g",
            quantity: 24,
            unitCostNet: 46.0, // 41.00 -> 46.00 (+%12.2 zam)
          },
          {
            rawName: "Filiz Burgu Makarna 500g",
            normalizedName: "filiz burgu makarna 500g",
            quantity: 100,
            unitCostNet: 12.5, // Değişmedi
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
