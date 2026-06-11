import * as XLSX from 'xlsx';
import type { CategoryId, Product, StockMap } from '../types';

/**
 * 在庫判定ロジック:
 *   Excel上の値をそのまま在庫数として扱う(0以下 → 在庫なし・代替品を提案)
 */
export function normalizeStockValue(raw: number): number {
  return raw > 0 ? raw : 0;
}

/** F列「サービス内容」→ カタログ品目のマッピング */
const SERVICE_TO_CATEGORY: Record<string, CategoryId> = {
  '手すり貸与': 'tesuri',
  '歩行補助つえ貸与': 'tsue',
  '歩行器貸与': 'hokoki',
  'スロープ貸与': 'slope',
  '車いす貸与': 'kurumaisu',
  '車いす付属品貸与': 'kurumaisu-fuzoku',
  '特殊寝台貸与': 'tokushu-shindai',
  '特殊寝台付属品貸与': 'shindai-fuzoku',
  '床ずれ防止用具貸与': 'tokozure',
  '体位変換器貸与': 'taii-henkan',
  '移動用リフト貸与': 'lift',
  '徘徊感知機器貸与': 'haikai-kanchi',
  '自動排泄処理装置貸与': 'haisetsu',
  '一般その他': 'sonota',
};

export interface CatalogData {
  products: Product[];
  stock: StockMap;
}

/**
 * 在庫一覧Excel(在庫一覧（総数）形式)をパースして商品マスタ+在庫を生成する。
 * 列: F=サービス内容(品目) / G=メーカー名 / J=商品コード / K=商品名 / L=引当可(在庫数)
 * ヘッダー名で列を特定し、見つからない場合は上記の列位置にフォールバックする。
 */
export function parseCatalogRows(rows: unknown[][]): CatalogData {
  const header = (rows[0] ?? []).map((h) => String(h ?? ''));
  const col = (name: string, fallback: number) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iService = col('サービス内容', 5); // F列
  const iMaker = col('メーカー名', 6);     // G列
  const iCode = col('商品コード', 9);      // J列
  const iName = col('商品名', 10);         // K列
  const iStock = col('引当可', 11);        // L列(在庫数)

  const products: Product[] = [];
  const rawStock: StockMap = {};
  const seen = new Set<string>();

  for (const r of rows.slice(1)) {
    const code = String(r[iCode] ?? '').trim();
    const name = String(r[iName] ?? '').trim();
    const categoryId = SERVICE_TO_CATEGORY[String(r[iService] ?? '').trim()];
    if (!code || !name || !categoryId) continue;

    const rawQty = Number(r[iStock]);
    const qty = Number.isNaN(rawQty) ? 0 : rawQty;

    if (seen.has(code)) {
      // 同一商品コードの行(サイズ違い等)はExcelの生値のまま合算
      // (0→1変換を行ごとに適用すると水増しになるため、合算後に一度だけ適用する)
      rawStock[code] += qty;
      continue;
    }
    seen.add(code);
    rawStock[code] = qty;

    // 商品コードがTAISコード形式(5〜6桁-6桁)ならTAISリンクに利用
    const tais = /^(\d{5,6})-(\d{6})/.exec(code);

    products.push({
      id: code,
      name,
      maker: String(r[iMaker] ?? '').trim() || '—',
      categoryId,
      taisCode: tais ? `${tais[1]}-${tais[2]}` : '',
      price: 0, // 在庫一覧に価格情報なし(0=非表示)
      description: '',
      featured: false,
      tags: name.split(/[\s　]+/).slice(0, 3),
    });
  }

  // 合算後の生値に在庫判定ロジックを一度だけ適用
  const stock: StockMap = {};
  for (const [code, raw] of Object.entries(rawStock)) {
    stock[code] = normalizeStockValue(raw);
  }

  // 各品目で在庫数の多い上位2件を「よく出る商品」として大きく表示
  const byCat = new Map<CategoryId, Product[]>();
  for (const p of products) {
    const list = byCat.get(p.categoryId) ?? [];
    list.push(p);
    byCat.set(p.categoryId, list);
  }
  for (const list of byCat.values()) {
    [...list]
      .sort((a, b) => (stock[b.id] ?? 0) - (stock[a.id] ?? 0))
      .slice(0, 2)
      .forEach((p) => { p.featured = true; });
  }

  return { products, stock };
}

/** アップロードされたExcelファイルをパースする */
export async function parseCatalogExcel(file: File | ArrayBuffer): Promise<CatalogData> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  return parseCatalogRows(rows);
}

/** 同梱の public/stock.xlsx を起動時に自動読み込み(なければnull) */
export async function loadDefaultCatalog(): Promise<CatalogData | null> {
  try {
    const res = await fetch('/stock.xlsx');
    if (!res.ok) return null;
    return parseCatalogExcel(await res.arrayBuffer());
  } catch {
    return null;
  }
}
