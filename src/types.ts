// ケアパル 共通型定義

export type CategoryId =
  | 'tesuri' | 'tsue' | 'hokoki' | 'slope' | 'kurumaisu' | 'kurumaisu-fuzoku'
  | 'tokushu-shindai' | 'shindai-fuzoku' | 'tokozure' | 'taii-henkan'
  | 'lift' | 'haikai-kanchi' | 'haisetsu' | 'sonota'
  | 'nyuyoku' | 'koshikake-benza';

export type CategoryKind = 'rental' | 'purchase';

export interface Category {
  id: CategoryId;
  name: string;
  kind: CategoryKind;
  guide: string;
  color: string;
  serviceCode?: { kaigo: string; yobo: string };
}

export type Firmness = 1 | 2 | 3 | 4 | 5;

export interface HandrailInfo {
  dimensions: string;
  installPhotos: string[];
}

export interface Product {
  id: string;
  name: string;
  maker: string;
  categoryId: CategoryId;
  taisCode: string;
  price: number;
  description: string;
  featured: boolean;
  tags: string[];
  firmness?: Firmness;
  handrail?: HandrailInfo;
  imageUrl?: string;
  /** Q列: メンテナンス状況(0より大きい値がある場合に表示) */
  maintenance?: number;
}

export type StockMap = Record<string, number>;

/** 商品ごとの在庫内訳 */
export interface StockDetail {
  available: number;   // L: 引当可（倉庫から出庫可能）
  reserved: number;    // M: 予約数
  renting: number;     // N: 契約中（レンタル中）
  cancelled: number;   // O: 解約済
  recovering: number;  // P: 回収済（消毒前）
  maintenance: number; // Q: メンテ中
  total: number;       // S: 在庫数（全体）
  unusable: number;    // U: 使用不可
}

export type StockDetailMap = Record<string, StockDetail>;

/** 事業所名 → (TAISコード → 単位数) */
export type OfficeRateMap = Record<string, Record<string, number>>;
