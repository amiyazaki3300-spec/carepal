# 🌷 ケアパル — 福祉用具デジタルカタログシステム

自社在庫のレンタル商品・販売商品を管理・閲覧・編集できるWebカタログです。

## 起動方法

```bash
npm install
npm run dev   # http://localhost:5173
```

## データの流れ

起動時に **Supabase → 同梱の `public/stock.xlsx` → サンプルデータ** の順で読み込みます。
ヘッダーの「📊 在庫Excelを読み込む」でいつでも最新の在庫一覧Excelに差し替えられます。

在庫一覧Excel(「在庫一覧（総数）」形式)の列:

| 列 | 内容 |
|---|---|
| F列(サービス内容) | 品目(車いす貸与 → 車いす などに自動変換) |
| G列(メーカー名) | メーカー |
| J列(商品コード) | 商品ID(TAISコード形式ならテクノエイド協会へリンク) |
| K列(商品名) | 商品名 |
| L列(引当可) | 在庫数(下記の特殊判定を適用) |

同一商品コードの行(サイズ違い等)は在庫を合算します。各品目で在庫数上位2件を「よく出る商品」として大きく表示します。

## 機能

| 機能 | 実装 |
|---|---|
| A4ブック表示 | 紙カタログのようなA4見開き表示(◀▶ボタン/←→キーでページ送り、目次から品目ジャンプ)。「📋 一覧表示」と切替可。 |
| デジタルカタログ表示 | レンタル品目 → 購入品目の順で表示。各品目冒頭に選定ガイド。 |
| 在庫Excel読み込み | ヘッダーの「📊 在庫Excelを読み込む」から。 |
| その場で編集 | 「✏️ 編集モード」でカタログページ上の商品名・メーカー・説明・選定ガイドを直接クリックして書き換え(ブラウザに自動保存)。 |
| 製品仕様・特徴 | `npm run fetch-details` でTAISから製品概要・仕様(寸法/重量等)を取得し、各商品セルに表示。 |
| PDF出力 | 「🖨 PDFダウンロード」(html2canvas + jsPDF、カテゴリごとにA4ページ分割)。 |
| 代替品提案 | 在庫切れ商品に同カテゴリ・タグ一致順で最大3件提案。マットレスは硬さが近いものを優先。 |

## 在庫判定ロジック

Excel上の値(L列=引当可)をそのまま在庫数として表示します。
同一商品コードの行(サイズ違い等)は合算し、**0以下は「在庫なし」**として代替品を提案します。
在庫ありの商品は枠内が薄ピンクで表示されます。

実装: [src/utils/inventory.ts](src/utils/inventory.ts) の `normalizeStockValue`

Excelフォーマット: 1行目ヘッダー、「商品ID」「在庫数」列(列名がない場合は1列目=ID、2列目=数量)。

## 商品画像(テクノエイド協会 TAIS)

商品写真はTAISコードから動的生成したURLで直接表示します(クリックで詳細ページへ)。

- 写真: `https://www.techno-tais.jp/Images/photo/{コード1}{コード2}.jpg`
- 詳細: `https://www.techno-aids.or.jp/ServiceWelfareGoodsDetail.php?RowNo=0&YouguCode1={コード1}&YouguCode2={コード2}`

写真が存在しない商品は「NO IMAGE」表示になります。実装: [src/utils/tais.ts](src/utils/tais.ts)

## 商品特有の表示

- **マットレス**: 硬さメーター(柔1〜5硬の5段階ドット表示) — `FirmnessMeter`
- **手すり**: 寸法表記(📐)。設置事例写真は `Product.handrail.installPhotos` にURLを追加すると掲載可能。

## 技術スタック

- Vite + React 19 + TypeScript
- Fabric.js v6(レイアウト編集)
- xlsx / SheetJS(Excel読み込み)
- html2canvas + jsPDF(PDF出力)

## 共有(Vercel + Supabase)

### Supabase(在庫データの共有DB)

1. https://supabase.com でプロジェクトを作成
2. SQL Editorで [supabase/schema.sql](supabase/schema.sql) を実行
3. Project Settings → API の URL と anon key を `.env.local` にコピー(`.env.example` 参照)
4. アプリの「☁ Supabaseへ保存」ボタンでExcelの内容をDBへ保存(以後、誰が開いてもDBから読み込み)

### Vercel(Webへの公開)

1. このフォルダをGitHubにpush
2. https://vercel.com で「New Project」→ リポジトリを選択(Viteとして自動認識)
3. Environment Variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定 → Deploy

またはCLIで: `npm i -g vercel && vercel`

> ⚠️ `public/stock.xlsx`(在庫一覧Excel)はデプロイすると公開URLでアクセス可能になります。
> 社外秘の場合は削除し、Supabase経由での共有のみにしてください。

## セキュリティ

`.npmrc` で Takumi Guard レジストリ(`https://npm.flatt.tech/`)を使用しています。
