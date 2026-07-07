import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Product, StockMap, StockDetailMap } from '../types';
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

// ── settings テーブル (key TEXT PK, value JSONB, updated_at TIMESTAMPTZ) ──

/** 設定値を1件保存。成功したら true、失敗(またはSupabase未設定)なら false。 */
export async function saveSetting(key: string, value: unknown): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    console.error('[saveSetting] Supabase保存失敗:', key, error.message);
    return false;
  }
  return true;
}

/** 設定値を1件読み込み */
export async function loadSetting<T>(key: string): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('settings').select('value').eq('key', key).single();
  if (error || !data) return null;
  return data.value as T;
}

/** 全設定値を一括読み込み */
export async function loadAllSettings(): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('settings').select('key, value');
  if (error || !data) return null;
  return Object.fromEntries((data as { key: string; value: unknown }[]).map(r => [r.key, r.value]));
}

/** クラウド日次バックアップ(overrides_backup_YYYY-MM-DD)の一覧を新しい順に取得 */
export async function listOverrideBackups(): Promise<{ day: string; updatedAt: string }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('settings')
    .select('key, updated_at')
    .like('key', 'overrides_backup_%')
    .order('key', { ascending: false });
  if (error || !data) return [];
  return (data as { key: string; updated_at: string }[]).map((r) => ({
    day: r.key.replace('overrides_backup_', ''),
    updatedAt: r.updated_at,
  }));
}

// ── products テーブル ──

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
  // stockDetail も保存
  if (data.stockDetail) {
    await saveSetting('stock_detail', data.stockDetail);
  }
  // 読み込み日時を保存
  await saveSetting('catalog_loaded_at', data.loadedAt?.toISOString() ?? new Date().toISOString());
}

/** Supabaseからカタログを読み込み(データがなければnull) */
export async function loadCatalogFromSupabase(): Promise<CatalogData | null> {
  return loadCatalogProducts(null, null);
}

/**
 * productテーブルのみ取得。allSettingsを渡すと別途loadSetting呼び出しをスキップできる。
 * 起動時はallSettingsをそのまま使うことで余分なネットワーク往復を省く。
 */
export async function loadCatalogProducts(
  preloadedStockDetail: StockDetailMap | null,
  preloadedLoadedAt: string | null,
): Promise<CatalogData | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const all: ProductRow[] = [];
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

  // 事前ロード済みならsupabase追加呼び出し不要
  const stockDetail = preloadedStockDetail ?? await loadSetting<StockDetailMap>('stock_detail');
  const loadedAtStr = preloadedLoadedAt ?? await loadSetting<string>('catalog_loaded_at');
  const loadedAt = loadedAtStr ? new Date(loadedAtStr) : undefined;

  return { products, stock, stockDetail: stockDetail ?? undefined, loadedAt };
}

// ── help_posts テーブル ──────────────────────────────────────────────────────

export interface HelpPost {
  id: string;
  name: string;
  content: string;
  created_at: string;
  resolved: boolean;
  admin_comment?: string;
  admin_comment_at?: string;
}

export async function loadHelpPosts(): Promise<HelpPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('help_posts').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as HelpPost[];
}

export async function saveHelpPost(name: string, content: string): Promise<HelpPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('help_posts').insert({ name, content }).select().single();
  if (error || !data) return null;
  return data as HelpPost;
}

export async function resolveHelpPost(id: string, adminComment: string, resolved: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('help_posts').update({
    resolved,
    admin_comment: adminComment || null,
    admin_comment_at: new Date().toISOString(),
  }).eq('id', id);
}
