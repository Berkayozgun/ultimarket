/** Hugin EFT-POS fiş başlığı — mağaza bilgileri */
export const RECEIPT_STORE = {
  name: "ÖZGÜN MARKET",
  owner: "AYSEL ÖZGÜN",
  addressLines: [
    "MİTHAT PAŞA MAH. BALIKPAZARI",
    "MERKEZ, EDİRNE",
    "CAD. ATAKAN HAN No: 44 / 2",
  ],
  taxOffice: "Kırkpınar V.D.",
  taxNumber: "6920320254",
} as const;

/** Termal yazıcı satır genişliği (56mm ruloda 50mm alan, ~32 karakter) */
export const RECEIPT_LINE_WIDTH = 32;
