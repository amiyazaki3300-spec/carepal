import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Category, CategoryId, Product, StockMap } from '../types';
import { CATEGORIES } from '../data/categories';
import { taisDetailUrl, taisPhotoUrl } from '../utils/tais';
import { fileToCompressedDataUrl } from '../utils/imageCompress';
import { suggestAlternatives } from '../utils/alternatives';
import type { TaisDetailMap } from '../utils/taisDetails';
import type { ExtraItem, LayoutOverride, Overrides } from '../utils/overrides';
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
  /** 選択事業所の TAISコード→単位数 マップ */
  officeUnits?: Record<string, number>;
  details: TaisDetailMap;
  navCategory: { id: CategoryId; ts: number } | null;
  navPage: { page: number; ts: number } | null;
  navSearch: { query: string; ts: number } | null;
  onSearchResult?: (msg: string) => void;
  editMode: boolean;
  overrides: Overrides;
  onOverride: (update: (o: Overrides) => Overrides) => void;
  authMode: 'user' | 'admin';
  onPageChange?: (spread: number, total: number) => void;
}

const FIRST_PAGE_ITEMS = 6;
const PAGE_ITEMS = 9;

function getCatOrder(catId: string, products: Product[], overrides: Overrides, stock: StockMap): string[] {
  const catProducts = products.filter((p) => p.categoryId === catId);
  const saved = overrides.cardOrder[catId];
  if (saved && saved.length > 0) {
    const orderMap = new Map(saved.map((id, i) => [id, i]));
    return [...catProducts]
      .sort((a, b) => (orderMap.get(a.id) ?? 99999) - (orderMap.get(b.id) ?? 99999))
      .map((p) => p.id);
  }
  const inStock = (p: Product) => (stock[p.id] ?? 0) > 0;
  return [
    ...catProducts.filter((p) => p.featured && inStock(p)),
    ...catProducts.filter((p) => p.featured && !inStock(p)),
    ...catProducts.filter((p) => !p.featured && inStock(p)),
    ...catProducts.filter((p) => !p.featured && !inStock(p)),
  ].map((p) => p.id);
}

function pageOfProduct(idx: number): number {
  if (idx < FIRST_PAGE_ITEMS) return 0;
  return 1 + Math.floor((idx - FIRST_PAGE_ITEMS) / PAGE_ITEMS);
}

function buildPages(categories: Category[], products: Product[], overrides: Overrides, stock: StockMap): PageData[] {
  const idToProduct = new Map(products.map((p) => [p.id, p]));
  const pages: PageData[] = [];
  for (const cat of categories) {
    const orderedIds = getCatOrder(cat.id, products, overrides, stock);
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
  const ref = useRef<HTMLSpanElement>(null);
  const editingRef = useRef(false);

  // マウント時に初期値をセット
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // value propが変わったときだけDOMを更新（編集中は上書きしない）
  useLayoutEffect(() => {
    if (ref.current && !editingRef.current) {
      ref.current.textContent = value;
    }
  }, [value]);

  if (!editing) return <span className={className}>{value}</span>;
  return (
    <span
      ref={ref}
      className={`${className ?? ''} editable`}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => { editingRef.current = true; }}
      onBlur={(e) => {
        editingRef.current = false;
        const v = (e.currentTarget.textContent ?? '').trim();
        if (v !== value) onSave(v);
      }}
    />
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
  const [dragging, setDragging] = useState(false);
  const layout = live ?? saved;

  const persist = (l: LayoutOverride | null) =>
    onOverride((o) => {
      const fp = { ...o.layouts[productId] };
      if (l) fp[part] = l; else delete fp[part];
      return { ...o, layouts: { ...o.layouts, [productId]: fp } };
    });

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const base = { ...layout }; const sx = e.clientX; const sy = e.clientY;
    setDragging(true);
    const onMove = (ev: PointerEvent) =>
      setLive({ ...base, x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      setDragging(false);
      const next = { ...base, x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) };
      setLive(null);
      if (next.x !== 0 || next.y !== 0 || next.s !== 1) persist(next); else persist(null);
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const startScale = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const base = layout.s; const sx = e.clientX;
    const onMove = (ev: PointerEvent) => {
      const s = Math.max(0.2, Math.min(4, base + (ev.clientX - sx) * 0.01));
      setLive({ ...layout, s });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      const s = Math.max(0.2, Math.min(4, base + (ev.clientX - sx) * 0.01));
      const next = { ...layout, s };
      setLive(null);
      persist(next.x !== 0 || next.y !== 0 || next.s !== 1 ? next : null);
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const transformed = layout.x !== 0 || layout.y !== 0 || layout.s !== 1;
  const style: React.CSSProperties | undefined = transformed
    ? { transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.s})`, transformOrigin: 'top left' } : undefined;

  if (!editing) return <div className="adj" style={style}>{children}</div>;

  // 写真以外(テキストブロック)はハンドル経由でのみ移動。テキストを直接クリックして編集できるようにする。
  if (part !== 'photo') {
    return (
      <div
        className={`adj adj--editing${dragging ? ' adj--dragging' : ''}`}
        style={{ ...style, position: 'relative' }}
      >
        {children}
        <div
          className="adj__move-handle"
          title="ドラッグで移動 / ダブルクリックでリセット"
          onPointerDown={startDrag}
          onDoubleClick={() => { setLive(null); persist(null); }}
        >⠿</div>
      </div>
    );
  }

  // 写真: エリア全体がドラッグ可能
  return (
    <div
      className={`adj adj--editing adj--photo${dragging ? ' adj--dragging' : ''}`}
      style={{ ...style, cursor: dragging ? 'grabbing' : 'grab', position: 'relative', zIndex: dragging ? 20 : undefined }}
      onPointerDown={startDrag}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {children}
      <div
        className="adj__scale-handle"
        title="左右ドラッグで拡大縮小"
        onPointerDown={startScale}
        onDragStart={(e) => e.preventDefault()}
      >⤡</div>
      {transformed && (
        <div className="adj__reset-btn" title="位置・サイズをリセット"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => { setLive(null); persist(null); }}>↩</div>
      )}
    </div>
  );
}

/** ドラッグ移動・リサイズ可能な追加アイテム */
function ExtraItemEl({ item, editing, onUpdate, onDelete }: {
  item: ExtraItem;
  editing: boolean;
  onUpdate: (u: ExtraItem) => void;
  onDelete: () => void;
}) {
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const [liveSz, setLiveSz] = useState<{ w: number; h: number } | null>(null);
  const [cropping, setCropping] = useState(false);

  const x = livePos?.x ?? item.x;
  const y = livePos?.y ?? item.y;
  const w = liveSz?.w ?? item.w;
  const h = liveSz?.h ?? item.h;

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const bx = item.x, by = item.y, sx = e.clientX, sy = e.clientY;
    const onMove = (ev: PointerEvent) => setLivePos({ x: bx + ev.clientX - sx, y: by + ev.clientY - sy });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePos(null);
      onUpdate({ ...item, x: bx + ev.clientX - sx, y: by + ev.clientY - sy });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const bw = item.w ?? 160;
    const bh = item.h ?? (item.type === 'image' ? 100 : 0);
    const sx = e.clientX, sy = e.clientY;
    const onMove = (ev: PointerEvent) => setLiveSz({
      w: Math.max(60, bw + ev.clientX - sx),
      h: item.type === 'image' ? Math.max(40, bh + ev.clientY - sy) : bh,
    });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLiveSz(null);
      onUpdate({
        ...item,
        w: Math.max(60, bw + ev.clientX - sx),
        h: item.type === 'image' ? Math.max(40, bh + ev.clientY - sy) : item.h,
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const style: React.CSSProperties = {
    transform: `translate(${x}px, ${y}px)`,
    width: w ? `${w}px` : '100%',
    height: item.type === 'image' && h ? `${h}px` : 'auto',
  };

  const fs = item.fontSize ? { fontSize: `${item.fontSize}em` } : {};

  if (!editing) {
    return (
      <div className="extraitem" style={style}>
        {item.type === 'text'
          ? <p className="bcard__extratxt" style={fs}>{item.content}</p>
          : <img src={item.content} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        }
      </div>
    );
  }

  return (
    <div className="extraitem extraitem--editing" style={style} onPointerDown={startDrag}>
      {/* 削除ボタン */}
      <button className="extraitem__del" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete}>✕</button>
      {/* コンテンツ */}
      {item.type === 'text' ? (
        <>
          <p
            className="bcard__extratxt editable"
            style={fs}
            contentEditable
            suppressContentEditableWarning
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = (e.currentTarget.textContent ?? '').trim();
              if (v !== item.content) onUpdate({ ...item, content: v });
            }}
          >{item.content}</p>
          <div className="extraitem__fontctrl" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => onUpdate({ ...item, fontSize: Math.max(0.5, +((item.fontSize ?? 0.8) - 0.1).toFixed(2)) })}>A-</button>
            <button onClick={() => onUpdate({ ...item, fontSize: +((item.fontSize ?? 0.8) + 0.1).toFixed(2) })}>A+</button>
          </div>
        </>
      ) : (
        <>
          {cropping && (
            <CropModal src={item.content} onDone={(url) => { onUpdate({ ...item, content: url }); setCropping(false); }} onCancel={() => setCropping(false)} />
          )}
          <img src={item.content} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }}
            onDoubleClick={(e) => { e.stopPropagation(); setCropping(true); }}
            title="ダブルクリックで切り取り"
          />
        </>
      )}
      {/* リサイズハンドル(右下) */}
      <div className="extraitem__resize" onPointerDown={startResize} />
    </div>
  );
}

// ── 画像クロップモーダル ───────────────────────────────
function CropModal({ src, onDone, onCancel }: {
  src: string;
  onDone: (croppedDataUrl: string) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [imgRect, setImgRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; bx: number; by: number; bw: number; bh: number } | null>(null);

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ir = { x: r.left, y: r.top, w: r.width, h: r.height };
    setImgRect(ir);
    setBox({ x: ir.w * 0.1, y: ir.h * 0.1, w: ir.w * 0.8, h: ir.h * 0.8 });
  };

  const clamp = (b: typeof box, ir: typeof imgRect) => {
    if (!b || !ir) return b;
    const x = Math.max(0, Math.min(b.x, ir.w - 20));
    const y = Math.max(0, Math.min(b.y, ir.h - 20));
    const w = Math.max(20, Math.min(b.w, ir.w - x));
    const h = Math.max(20, Math.min(b.h, ir.h - y));
    return { x, y, w, h };
  };

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation();
    if (!box) return;
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, bx: box.x, by: box.y, bw: box.w, bh: box.h };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current!;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      setBox((prev) => {
        if (!prev) return prev;
        const next = mode === 'move'
          ? { x: d.bx + dx, y: d.by + dy, w: d.bw, h: d.bh }
          : { x: d.bx, y: d.by, w: d.bw + dx, h: d.bh + dy };
        return clamp(next, imgRect) ?? prev;
      });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); dragRef.current = null; };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const confirm = () => {
    const el = imgRef.current;
    if (!el || !box || !imgRect) return;
    const scaleX = el.naturalWidth / imgRect.w;
    const scaleY = el.naturalHeight / imgRect.h;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.w * scaleX);
    canvas.height = Math.round(box.h * scaleY);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(el, box.x * scaleX, box.y * scaleY, box.w * scaleX, box.h * scaleY, 0, 0, canvas.width, canvas.height);
    onDone(canvas.toDataURL('image/png'));
  };

  return (
    <div className="cropmodal__overlay" onClick={onCancel}>
      <div className="cropmodal" onClick={(e) => e.stopPropagation()}>
        <p className="cropmodal__hint">切り取り範囲をドラッグで調整 → 確定</p>
        <div className="cropmodal__imgwrap" style={{ position: 'relative', display: 'inline-block' }}>
          <img ref={imgRef} src={src} alt="" className="cropmodal__img" onLoad={onImgLoad} draggable={false} />
          {box && (
            <div
              className="cropmodal__box"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onPointerDown={(e) => startDrag(e, 'move')}
            >
              <div className="cropmodal__resize" onPointerDown={(e) => startDrag(e, 'resize')} />
            </div>
          )}
        </div>
        <div className="cropmodal__btns">
          <button className="tb__btn tb__btn--primary" onClick={confirm}>✂ 切り取り確定</button>
          <button className="tb__btn" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
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
  const [cropping, setCropping] = useState(false);
  useEffect(() => setFailed(false), [product.id]);

  const effectiveTaisCode = overrides?.products[product.id]?.taisCode ?? product.taisCode;
  const customImg = overrides?.customImages?.[product.id];

  const saveImg = (dataUrl: string) => {
    onOverride?.((o) => ({ ...o, customImages: { ...o.customImages, [product.id]: dataUrl } }));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !onOverride) return;
    void fileToCompressedDataUrl(f).then(saveImg);
  };

  const cropSrc = customImg || (effectiveTaisCode && !failed ? taisPhotoUrl(effectiveTaisCode) : null);

  const PhotoToolbar = ({ onCrop }: { onCrop: () => void }) => (
    <div className="taisphoto__toolbar" onPointerDown={e => e.stopPropagation()}>
      <label className="taisphoto__tbtn" title="画像を差し替え">
        📷
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      </label>
      {cropSrc && (
        <button className="taisphoto__tbtn" title="切り取り" onClick={onCrop}>✂</button>
      )}
    </div>
  );

  if (customImg) {
    return (
      <>
        {cropping && cropSrc && (
          <CropModal src={cropSrc} onDone={(url) => { saveImg(url); setCropping(false); }} onCancel={() => setCropping(false)} />
        )}
        <div className={`${className} taisphoto--custom`}>
          <img src={customImg} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          {editMode && onOverride && <PhotoToolbar onCrop={() => setCropping(true)} />}
        </div>
      </>
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

  // 編集モード中はリンクなし、通常モードはTAISページへリンク
  if (editMode) {
    return (
      <>
        {cropping && cropSrc && (
          <CropModal src={cropSrc} onDone={(url) => { saveImg(url); setCropping(false); }} onCancel={() => setCropping(false)} />
        )}
        <div className={`${className} taisphoto--editwrap`}>
          <img src={taisPhotoUrl(effectiveTaisCode)} alt={product.name}
            loading="lazy" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
          <PhotoToolbar onCrop={() => setCropping(true)} />
        </div>
      </>
    );
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
  onDragOverEmpty: (slotId: string) => void;
  onDrop: (targetProductId: string) => void;
  onDropToPage: (pageNo: number, catId: string) => void;
  onMoveNext: (productId: string, catId: string) => void;
  onMovePrev: (productId: string, catId: string) => void;
  onMoveToLastPage: (productId: string, catId: string) => void;
  onAltSetting: (p: Product) => void;
  onFocus: (id: string | null, large?: boolean) => void;
  focusCardId: string | null;
  focusCardLarge?: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  authMode: 'user' | 'admin';
}

function BookCard({ product, stock, officeUnits, color, large, details, editMode, overrides, onOverride, callbacks, hideEditBar }: {
  product: Product; stock: StockMap; officeUnits?: Record<string, number>; color: string; large?: boolean;
  details: TaisDetailMap; editMode: boolean; overrides: Overrides;
  onOverride: Props['onOverride']; callbacks: CardCallbacks;
  hideEditBar?: boolean;
}) {
  const qty = stock[product.id] ?? 0;
  const out = qty <= 0;
  const ov = overrides.products[product.id] ?? {};
  const cardSize = overrides.cardSize?.[product.id] ?? {};
  const detail = product.taisCode ? details[product.taisCode] : undefined;
  const isLarge = large || !!cardSize.large;

  const name = ov.name ?? product.name;
  const maker = ov.maker ?? product.maker;
  const summary = ov.summary ?? detail?.summary ?? product.description;
  const effectiveTaisCode = ov.taisCode ?? product.taisCode;
  const extraItems = ov.extraItems ?? [];

  // 車いすは特定スペックを優先表示
  let specs: [string, string][];
  if (product.categoryId === 'kurumaisu' && detail?.specs) {
    const specMap = new Map(detail.specs);
    const wc = WHEELCHAIR_SPEC_KEYS.map((k): [string, string] | null => {
      const v = [...specMap.entries()].find(([label]) => label.includes(k));
      return v ? [k, v[1]] : null;
    }).filter(Boolean) as [string, string][];
    specs = wc.length > 0 ? wc.slice(0, large ? 8 : 6) : (detail.specs ?? []).slice(0, large ? 8 : 6);
  } else {
    specs = (detail?.specs ?? []).slice(0, large ? 8 : 6);
  }

  const setField = (field: 'name' | 'maker' | 'summary' | 'price') => (v: string) =>
    onOverride((o) => ({ ...o, products: { ...o.products, [product.id]: { ...o.products[product.id], [field]: v } } }));

  const setSpecOverride = (label: string, value: string) =>
    onOverride((o) => ({
      ...o,
      products: { ...o.products, [product.id]: { ...o.products[product.id], specOverrides: { ...(o.products[product.id]?.specOverrides ?? {}), [label]: value } } },
    }));

  const patchSpecRows = (fn: (rows: { label: string; value: string }[]) => { label: string; value: string }[]) =>
    onOverride((o) => ({
      ...o,
      products: { ...o.products, [product.id]: { ...o.products[product.id], specRows: fn(o.products[product.id]?.specRows ?? []) } },
    }));
  const addSpecRow = () => patchSpecRows((rows) => [...rows, { label: '項目名', value: '値' }]);
  const updateSpecRow = (i: number, label: string, value: string) =>
    patchSpecRows((rows) => rows.map((r, idx) => idx === i ? { label, value } : r));
  const deleteSpecRow = (i: number) => patchSpecRows((rows) => rows.filter((_, idx) => idx !== i));

  const setTaisCode = (v: string) =>
    onOverride((o) => ({ ...o, products: { ...o.products, [product.id]: { ...o.products[product.id], taisCode: v } } }));


  const patchItems = (fn: (items: ExtraItem[]) => ExtraItem[]) =>
    onOverride((o) => ({
      ...o,
      products: {
        ...o.products,
        [product.id]: { ...o.products[product.id], extraItems: fn(o.products[product.id]?.extraItems ?? []) },
      },
    }));

  const addTextItem = () =>
    patchItems((items) => [...items, { id: Date.now().toString(), type: 'text', content: 'テキストを入力してください', x: 0, y: 0 }]);

  const addImageItem = (dataUrl: string) =>
    patchItems((items) => [...items, { id: Date.now().toString(), type: 'image', content: dataUrl, x: 0, y: 0, w: 150, h: 100 }]);

  const updateItem = (id: string, updated: ExtraItem) =>
    patchItems((items) => items.map((it) => it.id === id ? updated : it));

  const deleteItem = (id: string) =>
    patchItems((items) => items.filter((it) => it.id !== id));

  const adjProps = { productId: product.id, editing: editMode, overrides, onOverride };
  const { onShowAlts, onDragStart, onDragOver, onDrop, onMoveNext, onMovePrev, onAltSetting, draggingId, dragOverId, authMode } = callbacks;
  const gridStyle: React.CSSProperties =
    cardSize.cols === 3 ? { gridColumn: 'span 3' } :
    cardSize.cols === 2 ? { gridColumn: 'span 2' } : {};

  return (
    <div
      data-card-id={product.id}
      className={`bcard ${isLarge ? 'bcard--large' : ''} ${out ? 'bcard--out' : 'bcard--in'} ${draggingId === product.id ? 'bcard--dragging' : ''} ${dragOverId === product.id ? 'bcard--dragover' : ''} ${editMode ? 'bcard--editing' : ''} ${callbacks.focusCardId === product.id ? 'bcard--focused' : ''}`}
      style={gridStyle}
      draggable={editMode}
      onDragStart={() => onDragStart(product.id, product.categoryId)}
      onDragOver={(e) => onDragOver(e, product.id)}
      onDrop={() => onDrop(product.id)}
    >
      {editMode && !hideEditBar && (
        <div className="bcard__editbar">
          <button
            className="bcard__editbtn bcard__editbtn--focus"
            onClick={() => callbacks.onFocus(callbacks.focusCardId === product.id ? null : product.id, !!large)}
            title="拡大して集中編集"
          >{callbacks.focusCardId === product.id ? '← 閉じる' : '⊕ 拡大編集'}</button>
          <div className="bcard__editbar-sep" />
          <span className="bcard__editbtn bcard__editbtn--drag" draggable={false} title="ドラッグで並び替え">⠿ 並替</span>
          <div className="bcard__editbar-sep" />
          <button className="bcard__editbtn" onClick={() => onMovePrev(product.id, product.categoryId)} title="前のページへ移動">◀ 前頁</button>
          <button className="bcard__editbtn" onClick={() => onMoveNext(product.id, product.categoryId)} title="次のページへ移動">次頁 ▶</button>
          {authMode === 'admin' && (
            <>
              <div className="bcard__editbar-sep" />
              <button className="bcard__editbtn bcard__editbtn--alt" onClick={() => onAltSetting(product)} title="在庫なし時の代替品を設定">代替設定</button>
            </>
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
          {specs.map(([label, value]) => {
            const displayValue = ov.specOverrides?.[label] ?? value;
            return (
              <tr key={label}>
                <th>{label}</th>
                <td>
                  {editMode
                    ? <span className="editable" contentEditable suppressContentEditableWarning
                        onBlur={(e) => {
                          const v = (e.currentTarget.textContent ?? '').trim();
                          if (v !== displayValue) setSpecOverride(label, v);
                        }}
                      >{displayValue}</span>
                    : displayValue}
                </td>
              </tr>
            );
          })}
          {(ov.specRows ?? []).map((row, i) => (
            <tr key={`custom-${i}`}>
              <th>
                {editMode
                  ? <span className="editable" contentEditable suppressContentEditableWarning
                      onBlur={(e) => updateSpecRow(i, (e.currentTarget.textContent ?? '').trim() || row.label, row.value)}
                    >{row.label}</span>
                  : row.label}
              </th>
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editMode
                    ? <span className="editable" contentEditable suppressContentEditableWarning
                        onBlur={(e) => updateSpecRow(i, row.label, (e.currentTarget.textContent ?? '').trim())}
                      >{row.value}</span>
                    : row.value}
                  {editMode && <button className="bcard__editbtn" style={{ fontSize: '0.6em', padding: '0 3px' }} onClick={() => deleteSpecRow(i)}>✕</button>}
                </span>
              </td>
            </tr>
          ))}
          {/* ＋行追加ボタンはbcard__addbtnsオーバーレイに移動 → レイアウトに影響しない */}
        </tbody>
      </table>

      <div className="bcard__main">
        <div className="bcard__info">
          {(summary || editMode) && (
            <Adjustable part="desc" {...adjProps}>
              <Editable className="bcard__desc" value={summary || ''} editing={editMode} onSave={setField('summary')} />
            </Adjustable>
          )}
          {product.handrail && <p className="bcard__bullet">※寸法: {product.handrail.dimensions}</p>}
          {product.firmness !== undefined && <FirmnessMeter value={product.firmness} />}
          {editMode
            ? <p className="bcard__price"><Editable value={ov.price ?? (product.price > 0 ? `¥${product.price.toLocaleString()}` : '価格未設定')} editing={true} onSave={setField('price')} /></p>
            : (ov.price ? <p className="bcard__price">{ov.price}</p> : product.price > 0 ? <p className="bcard__price">¥{product.price.toLocaleString()}</p> : null)
          }
          {officeUnits && product.taisCode && officeUnits[product.taisCode] != null && (
            <span className="bcard__units">
              <span className="bcard__units-num">{officeUnits[product.taisCode].toLocaleString()}</span>
              <span className="bcard__units-label">単位</span>
            </span>
          )}
          {out ? (
            <button className="stock--outicon" onClick={() => onShowAlts(product)} title="在庫なし - 代替品を見る">✕</button>
          ) : (
            <span className="stock stock--mini stock--in">在庫 {qty}</span>
          )}
          {/* カード下部追加アイテム（複数・移動・リサイズ可） */}
          {(extraItems.length > 0 || editMode) && (
            <div className="bcard__extras">
              {extraItems.map((item) => (
                <ExtraItemEl
                  key={item.id}
                  item={item}
                  editing={editMode}
                  onUpdate={(u) => updateItem(item.id, u)}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
              {editMode && (
                <div className="bcard__addbtns">
                  <button className="bcard__editbtn" onClick={addSpecRow}>＋スペック行</button>
                  <button className="bcard__editbtn" onClick={addTextItem}>＋テキスト</button>
                  <label className="bcard__editbtn">＋画像
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void fileToCompressedDataUrl(f).then(addImageItem);
                    }} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
        <Adjustable part="photo" {...adjProps}>
          <TaisPhoto product={product} className="bcard__photo" editMode={editMode} overrides={overrides} onOverride={onOverride} />
        </Adjustable>
      </div>
    </div>
  );
}


function FocusCardModal({ product, color, onClose, stock, officeUnits, details, overrides, onOverride, callbacks, large, cardRect }: {
  product: Product; color: string; onClose: () => void;
  stock: StockMap; officeUnits?: Record<string, number>;
  details: TaisDetailMap; overrides: Overrides;
  onOverride: Props['onOverride']; callbacks: CardCallbacks;
  large?: boolean;
  cardRect?: { w: number; h: number; fontSize: string };
}) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxW = vw * 0.90 - 40;
  const maxH = vh * 0.85 - 60;

  // ── グリッドセルと同じ寸法の枠ごと拡大(レイアウト完全一致) ──────────
  // カタログのカードは「固定の幅×高さの枠」+ .page の font-size(実測8.5px)で
  // 組まれており、写真幅・余白・罫線まで全て em/px が確定している。
  // グリッドと同じ幅(cardRect.w)・高さ(cardRect.h)・フォント(cardRect.fontSize)で
  // 描画し、枠ごと transform:scale で均一拡大する。罫線も比例拡大されるため
  // 文字・写真の位置/サイズが通常モードと完全一致する。
  const DISPLAY_W = cardRect?.w ?? (large ? 420 : 340);
  const DISPLAY_H = cardRect?.h ?? Math.round(DISPLAY_W * 1.4);

  // 幅・高さ両方が画面に収まる最大スケール(小さいカードもしっかり拡大、上限4)
  const scale = Math.min(maxW / DISPLAY_W, maxH / DISPLAY_H, 4);
  const scaledW = Math.ceil(DISPLAY_W * scale);
  const scaledH = Math.ceil(DISPLAY_H * scale);

  return (
    <div className="focus-overlay" onClick={onClose}>
      <div className="focus-modal" style={{ width: scaledW + 40 }} onClick={(e) => e.stopPropagation()}>
        <div className="focus-modal__header">
          <button className="focus-modal__close-btn" onClick={onClose}>← 一覧に戻る</button>
          <span className="focus-modal__name">{product.name}</span>
          <div className="focus-modal__nav">
            <button className="focus-modal__nav-btn" onClick={() => callbacks.onMovePrev(product.id, product.categoryId)}>◀ 前頁</button>
            <button className="focus-modal__nav-btn" onClick={() => callbacks.onMoveNext(product.id, product.categoryId)}>次頁 ▶</button>
            {callbacks.authMode === 'admin' && (
              <button className="focus-modal__nav-btn focus-modal__nav-btn--alt" onClick={() => callbacks.onAltSetting(product)}>代替設定</button>
            )}
          </div>
        </div>
        {/* グリッドセルと同じ寸法・フォントの枠ごと scaledW×scaledH に拡大 */}
        <div className="focus-modal__body" style={{ padding: '12px' }}>
          <div style={{ position: 'relative', width: scaledW, height: scaledH }}>
            <div
              className="focus-clone"
              style={{
                position: 'absolute', top: 0, left: 0,
                width: DISPLAY_W, height: DISPLAY_H,
                fontSize: cardRect?.fontSize,
                overflow: 'hidden',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <BookCard
                product={product} color={color} large={large}
                stock={stock} officeUnits={officeUnits}
                details={details} editMode={true}
                overrides={overrides} onOverride={onOverride}
                callbacks={callbacks}
                hideEditBar={true}
              />
            </div>
          </div>
        </div>
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

function Page({ page, products, stock, officeUnits, side, onJump, details, editMode, overrides, onOverride, callbacks }: {
  page: PageData; products: Product[]; stock: StockMap; officeUnits?: Record<string, number>; side: 'left' | 'right';
  onJump: (id: CategoryId) => void; details: TaisDetailMap;
  editMode: boolean; overrides: Overrides; onOverride: Props['onOverride'];
  callbacks: CardCallbacks;
}) {
  const cat = page.category;
  const big = page.isCategoryFirst ? page.products.filter((p) => p.featured).slice(0, 2) : [];
  const small = page.products.filter((p) => !big.includes(p));
  const guide = overrides.guides[cat.id] ?? cat.guide;
  const cardProps = { products, stock, officeUnits, details, editMode, overrides, onOverride, callbacks, color: cat.color };

  // 空きスロット(編集時のドロップ対象)
  const maxSmall = page.isCategoryFirst ? Math.max(0, FIRST_PAGE_ITEMS - big.length) : PAGE_ITEMS;
  const emptySlotCount = editMode ? Math.max(0, maxSmall - small.length) : 0;

  // ページ行数切替
  const pageRowCount = overrides.pageRows?.[page.pageNo];
  const cycleRowCount = () => {
    const cur = overrides.pageRows?.[page.pageNo];
    const next: number | undefined = !cur ? 1 : cur === 1 ? 2 : cur === 2 ? 3 : undefined;
    onOverride((o) => {
      const nr = { ...(o.pageRows ?? {}) };
      if (next === undefined) delete nr[page.pageNo]; else nr[page.pageNo] = next;
      return { ...o, pageRows: nr };
    });
  };

  const gridClass = `page__grid${pageRowCount ? ` page__grid--rows${pageRowCount}` : ''}`;

  return (
    <div className={`page page--${side}${editMode ? ' page--editing' : ''}`} data-pdf-section>
      <div className="page__band" style={{ background: `${cat.color}22`, borderColor: cat.color }}>
        <span className="page__band-title" style={{ color: cat.color }}>
          {cat.name}
          <img src="/icon.png" alt="" className="page__band-icon" />
        </span>
        {cat.serviceCode ? (
          <span className="page__band-code">
            サービスコード 介護給付:{cat.serviceCode.kaigo} ／ 予防給付:{cat.serviceCode.yobo}
          </span>
        ) : (
          <span className="page__band-code">{cat.kind === 'purchase' ? '特定福祉用具販売' : ''}</span>
        )}
      </div>
      <SideTabs current={cat} side={side} onJump={onJump} />

      <div className="page__body">
        {editMode && (
          <div className="page__editctrl">
            <button className="bcard__editbtn" onClick={cycleRowCount} title="カード行数を切り替え">
              行数: {pageRowCount ?? '自動'}
            </button>
          </div>
        )}
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
        <div
          className={gridClass}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.stopPropagation(); callbacks.onDropToPage(page.pageNo, cat.id); }}
        >
          {small.map((p) => <BookCard key={p.id} product={p} {...cardProps} />)}
          {Array.from({ length: emptySlotCount }, (_, i) => {
            const slotId = `empty-${page.pageNo}-${i}`;
            return (
              <div
                key={slotId}
                className={`bcard__dropzone${callbacks.dragOverId === slotId ? ' bcard__dropzone--over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); callbacks.onDragOverEmpty(slotId); }}
                onDragLeave={() => callbacks.onDragOverEmpty('')}
                onDrop={(e) => { e.stopPropagation(); callbacks.onDropToPage(page.pageNo, cat.id); }}
              />
            );
          })}
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

export function CatalogBook({ categories, products, stock, officeUnits, details, navCategory, navPage, navSearch, onSearchResult, editMode, overrides, onOverride, authMode, onPageChange }: Props) {
  const pages = useMemo(() => buildPages(categories, products, overrides, stock), [categories, products, overrides, stock]);
  const [spread, setSpread] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1.0);
  const spreadRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  // スクローラーの自然サイズを測定 (zoom=1時の実際のサイズ)
  // ※ スクロールバーの出現/消失で clientWidth/Height が往復してしまう環境があるため、
  //   微小な変化(2px未満)は無視してResizeObserverの無限ループ(=表示のガタつき)を防ぐ
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      setNaturalSize((prev) => {
        const w = scroller.clientWidth, h = scroller.clientHeight;
        if (Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2) return prev;
        return { w, h };
      });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(scroller);
    return () => obs.disconnect();
  }, []);

  // ズーム変更時: 上端・水平中央へスクロールリセット
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    });
  }, [zoom]);
  const [searchMsg, setSearchMsg] = useState('');
  const [altFor, setAltFor] = useState<Product | null>(null);
  const [altSettingFor, setAltSettingFor] = useState<Product | null>(null);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [focusCardRect, setFocusCardRect] = useState<{ w: number; h: number; fontSize: string } | null>(null);
  const [focusCardLarge, setFocusCardLarge] = useState(false);
  const hasCover = !!overrides.coverImage;
  const hasBackCover = !!overrides.backCoverImage;
  // 表紙がある場合 spread=0 が表紙、spread=1〜 が商品ページ、裏表紙は末尾に追加
  const pageOffset = hasCover ? 1 : 0;
  const maxSpread = Math.max(0, Math.ceil(pages.length / 2) - 1) + pageOffset + (hasBackCover ? 1 : 0);

  const draggingRef = useRef<{ productId: string; catId: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dragPageTimer = useRef<any>(null);

  const goSpread = (s: number, anim = true) => {
    void anim;
    const next = Math.max(0, Math.min(s, maxSpread));
    if (next === spread) return;
    setSpread(next);
    const pageNo = hasCover ? Math.max(0, (next - 1) * 2 + 1) : next * 2 + 1;
    setPageInput(String(pageNo));
    onPageChange?.(next, pages.length + pageOffset);
  };

  useEffect(() => {
    onPageChange?.(spread, pages.length + pageOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length, pageOffset]);

  useEffect(() => {
    if (!navCategory) return;
    const idx = pages.findIndex((p) => p.category.id === navCategory.id);
    if (idx >= 0) goSpread(Math.floor(idx / 2) + pageOffset, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCategory, pages]);

  useEffect(() => {
    if (!navPage) return;
    goSpread(Math.floor((Math.max(1, Math.min(navPage.page, pages.length)) - 1) / 2) + pageOffset, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navPage]);

  useEffect(() => {
    if (!navSearch) return;
    const q = navSearch.query.trim().toLowerCase();
    if (!q) return;
    const idx = pages.findIndex((p) =>
      p.products.some((pr) =>
        pr.name.toLowerCase().includes(q) ||
        pr.id.toLowerCase().includes(q) ||
        (pr.description ?? '').toLowerCase().includes(q) ||
        (pr.maker ?? '').toLowerCase().includes(q)
      ),
    );
    if (idx >= 0) { goSpread(Math.floor(idx / 2), false); onSearchResult?.(''); }
    else onSearchResult?.('見つかりません');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSearch]);

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
    if (idx >= 0) goSpread(Math.floor(idx / 2) + pageOffset, false);
  };

  // ── ピンチズーム ──────────────────────────────────────
  const getPinchDist = (e: React.TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchRef.current = { dist: getPinchDist(e), zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const ratio = getPinchDist(e) / pinchRef.current.dist;
      setZoom(Math.min(4, Math.max(0.5, pinchRef.current.zoom * ratio)));
    }
  };
  const onTouchEnd = () => { pinchRef.current = null; };

  // ホイールズーム (Ctrl+スクロール)
  useEffect(() => {
    const el = spreadRef.current?.parentElement;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => Math.min(4, Math.max(0.5, z - e.deltaY * 0.003)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
    const order = getCatOrder(catId, products, overrides, stock);
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
    const order = getCatOrder(catId, products, overrides, stock);
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
    const order = getCatOrder(catId, products, overrides, stock);
    const idx = order.indexOf(productId);
    if (idx < 0) return;
    const cp = pageOfProduct(idx);
    if (cp === 0) return;
    const ppe = cp === 1 ? FIRST_PAGE_ITEMS - 1 : FIRST_PAGE_ITEMS + (cp - 1) * PAGE_ITEMS - 1;
    const newOrder = order.filter((id) => id !== productId);
    newOrder.splice(ppe, 0, productId);
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const handleMoveToLastPage = (productId: string, catId: string) => {
    const order = getCatOrder(catId, products, overrides, stock);
    if (!order.includes(productId)) return;
    const newOrder = [...order.filter((id) => id !== productId), productId];
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const handleDragOverEmpty = (slotId: string) => {
    setDragOverId(slotId || null);
  };

  const handleDropToPage = (pageNo: number, catId: string) => {
    const src = draggingRef.current;
    setDraggingId(null); setDragOverId(null); draggingRef.current = null;
    if (!src || src.catId !== catId) return;
    const targetPage = pages.find((p) => p.pageNo === pageNo && p.category.id === catId);
    if (!targetPage) return;
    const order = getCatOrder(catId, products, overrides, stock);
    if (!order.includes(src.productId)) return;
    const newOrder = order.filter((id) => id !== src.productId);
    const lastOnPage = targetPage.products[targetPage.products.length - 1];
    const insertAt = lastOnPage ? newOrder.indexOf(lastOnPage.id) + 1 : 0;
    newOrder.splice(insertAt, 0, src.productId);
    onOverride((o) => ({ ...o, cardOrder: { ...o.cardOrder, [catId]: newOrder } }));
  };

  const callbacks: CardCallbacks = {
    onShowAlts: setAltFor,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragOverEmpty: handleDragOverEmpty,
    onDrop: handleDrop,
    onDropToPage: handleDropToPage,
    onMoveNext: handleMoveNext,
    onMovePrev: handleMovePrev,
    onMoveToLastPage: handleMoveToLastPage,
    onAltSetting: setAltSettingFor,
    onFocus: (id: string | null, large?: boolean) => {
      if (id) {
        // カードの実際のCSSサイズを計測 (getBoundingClientRect / zoom = CSS px)
        const el = document.querySelector(`[data-card-id="${id}"]`) as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          // グリッドカードの実フォントサイズ(.pageの clamp 値)を取得してクローンに引き継ぐ
          const fontSize = getComputedStyle(el).fontSize;
          setFocusCardRect({ w: rect.width / zoom, h: rect.height / zoom, fontSize });
        }
        setFocusCardId(id);
        setFocusCardLarge(!!large);
      } else {
        setFocusCardId(null);
        setFocusCardRect(null);
        setFocusCardLarge(false);
      }
    },
    focusCardId,
    focusCardLarge,
    draggingId,
    dragOverId,
    authMode,
  };

  const pageIndex = hasCover ? spread - 1 : spread;
  const left = pages[pageIndex * 2];
  const right = pages[pageIndex * 2 + 1];
  const isCoverSpread = hasCover && spread === 0;
  const isBackCoverSpread = hasBackCover && spread === maxSpread;

  if (!isCoverSpread && !isBackCoverSpread && !left) return <p className="book__empty">表示できる商品がありません。</p>;

  const pageProps = { products, stock, officeUnits, details, editMode, overrides, onOverride, onJump: jumpToCategory, callbacks };

  return (
    <div className={`book ${editMode ? 'book--editing' : ''}`}>
      {editMode && (
        <p className="book__editbanner">
          ✏️ 編集モード: ≡ドラッグで並替 ／ ◀頁・頁▶でページ移動 ／ ⇤2列で幅拡大 ／ 📷で画像追加
          {authMode === 'admin' ? ' ／ 「代替設定」で代替品を管理' : ''}
        </p>
      )}
      <div className={`book__stage${editMode ? ' book__stage--editing' : ''}`}>
        <button
          className="book__arrow"
          onClick={() => goSpread(spread - 1)}
          disabled={spread === 0}
          onDragOver={(e) => {
            e.preventDefault();
            if (spread === 0 || dragPageTimer.current) return;
            dragPageTimer.current = setTimeout(() => { dragPageTimer.current = undefined; goSpread(spread - 1); }, 750);
          }}
          onDragLeave={() => { clearTimeout(dragPageTimer.current); dragPageTimer.current = undefined; }}
        >◀</button>

        <div className="book__spread-scroller" ref={scrollerRef}>
          {/* transform:scale でカタログ全体を均一拡大。ラッパーがスクロール領域を確保 */}
          <div style={{
            width: naturalSize.w > 0 ? Math.max(naturalSize.w * zoom, naturalSize.w) : '100%',
            height: naturalSize.h > 0 ? Math.max(naturalSize.h * zoom, naturalSize.h) : '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
          <div
            ref={spreadRef}
            className="book__spread"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              height: naturalSize.h > 0 ? `${naturalSize.h}px` : '100%',
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {isCoverSpread ? (
              <div className="cover-page" data-pdf-section>
                <img src={overrides.coverImage} alt="表紙" className="cover-page__img" />
              </div>
            ) : isBackCoverSpread ? (
              <div className="cover-page" data-pdf-section>
                <img src={overrides.backCoverImage} alt="裏表紙" className="cover-page__img" />
              </div>
            ) : (
              <>
                <Page page={left} side="left" {...pageProps} />
                {right && <Page page={right} side="right" {...pageProps} />}
              </>
            )}
          </div>
          </div>
        </div>

        <button
          className="book__arrow"
          onClick={() => goSpread(spread + 1)}
          disabled={spread >= maxSpread}
          onDragOver={(e) => {
            e.preventDefault();
            if (spread >= maxSpread || dragPageTimer.current) return;
            dragPageTimer.current = setTimeout(() => { dragPageTimer.current = undefined; goSpread(spread + 1); }, 750);
          }}
          onDragLeave={() => { clearTimeout(dragPageTimer.current); dragPageTimer.current = undefined; }}
        >▶</button>
      </div>

      {/* ズームコントロール */}
      <div className="book__zoom">
        <button className="book__zoom-btn" onClick={() => setZoom(z => Math.min(4, +(z + 0.1).toFixed(1)))} title="拡大">＋</button>
        <button className="book__zoom-reset" onClick={() => setZoom(1)} title="リセット">{Math.round(zoom * 100)}%</button>
        <button className="book__zoom-btn" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(1)))} title="縮小">－</button>
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
      {editMode && focusCardId && focusCardRect && (() => {
        const fp = products.find((p) => p.id === focusCardId);
        const fc = fp ? categories.find((c) => c.id === fp.categoryId) : null;
        if (!fp || !fc) return null;
        return (
          <FocusCardModal
            product={fp} color={fc.color} large={focusCardLarge}
            cardRect={focusCardRect ?? undefined}
            stock={stock} officeUnits={officeUnits}
            details={details} overrides={overrides} onOverride={onOverride}
            callbacks={callbacks}
            onClose={() => { setFocusCardId(null); setFocusCardRect(null); setFocusCardLarge(false); }}
          />
        );
      })()}
    </div>
  );
}
