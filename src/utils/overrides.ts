import type { PressureUlcerSpec } from '../data/pressureUlcerSpecs';
export type { PressureUlcerSpec };

/** カードに追加する自由配置アイテム */
export interface ExtraItem {
  id: string;
  type: 'text' | 'image';
  content: string;      // テキスト文字列 or base64 data URL
  x: number;            // translate X (px)
  y: number;            // translate Y (px)
  w?: number;           // 幅 (px) — undefined = 100%
  h?: number;           // 高さ (px) — undefined = auto
  fontSize?: number;    // フォントサイズ (em)
}

export interface ProductOverride {
  name?: string;
  maker?: string;
  summary?: string;
  /** 編集モードで上書きした価格表示 */
  price?: string;
  /** 管理者モードで編集可能なTAISコード */
  taisCode?: string;
  /** 自由配置追加アイテム（複数可） */
  extraItems?: ExtraItem[];
  /** 管理者が手動で追加したスペック行 */
  specRows?: { label: string; value: string }[];
  /** TAISスペック行の値を上書き (label → 上書き値) */
  specOverrides?: Record<string, string>;
}

export interface LayoutOverride { x: number; y: number; s: number; }
export type LayoutMap = Record<string, Record<string, LayoutOverride>>;
export interface CardSizeOverride { cols?: 2 | 3; large?: true; }

/** 代替品設定(管理者が商品ごとに優先・除外を設定) */
export interface AltSetting {
  preferred?: string[];
  excluded?: string[];
}

/** 手動追加商品(TAISコードで登録) */
export interface ExtraProduct {
  id: string;
  taisCode: string;
  name: string;
  maker: string;
  categoryId: string;
  description?: string;
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
  /** pageNo → 固定行数(1/2/3). undefinedは自動 */
  pageRows: Record<number, number | undefined>;
  /** 確定済み商品IDリスト。設定時はExcel再読込で商品リストを変えない */
  catalogProductIds?: string[];
  /** 手動追加商品リスト */
  extraProducts?: ExtraProduct[];
  /** 非表示商品IDリスト */
  hiddenProductIds?: string[];
  /** 表紙画像 (dataURL) */
  coverImage?: string;
  /** 裏表紙画像 (dataURL) */
  backCoverImage?: string;
  /** 床ずれ防止用具スペック (productId → spec) */
  pressureUlcerSpecs?: Record<string, PressureUlcerSpec>;
  /** 最終保存日時 (Unix ms) — ローカル vs リモートのどちらが新しいか判定に使う */
  _savedAt?: number;
}

const KEY = 'carepal-edits';

function normalize(o: Overrides): Overrides {
  return {
    products:           o.products          ?? {},
    guides:             o.guides            ?? {},
    layouts:            o.layouts           ?? {},
    customImages:       o.customImages      ?? {},
    cardOrder:          o.cardOrder         ?? {},
    cardSize:           o.cardSize          ?? {},
    altSettings:        o.altSettings       ?? {},
    pageRows:           o.pageRows          ?? {},
    catalogProductIds:  o.catalogProductIds,
    extraProducts:      o.extraProducts     ?? [],
    hiddenProductIds:   o.hiddenProductIds  ?? [],
    coverImage:         o.coverImage,
    backCoverImage:     o.backCoverImage,
    pressureUlcerSpecs: o.pressureUlcerSpecs ?? {},
    _savedAt:           o._savedAt,
  };
}

export function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Overrides);
  } catch { /* 破損時は初期化 */ }
  return {
    products: {}, guides: {}, layouts: {}, customImages: {},
    cardOrder: {}, cardSize: {}, altSettings: {}, pageRows: {},
    extraProducts: [], hiddenProductIds: [],
  } as unknown as Overrides;
}

/**
 * localStorageに保存。成功したら true、QuotaExceededError なら false を返す。
 * 常に _savedAt を現在時刻に更新する。
 */
export function saveOverrides(o: Overrides): boolean {
  try {
    const withTs = { ...o, _savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(withTs));
    return true;
  } catch {
    // QuotaExceededError: 容量不足
    return false;
  }
}

/**
 * ローカルとリモートのどちらが新しいか比較し、新しい方を返す。
 * タイムスタンプが同じまたはリモートが新しい場合はリモートを採用。
 */
export function mergeOverrides(local: Overrides, remote: Overrides): { winner: Overrides; source: 'local' | 'remote' } {
  const localTs = local._savedAt ?? 0;
  const remoteTs = remote._savedAt ?? 0;
  if (localTs > remoteTs) {
    return { winner: local, source: 'local' };
  }
  return { winner: normalize(remote), source: 'remote' };
}
