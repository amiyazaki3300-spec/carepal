import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from './data/categories';
import { PRODUCTS } from './data/products';
import { DEMO_STOCK } from './data/demoStock';
import { loadDefaultCatalog, parseCatalogExcel, type CatalogData } from './utils/inventory';
import { exportCatalogPdf } from './utils/pdf';
import { loadTaisDetails, type TaisDetailMap } from './utils/taisDetails';
import { loadOverrides, saveOverrides, type Overrides } from './utils/overrides';
import { supabaseEnabled, saveCatalogToSupabase, loadCatalogFromSupabase } from './lib/supabase';
import type { CategoryId } from './types';
import { CategorySection } from './components/CategorySection';
import { CatalogBook } from './components/CatalogBook';
import './App.css';

// ── 認証 ──────────────────────────────────────────────
type AuthMode = 'user' | 'admin';
const CREDS: Record<string, AuthMode> = {
  'carepal:mak2026': 'user',
  'laperac:kam2026': 'admin',
};

function LoginScreen({ onLogin }: { onLogin: (mode: AuthMode) => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const mode = CREDS[`${id}:${pw}`];
    if (mode) { onLogin(mode); return; }
    setError('IDまたはパスワードが違います');
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__logo">🌷</div>
        <h1 className="login__title">ケアパル</h1>
        <p className="login__sub">福祉用具デジタルカタログ</p>
        <input
          className="login__input" placeholder="ログインID" value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <input
          className="login__input" type="password" placeholder="パスワード" value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="login__error">{error}</p>}
        <button className="login__btn" onClick={submit}>ログイン</button>
      </div>
    </div>
  );
}

// ── PDF オプションモーダル ─────────────────────────────
function PdfModal({ totalPages, onClose, onExport }: {
  totalPages: number;
  onClose: () => void;
  onExport: (mode: 'all' | 'current' | [number, number]) => void;
}) {
  const [mode, setMode] = useState<'all' | 'current' | 'range'>('current');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(totalPages));

  const go = () => {
    if (mode === 'range') {
      const f = Math.max(1, parseInt(from) || 1);
      const t = Math.min(totalPages, parseInt(to) || totalPages);
      onExport([f, t]);
    } else {
      onExport(mode);
    }
    onClose();
  };

  return (
    <div className="pdfmodal__overlay" onClick={onClose}>
      <div className="pdfmodal" onClick={(e) => e.stopPropagation()}>
        <h3 className="pdfmodal__title">📄 PDFダウンロード</h3>
        <label className="pdfmodal__opt"><input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} /> 現在のページ(見開き2ページ)</label>
        <label className="pdfmodal__opt"><input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> 全ページ({totalPages}ページ)</label>
        <label className="pdfmodal__opt"><input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> ページ指定</label>
        {mode === 'range' && (
          <div className="pdfmodal__range">
            <input type="number" min={1} max={totalPages} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>〜</span>
            <input type="number" min={1} max={totalPages} value={to} onChange={(e) => setTo(e.target.value)} />
            <span>ページ</span>
          </div>
        )}
        <div className="pdfmodal__actions">
          <button className="tb__btn tb__btn--primary" onClick={go}>ダウンロード</button>
          <button className="tb__btn" onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ── 管理者設定モーダル ────────────────────────────────
function AdminModal({
  onClose, editMode, onToggleEdit, onExcelLoad, onSaveSupabase,
  saving, lastUpdated,
}: {
  onClose: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onExcelLoad: (d: CatalogData) => void;
  onSaveSupabase: () => void;
  saving: boolean;
  lastUpdated: Date | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await parseCatalogExcel(f);
    onExcelLoad(data);
    onClose();
  };

  return (
    <div className="adminmodal__overlay" onClick={onClose}>
      <div className="adminmodal" onClick={(e) => e.stopPropagation()}>
        <div className="adminmodal__head">
          <h3 className="adminmodal__title">⚙️ 管理者設定</h3>
          <button className="adminmodal__close" onClick={onClose}>✕</button>
        </div>

        <section className="adminmodal__section">
          <h4>📊 在庫Excel更新</h4>
          {lastUpdated && (
            <p className="adminmodal__note">最終更新: {lastUpdated.toLocaleString('ja-JP')}</p>
          )}
          <button className="tb__btn tb__btn--primary" onClick={() => fileRef.current?.click()}>
            Excelファイルを選択してアップロード
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
        </section>

        <section className="adminmodal__section">
          <h4>✏️ 編集モード</h4>
          <button
            className={`tb__btn ${editMode ? 'tb__btn--active' : ''}`}
            onClick={() => { onToggleEdit(); onClose(); }}
          >
            {editMode ? '✅ 編集モードOFF にする' : '✏️ 編集モードON にする'}
          </button>
        </section>

        {supabaseEnabled && (
          <section className="adminmodal__section">
            <h4>☁️ Supabase保存</h4>
            <p className="adminmodal__note">現在の在庫データをクラウドDBへ保存します。他のPCでも同じデータが表示されます。</p>
            <button className="tb__btn tb__btn--primary" onClick={onSaveSupabase} disabled={saving}>
              {saving ? '⏳ 保存中…' : '☁ Supabaseへ保存'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

// ── メインアプリ ──────────────────────────────────────
export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [catalog, setCatalog] = useState<CatalogData>({ products: PRODUCTS, stock: DEMO_STOCK });
  const [details, setDetails] = useState<TaisDetailMap>({});
  const [view, setView] = useState<'book' | 'list'>('book');
  const [navCategory, setNavCategory] = useState<{ id: CategoryId; ts: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [showToolbar, setShowToolbar] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSpread, setCurrentSpread] = useState(0);
  const toolbarTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const catalogRef = useRef<HTMLDivElement>(null);

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

  // ツールバー自動表示(マウスが画面下部に来たとき)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight - 80) {
        setShowToolbar(true);
        clearTimeout(toolbarTimer.current);
      } else {
        clearTimeout(toolbarTimer.current);
        toolbarTimer.current = setTimeout(() => setShowToolbar(false), 2500);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); clearTimeout(toolbarTimer.current); };
  }, []);

  const handleOverride = (update: (o: Overrides) => Overrides) => {
    setOverrides((prev) => {
      const next = update(prev);
      saveOverrides(next);
      return next;
    });
  };

  const handleExcelLoad = (d: CatalogData) => {
    setCatalog(d);
    setNotice('');
  };

  const { products, stock } = catalog;

  async function handlePdf(mode: 'all' | 'current' | [number, number]) {
    if (!catalogRef.current) return;
    setExporting(true);
    try {
      const sections = Array.from(catalogRef.current.querySelectorAll<HTMLElement>('[data-pdf-section]'));
      let targets: HTMLElement[];
      if (mode === 'current') {
        targets = sections.slice(currentSpread * 2, currentSpread * 2 + 2);
      } else if (mode === 'all') {
        targets = sections;
      } else {
        targets = sections.slice(mode[0] - 1, mode[1]);
      }
      await exportCatalogPdf(targets.length > 0 ? targets[0].parentElement! : catalogRef.current, 'carepal-catalog.pdf', targets);
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
      setNotice(`⚠️ 保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!authMode) return <LoginScreen onLogin={setAuthMode} />;

  const hasProducts = (id: CategoryId) => products.some((p) => p.categoryId === id);

  const lastUpdatedStr = catalog.loadedAt
    ? catalog.loadedAt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' 更新'
    : '';

  return (
    <div className="app app--fullscreen">
      <main className={view === 'book' ? 'catalog catalog--book' : 'catalog catalog--list'} ref={catalogRef}>
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
            authMode={authMode}
            onPageChange={(spread, total) => { setCurrentSpread(spread); setTotalPages(total); }}
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

      {/* 更新日時バー(Excel読込後のみ) */}
      {lastUpdatedStr && (
        <div className="update-bar">{lastUpdatedStr}{notice && ` ／ ${notice}`}</div>
      )}

      {/* 自動表示ツールバー */}
      <div
        className={`tb ${showToolbar ? 'tb--visible' : ''}`}
        onMouseEnter={() => { setShowToolbar(true); clearTimeout(toolbarTimer.current); }}
        onMouseLeave={() => { toolbarTimer.current = setTimeout(() => setShowToolbar(false), 1500); }}
      >
        {/* 管理者設定(管理者のみ) */}
        {authMode === 'admin' && (
          <button className="tb__btn tb__btn--admin" onClick={() => setShowAdmin(true)}>⚙️ 管理者設定</button>
        )}

        {/* 編集モード状態表示 */}
        {editMode && <span className="tb__badge">✏️ 編集中</span>}

        <div className="tb__sep" />

        {/* 一覧/ブック切り替え */}
        <button className="tb__btn" onClick={() => setView((v) => (v === 'book' ? 'list' : 'book'))}>
          {view === 'book' ? '📋 一覧' : '📖 ブック'}
        </button>

        {/* 目次ジャンプ(ブック表示時) */}
        {view === 'book' && (
          <div className="tb__toc">
            {CATEGORIES.filter((c) => hasProducts(c.id)).map((c) => (
              <button
                key={c.id}
                className="tb__toc-btn"
                style={{ borderColor: c.color, color: c.color }}
                onClick={() => setNavCategory({ id: c.id, ts: Date.now() })}
              >
                {c.name.length > 5 ? c.name.slice(0, 5) : c.name}
              </button>
            ))}
          </div>
        )}

        <div className="tb__sep" />

        {/* PDF */}
        <button className="tb__btn" onClick={() => setShowPdfModal(true)} disabled={exporting}>
          {exporting ? '⏳' : '🖨 PDF'}
        </button>

        {/* ログアウト */}
        <button className="tb__btn tb__btn--logout" onClick={() => setAuthMode(null)}>🚪</button>
      </div>

      {/* モーダル群 */}
      {showAdmin && (
        <AdminModal
          onClose={() => setShowAdmin(false)}
          editMode={editMode}
          onToggleEdit={() => setEditMode((v) => !v)}
          onExcelLoad={handleExcelLoad}
          onSaveSupabase={handleSaveToSupabase}
          saving={saving}
          lastUpdated={catalog.loadedAt ?? null}
        />
      )}

      {showPdfModal && (
        <PdfModal
          totalPages={totalPages}
          onClose={() => setShowPdfModal(false)}
          onExport={handlePdf}
        />
      )}
    </div>
  );
}
