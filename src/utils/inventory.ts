import * as XLSX from 'xlsx';
import type { CategoryId, OfficeRateMap, Product, StockDetail, StockDetailMap, StockMap } from '../types';

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
  /** 在庫内訳詳細（L〜U列） */
  stockDetail?: StockDetailMap;
  /** 事業所別単位数マップ */
  officeRates?: OfficeRateMap;
  /** Excelを読み込んだ日時 */
  loadedAt?: Date;
}

/**
 * 単位数Excelを解析する
 * 列構成: A=TAISコード, B=品目, C=商品名, D=単位数, E=上限値, F=事業所名
 */
export function parseRateRows(rows: unknown[][]): OfficeRateMap {
  const officeRates: OfficeRateMap = {};
  for (const r of rows.slice(1)) {
    const tais = String(r[0] ?? '').trim();
    const units = Number(r[3]);
    const office = String(r[5] ?? '').trim();
    if (!tais || !office || Number.isNaN(units) || units <= 0) continue;
    if (!officeRates[office]) officeRates[office] = {};
    officeRates[office][tais] = units;
  }
  return officeRates;
}

export async function parseRateExcel(file: File | ArrayBuffer): Promise<OfficeRateMap> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  return parseRateRows(rows);
}

export async function loadDefaultRates(): Promise<OfficeRateMap | null> {
  try {
    const res = await fetch('/rates.xlsx');
    if (!res.ok) return null;
    return parseRateExcel(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function parseCatalogRows(rows: unknown[][]): CatalogData {
  const header = (rows[0] ?? []).map((h) => String(h ?? ''));
  const col = (name: string, fallback: number) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iService   = col('サービス内容', 5);   // F列
  const iMaker     = col('メーカー名', 6);     // G列
  const iCode      = col('商品コード', 9);     // J列
  const iName      = col('商品名', 10);        // K列
  const iAvailable = col('引当可', 11);        // L列
  const iReserved  = col('予約数', 12);        // M列
  const iRenting   = col('契約中', 13);        // N列
  const iCancelled = col('解約済', 14);        // O列
  const iRecovering = col('回収済', 15);       // P列
  const iMaint     = col('メンテ中', 16) >= 0 ? col('メンテ中', 16) : col('メンテナンス状況', 16); // Q列
  const iTotal     = col('在庫数', 18);        // S列
  const iUnusable  = col('使用不可', 20);      // U列

  const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isNaN(x) ? 0 : x; };

  const products: Product[] = [];
  const rawStock: StockMap = {};
  const rawDetail: Record<string, StockDetail> = {};
  const seen = new Set<string>();

  for (const r of rows.slice(1)) {
    const code = String(r[iCode] ?? '').trim();
    const name = String(r[iName] ?? '').trim();
    const categoryId = SERVICE_TO_CATEGORY[String(r[iService] ?? '').trim()];
    if (!code || !name || !categoryId) continue;

    const avail = n(r[iAvailable]);
    const reserved = n(r[iReserved]);
    const renting = n(r[iRenting]);
    const cancelled = n(r[iCancelled]);
    const recovering = n(r[iRecovering]);
    const maint = n(r[iMaint]);
    const total = n(r[iTotal]);
    const unusable = n(r[iUnusable]);

    if (seen.has(code)) {
      rawStock[code] += avail;
      const d = rawDetail[code];
      d.available += avail; d.reserved += reserved; d.renting += renting;
      d.cancelled += cancelled; d.recovering += recovering; d.maintenance += maint;
      d.total += total; d.unusable += unusable;
      continue;
    }
    seen.add(code);
    rawStock[code] = avail;
    rawDetail[code] = { available: avail, reserved, renting, cancelled, recovering, maintenance: maint, total, unusable };

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
      maintenance: maint > 0 ? maint : undefined,
    });
  }

  const stock: StockMap = {};
  for (const [code, raw] of Object.entries(rawStock)) {
    stock[code] = normalizeStockValue(raw);
  }

  const stockDetail: StockDetailMap = rawDetail;

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

  return { products, stock, stockDetail, loadedAt: new Date() };
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
