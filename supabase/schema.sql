-- ケアパル: Supabaseテーブル定義
-- SupabaseダッシュボードのSQL Editorで実行してください

create table if not exists products (
  id text primary key,            -- 商品コード(Excel J列)
  name text not null,             -- 商品名(K列)
  maker text not null default '', -- メーカー名(G列)
  category_id text not null,      -- 品目ID(F列サービス内容から変換)
  tais_code text not null default '',
  stock integer not null default 0, -- 在庫判定ロジック適用後の在庫数
  featured boolean not null default false,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category on products (category_id);

-- 公開カタログとして匿名読み取りを許可、書き込みはanonキー経由のみ
alter table products enable row level security;

create policy "public read" on products
  for select using (true);

create policy "anon upsert" on products
  for insert with check (true);

create policy "anon update" on products
  for update using (true);
