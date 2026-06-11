import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from './data/categories';
import { PRODUCTS } from './data/products';
import { DEMO_STOCK } from './data/demoStock';
import { loadDefaultCatalog, type CatalogData } from './utils/inventory';
import { exportCatalogPdf } from './utils/pdf';
import { loadTaisDetails, type TaisDetailMap } from './utils/taisDetails';
import { loadOverrides, saveOverrides, type Overrides } from './utils/overrides';
import { supabaseEnabled, saveCatalogToSupabase, loadCatalogFromSupabase } from './lib/supabase';
import type { CategoryId } from './types';
import { CategorySection } from './components/CategorySection';
import { CatalogBook } from './components/CatalogBook';
import { ExcelUploader } from './components/ExcelUploader';
import './App.css';

export default function App() {
  const [catalog, setCatalog] = useState<CatalogData>({ products: PRODUCTS, stock: DEMO_STOCK });
  const [details, setDetails] = useState<TaisDetailMap>({});
  const [view, setView] = useState<'book' | 'list'>('book');
  const [navCategory, setNavCategory] = useState<{ id: CategoryId; ts: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const catalogRef = useRef<HTMLDivElement>(null);

  // 起動時: Supabase → 同梱stock.xlsx → サンプルデータ の順で読み込み
  useEffect(() => {
    void (async () => {
      const fromDb = await loadCatalogFromSupabase();
      if (fromDb) {
        setCatalog(fromDb);
        setNotice(`☁ Supabaseから${fromDb.products.length}商品を読み込みました`);
        return;
      }
      const fromXlsx = await loadDefaultCatalog();
      if (fromXlsx && fromXlsx.products.length > 0) {
        setCatalog(fromXlsx);
        setNotice(`📊 在庫Excelから${fromXlsx.products.length}商品を読み込みました`);
      }
    })();
    void loadTaisDetails().then(setDetails);
  }, []);

  const handleOverride = (update: (o: Overrides) => Overrides) => {
    setOverrides((prev) => {
      const next = update(prev);
      saveOverrides(next);
      return next;
    });
  };

  const { products, stock } = catalog;
  const rental = CATEGORIES.filter((c) => c.kind === 'rental');
  const purchase = CATEGORIES.filter((c) => c.kind === 'purchase');
  const hasProducts = (id: CategoryId) => products.some((p) => p.categoryId === id);

  async function handlePdf() {
    if (!catalogRef.current) return;
    setExporting(true);
    try {
      await exportCatalogPdf(catalogRef.current);
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveToSupabase() {
    setSaving(true);
    try {
      await saveCatalogToSupabase(catalog);
      setNotice(`☁ ${catalog.products.length}商品をSupabaseへ保存しました`);
    } catch (e) {
      setNotice(`⚠️ 保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleNav(e: React.MouseEvent, id: CategoryId) {
    if (view === 'book') {
      e.preventDefault();
      setNavCategory({ id, ts: Date.now() });
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__stripe" />
        <h1 className="hero__title">
          <span className="hero__logo">🌷 ケアパル</span>
          <span className="hero__sub">福祉用具デジタルカタログ</span>
        </h1>
        <div className="hero__actions">
          <ExcelUploader onLoaded={(d) => { setCatalog(d); setNotice(''); }} />
          <button
            className="btn btn--secondary"
            onClick={() => setView((v) => (v === 'book' ? 'list' : 'book'))}
          >
            {view === 'book' ? '📋 一覧表示へ' : '📖 ブック表示へ'}
          </button>
          <button
            className={`btn ${editMode ? 'btn--editing' : 'btn--primary'}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '✅ 編集を終了' : '✏️ 編集モード'}
          </button>
          <button className="btn btn--primary" onClick={handlePdf} disabled={exporting}>
            {exporting ? '⏳ 生成中…' : '🖨 PDFダウンロード'}
          </button>
          {supabaseEnabled && (
            <button className="btn btn--secondary" onClick={handleSaveToSupabase} disabled={saving}>
              {saving ? '⏳ 保存中…' : '☁ Supabaseへ保存'}
            </button>
          )}
        </div>
        {notice && <p className="hero__notice">{notice}</p>}
      </header>

      <nav className="toc">
        <span className="toc__label">レンタル品目</span>
        {rental.filter((c) => hasProducts(c.id)).map((c) => (
          <a key={c.id} href={`#${c.id}`} className="toc__link" onClick={(e) => handleNav(e, c.id)}>
            {c.name}
          </a>
        ))}
        {purchase.some((c) => hasProducts(c.id)) && (
          <span className="toc__label toc__label--purchase">購入品目</span>
        )}
        {purchase.filter((c) => hasProducts(c.id)).map((c) => (
          <a key={c.id} href={`#${c.id}`} className="toc__link toc__link--purchase" onClick={(e) => handleNav(e, c.id)}>
            {c.name}
          </a>
        ))}
      </nav>

      <main className={view === 'book' ? 'catalog catalog--book' : 'catalog'} ref={catalogRef}>
        {view === 'book' ? (
          <CatalogBook
            categories={CATEGORIES}
            products={products}
            stock={stock}
            details={details}
            navCategory={navCategory}
            editMode={editMode}
            overrides={overrides}
            onOverride={handleOverride}
          />
        ) : (
          CATEGORIES.filter((c) => hasProducts(c.id)).map((c) => (
            <CategorySection
              key={c.id}
              category={c}
              products={products.filter((p) => p.categoryId === c.id)}
              stock={stock}
            />
          ))
        )}
      </main>

      <footer className="footer">
        <p>商品写真・製品仕様はテクノエイド協会の福祉用具情報システム(TAIS)から取得しています。</p>
        <p>在庫表示はExcelデータ(L列)に基づきます。在庫0以下の商品は「在庫なし」となり代替品を提案します。</p>
      </footer>
    </div>
  );
}
