import type { Product } from '../types';

// サンプル商品マスタ(実運用ではExcel/DBから読み込み)
export const PRODUCTS: Product[] = [
  // ── 手すり ──
  {
    id: 'TS-001', name: 'たちあっぷ CKA-01', maker: '矢崎化工', categoryId: 'tesuri',
    taisCode: '00180-000009', price: 3000, featured: true,
    description: '据え置き型の定番手すり。ベッドサイドや玄関の立ち座りに。',
    tags: ['手すり', '据置', '立ち座り'],
    handrail: { dimensions: '幅70×奥行60×高さ80cm(手すり高さ)', installPhotos: [] },
  },
  {
    id: 'TS-002', name: 'ベスポジ・e 突っ張り手すり', maker: 'ホクメイ', categoryId: 'tesuri',
    taisCode: '01538-000123', price: 3500, featured: false,
    description: '天井突っ張り型。縦の動きを支え、省スペースに設置可能。',
    tags: ['手すり', '突っ張り', '縦手すり'],
    handrail: { dimensions: '支柱径4cm/対応天井高 220〜280cm', installPhotos: [] },
  },
  {
    id: 'TS-003', name: 'ルーツ サイドタイプ', maker: 'モルテン', categoryId: 'tesuri',
    taisCode: '00170-000456', price: 3200, featured: false,
    description: 'ベッドからの起き上がり・立ち上がりをサポートする床置き手すり。',
    tags: ['手すり', '据置', 'ベッドサイド'],
    handrail: { dimensions: '幅66×奥行48×高さ70〜80cm', installPhotos: [] },
  },
  // ── 歩行補助つえ ──
  {
    id: 'CN-001', name: '四点杖 ステッキ SQ-100', maker: 'フランスベッド', categoryId: 'tsue',
    taisCode: '00200-000111', price: 800, featured: true,
    description: '支持面が広く安定する四点杖。屋内歩行の第一選択に。',
    tags: ['杖', '四点杖', '屋内'],
  },
  {
    id: 'CN-002', name: 'ロフストランドクラッチ', maker: 'プロト・ワン', categoryId: 'tsue',
    taisCode: '00210-000222', price: 900, featured: false,
    description: '前腕で支えるタイプ。握力が弱い方にも。',
    tags: ['杖', 'ロフストランド'],
  },
  // ── 歩行器 ──
  {
    id: 'WK-001', name: 'セーフティーアーム ウォーカー', maker: 'イーストアイ', categoryId: 'hokoki',
    taisCode: '00300-000333', price: 2000, featured: true,
    description: '軽量で持ち上げやすい固定型歩行器。屋内向け定番。',
    tags: ['歩行器', '固定型', '屋内'],
  },
  {
    id: 'WK-002', name: 'トレウォーク スリム', maker: '日進医療器', categoryId: 'hokoki',
    taisCode: '00310-000444', price: 2800, featured: false,
    description: '四輪歩行車。屋外の買い物にも使える座面・カゴ付き。',
    tags: ['歩行器', '歩行車', '屋外'],
  },
  // ── スロープ ──
  {
    id: 'SL-001', name: 'ダンスロープライト R-76', maker: 'ダンロップ', categoryId: 'slope',
    taisCode: '00400-000555', price: 3000, featured: true,
    description: '軽量カーボン製の可搬型スロープ。玄関の段差解消に。',
    tags: ['スロープ', '可搬型'],
  },
  {
    id: 'SL-002', name: 'デクパック EBL', maker: 'ケアメディックス', categoryId: 'slope',
    taisCode: '00410-000666', price: 4500, featured: false,
    description: '折りたたみ式で持ち運びやすいスロープ。',
    tags: ['スロープ', '折りたたみ'],
  },
  // ── 車いす ──
  {
    id: 'WC-001', name: 'NEXT CORE 自走式', maker: '松永製作所', categoryId: 'kurumaisu',
    taisCode: '00500-000777', price: 6000, featured: true,
    description: '軽量・コンパクトな自走式標準車いす。出庫数No.1。',
    tags: ['車いす', '自走式'],
  },
  {
    id: 'WC-002', name: 'NEXT CORE 介助式', maker: '松永製作所', categoryId: 'kurumaisu',
    taisCode: '00500-000778', price: 5500, featured: false,
    description: '介助者が押しやすい介助式。自走式と同シリーズ。',
    tags: ['車いす', '介助式'],
  },
  {
    id: 'WC-003', name: 'モジュール車いす AR-901', maker: '松永製作所', categoryId: 'kurumaisu',
    taisCode: '00510-000779', price: 7500, featured: false,
    description: '座面高・アーム高を調整できるモジュールタイプ。',
    tags: ['車いす', 'モジュール'],
  },
  // ── 車いす付属品 ──
  {
    id: 'WA-001', name: 'ロホクッション ミドル', maker: 'ペルモビール', categoryId: 'kurumaisu-fuzoku',
    taisCode: '00600-000888', price: 2000, featured: true,
    description: 'エアセル構造で体圧分散性に優れた車いすクッション。',
    tags: ['クッション', '体圧分散'],
  },
  {
    id: 'WA-002', name: '車いす用テーブル', maker: '日進医療器', categoryId: 'kurumaisu-fuzoku',
    taisCode: '00610-000999', price: 1000, featured: false,
    description: '食事や読書に便利な着脱式テーブル。',
    tags: ['テーブル'],
  },
  // ── 特殊寝台 ──
  {
    id: 'BD-001', name: '楽匠プラス 3モーター', maker: 'パラマウントベッド', categoryId: 'tokushu-shindai',
    taisCode: '00700-001111', price: 12000, featured: true,
    description: '背上げ・膝上げ・高さ調整の3モーター。らくらく動作支援。',
    tags: ['ベッド', '3モーター'],
  },
  {
    id: 'BD-002', name: '楽匠プラス 2モーター', maker: 'パラマウントベッド', categoryId: 'tokushu-shindai',
    taisCode: '00700-001112', price: 10000, featured: false,
    description: '背上げ・高さ調整の2モーター。',
    tags: ['ベッド', '2モーター'],
  },
  // ── 特殊寝台付属品(マットレス: 硬さ表記あり) ──
  {
    id: 'MT-001', name: 'エバーフィット C3 マットレス', maker: 'パラマウントベッド', categoryId: 'shindai-fuzoku',
    taisCode: '00800-002222', price: 3500, featured: true, firmness: 4,
    description: '端座位が安定する硬めのウレタンマットレス。寝返り・立ち上がり重視の方に。',
    tags: ['マットレス', '硬め'],
  },
  {
    id: 'MT-002', name: 'ストレッチフィット マットレス', maker: 'モルテン', categoryId: 'shindai-fuzoku',
    taisCode: '00810-002333', price: 3500, featured: false, firmness: 2,
    description: '柔らかめで体圧分散に優れる。背上げ時のズレを軽減。',
    tags: ['マットレス', '柔らかめ', '体圧分散'],
  },
  {
    id: 'MT-003', name: 'サイドレール KS-161', maker: 'パラマウントベッド', categoryId: 'shindai-fuzoku',
    taisCode: '00820-002444', price: 1000, featured: false,
    description: '布団のずり落ち防止用サイドレール(2本1組)。',
    tags: ['サイドレール'],
  },
  // ── 床ずれ防止用具 ──
  {
    id: 'AP-001', name: 'ここちあ結起 3D', maker: 'パラマウントベッド', categoryId: 'tokozure',
    taisCode: '00900-003333', price: 8000, featured: true, firmness: 1,
    description: '高機能エアマットレス。自動体位変換機能つき。',
    tags: ['エアマットレス', '褥瘡予防', '体圧分散'],
  },
  {
    id: 'AP-002', name: 'アルファプラ すくっと', maker: 'タイカ', categoryId: 'tokozure',
    taisCode: '00910-003444', price: 6000, featured: false, firmness: 2,
    description: '静止型の体圧分散マットレス。端座位も安定。',
    tags: ['静止型', '褥瘡予防', '体圧分散'],
  },
  // ── 体位変換器 ──
  {
    id: 'PC-001', name: 'ナーセントパット A', maker: 'アイ・ソネックス', categoryId: 'taii-henkan',
    taisCode: '01000-004444', price: 1500, featured: true,
    description: '姿勢保持・体位変換用クッションセット。',
    tags: ['体位変換', 'クッション'],
  },
  // ── 移動用リフト ──
  {
    id: 'LF-001', name: 'つるべー Bセット', maker: 'モリトー', categoryId: 'lift',
    taisCode: '01100-005555', price: 15000, featured: true,
    description: 'ベッドサイド据置式リフト。移乗介助の負担を大幅軽減。',
    tags: ['リフト', '据置式'],
  },
  // ── 認知症老人徘徊感知機器 ──
  {
    id: 'SN-001', name: '徘徊コールⅢ マットセンサー', maker: 'テクノスジャパン', categoryId: 'haikai-kanchi',
    taisCode: '01200-006666', price: 5000, featured: true,
    description: 'ベッドサイドのマットを踏むと受信機でお知らせ。',
    tags: ['センサー', 'マット型'],
  },
  // ── 自動排泄処理装置 ──
  {
    id: 'EX-001', name: 'スカットクリーン', maker: 'パラマウントベッド', categoryId: 'haisetsu',
    taisCode: '01300-007777', price: 8000, featured: true,
    description: '男性用・女性用レシーバー対応の自動採尿器。',
    tags: ['自動排泄', '採尿器'],
  },
  // ── 入浴補助用具(購入) ──
  {
    id: 'BT-001', name: 'シャワーチェア ユクリア', maker: 'パナソニックエイジフリー', categoryId: 'nyuyoku',
    taisCode: '01400-008888', price: 18000, featured: true,
    description: '肘掛け跳ね上げ式で移乗しやすいシャワーチェア。【販売品】',
    tags: ['シャワーチェア', '入浴'],
  },
  {
    id: 'BT-002', name: '浴槽手すり GR-グリップ', maker: 'リッチェル', categoryId: 'nyuyoku',
    taisCode: '01410-008999', price: 9800, featured: false,
    description: '浴槽のフチに固定するまたぎ動作用手すり。【販売品】',
    tags: ['浴槽手すり', '入浴'],
  },
  // ── 腰掛便座(購入) ──
  {
    id: 'PT-001', name: '家具調トイレ セレクトR', maker: 'アロン化成', categoryId: 'koshikake-benza',
    taisCode: '01500-009999', price: 35000, featured: true,
    description: '木製家具調で居室になじむポータブルトイレ。【販売品】',
    tags: ['ポータブルトイレ', '家具調'],
  },
  {
    id: 'PT-002', name: 'ポータブルトイレ FX-CP', maker: 'アロン化成', categoryId: 'koshikake-benza',
    taisCode: '01510-010101', price: 15000, featured: false,
    description: '樹脂製で軽量・お手入れ簡単なスタンダードタイプ。【販売品】',
    tags: ['ポータブルトイレ', '樹脂製'],
  },
];
