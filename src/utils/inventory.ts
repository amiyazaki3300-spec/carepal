import * as XLSX from 'xlsx';
import type { CategoryId, Product, StockMap } from '../types';

export function normalizeStockValue(raw: number): number {
  return raw > 0 ? raw : 0;
}

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
  /** Excelを読み込んだ日時 */
  loadedAt?: Date;
}

export function parseCatalogRows(rows: unknown[][]): CatalogData {
  const header = (rows[0] ?? []).map((h) => String(h ?? ''));
  const col = (name: string, fallback: number) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iService = col('サービス内容', 5);   // F列
  const iMaker   = col('メーカー名', 6);     // G列
  const iCode    = col('商品コード', 9);     // J列
  const iName    = col('商品名', 10);        // K列
  const iStock   = col('引当可', 11);        // L列
  const iMaint   = col('メンテナンス状況', 16); // Q列

  const products: Product[] = [];
  const rawStock: StockMap = {};
  const rawMaint: Record<string, number> = {};
  const seen = new Set<string>();

  for (const r of rows.slice(1)) {
    const code = String(r[iCode] ?? '').trim();
    const name = String(r[iName] ?? '').trim();
    const categoryId = SERVICE_TO_CATEGORY[String(r[iService] ?? '').trim()];
    if (!code || !name || !categoryId) continue;

    const rawQty = Number(r[iStock]);
    const qty = Number.isNaN(rawQty) ? 0 : rawQty;
    const maint = Number(r[iMaint] ?? 0);

    if (seen.has(code)) {
      rawStock[code] += qty;
      if (!Number.isNaN(maint) && maint > 0) rawMaint[code] = (rawMaint[code] ?? 0) + maint;
      continue;
    }
    seen.add(code);
    rawStock[code] = qty;
    if (!Number.isNaN(maint) && maint > 0) rawMaint[code] = maint;

    const tais = /^(\d{5,6})-(\d{6})/.exec(code);

    products.push({
      id: code,
      name,
      maker: String(r[iMaker] ?? '').trim() || '—',
      categoryId,
      taisCode: tais ? `${tais[1]}-${tais[2]}` : '',
      price: 0,
      description: '',
      featured: false,
      tags: name.split(/[\s　]+/).slice(0, 3),
      maintenance: undefined,
    });
  }

  // メンテナンス状況を商品に反映
  for (const p of products) {
    if (rawMaint[p.id]) p.maintenance = rawMaint[p.id];
  }

  const stock: StockMap = {};
  for (const [code, raw] of Object.entries(rawStock)) {
    stock[code] = normalizeStockValue(raw);
  }

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

  return { products, stock, loadedAt: new Date() };
}

export async function parseCatalogExcel(file: File | ArrayBuffer): Promise<CatalogData> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  return parseCatalogRows(rows);
}

export async function loadDefaultCatalog(): Promise<CatalogData | null> {
  try {
    const res = await fetch('/stock.xlsx');
    if (!res.ok) return null;
    return parseCatalogExcel(await res.arrayBuffer());
  } catch {
    return null;
  }
}
