import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Product, StockMap } from '../types';
import type { CatalogData } from '../utils/inventory';

// Vercelの環境変数(またはローカルの .env.local)に設定:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/** Supabaseが設定されていればクライアントを返す(未設定ならnull) */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  client ??= createClient(url, anonKey);
  return client;
}

export const supabaseEnabled = Boolean(url && anonKey);

interface ProductRow {
  id: string;
  name: string;
  maker: string;
  category_id: string;
  tais_code: string;
  stock: number;
  featured: boolean;
  tags: string[];
}

/** Excelから読み込んだカタログをSupabaseへ保存(全件置き換えupsert) */
export async function saveCatalogToSupabase(data: CatalogData): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabaseが設定されていません(.env.localを確認してください)');
  const rows: ProductRow[] = data.products.map((p) => ({
    id: p.id,
    name: p.name,
    maker: p.maker,
    category_id: p.categoryId,
    tais_code: p.taisCode,
    stock: data.stock[p.id] ?? 0,
    featured: p.featured,
    tags: p.tags,
  }));
  // 1000件ずつ分割upsert
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('products').upsert(rows.slice(i, i + 1000));
    if (error) throw error;
  }
}

/** Supabaseからカタログを読み込み(データがなければnull) */
export async function loadCatalogFromSupabase(): Promise<CatalogData | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const all: ProductRow[] = [];
  // ページングで全件取得
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('id')
      .range(from, from + 999);
    if (error || !data) return null;
    all.push(...(data as ProductRow[]));
    if (data.length < 1000) break;
  }
  if (all.length === 0) return null;

  const products: Product[] = all.map((r) => ({
    id: r.id,
    name: r.name,
    maker: r.maker,
    categoryId: r.category_id as Product['categoryId'],
    taisCode: r.tais_code,
    price: 0,
    description: '',
    featured: r.featured,
    tags: r.tags ?? [],
  }));
  const stock: StockMap = Object.fromEntries(all.map((r) => [r.id, r.stock]));
  return { products, stock };
}
