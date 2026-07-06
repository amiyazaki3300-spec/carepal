import { useState } from 'react';
import { PROPOSAL_RANK_KEY } from './AiSelector';
import { taisPhotoUrl } from '../utils/tais';
import type { Category, Product, StockDetail, StockDetailMap, StockMap } from '../types';

function loadProposalCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PROPOSAL_RANK_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}

interface Props {
  products: Product[];
  categories: Category[];
  stock: StockMap;
  stockDetail?: StockDetailMap;
  onClose: () => void;
}

function sumDetail(details: StockDetail[]): StockDetail {
  return details.reduce(
    (acc, d) => ({
      available: acc.available + d.available,
      reserved: acc.reserved + d.reserved,
      renting: acc.renting + d.renting,
      cancelled: acc.cancelled + d.cancelled,
      recovering: acc.recovering + d.recovering,
      maintenance: acc.maintenance + d.maintenance,
      total: acc.total + d.total,
      unusable: acc.unusable + d.unusable,
    }),
    { available: 0, reserved: 0, renting: 0, cancelled: 0, recovering: 0, maintenance: 0, total: 0, unusable: 0 }
  );
}

function operatingRate(d: StockDetail): number {
  // 稼働率 = 契約中 ÷ (契約中 + 引当可 + 予約 + 回収済 + メンテ中)
  const denom = d.renting + d.available + d.reserved + d.recovering + d.maintenance;
  if (denom <= 0) return 0;
  return Math.round((d.renting / denom) * 100);
}

export function Dashboard({ products, categories, stock, stockDetail, onClose }: Props) {
  const [tab, setTab] = useState<'stock' | 'rank'>('stock');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [proposalCounts, setProposalCounts] = useState(() => loadProposalCounts());

  const hasDetail = !!stockDetail && Object.keys(stockDetail).length > 0;

  // ── 全体集計 ──
  const allDetails = hasDetail
    ? products.map(p => stockDetail![p.id]).filter(Boolean)
    : [];
  const total = hasDetail ? sumDetail(allDetails) : null;

  // 詳細なしの場合のシンプル集計
  const inStockCount = products.filter(p => (stock[p.id] ?? 0) > 0).length;
  const outStockCount = products.length - inStockCount;
  const inStockRate = products.length > 0 ? Math.round((inStockCount / products.length) * 100) : 0;

  // ── 品目別集計 ──
  const catStats = categories.map(c => {
    const ps = products.filter(p => p.categoryId === c.id);
    if (ps.length === 0) return null;
    if (hasDetail) {
      const details = ps.map(p => stockDetail![p.id]).filter(Boolean);
      const s = sumDetail(details);
      return { cat: c, count: ps.length, detail: s, rate: operatingRate(s) };
    }
    const inS = ps.filter(p => (stock[p.id] ?? 0) > 0).length;
    return { cat: c, count: ps.length, detail: null, inStock: inS };
  }).filter(Boolean) as NonNullable<ReturnType<typeof categories.map>[0]>[];

  // ── AI提案ランキング ──
  const ranked = products
    .map(p => ({ product: p, count: proposalCounts[p.id] ?? 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxCount = ranked[0]?.count ?? 1;

  const resetRanking = () => {
    localStorage.removeItem(PROPOSAL_RANK_KEY);
    setProposalCounts({});
    setResetConfirm(false);
  };

  // ── 稼働率上位商品（詳細あり時） ──
  const topRenting = hasDetail
    ? products
        .map(p => ({ product: p, detail: stockDetail![p.id] }))
        .filter(x => x.detail && x.detail.renting > 0)
        .sort((a, b) => b.detail.renting - a.detail.renting)
        .slice(0, 10)
    : [];

  return (
    <div className="dash-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-modal">
        <div className="dash-header">
          <div>
            <div className="dash-header__title">📊 ダッシュボード</div>
            <div className="dash-header__sub">在庫状況・稼働分析・AI提案実績</div>
          </div>
          <button className="dash-close" onClick={onClose}>✕ 閉じる</button>
        </div>

        {/* タブ */}
        <div className="dash-tabs">
          <button className={`dash-tab ${tab === 'stock' ? 'dash-tab--active' : ''}`} onClick={() => setTab('stock')}>
            📦 在庫・稼働分析
          </button>
          <button className={`dash-tab ${tab === 'rank' ? 'dash-tab--active' : ''}`} onClick={() => setTab('rank')}>
            🤖 AI提案ランキング
          </button>
        </div>

        <div className="dash-body">
          {tab === 'stock' && (
            <>
              {/* 概要カード */}
              {hasDetail && total ? (
                <div className="dash-stat-grid dash-stat-grid--wide">
                  <div className="dash-stat dash-stat--total">
                    <div className="dash-stat__value">{total.total}</div>
                    <div className="dash-stat__label">総在庫数（S）</div>
                  </div>
                  <div className="dash-stat dash-stat--avail">
                    <div className="dash-stat__value">{total.available}</div>
                    <div className="dash-stat__label">引当可（L）</div>
                  </div>
                  <div className="dash-stat dash-stat--rent">
                    <div className="dash-stat__value">{total.renting}</div>
                    <div className="dash-stat__label">契約中（N）</div>
                  </div>
                  <div className="dash-stat dash-stat--reserved">
                    <div className="dash-stat__value">{total.reserved}</div>
                    <div className="dash-stat__label">予約数（M）</div>
                  </div>
                  <div className="dash-stat dash-stat--recover">
                    <div className="dash-stat__value">{total.recovering}</div>
                    <div className="dash-stat__label">回収済（P）</div>
                  </div>
                  <div className="dash-stat dash-stat--maint">
                    <div className="dash-stat__value">{total.maintenance}</div>
                    <div className="dash-stat__label">メンテ中（Q）</div>
                  </div>
                  <div className="dash-stat dash-stat--rate">
                    <div className="dash-stat__value">{operatingRate(total)}%</div>
                    <div className="dash-stat__label">稼働率</div>
                  </div>
                </div>
              ) : (
                <div className="dash-stat-grid">
                  <div className="dash-stat dash-stat--total">
                    <div className="dash-stat__value">{products.length}</div>
                    <div className="dash-stat__label">総登録商品数</div>
                  </div>
                  <div className="dash-stat dash-stat--avail">
                    <div className="dash-stat__value">{inStockCount}</div>
                    <div className="dash-stat__label">在庫あり</div>
                  </div>
                  <div className="dash-stat dash-stat--unusable">
                    <div className="dash-stat__value">{outStockCount}</div>
                    <div className="dash-stat__label">在庫なし</div>
                  </div>
                  <div className="dash-stat dash-stat--rate">
                    <div className="dash-stat__value">{inStockRate}%</div>
                    <div className="dash-stat__label">在庫あり率</div>
                  </div>
                </div>
              )}

              {/* 全体稼働バー（詳細あり） */}
              {hasDetail && total && (
                <div className="dash-section">
                  <div className="dash-section__title">全体 在庫内訳バー（稼働率 {operatingRate(total)}%）</div>
                  <div className="dash-status-bar">
                    {total.renting > 0 && (
                      <div className="dash-status-bar__seg dash-status-bar__seg--rent" style={{ flex: total.renting }}
                        title={`契約中: ${total.renting}`} />
                    )}
                    {total.reserved > 0 && (
                      <div className="dash-status-bar__seg dash-status-bar__seg--reserved" style={{ flex: total.reserved }}
                        title={`予約: ${total.reserved}`} />
                    )}
                    {total.available > 0 && (
                      <div className="dash-status-bar__seg dash-status-bar__seg--avail" style={{ flex: total.available }}
                        title={`引当可: ${total.available}`} />
                    )}
                    {total.recovering > 0 && (
                      <div className="dash-status-bar__seg dash-status-bar__seg--recover" style={{ flex: total.recovering }}
                        title={`回収済: ${total.recovering}`} />
                    )}
                    {total.maintenance > 0 && (
                      <div className="dash-status-bar__seg dash-status-bar__seg--maint" style={{ flex: total.maintenance }}
                        title={`メンテ中: ${total.maintenance}`} />
                    )}
                  </div>
                  <div className="dash-status-legend">
                    <span className="dash-legend dash-legend--rent">■ 契約中</span>
                    <span className="dash-legend dash-legend--reserved">■ 予約</span>
                    <span className="dash-legend dash-legend--avail">■ 引当可</span>
                    <span className="dash-legend dash-legend--recover">■ 回収済</span>
                    <span className="dash-legend dash-legend--maint">■ メンテ中</span>
                  </div>
                </div>
              )}

              {/* 品目別テーブル */}
              <div className="dash-section">
                <div className="dash-section__title">品目別 在庫内訳</div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th className="dash-table__th dash-table__th--name">品目</th>
                        {hasDetail ? (
                          <>
                            <th className="dash-table__th" title="S列: 全在庫">在庫数</th>
                            <th className="dash-table__th" title="L列: 倉庫から出庫可">引当可</th>
                            <th className="dash-table__th" title="M列: 予約が入っている数">予約</th>
                            <th className="dash-table__th" title="N列: 実際にレンタル中">契約中</th>
                            <th className="dash-table__th" title="P列: 返却済・消毒前">回収済</th>
                            <th className="dash-table__th" title="Q列: 消毒・修理中">メンテ中</th>
                            <th className="dash-table__th" title="契約中÷(契約中+引当可+予約+回収済+メンテ中)">稼働率</th>
                          </>
                        ) : (
                          <>
                            <th className="dash-table__th">商品数</th>
                            <th className="dash-table__th">在庫あり</th>
                            <th className="dash-table__th">在庫なし</th>
                            <th className="dash-table__th dash-table__th--bar">在庫率</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(catStats as Array<{cat: Category; count: number; detail: StockDetail | null; rate?: number; inStock?: number}>).map(({ cat, count, detail, rate, inStock }) => {
                        const outS = detail ? 0 : count - (inStock ?? 0);
                        return (
                          <tr key={cat.id} className="dash-table__row">
                            <td className="dash-table__td dash-table__td--name">{cat.name}</td>
                            {detail ? (
                              <>
                                <td className="dash-table__td dash-table__td--num">{detail.total}</td>
                                <td className="dash-table__td dash-table__td--avail">{detail.available}</td>
                                <td className="dash-table__td dash-table__td--reserved">{detail.reserved}</td>
                                <td className="dash-table__td dash-table__td--rent">{detail.renting}</td>
                                <td className="dash-table__td dash-table__td--recover">{detail.recovering}</td>
                                <td className="dash-table__td dash-table__td--maint">{detail.maintenance}</td>
                                <td className="dash-table__td">
                                  <div className="dash-mini-bar">
                                    <div className="dash-mini-bar__fill" style={{ width: `${rate ?? 0}%` }} />
                                    <span className="dash-mini-bar__pct">{rate ?? 0}%</span>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="dash-table__td dash-table__td--num">{count}</td>
                                <td className="dash-table__td dash-table__td--avail">{inStock ?? 0}</td>
                                <td className="dash-table__td">{outS}</td>
                                <td className="dash-table__td">
                                  <div className="dash-mini-bar">
                                    <div className="dash-mini-bar__fill" style={{ width: `${count > 0 ? Math.round(((inStock ?? 0) / count) * 100) : 0}%` }} />
                                    <span className="dash-mini-bar__pct">{count > 0 ? Math.round(((inStock ?? 0) / count) * 100) : 0}%</span>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* レンタル中上位商品 */}
              {topRenting.length > 0 && (
                <div className="dash-section">
                  <div className="dash-section__title">契約中 件数TOP（レンタル稼働商品）</div>
                  <div className="dash-rank-list">
                    {topRenting.map(({ product, detail }, i) => {
                      const photoUrl = product.taisCode ? taisPhotoUrl(product.taisCode) : null;
                      const rate = operatingRate(detail);
                      return (
                        <div key={product.id} className="dash-rank-item">
                          <div className="dash-rank-item__num">{i + 1}</div>
                          {photoUrl && (
                            <img src={photoUrl} alt={product.name} className="dash-rank-item__photo"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          <div className="dash-rank-item__info">
                            <div className="dash-rank-item__name">{product.name}</div>
                            <div className="dash-rank-item__maker">{product.maker}</div>
                            <div className="dash-detail-chips">
                              <span className="dash-chip dash-chip--rent">契約中 {detail.renting}</span>
                              <span className="dash-chip dash-chip--avail">引当可 {detail.available}</span>
                              {detail.recovering > 0 && <span className="dash-chip dash-chip--recover">回収済 {detail.recovering}</span>}
                              {detail.maintenance > 0 && <span className="dash-chip dash-chip--maint">メンテ {detail.maintenance}</span>}
                            </div>
                          </div>
                          <div className="dash-rank-item__count">
                            <span className="dash-rank-item__count-num">{rate}%</span>
                            <span className="dash-rank-item__count-label">稼働率</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!hasDetail && (
                <div className="dash-notice">
                  💡 在庫Excelをアップロードすると、引当可・契約中・メンテ中などの詳細な稼働分析が表示されます。
                </div>
              )}
            </>
          )}

          {tab === 'rank' && (
            <div className="dash-section">
              <div className="dash-section__head">
                <div className="dash-section__title">🤖 AI提案ランキング（累計）</div>
                {ranked.length > 0 && (
                  !resetConfirm
                    ? <button className="dash-reset-btn" onClick={() => setResetConfirm(true)}>リセット</button>
                    : (
                      <div className="dash-reset-confirm">
                        <span>本当にリセット?</span>
                        <button className="dash-reset-btn dash-reset-btn--danger" onClick={resetRanking}>はい</button>
                        <button className="dash-reset-btn" onClick={() => setResetConfirm(false)}>いいえ</button>
                      </div>
                    )
                )}
              </div>
              {ranked.length === 0 ? (
                <div className="dash-empty">AIによる提案履歴がまだありません。<br />AI選定を使うと、ここに提案回数が記録されます。</div>
              ) : (
                <div className="dash-rank-list">
                  {ranked.map(({ product, count }, i) => {
                    const photoUrl = product.taisCode ? taisPhotoUrl(product.taisCode) : null;
                    const inS = (stock[product.id] ?? 0) > 0;
                    const detail = stockDetail?.[product.id];
                    return (
                      <div key={product.id} className="dash-rank-item">
                        <div className="dash-rank-item__num">{i + 1}</div>
                        {photoUrl && (
                          <img src={photoUrl} alt={product.name} className="dash-rank-item__photo"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="dash-rank-item__info">
                          <div className="dash-rank-item__name">{product.name}</div>
                          <div className="dash-rank-item__maker">{product.maker}</div>
                          {detail ? (
                            <div className="dash-detail-chips">
                              <span className="dash-chip dash-chip--rent">契約中 {detail.renting}</span>
                              <span className="dash-chip dash-chip--avail">引当可 {detail.available}</span>
                            </div>
                          ) : (
                            <div className="dash-rank-bar">
                              <div className="dash-rank-bar__fill" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="dash-rank-item__count">
                          <span className="dash-rank-item__count-num">{count}</span>
                          <span className="dash-rank-item__count-label">回提案</span>
                        </div>
                        <div className={`dash-rank-item__stock ${inS ? 'dash-rank-item__stock--in' : 'dash-rank-item__stock--out'}`}>
                          {inS ? '在庫◎' : '在庫✕'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
