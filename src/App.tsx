import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings, LayoutList, BookOpen, Search, Printer, Pencil, Save, Undo2, LogOut,
  Lock, Unlock, Trash2, Plus, Cloud, Loader2, X, ChevronFirst, ChevronLast,
  ChevronLeft, ChevronRight, BarChart2, ClipboardList, Wrench, SlidersHorizontal,
  Bot, LayoutDashboard, HelpCircle, Building2, FileText, RotateCcw,
  Download, Upload,
} from 'lucide-react';
import { CATEGORIES } from './data/categories';
import { PRODUCTS } from './data/products';
import { DEMO_STOCK } from './data/demoStock';
import { loadDefaultCatalog, loadDefaultRates, parseCatalogExcel, parseRateExcel, type CatalogData } from './utils/inventory';
import { fileToDataUrl } from './utils/coverUpload';
import { exportCatalogPdf } from './utils/pdf';
import { loadTaisDetails, type TaisDetailMap } from './utils/taisDetails';
import { loadOverrides, saveOverrides, mergeOverrides, isEmptyOverrides, type Overrides, type ExtraProduct } from './utils/overrides';
import { taisPhotoUrl, taisDetailUrl } from './utils/tais';
import { suggestAlternatives } from './utils/alternatives';
import { supabaseEnabled, saveCatalogToSupabase, loadCatalogFromSupabase, loadCatalogProducts, saveSetting, loadSetting, loadAllSettings, listOverrideBackups } from './lib/supabase';
import type { CategoryId, OfficeRateMap, Product } from './types';
import { CategorySection } from './components/CategorySection';
import { CatalogBook } from './components/CatalogBook';
import { PressureUlcerChart } from './components/PressureUlcerChart';
import { AiSelector } from './components/AiSelector';
import { Dashboard } from './components/Dashboard';
import { HelpView } from './components/HelpView';
import './App.css';

// ── 認証 ──────────────────────────────────────────────
type AuthMode = 'user' | 'admin';

const ADMIN_ID = 'laperac';
const ADMIN_PW = 'kam2026';
const USER_ID = 'carepal';
const USER_PW_KEY = 'carepal_user_pw';
const SAVED_CREDS_KEY = 'carepal_saved_creds';
const OFFICE_RATES_KEY = 'carepal_office_rates';

function loadStoredRates(): OfficeRateMap {
  try { return JSON.parse(localStorage.getItem(OFFICE_RATES_KEY) ?? '{}') as OfficeRateMap; } catch { return {}; }
}
function saveStoredRates(rates: OfficeRateMap) {
  localStorage.setItem(OFFICE_RATES_KEY, JSON.stringify(rates));
}

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
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            className="login__input" placeholder="ログインID" value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            className="login__input" type="password" placeholder="パスワード" value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {error && <p className="login__error">{error}</p>}
          <label className="login__remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            ログイン情報を保存する
          </label>
          <button type="submit" className="login__btn">ログイン</button>
        </form>
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
        <h3 className="pdfmodal__title"><FileText size={16} style={{verticalAlign:'middle',marginRight:6}}/>PDFダウンロード</h3>
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
          {isLocked ? <><Lock size={14} style={{verticalAlign:'middle',marginRight:4}}/>カタログ確定済み（{overrides.catalogProductIds!.length}商品）</> : <><Unlock size={14} style={{verticalAlign:'middle',marginRight:4}}/>カタログ未確定（Excel連動中）</>}
        </p>
        <p className="adminmodal__note" style={{ margin: '0 0 8px' }}>
          {isLocked
            ? 'Excelを更新しても商品の追加・削除は起こりません。在庫数のみ更新されます。'
            : 'Excelを更新すると商品リストが変わります。「確定する」を押すと固定されます。'}
        </p>
        {isLocked
          ? <button className="tb__btn" onClick={unlockCatalog}><Unlock size={14} style={{verticalAlign:'middle',marginRight:4}}/>ロックを解除する（Excel連動に戻す）</button>
          : <button className="tb__btn tb__btn--primary" onClick={lockCatalog}><Lock size={14} style={{verticalAlign:'middle',marginRight:4}}/>現在の商品リストを確定する</button>
        }
      </div>

      {/* 商品削除 */}
      <button className="tb__btn" style={{ background: '#ffeaea', borderColor: '#e05', color: '#c00' }} onClick={() => setShowDelete(true)}>
        <Trash2 size={14} style={{verticalAlign:'middle',marginRight:4}}/>商品をカタログから削除する
      </button>

      {/* TAISコードで追加 */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.9rem' }}><Plus size={14} style={{verticalAlign:'middle',marginRight:4}}/>TAISコードで商品を追加</p>
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

// ── リセット確認ボタン ────────────────────────────────
function ResetConfirmButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'running'>('idle');
  if (step === 'idle') {
    return (
      <button className="tb__btn" style={{ background: '#ffeaea', borderColor: '#e05', color: '#c00' }}
        onClick={() => setStep('confirm')}>
        ⚠️ 初期設定に戻す
      </button>
    );
  }
  if (step === 'confirm') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#c00' }}>本当にすべてリセットしますか？</span>
        <button className="tb__btn" style={{ background: '#e05', color: '#fff', borderColor: '#e05' }}
          onClick={async () => { setStep('running'); await onConfirm(); }}>
          はい、リセットする
        </button>
        <button className="tb__btn" onClick={() => setStep('idle')}>キャンセル</button>
      </div>
    );
  }
  return <p style={{ fontSize: '0.85rem', color: '#888' }}>リセット中…</p>;
}

// ── クラウド日次バックアップ一覧・復元 ──────────────────
function CloudBackupSection({
  onOverride, onClose,
}: {
  onOverride: (u: (o: Overrides) => Overrides) => void;
  onClose: () => void;
}) {
  const [backups, setBackups] = useState<{ day: string; updatedAt: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      setBackups(await listOverrideBackups());
    } finally {
      setLoading(false);
    }
  };

  const restore = async (day: string) => {
    if (!confirm(`${day} 時点のクラウドバックアップに復元します。現在の編集内容は上書きされます。よろしいですか？`)) return;
    setRestoring(day);
    try {
      const data = await loadSetting<Overrides>(`overrides_backup_${day}`);
      if (!data) {
        alert('バックアップの読み込みに失敗しました。');
        return;
      }
      onOverride(() => ({ ...data, _savedAt: Date.now() }));
      alert(`${day} 時点のバックアップに復元しました。`);
      onClose();
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section className="adminmodal__section">
      <h4><Cloud size={14} style={{verticalAlign:'middle',marginRight:4}}/>クラウド日次バックアップ</h4>
      <p className="adminmodal__note">保存するたびにクラウド側へ日付ごとの復元ポイントが自動で残ります。誤って上書きした場合はここから過去の状態に戻せます。</p>
      <button className="tb__btn tb__btn--primary" onClick={loadList} disabled={loading}>
        {loading ? <><Loader2 size={13} style={{verticalAlign:'middle',marginRight:3}}/>読み込み中…</> : '一覧を表示'}
      </button>
      {backups !== null && (
        backups.length === 0 ? (
          <p className="adminmodal__note" style={{ marginTop: 8 }}>クラウドバックアップはまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {backups.map((b) => (
              <li key={b.day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.82rem' }}>{b.day}</span>
                <button className="tb__btn" style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  onClick={() => void restore(b.day)} disabled={restoring !== null}>
                  {restoring === b.day ? <Loader2 size={13} style={{verticalAlign:'middle'}}/> : 'この日に復元'}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

// ── 管理者設定モーダル ────────────────────────────────
function AdminModal({
  onClose, onExcelLoad, onInitialExcelLoad, onRateLoad, onSaveSupabase, onReloadFromSupabase,
  saving, lastUpdated, overrides, onOverride, allProducts,
}: {
  onClose: () => void;
  onExcelLoad: (d: CatalogData) => void;
  onInitialExcelLoad: (d: CatalogData) => void;
  onRateLoad: (rates: OfficeRateMap) => void;
  onSaveSupabase: () => void;
  onReloadFromSupabase: () => Promise<void>;
  saving: boolean;
  lastUpdated: Date | null;
  overrides: Overrides;
  onOverride: (u: (o: Overrides) => Overrides) => void;
  allProducts: Product[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rateFileRef = useRef<HTMLInputElement>(null);
  const initFileRef = useRef<HTMLInputElement>(null);
  const [newUserPw, setNewUserPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [tab, setTab] = useState<'stock' | 'catalog' | 'cover' | 'settings'>('stock');
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [backCoverUploading, setBackCoverUploading] = useState(false);
  const backCoverFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await parseCatalogExcel(f);
    onExcelLoad(data);
    onClose();
  };

  const handleInitFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await parseCatalogExcel(f);
    onInitialExcelLoad(data);
    onClose();
  };

  const handleRateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rates = await parseRateExcel(f);
    onRateLoad(rates);
    onClose();
  };

  const saveUserPw = () => {
    if (!newUserPw.trim()) return;
    const pw = newUserPw.trim();
    localStorage.setItem(USER_PW_KEY, pw);
    localStorage.removeItem(SAVED_CREDS_KEY);
    // Supabaseにも同期して他端末から使えるようにする
    if (supabaseEnabled) void saveSetting('user_pw', pw);
    setNewUserPw('');
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  };

  return (
    <div className="adminmodal__overlay" onClick={onClose}>
      <div className="adminmodal" onClick={(e) => e.stopPropagation()}>
        <div className="adminmodal__head">
          <h3 className="adminmodal__title"><Settings size={16} style={{verticalAlign:'middle',marginRight:6}}/>管理者設定</h3>
          <button className="adminmodal__close" onClick={onClose}><X size={16}/></button>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {([['stock', <><BarChart2 size={13} style={{verticalAlign:'middle',marginRight:3}}/>在庫更新</>], ['catalog', <><ClipboardList size={13} style={{verticalAlign:'middle',marginRight:3}}/>カタログ管理</>], ['cover', <>表紙</>], ['settings', <><Wrench size={13} style={{verticalAlign:'middle',marginRight:3}}/>設定</>]] as const).map(([t, label]) => (
            <button key={t} className={`tb__btn ${tab === t ? 'tb__btn--active' : ''}`}
              style={{ flex: 1, fontSize: '0.78rem', padding: '4px 2px' }}
              onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {tab === 'stock' && (
          <>
            <section className="adminmodal__section">
              <h4><BarChart2 size={14} style={{verticalAlign:'middle',marginRight:4}}/>在庫Excel更新</h4>
              {overrides.catalogProductIds ? (
                <p className="adminmodal__note"><Lock size={12} style={{verticalAlign:'middle',marginRight:3}}/>カタログ確定済み — Excelを更新すると<strong>在庫数のみ</strong>が更新されます。商品の追加・削除は起こりません。</p>
              ) : (
                <p className="adminmodal__note">カタログ未確定 — Excelを更新すると商品リストが変わります。</p>
              )}
              {lastUpdated && (
                <p className="adminmodal__note">最終更新: {lastUpdated.toLocaleString('ja-JP')}</p>
              )}
              <button className="tb__btn tb__btn--primary" onClick={() => fileRef.current?.click()}>
                Excelファイルを選択してアップロード
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
            </section>
            <section className="adminmodal__section">
              <h4>単位数Excel更新</h4>
              <p className="adminmodal__note">列構成: A=TAISコード／B=品目／C=商品名／D=単位数／F=事業所名</p>
              <button className="tb__btn tb__btn--primary" onClick={() => rateFileRef.current?.click()}>
                単位数Excelを選択してアップロード
              </button>
              <input ref={rateFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleRateFile} />
            </section>
            {supabaseEnabled && (
              <section className="adminmodal__section">
                <h4><Cloud size={14} style={{verticalAlign:'middle',marginRight:4}}/>Supabase保存</h4>
                <p className="adminmodal__note">現在の在庫データをクラウドDBへ保存します。</p>
                <button className="tb__btn tb__btn--primary" onClick={onSaveSupabase} disabled={saving}>
                  {saving ? <><Loader2 size={13} style={{verticalAlign:'middle',marginRight:3}}/>保存中…</> : <><Cloud size={13} style={{verticalAlign:'middle',marginRight:3}}/>Supabaseへ保存</>}
                </button>
              </section>
            )}
          </>
        )}

        {tab === 'catalog' && (
          <section className="adminmodal__section">
            <h4><ClipboardList size={14} style={{verticalAlign:'middle',marginRight:4}}/>カタログ管理</h4>
            <CatalogManageSection overrides={overrides} onOverride={onOverride} allProducts={allProducts} />
          </section>
        )}

        {tab === 'cover' && (
          <section className="adminmodal__section">
            <h4>表紙のアップロード</h4>
            <p className="adminmodal__note">画像（PNG・JPG）またはPDF（1ページ目を使用）をアップロードしてください。</p>
            {overrides.coverImage && (
              <div className="cover-preview">
                <img src={overrides.coverImage} alt="表紙プレビュー" className="cover-preview__img" />
              </div>
            )}
            <button
              className="tb__btn tb__btn--primary"
              onClick={() => coverFileRef.current?.click()}
              disabled={coverUploading}
            >
              {coverUploading ? <><Loader2 size={13} style={{verticalAlign:'middle',marginRight:4}}/>変換中...</> : '表紙ファイルを選択'}
            </button>
            <input
              ref={coverFileRef} type="file" accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setCoverUploading(true);
                try {
                  const dataUrl = await fileToDataUrl(f);
                  onOverride(o => ({ ...o, coverImage: dataUrl }));
                } finally {
                  setCoverUploading(false);
                }
              }}
            />
            {overrides.coverImage && (
              <button
                className="tb__btn"
                style={{ color: '#e05', borderColor: '#e05', marginTop: 8 }}
                onClick={() => onOverride(o => ({ ...o, coverImage: undefined }))}
              >
                表紙を削除
              </button>
            )}

            <hr style={{ margin: '16px 0', borderColor: '#e0e0e0' }} />
            <h4>裏表紙のアップロード</h4>
            <p className="adminmodal__note">画像（PNG・JPG）またはPDF（1ページ目を使用）をアップロードしてください。</p>
            {overrides.backCoverImage && (
              <div className="cover-preview">
                <img src={overrides.backCoverImage} alt="裏表紙プレビュー" className="cover-preview__img" />
              </div>
            )}
            <button
              className="tb__btn tb__btn--primary"
              onClick={() => backCoverFileRef.current?.click()}
              disabled={backCoverUploading}
            >
              {backCoverUploading ? <><Loader2 size={13} style={{verticalAlign:'middle',marginRight:4}}/>変換中...</> : '裏表紙ファイルを選択'}
            </button>
            <input
              ref={backCoverFileRef} type="file" accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBackCoverUploading(true);
                try {
                  const dataUrl = await fileToDataUrl(f);
                  onOverride(o => ({ ...o, backCoverImage: dataUrl }));
                } finally {
                  setBackCoverUploading(false);
                }
              }}
            />
            {overrides.backCoverImage && (
              <button
                className="tb__btn"
                style={{ color: '#e05', borderColor: '#e05', marginTop: 8 }}
                onClick={() => onOverride(o => ({ ...o, backCoverImage: undefined }))}
              >
                裏表紙を削除
              </button>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <>
            <section className="adminmodal__section">
              <h4><ClipboardList size={14} style={{verticalAlign:'middle',marginRight:4}}/>初期商品設定のアップロード</h4>
              <p className="adminmodal__note">ExcelをアップロードするとそのExcelに載っている商品だけが表示されます。在庫数も同時に反映されます。</p>
              <button className="tb__btn tb__btn--primary" onClick={() => initFileRef.current?.click()}>
                Excelをアップロードして商品を設定
              </button>
              <input ref={initFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleInitFile} />
            </section>
            <section className="adminmodal__section">
              <h4><RotateCcw size={14} style={{verticalAlign:'middle',marginRight:4}}/>初期商品設定に戻す</h4>
              <p className="adminmodal__note">Excelアップロード時の商品リストに戻します。カタログ確定・非表示設定・手動追加商品がリセットされます。ガイド・レイアウト・画像などの設定は保持されます。</p>
              <ResetConfirmButton
                onConfirm={async () => {
                  onOverride(o => ({
                    ...o,
                    catalogProductIds: undefined,
                    extraProducts: [],
                    hiddenProductIds: [],
                  }));
                  await onReloadFromSupabase();
                  onClose();
                }}
              />
            </section>
            <section className="adminmodal__section">
              <h4><Cloud size={14} style={{verticalAlign:'middle',marginRight:4}}/>在庫を今すぐ再読み込み</h4>
              <p className="adminmodal__note">Supabaseから最新の在庫データを強制取得します。</p>
              <button className="tb__btn tb__btn--primary" onClick={async () => { await onReloadFromSupabase(); onClose(); }}>
                <Cloud size={13} style={{verticalAlign:'middle',marginRight:3}}/>クラウドから在庫再読み込み
              </button>
            </section>
            <section className="adminmodal__section">
              <h4><Download size={14} style={{verticalAlign:'middle',marginRight:4}}/>バックアップ</h4>
              <p className="adminmodal__note">カタログの全編集内容（レイアウト・画像・ガイド・設定）をJSONファイルとして保存/復元できます。Cookie削除やPC変更に備えて定期的にダウンロードしてください。</p>
              <button className="tb__btn tb__btn--primary" onClick={() => {
                const data = JSON.stringify(overrides, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const d = new Date();
                a.download = `carepal-backup-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}>
                <Download size={13} style={{verticalAlign:'middle',marginRight:3}}/>バックアップをダウンロード
              </button>
              <button className="tb__btn" style={{ marginTop: 8 }} onClick={() => backupFileRef.current?.click()}>
                <Upload size={13} style={{verticalAlign:'middle',marginRight:3}}/>バックアップから復元
              </button>
              <input ref={backupFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const parsed = JSON.parse(await f.text()) as Overrides;
                    if (typeof parsed !== 'object' || parsed === null || typeof parsed.products !== 'object') {
                      alert('バックアップファイルの形式が正しくありません。');
                      return;
                    }
                    if (!confirm('現在の編集内容をバックアップファイルの内容で置き換えます。よろしいですか？')) return;
                    onOverride(() => ({ ...parsed, _savedAt: Date.now() }));
                    alert('復元しました。');
                    onClose();
                  } catch {
                    alert('ファイルの読み込みに失敗しました。');
                  } finally {
                    e.target.value = '';
                  }
                }} />
            </section>
            {supabaseEnabled && <CloudBackupSection onOverride={onOverride} onClose={onClose} />}
            <section className="adminmodal__section">
              <h4><Pencil size={14} style={{verticalAlign:'middle',marginRight:4}}/>編集モード</h4>
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

// ── 事業所選択画面 ────────────────────────────────────
function OfficeSelectScreen({ officeRates, onSelect }: {
  officeRates: OfficeRateMap;
  onSelect: (office: string | null) => void;
}) {
  const offices = Object.keys(officeRates).sort();
  return (
    <div className="login">
      <div className="login__card">
        <img src="/logo-text.png" alt="ケアパル" className="login__logoimg" />
        <p className="login__sub">事業所を選択してください</p>
        {offices.length > 0 ? (
          <div className="office-list">
            {offices.map((office) => (
              <button key={office} className="office-btn" onClick={() => onSelect(office)}>
                {office}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 12px' }}>
            単位数データがありません。<br/>管理者設定からExcelをアップロードしてください。
          </p>
        )}
        <button className="login__btn" style={{ marginTop: 12, background: '#aaa' }} onClick={() => onSelect(null)}>
          スキップ（単位数を表示しない）
        </button>
      </div>
    </div>
  );
}

// ── フィルターパネル ──────────────────────────────────
interface FilterState {
  unitMin: string;
  unitMax: string;
  categories: Set<string>;
  makers: Set<string>;
  inStockOnly: boolean;
}

function FilterPanel({
  open, onClose, filter, onChange,
  allCategories, allMakers, unitRange,
}: {
  open: boolean; onClose: () => void;
  filter: FilterState;
  onChange: (f: FilterState) => void;
  allCategories: { id: string; name: string }[];
  allMakers: string[];
  unitRange: [number, number] | null;
}) {
  const [makerSearch, setMakerSearch] = useState('');

  const toggle = <T extends string>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  };

  const activeCount = [
    filter.unitMin || filter.unitMax,
    filter.categories.size > 0,
    filter.makers.size > 0,
    filter.inStockOnly,
  ].filter(Boolean).length;

  const reset = () => onChange({ unitMin: '', unitMax: '', categories: new Set(), makers: new Set(), inStockOnly: false });

  if (!open) return null;

  return (
    <div className="filter-overlay" onClick={onClose}>
      <div className="filter-panel" onClick={e => e.stopPropagation()}>
        <div className="filter-panel__head">
          <span className="filter-panel__title">絞り込み{activeCount > 0 ? ` (${activeCount})` : ''}</span>
          <button className="filter-panel__reset" onClick={reset}>リセット</button>
          <button className="filter-panel__close" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="filter-panel__body">
        {unitRange && (
          <section className="filter-section">
            <h4 className="filter-section__title">単位数</h4>
            <div className="filter-unit-range">
              <input
                className="filter-unit-input" type="number" placeholder={String(unitRange[0])}
                value={filter.unitMin}
                onChange={e => onChange({ ...filter, unitMin: e.target.value })}
              />
              <span className="filter-unit-sep">〜</span>
              <input
                className="filter-unit-input" type="number" placeholder={String(unitRange[1])}
                value={filter.unitMax}
                onChange={e => onChange({ ...filter, unitMax: e.target.value })}
              />
              <span className="filter-unit-label">単位</span>
            </div>
          </section>
        )}

        <section className="filter-section">
          <h4 className="filter-section__title">品目</h4>
          <div className="filter-checks">
            {allCategories.map(c => (
              <label key={c.id} className="filter-check">
                <input type="checkbox" checked={filter.categories.has(c.id)}
                  onChange={() => onChange({ ...filter, categories: toggle(filter.categories, c.id) })} />
                {c.name}
              </label>
            ))}
          </div>
        </section>

        <section className="filter-section">
          <h4 className="filter-section__title">
            メーカー名
            {filter.makers.size > 0 && <span className="filter-section__count">{filter.makers.size}件選択中</span>}
          </h4>
          <input
            className="filter-maker-search"
            placeholder="メーカー名を検索..."
            value={makerSearch}
            onChange={e => setMakerSearch(e.target.value)}
          />
          <div className="filter-checks filter-checks--scroll">
            {allMakers.filter(m => m.toLowerCase().includes(makerSearch.toLowerCase())).map(m => (
              <label key={m} className="filter-check">
                <input type="checkbox" checked={filter.makers.has(m)}
                  onChange={() => onChange({ ...filter, makers: toggle(filter.makers, m) })} />
                {m}
              </label>
            ))}
          </div>
          {filter.makers.size > 0 && (
            <button className="filter-maker-clear" onClick={() => onChange({ ...filter, makers: new Set() })}>
              選択をクリア
            </button>
          )}
        </section>

        <section className="filter-section">
          <h4 className="filter-section__title">在庫</h4>
          <label className="filter-check">
            <input type="checkbox" checked={filter.inStockOnly}
              onChange={e => onChange({ ...filter, inStockOnly: e.target.checked })} />
            在庫あり商品のみ
          </label>
        </section>
        </div>
      </div>
    </div>
  );
}

// ── メインアプリ ──────────────────────────────────────
export default function App() {
  const [appReady, setAppReady] = useState(false); // Supabaseからパスワード取得完了後にtrue
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [selectedOffice, setSelectedOffice] = useState<string | null | undefined>(undefined);
  const [officeRateMap, setOfficeRateMap] = useState<OfficeRateMap>(() => loadStoredRates());
  const [showFilter, setShowFilter] = useState(false);
  const [showPuChart, setShowPuChart] = useState(false);
  const [showAiSelector, setShowAiSelector] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobDetailProduct, setMobDetailProduct] = useState<import('./types').Product | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [filter, setFilter] = useState<FilterState>({ unitMin: '', unitMax: '', categories: new Set(), makers: new Set(), inStockOnly: false });
  const [catalog, setCatalog] = useState<CatalogData>({ products: PRODUCTS, stock: DEMO_STOCK });
  const [details, setDetails] = useState<TaisDetailMap>({});
  const [view, setView] = useState<'book' | 'list' | 'help'>('book');
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
  const supabaseCatalogLoaded = useRef(false); // Supabase読込済みフラグ（ローカルExcel上書き防止）
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [cloudDown, setCloudDown] = useState(false); // Supabase接続不可フラグ

  // ─── 起動時のクラウド読込 ──────────────────────────────
  // ログイン画面の表示は「利用者パスワード」1件の取得だけを待つ(軽量・高速)。
  // overrides(画像を含み数MBになりうる)やカタログは、ログイン画面をブロックせず
  // バックグラウンドで気長に読み込む。タイムアウトでの早期失敗判定はしない —
  // 「遅い」は「未接続」ではない。実際にリクエストが失敗した場合のみ警告を出す。
  useEffect(() => {
    void (async () => {
      if (supabaseEnabled) {
        try {
          const pw = await loadSetting<string>('user_pw');
          if (pw) localStorage.setItem(USER_PW_KEY, pw);
        } catch { /* パスワード取得失敗時はローカル保存済みの値 or 既定値を使う */ }
      }

      // Supabaseがない or ローカルに単位数データが無ければローカルデータで補完
      if (Object.keys(loadStoredRates()).length === 0) {
        const rates = await loadDefaultRates();
        if (rates) { saveStoredRates(rates); setOfficeRateMap(rates); }
      }

      setAppReady(true); // パスワード取得完了でログイン画面を即表示

      if (supabaseEnabled) {
        try {
          // 全設定を一括取得(overridesに画像が含まれ数MBになることがあり、数十秒かかる場合がある)
          const allSettings = await loadAllSettings();
          if (allSettings === null) throw new Error('supabase unreachable');

          // AI キー
          if (allSettings?.ai_key) localStorage.setItem('carepal-ai-key', allSettings.ai_key as string);

          // office_rates（事業所選択画面で使う）
          if (allSettings?.office_rates) {
            const rates = allSettings.office_rates as OfficeRateMap;
            saveStoredRates(rates);
            setOfficeRateMap(rates);
          }

          // 前回選択した事業所を復元（スキップした場合は null）
          if (allSettings?.selected_office !== undefined) {
            setSelectedOffice(allSettings.selected_office as string | null);
          }

          // overrides: タイムスタンプ比較でローカルとリモートの新しい方を採用
          if (allSettings?.overrides) {
            const remote = allSettings.overrides as Overrides;
            const local = loadOverrides();
            const { winner, source } = mergeOverrides(local, remote);
            setOverrides(winner);
            saveOverrides(winner);
            // ローカルが新しければリモートにも書き戻す
            if (source === 'local' && supabaseEnabled) {
              void saveSetting('overrides', winner);
            }
          }

          // カタログはさらにバックグラウンドでロード
          const stockDetail = allSettings?.stock_detail ?? null;
          const loadedAt = allSettings?.catalog_loaded_at ?? null;
          void loadCatalogProducts(
            stockDetail as import('./types').StockDetailMap | null,
            loadedAt as string | null,
          ).then((fromDb) => {
            if (fromDb) {
              supabaseCatalogLoaded.current = true;
              setCatalog(fromDb);
              setNotice(`☁ Supabaseから${fromDb.products.length}商品を読み込みました`);
            }
          }).catch(() => {});

        } catch {
          // 実際に取得に失敗した場合のみ警告（低速なだけでは発火しない）
          setCloudDown(true);
          setNotice('⚠ クラウド(Supabase)に接続できません。保存はこの端末のみに残ります。管理者はSupabaseプロジェクトの状態を確認してください。');
        }
      }
    })();
    void loadTaisDetails().then(setDetails);
  }, []);

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

  // ローカルExcelのフォールバック読み込み（Supabaseにデータがない場合のみ）
  useEffect(() => {
    void (async () => {
      if (catalog.products === PRODUCTS) {
        // Supabaseから読み込まれていない場合のみローカルExcelを試みる
        const fromXlsx = await loadDefaultCatalog();
        if (fromXlsx && fromXlsx.products.length > 0 && !supabaseCatalogLoaded.current) {
          setCatalog(fromXlsx);
          setNotice(`在庫Excelから${fromXlsx.products.length}商品を読み込みました`);
        }
      }
    })();
  }, []);

  // モバイル検出
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // モバイル時はリスト表示を強制
  useEffect(() => {
    if (isMobile) setView(v => v === 'help' ? 'help' : 'list');
  }, [isMobile]);

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

  // ブラウザが突然閉じた場合でも最新のoverridesをlocalStorageに保存
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  useEffect(() => {
    const onBeforeUnload = () => {
      saveOverrides(overridesRef.current);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // クラウドから最新データを手動再読込（モバイル用）
  const reloadFromCloud = async () => {
    if (!supabaseEnabled) return;
    setSyncStatus('syncing');
    try {
      const allSettings = await loadAllSettings();
      if (allSettings?.office_rates) {
        const rates = allSettings.office_rates as OfficeRateMap;
        saveStoredRates(rates);
        setOfficeRateMap(rates);
      }
      if (allSettings?.ai_key) localStorage.setItem('carepal-ai-key', allSettings.ai_key as string);
      if (allSettings?.overrides) {
        const remote = allSettings.overrides as Overrides;
        const local = loadOverrides();
        const { winner } = mergeOverrides(local, remote);
        setOverrides(winner);
        saveOverrides(winner);
      }
      const fromDb = await loadCatalogFromSupabase();
      if (fromDb) setCatalog(fromDb);
      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
    }
  };

  const syncOverridesToCloud = (next: Overrides) => {
    if (!supabaseEnabled) return;
    // 空データはクラウドへ同期しない（Cookie削除直後の端末がクラウドを空で上書きする事故防止）
    if (isEmptyOverrides(next)) return;
    clearTimeout(syncTimer.current);
    setSyncStatus('syncing');
    // 即時同期（debounceなし）でSupabaseに保存（最新タイムスタンプを必ず付ける）
    void saveSetting('overrides', { ...next, _savedAt: Date.now() })
      .then(() => { setSyncStatus('done'); setTimeout(() => setSyncStatus('idle'), 3000); })
      .catch(() => setSyncStatus('error'));
  };

  const handleOverride = (update: (o: Overrides) => Overrides) => {
    // overridesRef.current は最終レンダリング済み + 直前の handleOverride 呼出し結果を保持する。
    // React の functional updater はレンダリング時まで遅延されるため、
    // 同一イベントバッチ内で blur(save) → click(saveEdits) が連続した場合、
    // localStorage への書込みが saveEdits の loadOverrides() より後になりバグになる。
    // next を同期的に計算し、localStorage への書込みも同期的に行うことで修正する。
    const next = update(overridesRef.current);
    overridesRef.current = next; // 次の handleOverride 呼出しに備えて即時更新
    const ok = saveOverrides(next);
    if (!ok) {
      setTimeout(() => setNotice('⚠ ストレージ容量不足のため一部の変更を保存できませんでした。画像を削減してください。'), 0);
    }
    if (!editModeRef.current) {
      syncOverridesToCloud(next);
    }
    setOverrides(next);
  };

  const enterEditMode = () => {
    editSnapshotRef.current = overrides;
    setEditMode(true);
  };

  const saveEdits = () => {
    const latest = overridesRef.current;
    // localStorage に保存（失敗してもセッション内の編集は維持する）
    const localOk = saveOverrides(latest);
    // setOverrides は ref の値を使う（loadOverrides() は save 失敗時に古い値を返すため使わない）
    setOverrides(latest);
    editSnapshotRef.current = latest;
    setEditMode(false);
    // Supabase には必ず最新タイムスタンプを付けて同期する。
    // localStorage が容量超過で保存できなかった場合でも、リロード時に
    // mergeOverrides が Supabase 側を新しいと判定してデータを復元できる。
    const payload = { ...latest, _savedAt: Date.now() };
    setSyncStatus('syncing');
    void (async () => {
      // 空データでクラウドを上書きしない（誤消去防止。意図的な全消去はサポートに相談）
      const skipCloud = isEmptyOverrides(payload);
      const cloudOk = supabaseEnabled && !skipCloud ? await saveSetting('overrides', payload) : false;
      // 日次バックアップ（同日中は上書き）— 誤保存やデータ消失時の復元ポイントになる
      if (cloudOk) {
        const day = new Date().toISOString().slice(0, 10);
        void saveSetting(`overrides_backup_${day}`, payload);
      }
      setSyncStatus(cloudOk ? 'done' : 'error');
      setTimeout(() => setSyncStatus('idle'), 3000);
      // どこに保存できたかを明示（リロードで戻る原因の切り分け用）
      if (localOk && cloudOk) {
        setNotice('✅ 保存しました（ローカル✓ / クラウド✓）');
      } else if (localOk && !cloudOk) {
        setNotice('⚠ ローカルには保存できましたが、クラウド保存に失敗しました（この端末ではリロードしても残ります）');
      } else if (!localOk && cloudOk) {
        setNotice('⚠ ローカル保存に失敗（容量不足）。クラウドには保存できたのでリロードで復元されます');
      } else {
        setNotice('❌ 保存に失敗しました（ローカル✗ / クラウド✗）。画像が大きすぎる可能性があります');
      }
    })();
  };

  const discardEdits = () => {
    if (editSnapshotRef.current) {
      setOverrides(editSnapshotRef.current);
      saveOverrides(editSnapshotRef.current);
    }
    setEditMode(false);
  };

  // ── キーボードショートカット ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // contentEditable内やinput内では発火しない
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        if (editModeRef.current) saveEdits(); else enterEditMode();
      } else if (e.ctrlKey && e.key === 'o') {
        if (!editModeRef.current) return;
        e.preventDefault();
        saveEdits();
      } else if (e.key === 'Escape' && editModeRef.current && !isInput) {
        discardEdits();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInitialExcelLoad = (d: CatalogData) => {
    setCatalog(d);
    supabaseCatalogLoaded.current = true;
    const productIds = d.products.map(p => p.id);
    handleOverride(o => ({ ...o, catalogProductIds: productIds, hiddenProductIds: [], extraProducts: [] }));
    setNotice(`✅ ${d.products.length}商品を初期商品として設定しました`);
    if (supabaseEnabled) {
      setSyncStatus('syncing');
      void saveCatalogToSupabase(d)
        .then(() => setSyncStatus('done'))
        .catch(() => setSyncStatus('error'));
    }
  };

  const handleExcelLoad = (d: CatalogData) => {
    let next: CatalogData;
    if (overrides.catalogProductIds && overrides.catalogProductIds.length > 0) {
      next = { ...catalog, stock: d.stock, stockDetail: d.stockDetail, loadedAt: d.loadedAt };
      setCatalog(next);
      setNotice(`🔒 在庫数を更新しました（商品リストは固定）`);
    } else {
      next = d;
      setCatalog(d);
      setNotice('');
    }
    // Supabaseへ自動同期
    if (supabaseEnabled) {
      setSyncStatus('syncing');
      void saveCatalogToSupabase(next)
        .then(() => setSyncStatus('done'))
        .catch(() => setSyncStatus('error'));
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

  // ── フック類はすべてここで（条件returnより前） ──────
  const officeUnits = selectedOffice ? officeRateMap[selectedOffice] : undefined;

  const allMakers = useMemo(() => [...new Set(products.map(p => p.maker))].filter(m => m && m !== '—').sort(), [products]);
  const unitRange = useMemo<[number, number] | null>(() => {
    if (!officeUnits) return null;
    const vals = products.map(p => p.taisCode ? officeUnits[p.taisCode] : undefined).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return [Math.min(...vals), Math.max(...vals)];
  }, [products, officeUnits]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (filter.inStockOnly && (stock[p.id] ?? 0) <= 0) return false;
      if (filter.categories.size > 0 && !filter.categories.has(p.categoryId)) return false;
      if (filter.makers.size > 0 && !filter.makers.has(p.maker)) return false;
      if (officeUnits && (filter.unitMin || filter.unitMax)) {
        const u = p.taisCode ? officeUnits[p.taisCode] : undefined;
        if (u == null) return false;
        if (filter.unitMin && u < Number(filter.unitMin)) return false;
        if (filter.unitMax && u > Number(filter.unitMax)) return false;
      }
      return true;
    });
  }, [products, filter, stock, officeUnits]);

  const filterActiveCount = [
    filter.unitMin || filter.unitMax,
    filter.categories.size > 0,
    filter.makers.size > 0,
    filter.inStockOnly,
  ].filter(Boolean).length;

  // ── 条件return ──────────────────────────────────────
  if (!appReady) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1f3a6e 0%, #1a2a50 100%)' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <img src="/logo-icon.png" alt="" style={{ width: 64, marginBottom: 16, opacity: 0.9 }} />
        <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>読み込み中…</p>
      </div>
    </div>
  );
  if (!authMode) return <LoginScreen onLogin={(mode) => { setAuthMode(mode); setSelectedOffice(undefined); }} />;

  if (selectedOffice === undefined) {
    return <OfficeSelectScreen officeRates={officeRateMap} onSelect={(office) => {
      setSelectedOffice(office);
      // 選択した事業所をSupabaseに保存（次回は自動で復元）
      if (supabaseEnabled) void saveSetting('selected_office', office);
    }} />;
  }

  const hasProducts = (id: CategoryId) => filteredProducts.some(p => p.categoryId === id);

  const lastUpdatedStr = catalog.loadedAt
    ? catalog.loadedAt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' 更新'
    : '';

  return (
    <div className="app app--fullscreen">
      {/* ─── モバイルUI ─── */}
      {isMobile && (
        <>
          {/* モバイル上部ヘッダー */}
          <header className="mob-header">
            <img src="/logo-icon.png" alt="" className="mob-header__icon" />
            <div className="mob-header__search">
              <input
                className="mob-header__input"
                placeholder="商品名・メーカーで検索"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setNavSearch({ query: searchInput.trim(), ts: Date.now() }); } }}
              />
              <button className="mob-header__searchbtn" onClick={() => { if (searchInput.trim()) setNavSearch({ query: searchInput.trim(), ts: Date.now() }); }}>
                <Search size={16} />
              </button>
            </div>
            <button
              className={`mob-header__filter${filterActiveCount > 0 ? ' mob-header__filter--active' : ''}`}
              onClick={() => setShowFilter(true)}
            >
              <SlidersHorizontal size={18} />
              {filterActiveCount > 0 && <span className="mob-header__filter-badge">{filterActiveCount}</span>}
            </button>
            {authMode === 'admin' && (
              <button className="mob-header__settings" onClick={() => setShowAdmin(true)}>
                <Settings size={18} />
              </button>
            )}
          </header>

          {/* カテゴリーチップ */}
          <div className="mob-chips">
            <button
              className={`mob-chip${filter.categories.size === 0 ? ' mob-chip--active' : ''}`}
              onClick={() => setFilter(f => ({ ...f, categories: new Set() }))}
            >すべて</button>
            {CATEGORIES.filter(c => hasProducts(c.id)).map(c => (
              <button
                key={c.id}
                className={`mob-chip${filter.categories.has(c.id) ? ' mob-chip--active' : ''}`}
                onClick={() => setFilter(f => {
                  const next = new Set(f.categories);
                  next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                  return { ...f, categories: next };
                })}
              >{c.name}</button>
            ))}
          </div>
        </>
      )}

      {view === 'help' && (
        <main className="catalog catalog--list" style={{ maxWidth: 720, padding: '24px 16px' }}>
          <HelpView authMode={authMode ?? 'user'} />
        </main>
      )}

      <main className={view === 'book' ? 'catalog catalog--book' : `catalog catalog--list${isMobile ? ' catalog--mobile' : ''}`} ref={catalogRef} style={view === 'help' ? { display: 'none' } : {}}>
        {view === 'book' ? (
          <CatalogBook
            categories={CATEGORIES}
            products={filteredProducts}
            stock={stock}
            officeUnits={officeUnits}
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
              products={filteredProducts.filter((p) => p.categoryId === c.id)}
              stock={stock}
              officeUnits={officeUnits}
              isMobile={isMobile}
              onTapProduct={isMobile ? setMobDetailProduct : undefined}
            />
          ))
        )}
      </main>

      {/* 更新日時バー(Excel読込後のみ・非モバイル) */}
      {lastUpdatedStr && !isMobile && (
        <div className="update-bar">
          {lastUpdatedStr}{notice && ` ／ ${notice}`}
          {supabaseEnabled && syncStatus === 'syncing' && <span className="sync-badge sync-badge--syncing"> ☁ 同期中…</span>}
          {supabaseEnabled && syncStatus === 'done'    && <span className="sync-badge sync-badge--done"> ☁ 同期済</span>}
          {supabaseEnabled && syncStatus === 'error'   && <span className="sync-badge sync-badge--error"> ⚠ 同期失敗</span>}
        </div>
      )}

      {/* クラウド未接続の常時警告バナー */}
      {cloudDown && (
        <div className="cloud-down-banner">
          ⚠ クラウド未接続 — 変更はこの端末のブラウザ内にのみ保存されます。Cookie削除やブラウザ変更でデータが消えるため、管理者設定→設定タブから「バックアップをダウンロード」してください。
        </div>
      )}

      {/* モバイルボトムナビ */}
      {isMobile && (
        <nav className="mob-nav">
          <button className="mob-nav__btn mob-nav__btn--ai" onClick={() => setShowAiSelector(true)}>
            <span className="mob-nav__icon"><Bot size={20}/></span>
            <span className="mob-nav__label">AI選定</span>
          </button>
          <button className="mob-nav__btn" onClick={() => setShowPuChart(true)}>
            <span className="mob-nav__icon"><BarChart2 size={20}/></span>
            <span className="mob-nav__label">床ずれ比較</span>
          </button>
          <button className="mob-nav__btn" onClick={() => setShowDashboard(true)}>
            <span className="mob-nav__icon"><LayoutDashboard size={20}/></span>
            <span className="mob-nav__label">ダッシュボード</span>
          </button>
          <button className="mob-nav__btn" onClick={() => setShowMobileMenu(true)}>
            <span className="mob-nav__icon"><Settings size={20}/></span>
            <span className="mob-nav__label">その他</span>
          </button>
        </nav>
      )}

      {/* モバイルメニュー */}
      {showMobileMenu && (
        <div className="mob-menu-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="mob-menu" onClick={e => e.stopPropagation()}>
            <div className="mob-menu__head">
              <span>メニュー</span>
              <button onClick={() => setShowMobileMenu(false)}><X size={18} /></button>
            </div>
            {supabaseEnabled && (
              <button className="mob-menu__item mob-menu__item--sync" onClick={() => { void reloadFromCloud(); setShowMobileMenu(false); }}>
                <span style={{ fontSize: '1rem' }}>☁</span>
                クラウドから再読込
                {syncStatus === 'syncing' && <span className="mob-menu__sync-badge mob-menu__sync-badge--ing">同期中…</span>}
                {syncStatus === 'done'    && <span className="mob-menu__sync-badge mob-menu__sync-badge--ok">完了</span>}
              </button>
            )}
            {authMode === 'admin' && (
              <button className="mob-menu__item" onClick={() => { setShowAdmin(true); setShowMobileMenu(false); }}>
                <Settings size={16} /> 管理者設定
              </button>
            )}
            <button className="mob-menu__item" onClick={() => { setShowFilter(true); setShowMobileMenu(false); }}>
              <SlidersHorizontal size={16} /> 絞り込み{filterActiveCount > 0 ? ` (${filterActiveCount})` : ''}
            </button>
            <button className="mob-menu__item" onClick={() => {
              setSelectedOffice(undefined);
              setShowMobileMenu(false);
            }}>
              <Building2 size={16} style={{verticalAlign:'middle',marginRight:6}}/> 事業所を変更
            </button>
            {lastUpdatedStr && <p className="mob-menu__note">{lastUpdatedStr}</p>}
            <button className="mob-menu__item mob-menu__item--logout" onClick={() => { setAuthMode(null); setShowMobileMenu(false); }}>
              <LogOut size={16} /> ログアウト
            </button>
          </div>
        </div>
      )}

      {/* 自動表示ツールバー（デスクトップのみ） */}
      {!isMobile && <div
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
          <button className="tb__btn tb__btn--admin" onClick={() => setShowAdmin(true)}><Settings size={14} style={{verticalAlign:'middle',marginRight:4}}/>管理者設定</button>
        )}

        {/* 編集モード状態表示 */}
        {editMode && <span className="tb__badge"><Pencil size={12} style={{verticalAlign:'middle',marginRight:3}}/>編集中（未保存）</span>}

        <div className="tb__sep" />

        {/* 一覧/ブック切り替え */}
        <button className="tb__btn" onClick={() => setView((v) => (v === 'book' ? 'list' : 'book'))}>
          {view === 'book' ? <><LayoutList size={14} style={{verticalAlign:'middle',marginRight:4}}/>一覧</> : <><BookOpen size={14} style={{verticalAlign:'middle',marginRight:4}}/>ブック</>}
        </button>

        {/* ページナビ(ブック表示時) */}
        {view === 'book' && (
          <>
            <div className="tb__sep" />
            <div className="tb__nav">
              <div className="tb__nav-arrows">
                <button className="tb__arrowbtn" title="最初のページ" onClick={() => jumpPage(1)}><ChevronFirst size={14}/></button>
                <button className="tb__arrowbtn" title="前のページ" onClick={() => jumpPage(Math.max(1, parseInt(pageInput,10)-1))}><ChevronLeft size={14}/></button>
                <button className="tb__arrowbtn" title="次のページ" onClick={() => jumpPage(Math.min(totalPages, parseInt(pageInput,10)+1))}><ChevronRight size={14}/></button>
                <button className="tb__arrowbtn" title="最後のページ" onClick={() => jumpPage(totalPages)}><ChevronLast size={14}/></button>
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
              <button className="tb__btn" onClick={doSearch}><Search size={14}/></button>
              {searchMsg && <span className="tb__searchmsg">{searchMsg}</span>}
            </div>
          </>
        )}

        <div className="tb__sep" />

        {/* AI 選定 */}
        <button className="tb__btn tb__btn--ai" onClick={() => setShowAiSelector(true)} title="AIが利用者に最適な福祉用具を提案">
          <Bot size={14} style={{verticalAlign:'middle',marginRight:4}}/>AI選定
        </button>

        {/* ダッシュボード */}
        <button className="tb__btn tb__btn--dash" onClick={() => setShowDashboard(true)} title="在庫状況・AI提案ランキング">
          <LayoutDashboard size={14} style={{verticalAlign:'middle',marginRight:4}}/>ダッシュボード
        </button>

        {/* 床ずれ防止用具 選定チャート */}
        <button className="tb__btn" onClick={() => setShowPuChart(true)} title="床ずれ防止用具の選定チャート・比較表">
          <BarChart2 size={14} style={{verticalAlign:'middle',marginRight:4}}/>床ずれ比較
        </button>

        {/* フィルター */}
        <button
          className={`tb__btn${filterActiveCount > 0 ? ' tb__btn--active' : ''}`}
          onClick={() => setShowFilter(true)}
        >
          <SlidersHorizontal size={14} style={{verticalAlign:'middle',marginRight:4}}/>
          絞込{filterActiveCount > 0 ? ` (${filterActiveCount})` : ''}
        </button>

        <div className="tb__sep" />

        {/* PDF */}
        <button className="tb__btn" onClick={() => setShowPdfModal(true)} disabled={exporting}>
          {exporting ? <><Loader2 size={14} style={{verticalAlign:'middle',marginRight:4}}/>出力中</> : <><Printer size={14} style={{verticalAlign:'middle',marginRight:4}}/>PDF</>}
        </button>

        {/* 編集モード切替(管理者のみ) */}
        {authMode === 'admin' && !editMode && (
          <button className="tb__btn" onClick={enterEditMode}><Pencil size={14} style={{verticalAlign:'middle',marginRight:4}}/>編集モード</button>
        )}
        {editMode && (
          <>
            <button className="tb__btn tb__btn--primary" onClick={saveEdits}><Save size={14} style={{verticalAlign:'middle',marginRight:4}}/>保存</button>
            <button className="tb__btn" style={{ color: '#c00', borderColor: '#e05' }} onClick={discardEdits}><Undo2 size={14} style={{verticalAlign:'middle',marginRight:4}}/>破棄</button>
          </>
        )}

        <div className="tb__sep" />

        {/* ヘルプ */}
        <button className="tb__btn" style={view === 'help' ? { background: '#e3f6ea', borderColor: '#2e9e5b', color: '#1d7a43' } : {}}
          onClick={() => setView(v => v === 'help' ? 'book' : 'help')}>
          <HelpCircle size={14} style={{verticalAlign:'middle',marginRight:4}}/>ヘルプ
        </button>

        {/* ログアウト */}
        <button className="tb__btn tb__btn--logout" onClick={() => setAuthMode(null)}><LogOut size={14}/></button>
      </div>}

      {/* フィルターパネル */}
      <FilterPanel
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filter={filter}
        onChange={setFilter}
        allCategories={CATEGORIES}
        allMakers={allMakers}
        unitRange={unitRange}
      />

      {/* ダッシュボード */}
      {showDashboard && (
        <Dashboard
          products={products}
          categories={CATEGORIES}
          stock={catalog.stock}
          stockDetail={catalog.stockDetail}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {/* AI 福祉用具選定 */}
      {showAiSelector && (
        <AiSelector
          products={products}
          categories={CATEGORIES}
          stock={catalog.stock}
          onClose={() => setShowAiSelector(false)}
        />
      )}

      {/* 床ずれ選定チャート */}
      {showPuChart && (
        <PressureUlcerChart
          products={products}
          stock={catalog.stock}
          overrides={overrides}
          onOverride={handleOverride}
          onClose={() => setShowPuChart(false)}
          officeUnits={officeUnits}
        />
      )}

      {/* スマホ商品詳細ボトムシート */}
      {mobDetailProduct && (() => {
        const p = mobDetailProduct;
        const qty = catalog.stock[p.id] ?? 0;
        const out = qty <= 0;
        const unit = officeUnits?.[p.taisCode ?? ''];
        const alts = out ? suggestAlternatives(p, products, catalog.stock) : [];
        return (
          <div className="mob-detail-overlay" onClick={() => setMobDetailProduct(null)}>
            <div className="mob-detail-sheet" onClick={e => e.stopPropagation()}>
              <div className="mob-detail__handle" />
              <div className="mob-detail__scroll">
                <div className="mob-detail__img">
                  {p.taisCode ? (
                    <img src={taisPhotoUrl(p.taisCode)} alt={p.name} onError={e => (e.currentTarget.style.display='none')} />
                  ) : <span className="mob-detail__noimg">📷</span>}
                </div>
                <div className="mob-detail__info">
                  <p className="mob-detail__maker">{p.maker}</p>
                  <h3 className="mob-detail__name">{p.name}</h3>
                  <div className="mob-detail__badges">
                    <span className={`stock ${out ? 'stock--out' : 'stock--in'}`}>{out ? '在庫なし' : `在庫 ${qty}`}</span>
                    {unit != null && <span className="mob-detail__unit">{unit.toLocaleString()} 単位/月</span>}
                  </div>
                  {p.taisCode && (
                    <p className="mob-detail__tais">
                      TAISコード: <a href={taisDetailUrl(p.taisCode)} target="_blank" rel="noreferrer">{p.taisCode}</a>
                    </p>
                  )}
                  {out && alts.length > 0 && (
                    <div className="mob-detail__alts">
                      <p className="mob-detail__alts-title">💡 代替品のご提案</p>
                      {alts.map(a => (
                        <div key={a.id} className="mob-detail__alt-item">
                          <span>{a.name}</span>
                          <span className="stock stock--in">在庫 {catalog.stock[a.id]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button className="mob-detail__close" onClick={() => setMobDetailProduct(null)}>閉じる</button>
            </div>
          </div>
        );
      })()}

      {/* モーダル群 */}
      {showAdmin && (
        <AdminModal
          onClose={() => setShowAdmin(false)}
          onExcelLoad={handleExcelLoad}
          onInitialExcelLoad={handleInitialExcelLoad}
          onRateLoad={(rates) => {
            saveStoredRates(rates);
            setOfficeRateMap(rates);
            setSelectedOffice(undefined);
            if (supabaseEnabled) void saveSetting('office_rates', rates);
          }}
          onSaveSupabase={handleSaveToSupabase}
          onReloadFromSupabase={reloadFromCloud}
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
