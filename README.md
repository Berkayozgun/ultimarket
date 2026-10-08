# Ultimarket — Edge POS & Telemetry Architecture

![Status: In Production](https://img.shields.io/badge/Status-In%20Production-success?style=flat-square&logo=render)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16%20(App%20Router)-black?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase / PostgreSQL](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Prisma ORM](https://img.shields.io/badge/Prisma-6.x-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Zustand](https://img.shields.io/badge/State-Zustand-orange?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%20v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)

> 🔒 **Gizlilik & Canlı Üretim Bildirimi:**  
> Bu sistem, aktif bir perakende market işletmesinde (**local edge node**) kesintisiz canlı üretim (production) ortamında çalışmaktadır. Hassas ciro, finansal işlem hacmi ve müşteri veresiye kayıtlarının korunması amacıyla canlı dağıtım URL'si genel internet erişimine kapalıdır (private local network & reverse proxy).

---

## 📌 Proje Özeti & Konsept

**Ultimarket**, fiziksel perakende kasasındaki dış dünyaya kapalı, yerel masaüstü POS sistemlerini (ör. Barkodsis) donanım seviyesinde dinleyen, sepet hareketlerini gerçek zamanlı olarak segmente eden ve satış olaylarını bulut analitik paneline aktaran hibrit bir **Edge POS & Telemetry** mimarisidir.

Geleneksel perakende yazılımları kapalı kutu (black-box) çalıştığından anlık sepet analitiği ve merkezi bulut senkronizasyonu sunmaz. Ultimarket, donanımsal barkod okuyucu (HID) veri akışını araya girerek dinler; sıfır gecikmeli bellek kuyruğu ve durum makinesi (state machine) ile müşteri alışverişlerini fiş bazında gruplar ve Next.js/Supabase üzerinden gerçek zamanlı canlı izleme ve raporlama sağlar.

---

## 🏗️ Sistem Mimarisi

Aşağıdaki şema, fiziksel kasadaki barkod okuyucudan bulut terminaline kadar olan donanım ve veri akışını göstermektedir:

```mermaid
flowchart LR
    subgraph EdgeNode["🏪 Yerel Kasa (Physical Edge Node)"]
        Scanner["📠 Barkod Okuyucu (USB / HID Input)"]
        LegacyPOS["🖥️ Masaüstü POS (Barkodsis vb.)"]
        
        subgraph Agent["🐍 Python Telemetry Agent"]
            HIDHook["HID Keyboard Hook (pynput)"]
            MemQueue["In-Memory Queue (queue.Queue)"]
            StateMachine["Basket State Machine\n(90s Timeout / ESC)"]
            Worker["Async Worker Thread\n(HTTP Dispatcher)"]
        end
    end

    subgraph Cloud["☁️ Bulut Veri Katmanı (Cloud / Server)"]
        API["⚡ Next.js API Route\n(/api/telemetry)"]
        DB[("🐘 PostgreSQL / Supabase\n(Prisma ORM)")]
        Realtime["📡 Supabase Realtime\n(Broadcast Channel)"]
    end

    subgraph Monitoring["📊 İzleme & Kasa Arayüzü"]
        WebPOS["🛒 Web POS & Kasa Ekranı\n(Zustand + Tailwind v4)"]
        LiveTerm["💻 Live Telemetry Terminal\n(Web Audio Bip + Feed)"]
        Analytics["📈 Günlük Analitik & Sepet Geçmişi"]
    end

    Scanner -->|Ham Tuş Vuruşu Akışı| LegacyPOS
    Scanner -->|Non-blocking Intercept| HIDHook
    HIDHook --> MemQueue
    MemQueue --> StateMachine
    StateMachine --> Worker
    Worker -->|HTTPS Bearer Token Auth| API
    API --> DB
    API --> Realtime
    Realtime --> LiveTerm
    Realtime --> Analytics
    DB -.-> WebPOS
```

---

## ⚡ Mühendislik Problemleri ve Çözülen Zorluklar (Engineering Highlights)

### 1. Concurrency & Rapid Scanning (50–100ms Burst Rate)
* **Problem:** Yoğun saatlerde kasiyerler barkodları art arda çok hızlı (50–100ms aralıklarla) okutur. Doğrudan senkron HTTP çağrıları yapılması durumunda ağ gecikmesi veya geçici bağlantı kopmaları klavye giriş akışını dondurur ve barkod okuma kaybına yol açardı.
* **Çözüm:** Çok iş parçacıklı (**multi-threaded**) üretici-tüketici (**producer-consumer**) mimarisi kuruldu. 
  - Ana thread donanımsal HID olaylarını bloklanmadan yakalayıp yerel bellek içi kuyruğa (`queue.Queue`) yazar.
  - Arka planda çalışan bağımsız `Worker Thread`, kuyruktan verileri tüketip `requests.Session` üzerinden HTTP Keep-Alive ile Next.js telemetri uç noktasına (`/api/telemetry`) iletir.
  - Ağ kesintilerinde exponential backoff ve yerel tamponlama uygulanarak **%0 veri kaybı** ve **sıfır giriş gecikmesi** garanti edilir.

### 2. Dynamic Basket Segmentation (Dinamik Sepet Durum Makinesi)
* **Problem:** Masaüstü kapalı devre POS yazılımları dışarıya bir sepet açma/kapatma API'si sunmaz. Hangi ürünlerin aynı müşterinin sepetinde olduğunu harici olarak bilmek imkansızdır.
* **Çözüm:** Çift tetikleyicili akıllı **Durum Makinesi (State Machine)** tasarlandı:
  - **Donanımsal `ESC_KEY` / `F2` Tetiklemesi:** Kasiyer satışı tamamladığında veya iptal ettiğinde donanımsal tuşa basar; ajan bunu anında yakalar ve sepeti kapatır (`reason: ESC_KEY`).
  - **90 Saniye `IDLE_TIMEOUT`:** Kasiyer tuşa basmayı unuttuğunda, son ürün taramasından sonra geçen 90 saniye hareketsizlik sonrası sepet otomatik olarak arşivlenir (`reason: IDLE_TIMEOUT`).
  - Her yeni tarama timeout sayacını sıfırlar; sepet tamamlandığında toplam ürün adedi, okutulan barkod listesi ve sepet süresi JSON formatında `BASKET_COMPLETED` olayı olarak yayınlanır.

### 3. Katalog Migrasyonu & Veri Standardizasyonu
* **Problem:** İşletmenin eski sisteminden (Barkodsis / Excel) gelen 2.000+ ürünlük katalogda bozuk karakterler, tutarsız kısaltmalar (`"A.FST-CIK"`, `"KS.BOX"`, `"ROT MAVİ"`) ve şema farklılıkları mevcuttu.
* **Çözüm:** 
  - Özel veri işleme motoru (`scripts/clean-products.ts`) geliştirildi.
  - Regex ve kural tabanlı kısaltma açıcılar (`"A.FST-CIK"` $\rightarrow$ `"Antep Fıstıklı Çikolata"`) ile kurumsal marka adları en başa standardize edildi.
  - Karmaşık ve belirsiz kayıtlar için **NVIDIA NIM (Llama Vision/LLM)** API'si ile toplu (batch) normalizasyon yapıldı.
  - PostgreSQL'in büyük/küçük harf duyarlı şemasına (`sellPrice`, `lastCostNet`, `purchaseVatRate`) %100 uyumlu temiz bir katalog oluşturuldu.

---

## 📟 Terminal & Canlı Telemetri Önizlemesi

Edge ajanından bulut terminaline akan gerçek zamanlı telemetri log formatı:

```text
> kasa_agent@pos: ~/telemetry-stream
[2026-10-08 14:20:01.104] [INIT] Agent listening on HID Keyboard Device /dev/input/event3...
[2026-10-08 14:22:15.820] [SCAN] 8690504131458 -> Ülker Dido Trio 36.5g           ₺30.00 (HTTP 200 - 42ms)
[2026-10-08 14:22:18.210] [SCAN] 8690787131022 -> Tadım Kavrulmuş Fıstık 180g       ₺45.00 (HTTP 200 - 38ms)
[2026-10-08 14:22:20.015] [SCAN] 8690504001234 -> Tuborg Gold Kutu 50cl             ₺65.00 (HTTP 200 - 45ms)
[2026-10-08 14:22:24.490] [BASKET_CLOSED] 3 ürün ile sepet kapandı (ESC_KEY) -> Toplam: ₺140.00
[2026-10-08 14:23:55.100] [IDLE_WATCHDOG] Sepet zaman aşımı tetiklendi (90s IDLE_TIMEOUT)
```

Web tabanlı canlı terminal (`/live-terminal`), Supabase Realtime üzerinden bu akışı dinler ve her barkod okumasında Web Audio API üzerinden donanım hissi veren **akustik bip (beep)** sesi üretir.

---

## 💻 Teknoloji Yığını

| Katman | Teknoloji / Kütüphane | Kullanım Amacı |
| :--- | :--- | :--- |
| **Edge Telemetry** | Python 3.11+, `pynput`, `queue`, `requests` | HID tuş yakalama, yerel bellek kuyruğu & HTTP dispatch |
| **Frontend Framework**| Next.js 16 (App Router), React 19, TypeScript | Yüksek performanslı SSR/CSR web arayüzü |
| **Stil & Arayüz** | Tailwind CSS v4, Lucide React | Sıfır CSS-in-JS yükü, ultra hafif sistem fontu (`system-ui`) |
| **Durum Yönetimi** | Zustand | Ayrık Kasa Sepeti ve Telemetri Terminali state yönetimi |
| **Veritabanı & ORM** | PostgreSQL, Prisma ORM 6.x | Tip güvenli ilişkisel veri modeli |
| **Gerçek Zamanlı Hub**| Supabase Realtime Channels | WebSocket tabanlı anlık telemetri yayını (Broadcast) |
| **Görsel Analitik** | Recharts, Date-fns | Günlük sepet trendleri ve satış dağılım grafikleri |
| **Yapay Zeka (AI)** | NVIDIA NIM (Llama 4 / 3.2 Vision) | Fatura/irsaliye tarama ve ürün adı temizleme |

---

## 📂 Proje Dizin Yapısı

```text
ultimarket/
├── agent/                         # Python Edge POS Telemetry Ajanı
│   ├── agent.py                   # HID Dinleyici, State Machine ve Worker Thread
│   ├── config.py                  # API URL, Gizli Token ve Zaman Aşımı Ayarları
│   └── requirements.txt           # Python kütüphaneleri (pynput, requests vb.)
├── prisma/
│   ├── schema.prisma              # Product, Sale, TelemetryLog, Customer şeması
│   └── seed.ts                    # Örnek ürün, müşteri ve test verileri
├── scripts/
│   └── clean-products.ts          # 2.000+ ürünlük Excel/Barkodsis veri normalizasyonu
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── live-terminal/     # Canlı telemetri akış terminali & sesli bildirimler
│   │   │   └── page.tsx           # Satış metrikleri, saatlik ciro ve sepet analitiği
│   │   ├── api/
│   │   │   ├── telemetry/         # Edge ajanından gelen event ingest API
│   │   │   ├── fatura-analiz/     # NVIDIA NIM Vision ile fatura çıkarma API
│   │   │   ├── sales/             # Satış tamamlama uç noktaları (Nakit/Kart/Veresiye)
│   │   │   └── products/          # Ürün arama ve fiyat sorgulama
│   │   ├── page.tsx               # Kasiyer dostu fare gerektirmeyen Kasa Ekranı
│   │   ├── veresiye/              # Müşteri veresiye defteri ve bakiye takibi
│   │   └── faturalar/             # Fatura tarama & toptancı zam uyarı asistanı
│   ├── components/                # Kasa ve Dashboard modüler UI bileşenleri
│   ├── lib/                       # Prisma istemcisi, Supabase SDK & yardımcı araçlar
│   └── store/                     # Zustand Mağazaları (useCartStore, useTelemetryStore)
├── .env.example                   # Ortam değişkenleri şablonu
├── package.json
└── README.md
```

---

## ⌨️ Kasiyer Klavye Kısayolları

Kasa ekranı (`/`), kasiyerin elini klavye ve barkod okuyucudan çekmeden tüm işlemleri saniyeler içinde yapabilmesi için fareye ihtiyaç duymayacak şekilde tasarlanmıştır:

| Tuş | Eylem |
| :--- | :--- |
| **Barkod Okuyucu** | Ekranda herhangi bir yere odaklanmadan okutun; ürün anında sepete eklenir. |
| **F2** | **NAKİT** ödeme ile satışı tamamlar ve fişi kapatır. |
| **F3** | **KART** (POS) ödeme ile satışı tamamlar ve fişi kapatır. |
| **F4** | **VERESİYE** modalını açar (Müşteri arama, ok tuşları, limit denetimi). |
| **Space** / **Esc** | Sepet temizleme onay diyaloğunu açar (**Enter**: Temizle, **Esc**: İptal). |
| **↑ / ↓** | Sepetteki ürün satırları arasında gezinir. |
| **+** / **-** | Seçili ürünün miktarını artırır / azaltır. |
| **Delete** / **Backspace** | Seçili ürünü sepetten çıkarır. |

---

## 🚀 Kurulum ve Yerel Geliştirme (Setup Guide)

### 1. Gereksinimler
- **Node.js**: v20+ veya v24+
- **Python**: 3.11+ (Edge ajanı için)
- **PostgreSQL**: v15+ (veya Supabase projesi)
- **NVIDIA NIM API Key**: *(Opsiyonel - Fatura Vision analizi için [build.nvidia.com](https://build.nvidia.com))*

### 2. Ortam Değişkenlerini Tanımlama
Kök dizindeki `.env.example` dosyasını `.env` olarak kopyalayın:

```bash
cp .env.example .env
```

`.env` dosyasını yerel veya bulut konfigürasyonunuza göre düzenleyin:

```env
# Veritabanı (PostgreSQL / Supabase)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ultimarket?schema=public"

# Telemetri Güvenliği
TELEMETRY_SECRET_TOKEN="ultimarket_telemetry_secure_token_2026"

# Supabase Realtime & İstemci
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# NVIDIA NIM Vision & Text Modelleri (Fatura ve Veri Temizleme)
NVIDIA_API_KEY="nvapi-..."
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_VISION_MODEL="meta/llama-3.2-11b-vision-instruct"
```

### 3. Paketleri Yükleme ve Veritabanını Hazırlama
```bash
# Node.js bağımlılıklarını yükleyin
npm install

# Prisma şemasını veritabanına uygulayın
npx prisma db push

# Örnek market ürünlerini ve müşterileri veritabanına yükleyin
npm run seed
```

### 4. Edge Telemetri Ajanını Başlatma (Python)
Kasa PC'sinde veya yerel test ortamında ajanı başlatmak için:

```bash
cd agent
pip install -r requirements.txt
python agent.py
```

### 5. Next.js Web Uygulamasını Çalıştırma
```bash
npm run dev
```

Tarayıcınızdan **`http://localhost:3000`** adresine giderek Kasa arayüzünü, **`http://localhost:3000/live-terminal`** adresinden ise canlı telemetri akışını izleyebilirsiniz.

---

## 📜 Lisans & Haklar

Bu proje tescilli olup ticari kullanım hakları ilgili işletmeye aittir. Özel ağ konfigürasyonu ve telemetri şifreleme anahtarları gizlilik protokolleri kapsamında korunmaktadır.
