import { useEffect, useMemo, useState } from 'react';
import type { Category, CategoryId, Product, StockMap } from '../types';
import { CATEGORIES } from '../data/categories';
import { taisDetailUrl, taisPhotoUrl } from '../utils/tais';
import { suggestAlternatives } from '../utils/alternatives';
import type { TaisDetailMap } from '../utils/taisDetails';
import type { LayoutOverride, Overrides } from '../utils/overrides';
import { FirmnessMeter } from './FirmnessMeter';

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
  /** 目次から品目ジャンプするための指定(tsで毎クリックを識別) */
  navCategory: { id: CategoryId; ts: number } | null;
  /** 編集モード: ページ上の文字をその場で書き換え可能 */
  editMode: boolean;
  overrides: Overrides;
  onOverride: (update: (o: Overrides) => Overrides) => void;
}

const FIRST_PAGE_ITEMS = 6;  // 品目1ページ目: ガイド + 大2 + 小4
const PAGE_ITEMS = 9;        // 2ページ目以降: 3×3(収まらない分は次ページへ)

function buildPages(categories: Category[], products: Product[]): PageData[] {
  const pages: PageData[] = [];
  for (const cat of categories) {
    const items = products.filter((p) => p.categoryId === cat.id);
    if (items.length === 0) continue;
    const ordered = [...items.filter((p) => p.featured), ...items.filter((p) => !p.featured)];
    pages.push({ category: cat, products: ordered.slice(0, FIRST_PAGE_ITEMS), isCategoryFirst: true, pageNo: 0 });
    for (let i = FIRST_PAGE_ITEMS; i < ordered.length; i += PAGE_ITEMS) {
      pages.push({ category: cat, products: ordered.slice(i, i + PAGE_ITEMS), isCategoryFirst: false, pageNo: 0 });
    }
  }
  pages.forEach((p, i) => { p.pageNo = i + 1; });
  return pages;
}

/** 編集モード時にその場で書き換えできるテキスト */
function Editable({ value, editing, className, onSave }: {
  value: string; editing: boolean; className?: string; onSave: (v: string) => void;
}) {
  if (!editing) return <span className={className}>{value}</span>;
  return (
    <span
      className={`${className ?? ''} editable`}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? '').trim();
        if (v !== value) onSave(v);
      }}
    >
      {value}
    </span>
  );
}

const DEFAULT_LAYOUT: LayoutOverride = { x: 0, y: 0, s: 1 };

/**
 * 編集モードで移動(✥ハンドルをドラッグ)・拡大縮小(◢ハンドルをドラッグ)できるラッパー。
 * ハンドルのダブルクリックで配置をリセット。
 */
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
      const forProduct = { ...o.layouts[productId] };
      if (l) forProduct[part] = l;
      else delete forProduct[part];
      return { ...o, layouts: { ...o.layouts, [productId]: forProduct } };
    });

  const startDrag = (mode: 'move' | 'scale') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = { ...layout };
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (mode === 'move') {
        setLive({ ...base, x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) });
      } else {
        const s = Math.min(3, Math.max(0.4, base.s + (ev.clientX - sx) / 120));
        setLive({ ...base, s });
      }
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const next = mode === 'move'
        ? { ...base, x: base.x + dx, y: base.y + dy }
        : { ...base, s: Math.min(3, Math.max(0.4, base.s + dx / 120)) };
      setLive(null);
      persist(next);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const transformed = layout.x !== 0 || layout.y !== 0 || layout.s !== 1;
  const style: React.CSSProperties | undefined = transformed
    ? { transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.s})`, transformOrigin: 'top left' }
    : undefined;

  if (!editing) return <div className="adj" style={style}>{children}</div>;

  return (
    <div className="adj adj--editing" style={style}>
      <span
        className="adj__handle adj__handle--move" title="ドラッグで移動 / ダブルクリックでリセット"
        onPointerDown={startDrag('move')}
        onDoubleClick={() => { setLive(null); persist(null); }}
      >✥</span>
      <span
        className="adj__handle adj__handle--scale" title="左右ドラッグで拡大縮小"
        onPointerDown={startDrag('scale')}
      >◢</span>
      {children}
    </div>
  );
}

/** TAIS写真(取得できない場合はNO IMAGE表示) */
function TaisPhoto({ product, className }: { product: Product; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.id]);

  if (!product.taisCode || failed) {
    return <div className={`${className} taisphoto--none`}>NO IMAGE</div>;
  }
  return (
    <a href={taisDetailUrl(product.taisCode)} target="_blank" rel="noreferrer" title="テクノエイド協会で詳細を見る">
      <img
        className={className}
        src={taisPhotoUrl(product.taisCode)}
        alt={product.name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

/** パラマウント風の商品セル: 名称帯+仕様表+写真+特徴 */
function BookCard({ product, products, stock, color, large, details, editMode, overrides, onOverride, onShowAlts }: {
  product: Product; products: Product[]; stock: StockMap; color: string; large?: boolean;
  details: TaisDetailMap; editMode: boolean; overrides: Overrides;
  onOverride: Props['onOverride'];
  onShowAlts: (p: Product) => void;
}) {
  const qty = stock[product.id] ?? 0;
  const out = qty <= 0;
  const alts = out ? suggestAlternatives(product, products, stock) : [];
  const detail = product.taisCode ? details[product.taisCode] : undefined;
  const ov = overrides.products[product.id] ?? {};

  const name = ov.name ?? product.name;
  const maker = ov.maker ?? product.maker;
  const summary = ov.summary ?? detail?.summary ?? product.description;
  const specs = (detail?.specs ?? []).slice(0, large ? 4 : 2);

  const setField = (field: 'name' | 'maker' | 'summary') => (v: string) =>
    onOverride((o) => ({
      ...o,
      products: { ...o.products, [product.id]: { ...o.products[product.id], [field]: v } },
    }));

  const adjProps = { productId: product.id, editing: editMode, overrides, onOverride };

  return (
    <div className={`bcard ${large ? 'bcard--large' : ''} ${out ? 'bcard--out' : 'bcard--in'}`}>
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
            <td>{product.id}</td>
            <th>TAISコード</th>
            <td>{product.taisCode || '—'}</td>
          </tr>
          {specs.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td colSpan={3}>{value}</td>
            </tr>
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
            <button
              className="stock stock--mini stock--out stock--btn"
              onClick={() => onShowAlts(product)}
              title="クリックで代替品を表示"
            >
              在庫なし ▶代替品
            </button>
          ) : (
            <span className="stock stock--mini stock--in">在庫 {qty}</span>
          )}
        </div>
        <Adjustable part="photo" {...adjProps}>
          <TaisPhoto product={product} className="bcard__photo" />
        </Adjustable>
      </div>

      {out && alts.length > 0 && (
        <button className="bcard__alt bcard__alt--btn" onClick={() => onShowAlts(product)}>
          💡 代替: {alts.map((a) => a.name).join(' / ')}
        </button>
      )}
    </div>
  );
}

/** 在庫切れ商品の代替品一覧モーダル(写真・商品名・特徴付き) */
function AltModal({ product, products, stock, details, onClose }: {
  product: Product; products: Product[]; stock: StockMap; details: TaisDetailMap;
  onClose: () => void;
}) {
  const alts = suggestAlternatives(product, products, stock, 8);
  return (
    <div className="altmodal__overlay" onClick={onClose}>
      <div className="altmodal" onClick={(e) => e.stopPropagation()}>
        <div className="altmodal__head">
          <div>
            <p className="altmodal__label">在庫切れ商品</p>
            <h3 className="altmodal__title">{product.name}</h3>
            <p className="altmodal__sub">{product.maker} ／ 商品コード: {product.id}</p>
          </div>
          <button className="altmodal__close" onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <h4 className="altmodal__section">💡 在庫のある代替品({alts.length}件)</h4>
        {alts.length === 0 ? (
          <p className="altmodal__empty">同じ品目で在庫のある代替品が見つかりませんでした。</p>
        ) : (
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

/** ページ端の品目インデックスタブ列 */
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
          {c.name.length > 6 ? c.name.slice(0, 6) : c.name}
        </button>
      ))}
    </div>
  );
}

/** A4 1ページ分(パラマウント風) */
function Page({ page, products, stock, side, onJump, details, editMode, overrides, onOverride, onShowAlts }: {
  page: PageData; products: Product[]; stock: StockMap; side: 'left' | 'right';
  onJump: (id: CategoryId) => void; details: TaisDetailMap;
  editMode: boolean; overrides: Overrides; onOverride: Props['onOverride'];
  onShowAlts: (p: Product) => void;
}) {
  const cat = page.category;
  const big = page.isCategoryFirst ? page.products.filter((p) => p.featured).slice(0, 2) : [];
  const small = page.products.filter((p) => !big.includes(p));
  const guide = overrides.guides[cat.id] ?? cat.guide;
  const cardProps = { products, stock, details, editMode, overrides, onOverride, onShowAlts, color: cat.color };

  return (
    <div className={`page page--${side}`} data-pdf-section>
      <div className="page__band" style={{ background: `${cat.color}22`, borderColor: cat.color }}>
        <span className="page__band-title" style={{ color: cat.color }}>{cat.name}</span>
        {cat.serviceCode ? (
          <span className="page__band-code">
            サービスコード({cat.name}) 介護給付:{cat.serviceCode.kaigo} ／ 予防給付:{cat.serviceCode.yobo}
          </span>
        ) : (
          <span className="page__band-code">{cat.kind === 'purchase' ? '特定福祉用具販売' : ''}</span>
        )}
      </div>
      <span className="page__tab" style={{ background: cat.color }}>{cat.name}</span>
      <SideTabs current={cat} side={side} onJump={onJump} />

      <div className="page__body">
        {page.isCategoryFirst && (
          <div className="page__guide" style={{ borderColor: cat.color }}>
            <strong style={{ color: cat.color }}>福祉用具の選定ガイド</strong>
            <p>
              <Editable
                value={guide}
                editing={editMode}
                onSave={(v) => onOverride((o) => ({ ...o, guides: { ...o.guides, [cat.id]: v } }))}
              />
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
          <>
            <span className="page__pageno">{page.pageNo}</span>
            <span>※介護保険上の利用者負担割合は所得に応じて異なります。</span>
          </>
        ) : (
          <>
            <span>※介護保険上の利用者負担割合は所得に応じて異なります。</span>
            <span className="page__pageno">{page.pageNo}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** A4見開きのブックビュー(◀▶/←→キー/ページ番号入力/商品名検索/編集モード) */
export function CatalogBook({ categories, products, stock, details, navCategory, editMode, overrides, onOverride }: Props) {
  const pages = useMemo(() => buildPages(categories, products), [categories, products]);
  const [spread, setSpread] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [altFor, setAltFor] = useState<Product | null>(null);
  const maxSpread = Math.max(0, Math.ceil(pages.length / 2) - 1);

  const goSpread = (s: number) => {
    const next = Math.max(0, Math.min(s, maxSpread));
    setSpread(next);
    setPageInput(String(next * 2 + 1));
  };

  // 目次からの品目ジャンプ
  useEffect(() => {
    if (!navCategory) return;
    const idx = pages.findIndex((p) => p.category.id === navCategory.id);
    if (idx >= 0) goSpread(Math.floor(idx / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCategory, pages]);

  // ←→キーでページ送り(編集中・入力中は無効)
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
    if (idx >= 0) {
      goSpread(Math.floor(idx / 2));
      setSearchMsg('');
    } else {
      setSearchMsg('見つかりません');
    }
  };

  const left = pages[spread * 2];
  const right = pages[spread * 2 + 1];
  if (!left) return <p className="book__empty">表示できる商品がありません。</p>;

  const pageProps = {
    products, stock, details, editMode, overrides, onOverride,
    onJump: jumpToCategory, onShowAlts: setAltFor,
  };

  return (
    <div className={`book ${editMode ? 'book--editing' : ''}`}>
      {editMode && (
        <p className="book__editbanner">
          ✏️ 編集モード: テキストはクリックして書き換え ／ ✥をドラッグで移動 ／ ◢を左右ドラッグで拡大縮小 ／ ✥ダブルクリックで配置リセット(すべて自動保存)
        </p>
      )}
      <div className="book__stage">
        <button className="book__arrow" aria-label="前のページ" onClick={() => goSpread(spread - 1)} disabled={spread === 0}>◀</button>
        <div className="book__spread">
          <Page page={left} side="left" {...pageProps} />
          {right && <Page page={right} side="right" {...pageProps} />}
        </div>
        <button className="book__arrow" aria-label="次のページ" onClick={() => goSpread(spread + 1)} disabled={spread >= maxSpread}>▶</button>
      </div>

      <div className="book__toolbar">
        <button className="book__tbtn" onClick={() => goSpread(0)} title="最初のページ">⏮</button>
        <button className="book__tbtn" onClick={() => goSpread(spread - 1)} title="前のページ">◀</button>
        <span className="book__pageinput">
          ページ:
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = parseInt(pageInput, 10);
                if (!Number.isNaN(n)) goSpread(Math.floor((n - 1) / 2));
              }
            }}
          />
          / {pages.length}
        </span>
        <button className="book__tbtn" onClick={() => goSpread(spread + 1)} title="次のページ">▶</button>
        <button className="book__tbtn" onClick={() => goSpread(maxSpread)} title="最後のページ">⏭</button>
        <span className="book__search">
          <input
            placeholder="商品名・商品コードで検索"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchMsg(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button className="book__tbtn" onClick={handleSearch} title="検索">🔍</button>
          {searchMsg && <em className="book__searchmsg">{searchMsg}</em>}
        </span>
      </div>

      {altFor && (
        <AltModal
          product={altFor}
          products={products}
          stock={stock}
          details={details}
          onClose={() => setAltFor(null)}
        />
      )}
    </div>
  );
}
