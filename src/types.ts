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
  /** 品目冒頭に掲載する「福祉用具の選定ガイド」 */
  guide: string;
  /** 品目のテーマカラー(ページ帯・タブに使用) */
  color: string;
  /** 介護給付/予防給付のサービスコード(レンタル品目のみ) */
  serviceCode?: { kaigo: string; yobo: string };
}

/** マットレス等の硬さ表記 (1=やわらかい 〜 5=かたい) */
export type Firmness = 1 | 2 | 3 | 4 | 5;

export interface HandrailInfo {
  /** 寸法表記 例: "幅70×奥行60×高さ80cm" */
  dimensions: string;
  /** 設置事例写真URL */
  installPhotos: string[];
}

export interface Product {
  id: string;
  name: string;
  maker: string;
  categoryId: CategoryId;
  /** TAISコード 例: "00180-000009" */
  taisCode: string;
  /** レンタル月額 or 販売価格(円) */
  price: number;
  description: string;
  /** よく出る商品(大きく上部表示) */
  featured: boolean;
  /** 代替品マッチング用タグ */
  tags: string[];
  /** マットレス用: 硬さ */
  firmness?: Firmness;
  /** 手すり用: 寸法・設置事例 */
  handrail?: HandrailInfo;
  /** 画像URL(未指定ならTAISコードから生成したリンクを使用) */
  imageUrl?: string;
}

/** Excel読み込み後の在庫マップ: 商品ID → 表示用在庫数 */
export type StockMap = Record<string, number>;
