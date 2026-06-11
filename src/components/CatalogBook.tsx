import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, CategoryId, Product, StockMap } from '../types';
import { CATEGORIES } from '../data/categories';
import { taisDetailUrl, taisPhotoUrl } from '../utils/tais';
import { suggestAlternatives } from '../utils/alternatives';
import type { TaisDetailMap } from '../utils/taisDetails';
import type { LayoutOverride, Overrides } from '../utils/overrides';
import { FirmnessMeter } from './FirmnessMeter';

// 車いす仕様の優先表示キー
const WHEELCHAIR_SPEC_KEYS = ['重量', '座幅', '前座高', '全幅', '奥行'];

// サイドタブ略語マップ
const TAB_ABBR: Record<string, string> = {
  '車いす付属品': '車付属',
  '特殊寝台付属品': '寝台付属',
  '移動用リフト': 'リフト',
  '徘徊感知機器': '徘徊感知',
  '自動排泄処理装置': '自動排泄',
  '入浴補助用具': '入浴',
  '歩行補助つえ': 'つえ',
};
const tabLabel = (name: string) => TAB_ABBR[name] ?? (name.length > 5 ? name.slice(0, 5) : name);

interface PageData {
  category: Category;
  products: Product[];
  isCategoryFirst: boolean;
  pageNo: number;
}

interface Props {
  categories: Category[];
  products: Product[];
  stock: StockMap;
  details: TaisDetailMap;
  navCategory: { id: CategoryId; ts: number } | null;
  editMode: boolean;
  overrides: Overrides;
  onOverride: (update: (o: Overrides) => Overrides) => void;
  authMode: 'user' | 'admin';
  onPageChange?: (spread: number, total: number) => void;
}

const FIRST_PAGE_ITEMS = 6;
const PAGE_ITEMS = 9;

function getCatOrder(catId: string, products: Product[], overrides: Overrides): string[] {
  const catProducts = products.filter((p) => p.categoryId === catId);
  const saved = overrides.cardOrder[catId];
  if (saved && saved.length > 0) {
    const orderMap = new Map(saved.map((id, i) => [id, i]));
    return [...catProducts]
      .sort((a, b) => (orderMap.get(a.id) ?? 99999) - (orderMap.get(b.id) ?? 99999))
      .map((p) => p.id);
  }
  return [
    ...catProducts.filter((p) => p.featured),
    ...catProducts.filter((p) => !p.featured),
  ].map((p) => p.id);
}

function pageOfProduct(idx: number): number {
  if (idx < FIRST_PAGE_ITEMS) return 0;
  return 1 + Math.floor((idx - FIRST_PAGE_ITEMS) / PAGE_ITEMS);
}

function buildPages(categories: Category[], products: Product[], overrides: Overrides): PageData[] {
  const idToProduct = new Map(products.map((p) => [p.id, p]));
  const pages: PageData[] = [];
  for (const cat of categories) {
    const orderedIds = getCatOrder(cat.id, products, overrides);
    if (orderedIds.length === 0) continue;
    const ordered = orderedIds.map((id) => idToProduct.get(id)!).filter(Boolean);
    pages.push({ category: cat, products: ordered.slice(0, FIRST_PAGE_ITEMS), isCategoryFirst: true, pageNo: 0 });
    for (let i = FIRST_PAGE_ITEMS; i < ordered.length; i += PAGE_ITEMS) {
      pages.push({ category: cat, products: ordered.slice(i, i + PAGE_ITEMS), isCategoryFirst: false, pageNo: 0 });
    }
  }
  pages.forEach((p, i) => { p.pageNo = i + 1; });
  return pages;
}

function Editable({ value, editing, className, onSave }: {
  value: string; editing: boolean; className?: string; onSave: (v: string) => void;
}) {
  if (!editing) return <span className={className}>{value}</span>;
  return (
    <span
      className={`${className ?? ''} editable`}
      contentEditable suppressContentEditableWarning
      onBlur={(e) => { const v = (e.currentTarget.textContent ?? '').trim(); if (v !== value) onSave(v); }}
    >{value}</span>
  );
}

const DEFAULT_LAYOUT: LayoutOverride = { x: 0, y: 0, s: 1 };

function Adjustable({ productId, part, editing, overrides, onOverride, children }: {
  productId: string; part: 'photo' | 'title' | 'desc';
  editing: boolean; overrides: Overrides; onOverride: Props['onOverride'];
  children: React.ReactNode;
}) {
  const saved = overrides.layouts[productId]?.[part] ?? DEFAULT_LAYOUT;
  const [live, setLive] = useState<LayoutOverride | null>(null);
  const layout = live ?? saved;

  const persist = (l: LayoutOverride | null) =>
    onOverride((o) => {
      const fp = { ...o.layouts[productId] };
      if (l) fp[part] = l; else delete fp[part];
      return { ...o, layouts: { ...o.layouts, [productId]: fp } };
    });

  const startDrag = (mode: 'move' | 'scale') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const base = { ...layout }; const sx = e.clientX; const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (mode === 'move') setLive({ ...base, x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) });
      else setLive({ ...base, s: Math.min(3, Math.max(0.4, base.s + (ev.clientX - sx) / 120)) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      const dx = ev.clientX - sx; const dy = ev.clientY - sy;
      const next = mode === 'move' ? { ...base, x: base.x + dx, y: base.y + dy }
        : { ...base, s: Math.min(3, Math.max(0.4, base.s + dx / 120)) };
      setLive(null); persist(next);
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const transformed = layout.x !== 0 || layout.y !== 0 || layout.s !== 1;
  const style: React.CSSProperties | undefined = transformed
    ? { transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.s})`, transformOrigin: 'top left' } : undefined;

  if (!editing) return <div className="adj" style={style}>{children}</div>;
  return (
    <div className="adj adj--editing" style={style}>
      <span className="adj__handle adj__handle--move" title="ドラッグで移動 / ダブルクリックでリセット"
        onPointerDown={startDrag('move')} onDoubleClick={() => { setLive(null); persist(null); }}>✥</span>
      <span className="adj__handle adj__handle--scale" title="左右ドラッグで拡大縮小"
        onPointerDown={startDrag('scale')}>◢</span>
      {children}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className="copy-btn" onClick={copy} title="コピー">
      {copied ? '✓' : '⎘'}
    </button>
  );
}

function TaisPhoto({ product, className, editMode, overrides, onOverride }: {
  product: Product; className: string;
  editMode?: boolean; overrides?: Overrides; onOverride?: Props['onOverride'];
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.id]);

  const effectiveTaisCode = overrides?.products[product.id]?.taisCode ?? product.taisCode;
  const customImg = overrides?.customImages?.[product.id];

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !onOverride) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onOverride((o) => ({ ...o, customImages: { ...o.customImages, [product.id]: dataUrl } }));
    };
    reader.readAsDataURL(f);
  };

  if (customImg) {
    return (
      <div className={`${className} taisphoto--custom`}>
        <img src={customImg} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        {editMode && onOverride && (
          <label className="taisphoto__reupload" title="画像を変更">📷
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
        )}
      </div>
    );
  }

  if (!effectiveTaisCode || failed) {
    if (editMode && onOverride) {
      return (
        <label className={`${className} taisphoto--none taisphoto--upload`} title="クリックして画像をアップロード">
          <span>📷<br />画像を追加</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
        </label>
      );
    }
    return <div className={`${className} taisphoto--none`}>NO IMAGE</div>;
  }

  return (
    <a href={taisDetailUrl(effectiveTaisCode)} target="_blank" rel="noreferrer" title="テクノエイド協会で詳細を見る">
      <img className={className} src={taisPhotoUrl(effectiveTaisCode)} alt={product.name}
        loading="lazy" onError={() => setFailed(true)} />
    </a>
  );
}

// 管理者用: 代替品設定モーダル
function AltSettingModal({ product, products: catProds, stock, overrides, onOverride, onClose }: {
  product: Product; products: Product[]; stock: StockMap;
  overrides: Overrides; onOverride: Props['onOverride']; onClose: () => void;
}) {
  const catProducts = catProds.filter((p) => p.id !== product.id && p.categoryId === product.categoryId);
  const setting = overrides.altSettings[product.id] ?? {};
  const preferred = new Set(setting.preferred ?? []);
  const excluded = new Set(setting.excluded ?? []);

  const toggle = (id: string, type: 'preferred' | 'excluded') => {
    onOverride((o) => {
      const cur = o.altSettings[product.id] ?? {};
      const pref = new Set(cur.preferred ?? []);
      const excl = new Set(cur.excluded ?? []);
      if (type === 'preferred') {
        if (pref.has(id)) pref.delete(id); else { pref.add(id); excl.delete(id); }
      } else {
        if (excl.has(id)) excl.delete(id); else { excl.add(id); pref.delete(id); }
      }
      return { ...o, altSettings: { ...o.altSettings, [product.id]: { preferred: [...pref], excluded: [...excl] } } };
    });
  };

  return (
    <div className="altmodal__overlay" onClick={onClose}>
      <div className="altmodal" onClick={(e) => e.stopPropagation()}>
        <div className="altmodal__head">
          <div>
            <p className="altmodal__label">代替品設定</p>
            <h3 className="altmodal__title">{product.name}</h3>
          </div>
          <button className="altmodal__close" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: '8px 0' }}>
          ★=優先して提案 ✕=提案しない　※設定なしは自動判定
        </p>
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {catProducts.map((p) => (
            <div key={p.id} className="altsetting__row">
              <span className="altsetting__name">{p.name} <small style={{ color: '#999' }}>在庫{stock[p.id] ?? 0}</small></span>
              <button
                className={`altsetting__btn ${preferred.has(p.id) ? 'is-preferred' : ''}`}
                onClick={() => toggle(p.id, 'preferred')}>★ 優先</button>
              <button
                className={`altsetting__btn ${excluded.has(p.id) ? 'is-excluded' : ''}`}
                onClick={() => toggle(p.id, 'excluded')}>✕ 除外</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CardCallbacks {
  onShowAlts: (p: Product) => void;
  onDragStart: (productId: string, catId: string) => void;
  onDragOver: (e: React.DragEvent, productId: string) => void;
  onDrop: (targetProductId: string) => void;
  onMoveNext: (productId: string, catId: string) => void;
  onMovePrev: (productId: string, catId: string) => void;
  onAltSetting: (p: Product) => void;
  draggingId: string | null;
  dragOverId: string | null;
  authMode: 'user' | 'admin';
}

function BookCard({ product, stock, color, large, details, editMode, overrides, onOverride, callbacks }: {
  product: Product; stock: StockMap; color: string; large?: boolean;
  details: TaisDetailMap; editMode: boolean; overrides: Overrides;
  onOverride: Props['onOverride']; callbacks: CardCallbacks;
}) {
  const qty = stock[product.id] ?? 0;
  const out = qty <= 0;
  const ov = overrides.products[product.id] ?? {};
  const cardSize = overrides.cardSize?.[product.id] ?? {};
  const detail = product.taisCode ? details[product.taisCode] : undefined;

  const name = ov.name ?? product.name;
  const maker = ov.maker ?? product.maker;
  const summary = ov.summary ?? detail?.summary ?? product.description;
  const effectiveTaisCode = ov.taisCode ?? product.taisCode;

  // 車いすは特定スペックを優先表示
  let specs: [string, string][];
  if (product.categoryId === 'kurumaisu' && detail?.specs) {
    const specMap = new Map(detail.specs);
    const wc = WHEELCHAIR_SPEC_KEYS.map((k): [string, string] | null => {
      const v = [...specMap.entries()].find(([label]) => label.includes(k));
      return v ? [k, v[1]] : null;
    }).filter(Boolean) as [string, string][];
    specs = wc.length > 0 ? wc.slice(0, large ? 5 : 3) : (detail.specs ?? []).slice(0, large ? 4 : 2);
  } else {
    specs = (detail?.specs ?? []).slice(0, large ? 4 : 2);
  }

  const setField = (field: 'name' | 'maker' | 'summary') => (v: string) =>
    onOverride((o) => ({ ...o, products: { ...o.products, [product.id]: { ...o.products[product.id], [field]: v } } }));

  const setTaisCode = (v: string) =>
    onOverride((o) => ({ ...o, products: { ...o.products, [product.id]: { ...o.products[product.id], taisCode: v } } }));

  const toggleCols = () =>
    onOverride((o) => ({ ...o, cardSize: { ...o.cardSize, [product.id]: { cols: cardSize.cols === 2 ? undefined : 2 } } }));

  const adjProps = { productId: product.id, editing: editMode, overrides, onOverride };
  const { onShowAlts, onDragStart, onDragOver, onDrop, onMoveNext, onMovePrev, onAltSetting, draggingId, dragOverId, authMode } = callbacks;
  const gridStyle: React.CSSProperties = cardSize.cols === 2 ? { gridColumn: 'span 2' } : {};

  return (
    <div
      className={`bcard ${large ? 'bcard--large' : ''} ${out ? 'bcard--out' : 'bcard--in'} ${draggingId === product.id ? 'bcard--dragging' : ''} ${dragOverId === product.id ? 'bcard--dragover' : ''}`}
      style={gridStyle}
      draggable={editMode}
      onDragStart={() => onDragStart(product.id, product.categoryId)}
      onDragOver={(e) => onDragOver(e, product.id)}
      onDrop={() => onDrop(product.id)}
    >
      {editMode && (
        <div className="bcard__editbar">
          <span className="bcard__editbtn bcard__editbtn--drag" title="ドラッグで並び替え">≡</span>
          <button className="bcard__editbtn" onClick={toggleCols}>{cardSize.cols === 2 ? '⇥1列' : '⇤2列'}</button>
          <button className="bcard__editbtn" onClick={() => onMovePrev(product.id, product.categoryId)}>◀頁</button>
          <button className="bcard__editbtn" onClick={() => onMoveNext(product.id, product.categoryId)}>頁▶</button>
          {authMode === 'admin' && (
            <button className="bcard__editbtn" onClick={() => onAltSetting(product)}>代替設定</button>
          )}
        </div>
      )}

      {/* メンテナンスバッジ */}
      {(product.maintenance ?? 0) > 0 && (
        <span className="bcard__maint">メンテ{product.maintenance}</span>
      )}

      <Adjustable part="title" {...adjProps}>
        <div className="bcard__titlebar" style={{ borderColor: color }}>
          <Editable className="bcard__name" value={name} editing={editMode} onSave={setField('name')} />
          <Editable className="bcard__maker" value={maker} editing={editMode} onSave={setField('maker')} />
        </div>
      </Adjustable>

      <table className="bcard__spec">
        <tbody>
          <tr>
            <th>商品コード</th>
            <td>
              <span className="code-cell">{product.id}<CopyBtn text={product.id} /></span>
            </td>
          </tr>
          <tr>
            <th>TAISコード</th>
            <td>
              <span className="code-cell">
                {editMode && authMode === 'admin'
                  ? <Editable value={effectiveTaisCode || '—'} editing={true} onSave={setTaisCode} />
                  : (effectiveTaisCode || '—')
                }
                {effectiveTaisCode && <CopyBtn text={effectiveTaisCode} />}
              </span>
            </td>
          </tr>
          {specs.map(([label, value]) => (
            <tr key={label}><th>{label}</th><td colSpan={1}>{value}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="bcard__main">
        <div className="bcard__info">
          {summary && (
            <Adjustable part="desc" {...adjProps}>
              <Editable className="bcard__desc" value={summary} editing={editMode} onSave={setField('summary')} />
            </Adjustable>
          )}
          {product.handrail && <p className="bcard__bullet">※寸法: {product.handrail.dimensions}</p>}
          {product.firmness !== undefined && <FirmnessMeter value={product.firmness} />}
          {product.price > 0 && <p className="bcard__price">¥{product.price.toLocaleString()}</p>}
          {out ? (
            <button className="stock stock--mini stock--out stock--btn" onClick={() => onShowAlts(product)} title="代替品を表示">
              在庫なし ▶代替品
            </button>
          ) : (
            <span className="stock stock--mini stock--in">在庫 {qty}</span>
          )}
        </div>
        <Adjustable part="photo" {...adjProps}>
          <TaisPhoto product={product} className="bcard__photo" editMode={editMode} overrides={overrides} onOverride={onOverride} />
        </Adjustable>
      </div>
    </div>
  );
}

function AltModal({ product, products, stock, details, overrides, onClose }: {
  product: Product; products: Product[]; stock: StockMap; details: TaisDetailMap;
  overrides: Overrides; onClose: () => void;
}) {
  const alts = suggestAlternatives(product, products, stock, 8, overrides);
  return (
    <div className="altmodal__overlay" onClick={onClose}>
      <div className="altmodal" onClick={(e) => e.stopPropagation()}>
        <div className="altmodal__head">
          <div>
            <p className="altmodal__label">在庫切れ商品</p>
            <h3 className="altmodal__title">{product.name}</h3>
            <p className="altmodal__sub">{product.maker} ／ 商品コード: {product.id}</p>
          </div>
          <button className="altmodal__close" onClick={onClose}>✕</button>
        </div>
        <h4 className="altmodal__section">💡 在庫のある代替品({alts.length}件)</h4>
        {alts.length === 0
          ? <p className="altmodal__empty">同じ品目で在庫のある代替品が見つかりませんでした。</p>
          : (
            <div className="altmodal__grid">
              {alts.map((a) => {
                const d = a.taisCode ? details[a.taisCode] : undefined;
                return (
                  <div key={a.id} className="altcard">
                    <TaisPhoto product={a} className="altcard__photo" />
                    <div className="altcard__body">
                      <p className="altcard__maker">{a.maker}</p>
                      <h5 className="altcard__name">{a.name}</h5>
                      <p className="altcard__code">商品コード: {a.id}</p>
                      {d?.summary && <p className="altcard__desc">{d.summary}</p>}
                      {(d?.specs ?? []).slice(0, 2).map(([label, value]) => (
                        <p key={label} className="altcard__spec">{label}: {value}</p>
                      ))}
                      <span className="stock stock--in">在庫 {stock[a.id]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

function SideTabs({ current, side, onJump }: {
  current: Category; side: 'left' | 'right'; onJump: (id: CategoryId) => void;
}) {
  return (
    <div className={`page__sidetabs page__sidetabs--${side}`}>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          className={`page__minitab ${c.id === current.id ? 'is-active' : ''}`}
          style={{ background: c.id === current.id ? c.color : `${c.color}33`, color: c.id === current.id ? '#fff' : c.color }}
          onClick={() => onJump(c.id)}
          title={c.name}
        >
          {tabLabel(c.name)}
        </button>
      ))}
    </div>
  );
}

function Page({ page, products, stock, side, onJump, details, editMode, overrides, onOverride, callbacks }: {
  page: PageData; products: Product[]; stock: StockMap; side: 'left' | 'right';
  onJump: (id: CategoryId) => void; details: TaisDetailMap;
  editMode: boolean; overrides: Overrides; onOverride: Props['onOverride'];
  callbacks: CardCallbacks;
}) {
  const cat = page.category;
  const big = page.isCategoryFirst ? page.products.filter((p) => p.featured).slice(0, 2) : [];
  const small = page.products.filter((p) => !big.includes(p));
  const guide = overrides.guides[cat.id] ?? cat.guide;
  const cardProps = { products, stock, details, editMode, overrides, onOverride, callbacks, color: cat.color };

  return (
    <div className={`page page--${side}`} data-pdf-section>
      <div className="page__band" style={{ background: `${cat.color}22`, borderColor: cat.color }}>
        <span className="page__band-title" style={{ color: cat.color }}>{cat.name}</span>
        {cat.serviceCode ? (
          <span className="page__band-code">
            サービスコード 介護給付:{cat.serviceCode.kaigo} ／ 予防給付:{cat.serviceCode.yobo}
          </span>
        ) : (
          <span className="page__band-code">{cat.kind === 'purchase' ? '特定福祉用具販売' : ''}</span>
        )}
      </div>
      {/* page__tab(上の角の品目タグ)は削除 */}
      <SideTabs current={cat} side={side} onJump={onJump} />

      <div className="page__body">
        {page.isCategoryFirst && (
          <div className="page__guide" style={{ borderColor: cat.color }}>
            <strong style={{ color: cat.color }}>福祉用具の選定ガイド</strong>
            <p>
              <Editable value={guide} editing={editMode}
                onSave={(v) => onOverride((o) => ({ ...o, guides: { ...o.guides, [cat.id]: v } }))} />
            </p>
          </div>
        )}
        {big.length > 0 && (
          <div className="page__big">
            {big.map((p) => <BookCard key={p.id} product={p} large {...cardProps} />)}
          </div>
        )}
        <div className="page__grid">
          {small.map((p) => <BookCard key={p.id} product={p} {...cardProps} />)}
        </div>
      </div>

      <div className="page__footer" style={{ borderColor: cat.color }}>
        {side === 'left' ? (
          <><span className="page__pageno">{page.pageNo}</span><span>※介護保険上の利用者負担割合は所得に応じて異なります。</span></>
        ) : (
          <><span>※介護保険上の利用者負担割合は所得に応じて異なります。</span><span className="page__pageno">{page.pageNo}</span></>
        )}
      </div>
    </div>
  );
}

export function CatalogBook({ categories, products, stock, details, navCategory, editMode, overrides, onOverride, authMode, onPageChange }: Props) {
  const pages = useMemo(() => buildPages(categories, products, overrides), [categories, products, overrides]);
  const [spread, setSpread] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [altFor, setAltFor] = useState<Product | null>(null);
  const [altSettingFor, setAltSettingFor] = useState<Product | null>(null);
  const maxSpread = Math.max(0, Math.ceil(pages.length / 2) - 1);

  const draggingRef = useRef<{ productId: string; catId: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const goSpread = (s: number) => {
    const next = Math.max(0, Math.min(s, maxSpread));
    setSpread(next);
    setPageInput(String(next * 2 + 1));
    onPageChange?.(next, pages.length);
  };

  useEffect(() => {
    onPageChange?.(spread, pages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  useEffect(() => {
    if (!navCategory) return;
    const idx = pages.findIndex((p) => p.category.id === navCategory.id);
    if (idx >= 0) goSpread(Math.floor(idx / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCategory, pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || (el as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowRight') goSpread(spread + 1);
      if (e.key === 'ArrowLeft') goSpread(spread - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread, maxSpread]);

  const jumpToCategory = (id: CategoryId) => {
    const idx = pages.findIndex((p) => p.category.id === id);
    if (idx >= 0) goSpread(Math.floor(idx / 2));
  };

  const handleSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const idx = pages.findIndex((p) =>
      p.products.some((pr) => pr.name.toLowerCase().includes(q) || pr.id.toLowerCase().includes(q)),
    );
    if (idx >= 0) { goSpread(Math.floor(idx / 2)); setSearchMsg(''); }
    else setSearchMsg('見つかりません');
  };

  const handleDragStart = (productId: string, catId: string) => {
    draggingRef.current = { productId, catId };
    setDraggingId(productId);
  };

  const handleDragOver = (e: React.DragEvent, targetProductId: string) => {
    e.preventDefault();
    setDragOverId(targetProductId);
  };

  const handleDrop = (targetProductId: string) => {
    const src = draggingRef.current;
    setDraggingId(null); setDragOverId(null); draggingRef.current = null;
    if (!src || src.productId === targetProductId) return;
    const srcProduct = products.find((p) => p.id === src.productId);
    const tgtProduct = products.find((p) => p.id === targetProductId);
    if (!srcProduct || !tgtProduct || srcProduct.categoryId !== tgtProduct.categoryId) return;
    const catId = srcProduct.categoryId;
    const order = getCatOrder(catId, products, overrides);
    const srcIdx = order.indexOf(src.productId);
    if (srcIdx < 0) return;
    const newOrder = [...order];
    newOrder.splice(srcIdx, 1);
    const insertAt = newOrder.indexOf(targetProductId);
    if (insertAt < 0) return;
    newOrder.splice(insertAt, 0, src.productId);
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const handleMoveNext = (productId: string, catId: string) => {
    const order = getCatOrder(catId, products, overrides);
    const idx = order.indexOf(productId);
    if (idx < 0) return;
    const cp = pageOfProduct(idx);
    const nps = cp === 0 ? FIRST_PAGE_ITEMS : FIRST_PAGE_ITEMS + cp * PAGE_ITEMS;
    if (nps >= order.length) return;
    const newOrder = order.filter((id) => id !== productId);
    newOrder.splice(nps, 0, productId);
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const handleMovePrev = (productId: string, catId: string) => {
    const order = getCatOrder(catId, products, overrides);
    const idx = order.indexOf(productId);
    if (idx < 0) return;
    const cp = pageOfProduct(idx);
    if (cp === 0) return;
    const ppe = cp === 1 ? FIRST_PAGE_ITEMS - 1 : FIRST_PAGE_ITEMS + (cp - 1) * PAGE_ITEMS - 1;
    const newOrder = order.filter((id) => id !== productId);
    newOrder.splice(ppe, 0, productId);
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const callbacks: CardCallbacks = {
    onShowAlts: setAltFor,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onMoveNext: handleMoveNext,
    onMovePrev: handleMovePrev,
    onAltSetting: setAltSettingFor,
    draggingId,
    dragOverId,
    authMode,
  };

  const left = pages[spread * 2];
  const right = pages[spread * 2 + 1];
  if (!left) return <p className="book__empty">表示できる商品がありません。</p>;

  const pageProps = { products, stock, details, editMode, overrides, onOverride, onJump: jumpToCategory, callbacks };

  return (
    <div className={`book ${editMode ? 'book--editing' : ''}`}>
      {editMode && (
        <p className="book__editbanner">
          ✏️ 編集モード: ≡ドラッグで並替 ／ ◀頁・頁▶でページ移動 ／ ⇤2列で幅拡大 ／ 📷で画像追加
          {authMode === 'admin' ? ' ／ 「代替設定」で代替品を管理' : ''}
        </p>
      )}
      <div className="book__stage">
        <button className="book__arrow" onClick={() => goSpread(spread - 1)} disabled={spread === 0}>◀</button>
        <div className="book__spread">
          <Page page={left} side="left" {...pageProps} />
          {right && <Page page={right} side="right" {...pageProps} />}
        </div>
        <button className="book__arrow" onClick={() => goSpread(spread + 1)} disabled={spread >= maxSpread}>▶</button>
      </div>

      {/* ページ入力・検索は下のツールバーに統合済みなので非表示 */}
      <div className="book__toolbar" style={{ display: 'none' }}>
        <span className="book__pageinput">
          ページ:
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(pageInput, 10); if (!Number.isNaN(n)) goSpread(Math.floor((n - 1) / 2)); } }} />
          / {pages.length}
        </span>
        <span className="book__search">
          <input placeholder="商品名・商品コードで検索" value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchMsg(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} />
          <button className="book__tbtn" onClick={handleSearch}>🔍</button>
          {searchMsg && <em className="book__searchmsg">{searchMsg}</em>}
        </span>
      </div>

      {altFor && (
        <AltModal product={altFor} products={products} stock={stock} details={details}
          overrides={overrides} onClose={() => setAltFor(null)} />
      )}
      {altSettingFor && authMode === 'admin' && (
        <AltSettingModal product={altSettingFor} products={products} stock={stock}
          overrides={overrides} onOverride={onOverride} onClose={() => setAltSettingFor(null)} />
      )}
    </div>
  );
}
