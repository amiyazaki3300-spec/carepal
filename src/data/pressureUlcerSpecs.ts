export type MattressType = '圧切替型' | '静止型';
export type SubType = 'リプレイスメント' | 'オーバーレイ';

export interface PressureUlcerSpec {
  mattressType: MattressType;
  subType: SubType;
  /** 0=床ずれなし, 1=ステージI, 2=II, 3=III */
  stageMin: 0 | 1 | 2 | 3;
  /** 1=ステージI, 2=II, 3=III, 4=IV */
  stageMax: 1 | 2 | 3 | 4;
  bodyPositionChange: boolean;
  /** 体圧分散スコア 1〜10 */
  pressureScore: number;
  features: string[];
  maxWeight?: number;
  material?: string;
  pumpNoise?: '静音' | '標準';
  thickness?: string;
}

/** 製品名パターンによる自動マッチング定義 */
export interface PressureUlcerSpecPattern {
  /** 製品名に含まれる文字列（小文字で比較） */
  namePatterns: string[];
  /** メーカー名に含まれる文字列（省略時はメーカー問わず） */
  makerPatterns?: string[];
  spec: PressureUlcerSpec;
}

/**
 * 製品名・メーカー名のパターンマッチングでスペックを自動付与するリスト。
 * 上に書いたものほど優先度が高い（最初にマッチしたものを使用）。
 */
export const PRESSURE_ULCER_SPECS_BY_PATTERN: PressureUlcerSpecPattern[] = [
  // ══ 圧切替型 ══
  {
    namePatterns: ['ここちあ結起', '結起'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 2, stageMax: 4, bodyPositionChange: true, pressureScore: 10, features: ['自動体位変換', '3D構造', '高機能モニタリング', 'アラーム機能'], maxWeight: 130, material: 'エアセル', pumpNoise: '静音', thickness: '13cm' },
  },
  {
    namePatterns: ['ここちあ利楽', 'ここちあ通気', '利楽'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 2, stageMax: 4, bodyPositionChange: false, pressureScore: 9, features: ['高機能', '体重自動設定', '通気タイプ選択可', 'ヘッドアップ自動調整'], maxWeight: 130, material: 'エアセル', pumpNoise: '静音', thickness: '13cm' },
  },
  {
    namePatterns: ['ビッグセル'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 2, stageMax: 4, bodyPositionChange: false, pressureScore: 8, features: ['高機能', 'ビッグセル構造', 'モニタリング機能', '高重度対応'], maxWeight: 130, material: 'エアセル', pumpNoise: '標準', thickness: '13cm' },
  },
  {
    namePatterns: ['ラグーナ', 'laguna'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 1, stageMax: 4, bodyPositionChange: true, pressureScore: 8, features: ['体位変換機能付', '傾斜角20°', '圧切替方式', '体位保持'], maxWeight: 120, material: 'エアセル', pumpNoise: '標準', thickness: '12cm' },
  },
  {
    namePatterns: ['オスカー', 'oscar'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 1, stageMax: 3, bodyPositionChange: true, pressureScore: 7, features: ['体位変換機能', '高機能圧切替', '体重設定可'], maxWeight: 120, material: 'エアセル', pumpNoise: '標準', thickness: '12cm' },
  },
  {
    namePatterns: ['ネクサス', 'nexus'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 0, stageMax: 3, bodyPositionChange: false, pressureScore: 7, features: ['予防〜ステージIII対応', '5分割セル', '体重自動設定', '微波動モード'], maxWeight: 130, material: 'エアセル', pumpNoise: '静音', thickness: '12cm' },
  },
  {
    namePatterns: ['エアドクター', 'air doctor'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 0, stageMax: 3, bodyPositionChange: false, pressureScore: 7, features: ['予防から対応', '圧切替方式', '体重設定可'], maxWeight: 130, material: 'エアセル', pumpNoise: '標準', thickness: '12cm' },
  },
  {
    namePatterns: ['トライセル'],
    spec: { mattressType: '圧切替型', subType: 'リプレイスメント', stageMin: 0, stageMax: 3, bodyPositionChange: false, pressureScore: 6, features: ['圧切替方式', '3セル構造', '操作簡単'], maxWeight: 100, material: 'エアセル', pumpNoise: '標準', thickness: '10cm' },
  },
  // ══ 静止型（高機能） ══
  {
    namePatterns: ['ステージア', 'stagea'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 2, bodyPositionChange: false, pressureScore: 7, features: ['マイクロエアセル', '体圧分散+除圧', '硬さ3段階調整', '端座位安定', 'むれ・ひえ対策'], maxWeight: 130, material: 'エアセル+ウレタン', thickness: '13cm' },
  },
  {
    namePatterns: ['フィール', 'feel'],
    makerPatterns: ['モルテン', 'molten'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 2, bodyPositionChange: false, pressureScore: 6, features: ['3層ハイブリッド構造', '自動体圧調整', '端座位安定', '防水カバー'], maxWeight: 150, material: 'エアセル+ウレタン', thickness: '13cm' },
  },
  {
    namePatterns: ['アルファプラ'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 2, bodyPositionChange: false, pressureScore: 6, features: ['端座位安定', '通気性良好', 'カバー洗浄可', '軽量'], maxWeight: 100, material: 'ウレタン+エア', thickness: '10cm' },
  },
  {
    namePatterns: ['モルテンプラ'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 2, bodyPositionChange: false, pressureScore: 5, features: ['静止型体圧分散', '防水カバー', '介護保険対応'], maxWeight: 100, material: 'ウレタン+エア', thickness: '10cm' },
  },
  {
    namePatterns: ['ナーセントコンタ', 'nasent'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 1, stageMax: 2, bodyPositionChange: false, pressureScore: 6, features: ['立体形状セル', '通気性良好', '洗浄可能カバー', 'ウレタン2層構造'], maxWeight: 100, material: 'エア+ウレタン', thickness: '11cm' },
  },
  {
    namePatterns: ['エバープラウド'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 1, stageMax: 2, bodyPositionChange: false, pressureScore: 6, features: ['ドライタイプ', '通気性良好', '湿気対策'], maxWeight: 100, material: 'ウレタン+エア', thickness: '10cm' },
  },
  {
    namePatterns: ['テルサ', 'tellsa'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 2, bodyPositionChange: false, pressureScore: 5, features: ['静止型', '体圧分散', '防水'], maxWeight: 100, material: 'ウレタン', thickness: '9cm' },
  },
  {
    namePatterns: ['ピュアレックス', 'purelex'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['ゲル+ウレタン', '3分割構造', 'ローテーション可', '洗浄可能'], maxWeight: 100, material: 'ゲル+ウレタン', thickness: '10cm' },
  },
  {
    namePatterns: ['アクアフロート'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['静止型', '軽量', 'コスト効果高い'], maxWeight: 90, material: 'ウレタン', thickness: '8cm' },
  },
  {
    namePatterns: ['キュオラ'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['予防〜軽度対応', '軽量', 'コンパクト'], maxWeight: 90, material: 'ウレタン', thickness: '8cm' },
  },
  {
    namePatterns: ['エアリーポート'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['静止型', '体圧分散', '通気性'], maxWeight: 90, material: 'ウレタン', thickness: '8cm' },
  },
  {
    namePatterns: ['ゼロソア', 'zero'],
    makerPatterns: ['ケープ', 'cape'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 3, features: ['予防向け', '入門モデル', '寝返り補助'], maxWeight: 80, material: 'ウレタン', thickness: '7cm' },
  },
  {
    namePatterns: ['ソフィア', 'sophia'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['静止型', '軽量', '予防向け'], maxWeight: 90, material: 'ウレタン', thickness: '8cm' },
  },
  {
    namePatterns: ['ナッキー'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 3, features: ['静止型', '入門モデル', '予防向け'], maxWeight: 80, material: 'ウレタン', thickness: '7cm' },
  },
  // 豊田合成 体圧分散マットレス（製品名が一般名の場合）
  {
    namePatterns: ['体圧分散マットレス', '体圧分散'],
    makerPatterns: ['豊田合成'],
    spec: { mattressType: '静止型', subType: 'リプレイスメント', stageMin: 0, stageMax: 1, bodyPositionChange: false, pressureScore: 4, features: ['静止型', '体圧分散', '予防向け'], maxWeight: 90, material: 'ウレタン', thickness: '8cm' },
  },
];

/** productId → PressureUlcerSpec */
export const PRESSURE_ULCER_SPECS: Record<string, PressureUlcerSpec> = {
  // ── 圧切替型 ──
  'AP-001': {
    mattressType: '圧切替型', subType: 'リプレイスメント',
    stageMin: 2, stageMax: 4,
    bodyPositionChange: true, pressureScore: 9,
    features: ['自動体位変換', '体重自動設定', 'アラーム機能', '高機能モニタリング'],
    maxWeight: 130, material: 'エアセル', pumpNoise: '静音', thickness: '13cm',
  },
  'AP-003': {
    mattressType: '圧切替型', subType: 'リプレイスメント',
    stageMin: 2, stageMax: 4,
    bodyPositionChange: false, pressureScore: 7,
    features: ['圧切替方式', '体重設定可', 'ソフト/ハード切替', '3段階圧設定'],
    maxWeight: 130, material: 'エアセル', pumpNoise: '標準', thickness: '12cm',
  },
  'AP-004': {
    mattressType: '圧切替型', subType: 'リプレイスメント',
    stageMin: 2, stageMax: 4,
    bodyPositionChange: true, pressureScore: 7,
    features: ['体位変換機能', '傾斜角20°', '自動調整', '体位保持'],
    maxWeight: 120, material: 'エアセル', pumpNoise: '標準', thickness: '12cm',
  },
  'AP-005': {
    mattressType: '圧切替型', subType: 'リプレイスメント',
    stageMin: 2, stageMax: 3,
    bodyPositionChange: false, pressureScore: 6,
    features: ['静音設計', 'コンパクト収納', '操作簡単', '軽量ポンプ'],
    maxWeight: 100, material: 'エアセル', pumpNoise: '静音', thickness: '10cm',
  },
  // ── 静止型 ──
  'AP-002': {
    mattressType: '静止型', subType: 'リプレイスメント',
    stageMin: 1, stageMax: 3,
    bodyPositionChange: false, pressureScore: 6,
    features: ['端座位安定', '通気性良好', '軽量', 'カバー洗浄可'],
    maxWeight: 100, material: 'ウレタン+エア', thickness: '10cm',
  },
  'AP-006': {
    mattressType: '静止型', subType: 'リプレイスメント',
    stageMin: 2, stageMax: 3,
    bodyPositionChange: false, pressureScore: 6,
    features: ['立体形状セル', '通気性良好', 'ウレタン2層構造', 'カバー洗浄可'],
    maxWeight: 100, material: 'エア+ウレタン', thickness: '11cm',
  },
  'AP-007': {
    mattressType: '静止型', subType: 'リプレイスメント',
    stageMin: 1, stageMax: 2,
    bodyPositionChange: false, pressureScore: 4,
    features: ['軽量コンパクト', '設置容易', '低リスク〜中リスク向け', 'コスト効果高い'],
    maxWeight: 90, material: 'ウレタン', thickness: '8cm',
  },
  'AP-008': {
    mattressType: '静止型', subType: 'リプレイスメント',
    stageMin: 0, stageMax: 1,
    bodyPositionChange: false, pressureScore: 3,
    features: ['予防〜軽度対応', '寝返り補助', '入門モデル', '廉価'],
    maxWeight: 80, material: 'ウレタン', thickness: '7cm',
  },
};
