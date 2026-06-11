// インライン編集の内容(商品名・メーカー・説明・ガイド文)をlocalStorageに保存

export interface ProductOverride {
  name?: string;
  maker?: string;
  summary?: string;
}

/** ドラッグ移動・サイズ変更の値(x/y=px移動量, s=拡大率) */
export interface LayoutOverride {
  x: number;
  y: number;
  s: number;
}

/** 商品ID → 部位(photo/title/desc) → レイアウト */
export type LayoutMap = Record<string, Record<string, LayoutOverride>>;

export interface Overrides {
  products: Record<string, ProductOverride>;
  guides: Record<string, string>;
  layouts: LayoutMap;
}

const KEY = 'carepal-edits';

export function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Overrides;
      return { products: o.products ?? {}, guides: o.guides ?? {}, layouts: o.layouts ?? {} };
    }
  } catch { /* 破損時は初期化 */ }
  return { products: {}, guides: {}, layouts: {} };
}

export function saveOverrides(o: Overrides): void {
  localStorage.setItem(KEY, JSON.stringify(o));
}
