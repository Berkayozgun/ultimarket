import { create } from "zustand";

export interface CartItem {
  productId: number;
  barcode: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  addByProduct: (product: {
    id: number;
    barcode: string;
    name: string;
    sellPrice: number;
  }) => void;
  addVirtualQuickItem: (item: {
    productId: number;
    barcode: string;
    name: string;
    unitPrice: number;
  }) => void;
  inc: (productId: number) => void;
  dec: (productId: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addByProduct: (product) => {
    set((state) => {
      const existing = state.items.find((item) => item.productId === product.id);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            barcode: product.barcode,
            name: product.name,
            unitPrice: product.sellPrice,
            quantity: 1,
          },
        ],
      };
    });
  },
  addVirtualQuickItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: item.productId,
            barcode: item.barcode,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: 1,
          },
        ],
      };
    });
  },
  inc: (productId) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.productId === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ),
    }));
  },
  dec: (productId) => {
    set((state) => ({
      items: state.items
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0),
    }));
  },
  remove: (productId) => {
    set((state) => ({
      items: state.items.filter((item) => item.productId !== productId),
    }));
  },
  clear: () => {
    set({ items: [] });
  },
  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },
  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
