# UltiMarket - Akıllı Kasa, Veresiye ve Fatura Asistanı

Eski donanımlı dükkan ve market PC'lerinde (düşük RAM/CPU) **sıfır gecikmeyle** çalışacak şekilde tasarlanmış ultra-hafif Kasa, Veresiye Defteri ve Akıllı Fatura/İrsaliye Asistanı.

---

## ⚡ Temel Mimari ve Sert Kısıtlar

- **Ağır UI Kitleri Yoktur:** Mantine, Chakra, MUI, Ant Design, shadcn, Radix veya Headless UI gibi ağır kütüphaneler kesinlikle **kullanılmamıştır**. Saf Tailwind CSS ve yerel HTML öğeleriyle sıfır maliyetli render sağlanır.
- **Sistem Fontu:** Harici Google Font indirilmez; doğrudan `system-ui` kullanılır. Sayfa açılış gecikmesi ve ağ yükü sıfırdır.
- **Maksimum 75ms Transition:** Kasiyer hızını yavaşlatacak ağır animasyonlar ve gölgeler (box-shadow) devre dışı bırakılmıştır.
- **Stoksuz Model:** Stok takibi yapılmaz. Ürünler sadece `barkod → isim / satış fiyatı` sözlüğü olarak çalışır. Maliyet bilgisi doğrudan gelen toptancı faturalarından (`InvoiceItem`) beslenir.
- **USB/HID Barkod Desteği:** Standart USB/HID klavye emülasyonlu barkod okuyucular pencere seviyesinde (<50ms tuş vuruşu aralığı) dinlenir. Arama kutularındaki normal klavye yazımlarını engellemez.
- **Türkçe ve TRY Uyumlu:** `tr-TR` biçimlendirmesi, `₺` para birimi ve tabular-nums sayı hizalaması.
- **NVIDIA NIM Entegrasyonu:** Llama 4 Vision ile fatura görselleri yapılandırılmış JSON'a dönüştürülür ve önceki alış maliyetlerine göre zam oranları anında hesaplanır.

---

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler
- Node.js 18+ (Node 20 veya 24 önerilir)
- PostgreSQL (veya Supabase)
- NVIDIA NIM API Anahtarı (Ücretsiz deneme, kart gerektirmez: [build.nvidia.com/settings](https://build.nvidia.com/settings))

### 2. Ortam Değişkenleri (.env)
Proje kök dizinindeki `.env.example` dosyasını kopyalayarak `.env` dosyanızı oluşturun:

```bash
cp .env.example .env
```

`.env` dosyanızın içeriğini doldurun:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ultimarket?schema=public"
NVIDIA_API_KEY="nvapi-..."
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_VISION_MODEL="meta/llama-4-maverick-17b-128e-instruct"
```
*(Yedek model: `meta/llama-3.2-11b-vision-instruct`)*

### 3. (Opsiyonel) Docker ile PostgreSQL Başlatma
Eğer yerel makinenizde kurulu bir PostgreSQL yoksa Docker ile tek komutta başlatabilirsiniz:

```bash
docker run --name ultimarket-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ultimarket -p 5432:5432 -d postgres:16-alpine
```

### 4. Prisma Veritabanı ve Seed
Veritabanı şemasını oluşturmak ve 25 örnek market ürünü, 8 müşteri ve zam testi için 2 faturayı yüklemek için:

```bash
# Şemayı veritabanına uygulayın
npx prisma db push

# Örnek test verilerini (25 ürün, 8 müşteri, 2 fatura) yükleyin
npm run seed
```

### 5. Geliştirme Sunucusunu Çalıştırma
```bash
npm run dev
```

Tarayıcınızdan **`http://localhost:3000`** adresine gidin.

---

## ⌨️ Kasiyer Klavye Kısayolları

Kasa ekranı (`/`) fareye ihtiyaç duymadan, sadece klavye ve barkod okuyucu ile kullanılacak şekilde optimize edilmiştir:

| Tuş | Eylem |
| :--- | :--- |
| **Barkod Okuyucu** | Herhangi bir alana tıklamaya gerek kalmadan barkodu okutun; ürün sepete eklenir. |
| **F2** | **NAKİT** ödeme ile satışı tamamlar ve fişi kapatır. |
| **F3** | **KART** (POS) ödeme ile satışı tamamlar ve fişi kapatır. |
| **F4** | **VERESİYE** modalını açar (Müşteri arama, ok tuşları, limit kontrolü). |
| **Space** / **Escape** | Sepeti temizleme onay diyaloğunu açar (**Enter**: Temizle, **Esc**: İptal). |
| **↑ / ↓** | Sepetteki ürün satırları arasında gezinir. |
| **+** veya **Numpad +** | Seçili ürünün adetini artırır. |
| **-** veya **Numpad -** | Seçili ürünün adetini azaltır. |
| **Delete** / **Backspace** | Seçili ürünü sepetten çıkarır. |

---

## 📱 Sayfalar ve Modüller

### 1. Kasa Ekranı (`/`)
- Tam ekran, koyu tema (`bg-neutral-950`), göz yormayan yüksek kontrast.
- Büyük `tabular-nums` toplam tutar göstergesi.
- Veresiye modalında kalan kredi limiti anlık kontrol edilir; limiti aşan satışların gönderimi engellenir.
- Barkod okuyucusu olmayan test cihazları için alt kısımda manuel hızlı barkod giriş alanı bulunur.

### 2. Veresiye Defteri (`/veresiye`)
- Sol tarafta müşteri listesi, hızlı arama, borç durumu ve kalan limit.
- Yeni veresiye müşterisi tanımlama.
- Seçilen müşteriye **Borç Yaz** (ürün şartsız elden borç kaydı).
- **Kısmi Tahsilat** (mevcut bakiyeyi aşamaz).
- Tek tuşla **Bakiye Kapat**.
- En yeni işlem en üstte olacak şekilde tüm borç/tahsilat hareket geçmişi.

### 3. Fatura & İrsaliye Asistanı (`/faturalar`)
- Cep telefonundan kamera ile anında çekim (`capture="environment"`) veya bilgisayardan görsel yükleme (JPEG, PNG, WebP).
- **NVIDIA NIM Vision Analizi**: Tedarikçi adı, fatura tarihi, vade ve ürün kalemlerini KDV hariç net maliyetleriyle çıkarır.
- **Fiyat Artışı (Zam) Uyarıları (Turuncu)**: Faturadaki ürünlerin net maliyetleri sistemdeki son faturayla karşılaştırılır. Fiyatı artan kalemler yüzde artış oranıyla birlikte dikkat çeken turuncu kutuda listelenir.
- **Onayla ve Kaydet / Reddet**: Onaylanan faturalar sisteme `ISLENDI` olarak kaydedilir ve sonraki fiyat karşılaştırmaları için baz alınır.
- İşlenmiş fatura geçmişi ve kalem detayları.

---

## 🛠️ Kullanılan Teknolojiler

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Stil:** Tailwind CSS v4 (Özel hafif sistem fontu yapılandırması)
- **Durum Yönetimi:** Zustand (Sepet yönetimi - kalıcılık/persist olmadan)
- **Veritabanı & ORM:** PostgreSQL + Prisma ORM (Supabase ile %100 uyumlu)
- **AI & Vision:** OpenAI Node SDK (NVIDIA NIM uç noktası ile Llama 4 Vision modeli)
- **Doğrulama:** Zod (Tüm API istekleri ve NIM JSON çıktıları için sıkı doğrulama)
- **İkonlar:** Lucide React (Yalnızca kullanılan ikonlar - tree-shaken)
