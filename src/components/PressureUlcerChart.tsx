import { useMemo, useState } from 'react';
import type { Product, StockMap } from '../types';
import type { Overrides } from '../utils/overrides';
import { PRESSURE_ULCER_SPECS, PRESSURE_ULCER_SPECS_BY_PATTERN, type PressureUlcerSpec, type MattressType } from '../data/pressureUlcerSpecs';
import { taisPhotoUrl, taisDetailUrl } from '../utils/tais';

const STAGES = [
  { key: 0, label: '床ずれなし', shortDesc: '予防段階' },
  { key: 1, label: 'ステージⅠ', shortDesc: '皮膚の発赤' },
  { key: 2, label: 'ステージⅡ', shortDesc: '浅い潰瘍' },
  { key: 3, label: 'ステージⅢ', shortDesc: '深い潰瘍' },
  { key: 4, label: 'ステージⅣ', shortDesc: '骨まで到達' },
];

interface Props {
  products: Product[];
  stock: StockMap;
  overrides: Overrides;
  onOverride: (fn: (o: Overrides) => Overrides) => void;
  onClose: () => void;
  /** 選択事業所の TAISコード→単位数 マップ */
  officeUnits?: Record<string, number>;
}

/**
 * スペック解決: ①ユーザー設定 → ②IDベース組み込み → ③名前/メーカーパターンマッチング
 */
function resolveSpec(productId: string, productName: string, maker: string, overrides: Overrides): PressureUlcerSpec | undefined {
  if (overrides.pressureUlcerSpecs?.[productId]) return overrides.pressureUlcerSpecs[productId];
  if (PRESSURE_ULCER_SPECS[productId]) return PRESSURE_ULCER_SPECS[productId];

  const normName = productName.toLowerCase();
  const normMaker = maker.toLowerCase();
  for (const entry of PRESSURE_ULCER_SPECS_BY_PATTERN) {
    const nameMatch = entry.namePatterns.some(p => normName.includes(p.toLowerCase()));
    const makerMatch = !entry.makerPatterns || entry.makerPatterns.some(p => normMaker.includes(p.toLowerCase()));
    if (nameMatch && makerMatch) return entry.spec;
  }
  return undefined;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="pu-score">
      <div className="pu-score__track">
        <div className="pu-score__fill" style={{ width: `${score * 10}%` }} />
      </div>
      <span className="pu-score__label">{score}/10</span>
    </div>
  );
}

function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  if (!product.taisCode || failed) return null;
  return (
    <a href={taisDetailUrl(product.taisCode)} target="_blank" rel="noreferrer" title="TAISで詳細を見る"
      onClick={e => e.stopPropagation()}>
      <img src={taisPhotoUrl(product.taisCode)} alt={product.name}
        className="pu-row__photo" onError={() => setFailed(true)} loading="lazy" />
    </a>
  );
}

/** インライン スペック編集フォーム */
function SpecEditForm({ current, onSave, onCancel }: {
  current?: PressureUlcerSpec;
  onSave: (spec: PressureUlcerSpec) => void;
  onCancel: () => void;
}) {
  const def: PressureUlcerSpec = current ?? {
    mattressType: '静止型', subType: 'リプレイスメント',
    stageMin: 0, stageMax: 2,
    bodyPositionChange: false, pressureScore: 5,
    features: [], maxWeight: 100, material: '', pumpNoise: undefined, thickness: '',
  };
  const [type, setType] = useState<MattressType>(def.mattressType);
  const [stageMin, setStageMin] = useState<PressureUlcerSpec['stageMin']>(def.stageMin);
  const [stageMax, setStageMax] = useState<PressureUlcerSpec['stageMax']>(def.stageMax);
  const [bodyPos, setBodyPos] = useState(def.bodyPositionChange);
  const [score, setScore] = useState(def.pressureScore);
  const [maxWeight, setMaxWeight] = useState(def.maxWeight ?? 100);
  const [material, setMaterial] = useState(def.material ?? '');
  const [thickness, setThickness] = useState(def.thickness ?? '');
  const [featureInput, setFeatureInput] = useState('');
  const [features, setFeatures] = useState<string[]>(def.features ?? []);

  const addFeature = () => {
    const v = featureInput.trim();
    if (v && !features.includes(v)) { setFeatures([...features, v]); setFeatureInput(''); }
  };

  const save = () => {
    onSave({
      mattressType: type, subType: 'リプレイスメント',
      stageMin: stageMin as PressureUlcerSpec['stageMin'],
      stageMax: stageMax as PressureUlcerSpec['stageMax'],
      bodyPositionChange: bodyPos, pressureScore: score,
      features, maxWeight, material, thickness,
    });
  };

  return (
    <div className="pu-specform" onClick={e => e.stopPropagation()}>
      <div className="pu-specform__row">
        <label className="pu-specform__label">タイプ</label>
        <div className="pu-specform__btns">
          {(['圧切替型', '静止型'] as MattressType[]).map(t => (
            <button key={t}
              className={`pu-specform__opt ${type === t ? 'pu-specform__opt--on' : ''}`}
              onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">対応ステージ</label>
        <div className="pu-specform__range">
          <select value={stageMin} onChange={e => setStageMin(Number(e.target.value) as PressureUlcerSpec['stageMin'])} className="pu-specform__sel">
            {STAGES.slice(0, 4).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span>〜</span>
          <select value={stageMax} onChange={e => setStageMax(Number(e.target.value) as PressureUlcerSpec['stageMax'])} className="pu-specform__sel">
            {STAGES.slice(1).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">体位変換機能</label>
        <label className="pu-specform__check">
          <input type="checkbox" checked={bodyPos} onChange={e => setBodyPos(e.target.checked)} />
          あり
        </label>
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">体圧分散スコア</label>
        <div className="pu-specform__score">
          <input type="range" min={1} max={10} value={score}
            onChange={e => setScore(Number(e.target.value))} className="pu-specform__range-input" />
          <span className="pu-specform__score-val">{score}/10</span>
        </div>
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">素材</label>
        <input className="pu-specform__input" value={material}
          onChange={e => setMaterial(e.target.value)} placeholder="例: エアセル、ウレタン" />
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">厚さ</label>
        <input className="pu-specform__input" value={thickness}
          onChange={e => setThickness(e.target.value)} placeholder="例: 12cm" style={{ width: 80 }} />
      </div>

      <div className="pu-specform__row">
        <label className="pu-specform__label">耐荷重</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" className="pu-specform__input" value={maxWeight}
            onChange={e => setMaxWeight(Number(e.target.value))} style={{ width: 70 }} />
          <span style={{ fontSize: '0.8rem', color: '#666' }}>kg</span>
        </div>
      </div>

      <div className="pu-specform__row pu-specform__row--top">
        <label className="pu-specform__label">特徴タグ</label>
        <div className="pu-specform__tags">
          {features.map(f => (
            <span key={f} className="pu-feature-tag pu-feature-tag--edit">
              {f}
              <button onClick={() => setFeatures(features.filter(x => x !== f))}>×</button>
            </span>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <input className="pu-specform__input" value={featureInput}
              onChange={e => setFeatureInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFeature()}
              placeholder="タグを追加してEnter" style={{ flex: 1 }} />
            <button className="pu-specform__addbtn" onClick={addFeature}>追加</button>
          </div>
        </div>
      </div>

      <div className="pu-specform__footer">
        <button className="pu-specform__save" onClick={save}>保存</button>
        <button className="pu-specform__cancel" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}

export function PressureUlcerChart({ products, stock, overrides, onOverride, onClose, officeUnits }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'chart' | 'compare'>('chart');
  const [editingId, setEditingId] = useState<string | null>(null);

  const tokozureProducts = useMemo(
    () => products.filter(p => p.categoryId === 'tokozure'),
    [products],
  );

  const airProducts = useMemo(() =>
    tokozureProducts
      .filter(p => resolveSpec(p.id, p.name, p.maker, overrides)?.mattressType === '圧切替型')
      .sort((a, b) => (resolveSpec(b.id, b.name, b.maker, overrides)?.pressureScore ?? 0) - (resolveSpec(a.id, a.name, a.maker, overrides)?.pressureScore ?? 0)),
    [tokozureProducts, overrides],
  );

  const staticProducts = useMemo(() =>
    tokozureProducts
      .filter(p => resolveSpec(p.id, p.name, p.maker, overrides)?.mattressType === '静止型')
      .sort((a, b) => (resolveSpec(b.id, b.name, b.maker, overrides)?.pressureScore ?? 0) - (resolveSpec(a.id, a.name, a.maker, overrides)?.pressureScore ?? 0)),
    [tokozureProducts, overrides],
  );

  const unsetProducts = useMemo(() =>
    tokozureProducts.filter(p => !resolveSpec(p.id, p.name, p.maker, overrides)),
    [tokozureProducts, overrides],
  );

  const toggle = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const getName = (p: Product) => overrides.products[p.id]?.name ?? p.name;
  const selectedProducts = tokozureProducts.filter(p => selectedIds.has(p.id));

  const saveSpec = (productId: string, spec: PressureUlcerSpec) => {
    onOverride(o => ({
      ...o,
      pressureUlcerSpecs: { ...(o.pressureUlcerSpecs ?? {}), [productId]: spec },
    }));
    setEditingId(null);
  };

  const deleteSpec = (productId: string) => {
    onOverride(o => {
      const next = { ...(o.pressureUlcerSpecs ?? {}) };
      delete next[productId];
      return { ...o, pressureUlcerSpecs: next };
    });
  };

  const getBarStyle = (spec: PressureUlcerSpec): React.CSSProperties => {
    const colW = 100 / STAGES.length;
    return { left: `${spec.stageMin * colW}%`, width: `${(spec.stageMax - spec.stageMin + 1) * colW}%` };
  };

  const stageLabel = (spec: PressureUlcerSpec) => {
    const min = STAGES[spec.stageMin].label;
    const max = STAGES[spec.stageMax].label;
    return min === max ? min : `${min} 〜 ${max}`;
  };

  const isUserSpec = (productId: string) => !!(overrides.pressureUlcerSpecs?.[productId]);

  const renderRow = (p: Product) => {
    const spec = resolveSpec(p.id, p.name, p.maker, overrides);
    if (!spec) return null;
    const sel = selectedIds.has(p.id);
    const outOfStock = (stock[p.id] ?? 0) === 0;
    const editing = editingId === p.id;
    return (
      <div key={p.id} className="pu-rowwrap">
        <div className={`pu-row${sel ? ' pu-row--sel' : ''}${outOfStock ? ' pu-row--out' : ''}`}>
          <label className="pu-row__label" htmlFor={`puc-${p.id}`}>
            <input id={`puc-${p.id}`} type="checkbox" className="pu-row__chk"
              checked={sel} onChange={() => toggle(p.id)} />
            <ProductPhoto product={p} />
            <span className="pu-row__info">
              <span className="pu-row__name">{getName(p)}</span>
              <span className="pu-row__maker">{p.maker}</span>
              {p.taisCode && <span className="pu-row__tais">{p.taisCode}</span>}
              {outOfStock && <span className="pu-row__outstk">在庫なし</span>}
            </span>
          </label>
          <div className="pu-row__barwrap">
            {STAGES.map(s => <div key={s.key} className="pu-row__col" />)}
            <div
              className={`pu-row__bar${spec.mattressType === '圧切替型' ? ' pu-row__bar--air' : ' pu-row__bar--static'}`}
              style={getBarStyle(spec)} title={stageLabel(spec)}
            >
              {spec.bodyPositionChange && <span className="pu-row__badge">体位変換</span>}
            </div>
          </div>
          <div className="pu-row__actions">
            <button className="pu-row__editbtn" title="スペックを編集"
              onClick={() => setEditingId(editing ? null : p.id)}>
              {editing ? '✕' : '✏️'}
            </button>
            {isUserSpec(p.id) && (
              <button className="pu-row__delbtn" title="初期値に戻す"
                onClick={() => deleteSpec(p.id)}>↩</button>
            )}
          </div>
        </div>
        {editing && (
          <div className="pu-row__formpanel">
            <SpecEditForm
              current={resolveSpec(p.id, p.name, p.maker, overrides)}
              onSave={s => saveSpec(p.id, s)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        )}
      </div>
    );
  };

  const renderUnsetRow = (p: Product) => {
    const editing = editingId === p.id;
    const outOfStock = (stock[p.id] ?? 0) === 0;
    return (
      <div key={p.id} className="pu-rowwrap">
        <div className={`pu-row pu-row--unset${outOfStock ? ' pu-row--out' : ''}`}>
          <label className="pu-row__label" style={{ opacity: 0.5, pointerEvents: 'none' }}>
            <input type="checkbox" className="pu-row__chk" disabled />
            <ProductPhoto product={p} />
            <span className="pu-row__info">
              <span className="pu-row__name">{getName(p)}</span>
              <span className="pu-row__maker">{p.maker}</span>
              {p.taisCode && <span className="pu-row__tais">{p.taisCode}</span>}
              {outOfStock && <span className="pu-row__outstk">在庫なし</span>}
            </span>
          </label>
          <div className="pu-row__barwrap" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <span className="pu-row__unsetlabel">— スペック未設定 —</span>
          </div>
          <div className="pu-row__actions">
            <button className="pu-row__editbtn pu-row__editbtn--new" title="スペックを設定する"
              onClick={() => setEditingId(editing ? null : p.id)}>
              {editing ? '✕' : '＋設定'}
            </button>
          </div>
        </div>
        {editing && (
          <div className="pu-row__formpanel">
            <SpecEditForm
              current={undefined}
              onSave={s => saveSpec(p.id, s)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pu-overlay" onClick={onClose}>
      <div className="pu-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pu-modal__head">
          <div>
            <h2 className="pu-modal__title">床ずれ防止用具 選定チャート</h2>
            <p className="pu-modal__sub">✏️ で各製品のスペックを設定 / チェックして比較表を作成</p>
          </div>
          <div className="pu-modal__headbtns">
            {view === 'chart' && selectedIds.size >= 2 && (
              <button className="pu-btn pu-btn--compare" onClick={() => setView('compare')}>
                {selectedIds.size}製品を比較
              </button>
            )}
            {view === 'compare' && (
              <button className="pu-btn" onClick={() => setView('chart')}>← チャートに戻る</button>
            )}
            <button className="pu-btn pu-btn--close" onClick={onClose}>✕ 閉じる</button>
          </div>
        </div>

        {view === 'chart' && (
          <div className="pu-chart">
            {/* Stage column headers */}
            <div className="pu-chart__header">
              <div className="pu-chart__header-left">
                <span className="pu-chart__header-topline">床ずれの程度</span>
                <span className="pu-chart__header-botline">マットレス</span>
              </div>
              <div className="pu-chart__header-cols">
                {STAGES.map(s => (
                  <div key={s.key} className="pu-chart__hcol">
                    <div className={`pu-chart__hcol-badge pu-chart__hcol-badge--${s.key}`}>{s.label}</div>
                    <div className="pu-chart__hcol-desc">{s.shortDesc}</div>
                  </div>
                ))}
              </div>
              <div className="pu-chart__header-actions" />
            </div>

            {/* Performance axis */}
            <div className="pu-axis">
              <div className="pu-axis__left">体圧分散性能</div>
              <div className="pu-axis__right">
                <span className="pu-axis__lo">低</span>
                <div className="pu-axis__gradient" />
                <span className="pu-axis__hi">高</span>
              </div>
              <div style={{ width: 72 }} />
            </div>

            {/* 圧切替型 */}
            {airProducts.length > 0 && (
              <div className="pu-group">
                <div className="pu-group__head pu-group__head--air">
                  <div className="pu-group__type">圧<br/>切<br/>替<br/>型</div>
                  <div className="pu-group__sub">リプレイスメント</div>
                </div>
                <div className="pu-group__rows">{airProducts.map(renderRow)}</div>
              </div>
            )}

            {/* 静止型 */}
            {staticProducts.length > 0 && (
              <div className="pu-group">
                <div className="pu-group__head pu-group__head--static">
                  <div className="pu-group__type">静<br/>止<br/>型</div>
                  <div className="pu-group__sub">リプレイスメント</div>
                </div>
                <div className="pu-group__rows">{staticProducts.map(renderRow)}</div>
              </div>
            )}

            {/* スペック未設定 */}
            {unsetProducts.length > 0 && (
              <div className="pu-group">
                <div className="pu-group__head pu-group__head--unset">
                  <div className="pu-group__type" style={{ fontSize: '0.65rem' }}>未<br/>設<br/>定</div>
                </div>
                <div className="pu-group__rows">{unsetProducts.map(renderUnsetRow)}</div>
              </div>
            )}

            {tokozureProducts.length === 0 && (
              <p className="pu-empty">床ずれ防止用具の登録がありません。</p>
            )}

            {selectedIds.size > 0 && (
              <div className="pu-hint">
                {selectedIds.size}製品を選択中。
                {selectedIds.size < 2 ? 'もう1製品選択すると比較できます。' : '「比較」ボタンで詳細比較ができます。'}
              </div>
            )}
          </div>
        )}

        {view === 'compare' && (
          <div className="pu-compare">
            <div className="pu-compare__scroll">
              <table className="pu-compare__tbl">
                <thead>
                  <tr>
                    <th className="pu-compare__rowth">比較項目</th>
                    {selectedProducts.map(p => (
                      <th key={p.id} className="pu-compare__colth">
                        <div className="pu-compare__product-head">
                          <ProductPhoto product={p} />
                          <div>
                            <div className="pu-compare__pname">{getName(p)}</div>
                            <div className="pu-compare__pmaker">{p.maker}</div>
                            <div className={`pu-compare__pstock${(stock[p.id] ?? 0) === 0 ? ' pu-compare__pstock--out' : ''}`}>
                              {(stock[p.id] ?? 0) > 0 ? `在庫 ${stock[p.id]}` : '在庫なし'}
                            </div>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['タイプ', (p: Product) => {
                      const s = resolveSpec(p.id, p.name, p.maker, overrides);
                      return s ? <span className={`pu-type-badge pu-type-badge--${s.mattressType === '圧切替型' ? 'air' : 'static'}`}>{s.mattressType}</span> : '—';
                    }],
                    ['対応ステージ', (p: Product) => { const s = resolveSpec(p.id, p.name, p.maker, overrides); return s ? stageLabel(s) : '—'; }],
                    ['体位変換機能', (p: Product) => { const s = resolveSpec(p.id, p.name, p.maker, overrides); return s?.bodyPositionChange ? '✓ あり' : '—'; }],
                    ['体圧分散性能', (p: Product) => { const s = resolveSpec(p.id, p.name, p.maker, overrides); return s ? <ScoreBar score={s.pressureScore} /> : '—'; }],
                    ['耐荷重', (p: Product) => { const s = resolveSpec(p.id, p.name, p.maker, overrides); return s?.maxWeight ? `${s.maxWeight}kg` : '—'; }],
                    ['素材', (p: Product) => resolveSpec(p.id, p.name, p.maker, overrides)?.material || '—'],
                    ['厚さ', (p: Product) => resolveSpec(p.id, p.name, p.maker, overrides)?.thickness || '—'],
                    ['ポンプ音', (p: Product) => resolveSpec(p.id, p.name, p.maker, overrides)?.pumpNoise || '—'],
                    ['主な特徴', (p: Product) => {
                      const f = resolveSpec(p.id, p.name, p.maker, overrides)?.features ?? [];
                      return f.length ? <>{f.map((t, i) => <span key={i} className="pu-feature-tag">{t}</span>)}</> : '—';
                    }],
                    ['レンタル単価', (p: Product) => {
                      const units = p.taisCode ? officeUnits?.[p.taisCode] : undefined;
                      if (units != null) return `${units.toLocaleString()}単位/月`;
                      if (p.price > 0) return `¥${p.price.toLocaleString()}/月`;
                      return '—';
                    }],
                  ] as [string, (p: Product) => React.ReactNode][]).map(([label, render]) => (
                    <tr key={label}>
                      <th className="pu-compare__rowth">{label}</th>
                      {selectedProducts.map(p => (
                        <td key={p.id} className={`pu-compare__td${label === '体位変換機能' && resolveSpec(p.id, p.name, p.maker, overrides)?.bodyPositionChange ? ' pu-compare__td--yes' : ''}${label === '主な特徴' ? ' pu-compare__td--features' : ''}`}>
                          {render(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
