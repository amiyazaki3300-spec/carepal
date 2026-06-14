import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from './data/categories';
import { PRODUCTS } from './data/products';
import { DEMO_STOCK } from './data/demoStock';
import { loadDefaultCatalog, parseCatalogExcel, type CatalogData } from './utils/inventory';
import { exportCatalogPdf } from './utils/pdf';
import { loadTaisDetails, type TaisDetailMap } from './utils/taisDetails';
import { loadOverrides, saveOverrides, type Overrides, type ExtraProduct } from './utils/overrides';
import { taisPhotoUrl, taisDetailUrl } from './utils/tais';
import { supabaseEnabled, saveCatalogToSupabase, loadCatalogFromSupabase } from './lib/supabase';
import type { CategoryId, Product } from './types';
import { CategorySection } from './components/CategorySection';
import { CatalogBook } from './components/CatalogBook';
import './App.css';

// ── 認証 ──────────────────────────────────────────────
type AuthMode = 'user' | 'admin';

const ADMIN_ID = 'laperac';
const ADMIN_PW = 'kam2026';
const USER_ID = 'carepal';
const USER_PW_KEY = 'carepal_user_pw';
const SAVED_CREDS_KEY = 'carepal_saved_creds';

function getUserPw(): string {
  return localStorage.getItem(USER_PW_KEY) ?? 'mak2026';
}

function getCredentials(): Record<string, AuthMode> {
  return {
    [`${USER_ID}:${getUserPw()}`]: 'user',
    [`${ADMIN_ID}:${ADMIN_PW}`]: 'admin',
  };
}

function LoginScreen({ onLogin }: { onLogin: (mode: AuthMode) => void }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED_CREDS_KEY) ?? 'null'); } catch { return null; } })();
  const [id, setId] = useState<string>(saved?.id ?? '');
  const [pw, setPw] = useState<string>(saved?.pw ?? '');
  const [remember, setRemember] = useState<boolean>(!!saved);
  const [error, setError] = useState('');

  const submit = () => {
    const mode = getCredentials()[`${id}:${pw}`];
    if (mode) {
      if (remember) {
        localStorage.setItem(SAVED_CREDS_KEY, JSON.stringify({ id, pw }));
      } else {
        localStorage.removeItem(SAVED_CREDS_KEY);
      }
      onLogin(mode);
      return;
    }
    setError('IDまたはパスワードが違います');
  };

  return (
    <div className="login">
      <div className="login__card">
        <img src="/logo-text.png" alt="ケアパル" className="login__logoimg" />
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
        <label className="login__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          ログイン情報を保存する
        </label>
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

// ── カタログ管理セクション ────────────────────────────
function CatalogManageSection({
  overrides, onOverride, allProducts,
}: {
  overrides: Overrides;
  onOverride: (u: (o: Overrides) => Overrides) => void;
  allProducts: Product[];
}) {
  const isLocked = !!(overrides.catalogProductIds && overrides.catalogProductIds.length > 0);
  const hiddenSet = new Set(overrides.hiddenProductIds ?? []);
  const extraProducts = overrides.extraProducts ?? [];

  // 追加フォーム
  const [addTais, setAddTais] = useState('');
  const [addName, setAddName] = useState('');
  const [addMaker, setAddMaker] = useState('');
  const [addCat, setAddCat] = useState<string>(CATEGORIES[0].id);
  const [addDesc, setAddDesc] = useState('');
  const [addMsg, setAddMsg] = useState('');

  // 削除画面
  const [showDelete, setShowDelete] = useState(false);
  const [deleteQuery, setDeleteQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);

  const lockCatalog = () => {
    const ids = allProducts
      .filter(p => !hiddenSet.has(p.id))
      .map(p => p.id);
    onOverride(o => ({ ...o, catalogProductIds: ids }));
  };

  const unlockCatalog = () => {
    onOverride(o => ({ ...o, catalogProductIds: undefined }));
  };

  const addProduct = () => {
    const tais = addTais.trim();
    const name = addName.trim();
    if (!tais || !name) { setAddMsg('TAISコードと商品名は必須です'); return; }
    const id = tais.replace('-', '') + '_extra_' + Date.now();
    const ep: ExtraProduct = { id, taisCode: tais, name, maker: addMaker.trim(), categoryId: addCat, description: addDesc.trim() || undefined };
    onOverride(o => ({ ...o, extraProducts: [...(o.extraProducts ?? []), ep] }));
    // カタログ確定済みの場合はIDも追加
    if (isLocked) {
      onOverride(o => ({ ...o, catalogProductIds: [...(o.catalogProductIds ?? []), id] }));
    }
    setAddTais(''); setAddName(''); setAddMaker(''); setAddDesc(''); setAddMsg('✅ 追加しました');
    setTimeout(() => setAddMsg(''), 2000);
  };

  const currentProducts = allProducts.filter(p => !hiddenSet.has(p.id));
  const filteredForDelete = currentProducts.filter(p =>
    !deleteQuery || p.name.includes(deleteQuery) || p.maker.includes(deleteQuery) || p.id.includes(deleteQuery)
  );

  const confirmDelete = () => {
    if (pendingDelete.length === 0) return;
    onOverride(o => ({
      ...o,
      hiddenProductIds: [...new Set([...(o.hiddenProductIds ?? []), ...pendingDelete])],
      catalogProductIds: o.catalogProductIds?.filter(id => !pendingDelete.includes(id)),
    }));
    setPendingDelete([]);
    setShowDelete(false);
  };

  if (showDelete) {
    return (
      <div>
        <button className="tb__btn" onClick={() => setShowDelete(false)} style={{ marginBottom: 8 }}>← 戻る</button>
        <p className="adminmodal__note">削除する商品を選んで「削除を確定」を押してください。</p>
        <input
          className="login__input" style={{ margin: '4px 0 8px', width: '100%', boxSizing: 'border-box' }}
          placeholder="商品名・メーカーで絞り込み"
          value={deleteQuery} onChange={e => setDeleteQuery(e.target.value)}
        />
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6 }}>
          {filteredForDelete.map(p => {
            const checked = pendingDelete.includes(p.id);
            return (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: checked ? '#ffeaea' : undefined }}>
                <input type="checkbox" checked={checked} onChange={e => {
                  setPendingDelete(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id));
                }} />
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{p.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#888' }}>{p.maker}</span>
              </label>
            );
          })}
          {filteredForDelete.length === 0 && <p style={{ padding: 12, color: '#aaa', fontSize: '0.85rem' }}>該当なし</p>}
        </div>
        {pendingDelete.length > 0 && (
          <button className="tb__btn" style={{ marginTop: 10, background: '#e05', color: '#fff', borderColor: '#e05' }} onClick={confirmDelete}>
            {pendingDelete.length}件を削除する
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ロック状態 */}
      <div style={{ padding: '8px 12px', borderRadius: 8, background: isLocked ? '#e3f6ea' : '#fff3cd', border: `1px solid ${isLocked ? '#2e9e5b' : '#ffc107'}` }}>
        <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '0.9rem' }}>
          {isLocked ? `🔒 カタログ確定済み（${overrides.catalogProductIds!.length}商品）` : '🔓 カタログ未確定（Excel連動中）'}
        </p>
        <p className="adminmodal__note" style={{ margin: '0 0 8px' }}>
          {isLocked
            ? 'Excelを更新しても商品の追加・削除は起こりません。在庫数のみ更新されます。'
            : 'Excelを更新すると商品リストが変わります。「確定する」を押すと固定されます。'}
        </p>
        {isLocked
          ? <button className="tb__btn" onClick={unlockCatalog}>🔓 ロックを解除する（Excel連動に戻す）</button>
          : <button className="tb__btn tb__btn--primary" onClick={lockCatalog}>🔒 現在の商品リストを確定する</button>
        }
      </div>

      {/* 商品削除 */}
      <button className="tb__btn" style={{ background: '#ffeaea', borderColor: '#e05', color: '#c00' }} onClick={() => setShowDelete(true)}>
        🗑 商品をカタログから削除する
      </button>

      {/* TAISコードで追加 */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.9rem' }}>➕ TAISコードで商品を追加</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="login__input" style={{ margin: 0, flex: 1 }} placeholder="TAISコード (例: 00054-000132)" value={addTais}
              onChange={e => setAddTais(e.target.value)} />
            {addTais.includes('-') && (
              <a href={taisDetailUrl(addTais)} target="_blank" rel="noopener noreferrer" className="tb__btn" style={{ fontSize: '0.75rem', textDecoration: 'none' }}>TAIS参照</a>
            )}
          </div>
          <input className="login__input" style={{ margin: 0 }} placeholder="商品名（必須）" value={addName} onChange={e => setAddName(e.target.value)} />
          <input className="login__input" style={{ margin: 0 }} placeholder="メーカー名" value={addMaker} onChange={e => setAddMaker(e.target.value)} />
          <select style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', fontSize: '0.92rem' }}
            value={addCat} onChange={e => setAddCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <textarea className="login__input" style={{ margin: 0, minHeight: 60, resize: 'vertical' }} placeholder="説明（任意）" value={addDesc} onChange={e => setAddDesc(e.target.value)} />
          {addTais.includes('-') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={taisPhotoUrl(addTais)} alt="" style={{ width: 60, height: 60, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 4 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="adminmodal__note">TAIS登録写真（自動取得）</span>
            </div>
          )}
          <button className="tb__btn tb__btn--primary" onClick={addProduct}>追加する</button>
          {addMsg && <p style={{ margin: 0, color: addMsg.startsWith('✅') ? '#2e9e5b' : '#e05', fontSize: '0.85rem' }}>{addMsg}</p>}
        </div>
      </div>

      {/* 追加済み手動商品一覧 */}
      {extraProducts.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#555' }}>手動追加済み: {extraProducts.length}件</p>
          {extraProducts.map(ep => (
            <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ flex: 1, fontSize: '0.82rem' }}>{ep.name}</span>
              <button className="tb__btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#e05', borderColor: '#e05' }}
                onClick={() => onOverride(o => ({ ...o, extraProducts: (o.extraProducts ?? []).filter(x => x.id !== ep.id) }))}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 管理者設定モーダル ────────────────────────────────
function AdminModal({
  onClose, onExcelLoad, onSaveSupabase,
  saving, lastUpdated, overrides, onOverride, allProducts,
}: {
  onClose: () => void;
  onExcelLoad: (d: CatalogData) => void;
  onSaveSupabase: () => void;
  saving: boolean;
  lastUpdated: Date | null;
  overrides: Overrides;
  onOverride: (u: (o: Overrides) => Overrides) => void;
  allProducts: Product[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newUserPw, setNewUserPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [tab, setTab] = useState<'stock' | 'catalog' | 'settings'>('stock');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await parseCatalogExcel(f);
    onExcelLoad(data);
    onClose();
  };

  const saveUserPw = () => {
    if (!newUserPw.trim()) return;
    localStorage.setItem(USER_PW_KEY, newUserPw.trim());
    localStorage.removeItem(SAVED_CREDS_KEY);
    setNewUserPw('');
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  };

  return (
    <div className="adminmodal__overlay" onClick={onClose}>
      <div className="adminmodal" onClick={(e) => e.stopPropagation()}>
        <div className="adminmodal__head">
          <h3 className="adminmodal__title">⚙️ 管理者設定</h3>
          <button className="adminmodal__close" onClick={onClose}>✕</button>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {([['stock', '📊 在庫更新'], ['catalog', '📋 カタログ管理'], ['settings', '🔧 設定']] as const).map(([t, label]) => (
            <button key={t} className={`tb__btn ${tab === t ? 'tb__btn--active' : ''}`}
              style={{ flex: 1, fontSize: '0.78rem', padding: '4px 2px' }}
              onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {tab === 'stock' && (
          <>
            <section className="adminmodal__section">
              <h4>📊 在庫Excel更新</h4>
              {overrides.catalogProductIds ? (
                <p className="adminmodal__note">🔒 カタログ確定済み — Excelを更新すると<strong>在庫数のみ</strong>が更新されます。商品の追加・削除は起こりません。</p>
              ) : (
                <p className="adminmodal__note">⚠️ カタログ未確定 — Excelを更新すると商品リストが変わります。</p>
              )}
              {lastUpdated && (
                <p className="adminmodal__note">最終更新: {lastUpdated.toLocaleString('ja-JP')}</p>
              )}
              <button className="tb__btn tb__btn--primary" onClick={() => fileRef.current?.click()}>
                Excelファイルを選択してアップロード
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
            </section>
            {supabaseEnabled && (
              <section className="adminmodal__section">
                <h4>☁️ Supabase保存</h4>
                <p className="adminmodal__note">現在の在庫データをクラウドDBへ保存します。</p>
                <button className="tb__btn tb__btn--primary" onClick={onSaveSupabase} disabled={saving}>
                  {saving ? '⏳ 保存中…' : '☁ Supabaseへ保存'}
                </button>
              </section>
            )}
          </>
        )}

        {tab === 'catalog' && (
          <section className="adminmodal__section">
            <h4>📋 カタログ管理</h4>
            <CatalogManageSection overrides={overrides} onOverride={onOverride} allProducts={allProducts} />
          </section>
        )}

        {tab === 'settings' && (
          <>
            <section className="adminmodal__section">
              <h4>✏️ 編集モード</h4>
              <p className="adminmodal__note">編集モードはツールバー下部のボタンから操作してください。保存ボタンを押すまで変更は反映されません。</p>
            </section>
            <section className="adminmodal__section">
              <h4>🔑 利用者パスワード変更</h4>
              <p className="adminmodal__note">ID「carepal」のパスワードを変更します（このブラウザに保存）</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  className="login__input" style={{ margin: 0, flex: 1 }}
                  type="password" placeholder="新しいパスワード"
                  value={newUserPw} onChange={(e) => setNewUserPw(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveUserPw()}
                />
                <button className="tb__btn tb__btn--primary" onClick={saveUserPw} disabled={!newUserPw.trim()}>
                  {pwSaved ? '✅ 保存済' : '保存'}
                </button>
              </div>
            </section>
          </>
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
  const [navCategory] = useState<{ id: CategoryId; ts: number } | null>(null);
  const [navPage, setNavPage] = useState<{ page: number; ts: number } | null>(null);
  const [navSearch, setNavSearch] = useState<{ query: string; ts: number } | null>(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [pageInput, setPageInput] = useState('1');
  const [searchInput, setSearchInput] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const editSnapshotRef = useRef<Overrides | null>(null); // 編集開始時のスナップショット
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

  const jumpPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setPageInput(String(p));
    setNavPage({ page: p, ts: Date.now() });
  };
  const doSearch = () => {
    const q = searchInput.trim();
    if (!q) return;
    setNavSearch({ query: q, ts: Date.now() });
  };

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
      if (e.clientX < 80) {
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

  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;

  const handleOverride = (update: (o: Overrides) => Overrides) => {
    setOverrides((prev) => {
      const next = update(prev);
      if (!editModeRef.current) saveOverrides(next); // 編集モード外のみ即時保存
      return next;
    });
  };

  const enterEditMode = () => {
    editSnapshotRef.current = overrides; // 開始時スナップショット
    setEditMode(true);
  };

  const saveEdits = () => {
    saveOverrides(overrides);
    editSnapshotRef.current = overrides;
    setEditMode(false);
  };

  const discardEdits = () => {
    if (editSnapshotRef.current) {
      setOverrides(editSnapshotRef.current);
      saveOverrides(editSnapshotRef.current);
    }
    setEditMode(false);
  };

  const handleExcelLoad = (d: CatalogData) => {
    if (overrides.catalogProductIds && overrides.catalogProductIds.length > 0) {
      // カタログ確定済み: 在庫数のみ更新し商品リストは変えない
      setCatalog(prev => ({ ...prev, stock: d.stock, loadedAt: d.loadedAt }));
      setNotice(`🔒 在庫数を更新しました（商品リストは固定）`);
    } else {
      setCatalog(d);
      setNotice('');
    }
  };

  const { products: rawProducts, stock } = catalog;

  // カタログ確定・非表示フィルタリング + 手動追加商品を合成
  const products = useMemo<Product[]>(() => {
    const catalogIds = overrides.catalogProductIds;
    const hiddenSet = new Set(overrides.hiddenProductIds ?? []);
    let base: Product[];
    if (catalogIds && catalogIds.length > 0) {
      base = rawProducts.filter(p => catalogIds.includes(p.id) && !hiddenSet.has(p.id));
    } else {
      base = rawProducts.filter(p => !hiddenSet.has(p.id));
    }
    const extra: Product[] = (overrides.extraProducts ?? [])
      .filter(ep => !hiddenSet.has(ep.id))
      .map(ep => ({
        id: ep.id,
        name: ep.name,
        maker: ep.maker,
        categoryId: ep.categoryId as Product['categoryId'],
        taisCode: ep.taisCode,
        price: 0,
        description: ep.description ?? '',
        featured: false,
        tags: [ep.name],
      }));
    return [...base, ...extra];
  }, [rawProducts, overrides.catalogProductIds, overrides.hiddenProductIds, overrides.extraProducts]);

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

  const hasProducts = (id: CategoryId) => products.some(p => p.categoryId === id);

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
            navPage={navPage}
            navSearch={navSearch}
            onSearchResult={(msg) => setSearchMsg(msg)}
            editMode={editMode}
            overrides={overrides}
            onOverride={handleOverride}
            authMode={authMode}
            onPageChange={(spread, total) => { setCurrentSpread(spread); setTotalPages(total); setPageInput(String(spread * 2 + 1)); }}
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
        {/* ロゴ */}
        <div className="tb__logo">
          <img src="/logo-icon.png" alt="" className="tb__logo-icon" />
          <img src="/logo-text.png" alt="CAREPAL" className="tb__logo-text" />
        </div>

        <div className="tb__sep" />

        {/* 管理者設定(管理者のみ) */}
        {authMode === 'admin' && (
          <button className="tb__btn tb__btn--admin" onClick={() => setShowAdmin(true)}>⚙️ 管理者設定</button>
        )}

        {/* 編集モード状態表示 */}
        {editMode && <span className="tb__badge">✏️ 編集中（未保存）</span>}

        <div className="tb__sep" />

        {/* 一覧/ブック切り替え */}
        <button className="tb__btn" onClick={() => setView((v) => (v === 'book' ? 'list' : 'book'))}>
          {view === 'book' ? '📋 一覧' : '📖 ブック'}
        </button>

        {/* ページナビ(ブック表示時) */}
        {view === 'book' && (
          <>
            <div className="tb__sep" />
            <div className="tb__nav">
              <div className="tb__nav-arrows">
                <button className="tb__arrowbtn" title="最初のページ" onClick={() => jumpPage(1)}>|◀</button>
                <button className="tb__arrowbtn" title="前のページ" onClick={() => jumpPage(Math.max(1, parseInt(pageInput,10)-1))}>◀</button>
                <button className="tb__arrowbtn" title="次のページ" onClick={() => jumpPage(Math.min(totalPages, parseInt(pageInput,10)+1))}>▶</button>
                <button className="tb__arrowbtn" title="最後のページ" onClick={() => jumpPage(totalPages)}>▶|</button>
              </div>
              <div className="tb__nav-page">
                <input
                  className="tb__pageinput"
                  type="number" min={1} max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(pageInput, 10); if (!Number.isNaN(n)) jumpPage(n); } }}
                />
                <span className="tb__pagetotal">/ {totalPages}</span>
              </div>
            </div>
            <div className="tb__sep" />
            <div className="tb__search">
              <input
                className="tb__searchinput"
                placeholder="商品名・メーカーで検索"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setSearchMsg(''); }}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              />
              <button className="tb__btn" onClick={doSearch}>🔍</button>
              {searchMsg && <span className="tb__searchmsg">{searchMsg}</span>}
            </div>
          </>
        )}

        <div className="tb__sep" />

        {/* PDF */}
        <button className="tb__btn" onClick={() => setShowPdfModal(true)} disabled={exporting}>
          {exporting ? '⏳' : '🖨 PDF'}
        </button>

        {/* 編集モード切替(管理者のみ) */}
        {authMode === 'admin' && !editMode && (
          <button className="tb__btn" onClick={enterEditMode}>✏️ 編集モード</button>
        )}
        {editMode && (
          <>
            <button className="tb__btn tb__btn--primary" onClick={saveEdits}>💾 保存</button>
            <button className="tb__btn" style={{ color: '#c00', borderColor: '#e05' }} onClick={discardEdits}>↩ 破棄</button>
          </>
        )}

        {/* ログアウト */}
        <button className="tb__btn tb__btn--logout" onClick={() => setAuthMode(null)}>🚪</button>
      </div>

      {/* モーダル群 */}
      {showAdmin && (
        <AdminModal
          onClose={() => setShowAdmin(false)}
          onExcelLoad={handleExcelLoad}
          onSaveSupabase={handleSaveToSupabase}
          saving={saving}
          lastUpdated={catalog.loadedAt ?? null}
          overrides={overrides}
          onOverride={handleOverride}
          allProducts={products}
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
