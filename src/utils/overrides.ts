export interface ProductOverride {
  name?: string;
  maker?: string;
  summary?: string;
  /** 管理者モードで編集可能なTAISコード */
  taisCode?: string;
}

export interface LayoutOverride { x: number; y: number; s: number; }
export type LayoutMap = Record<string, Record<string, LayoutOverride>>;
export interface CardSizeOverride { cols?: 2; }

/** 代替品設定(管理者が商品ごとに優先・除外を設定) */
export interface AltSetting {
  preferred?: string[];  // 優先する商品ID
  excluded?: string[];   // 除外する商品ID
}

export interface Overrides {
  products: Record<string, ProductOverride>;
  guides: Record<string, string>;
  layouts: LayoutMap;
  customImages: Record<string, string>;
  cardOrder: Record<string, string[]>;
  cardSize: Record<string, CardSizeOverride>;
  /** productId → 代替品設定 */
  altSettings: Record<string, AltSetting>;
}

const KEY = 'carepal-edits';

export function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Overrides;
      return {
        products:     o.products     ?? {},
        guides:       o.guides       ?? {},
        layouts:      o.layouts      ?? {},
        customImages: o.customImages ?? {},
        cardOrder:    o.cardOrder    ?? {},
        cardSize:     o.cardSize     ?? {},
        altSettings:  o.altSettings  ?? {},
      };
    }
  } catch { /* 破損時は初期化 */ }
  return { products: {}, guides: {}, layouts: {}, customImages: {}, cardOrder: {}, cardSize: {}, altSettings: {} };
}

export function saveOverrides(o: Overrides): void {
  localStorage.setItem(KEY, JSON.stringify(o));
}
