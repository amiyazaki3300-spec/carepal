import { useMemo, useState } from 'react';
import type { Product, StockMap } from '../types';
import { taisPhotoUrl } from '../utils/tais';
import { PROPOSAL_RANK_KEY } from './AiSelector';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';

interface Props {
  products: Product[];
  stock: StockMap;
  onAiOpen: () => void;
}

function MiniCard({ product, stock }: { product: Product; stock: StockMap }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const inStock = (stock[product.id] ?? 0) > 0;
  const photoUrl = product.taisCode ? taisPhotoUrl(product.taisCode) : null;

  return (
    <div className={`rec-card ${!inStock ? 'rec-card--nostock' : ''}`}>
      <div className="rec-card__photo">
        {photoUrl && !photoFailed ? (
          <img src={photoUrl} alt={product.name} onError={() => setPhotoFailed(true)} loading="lazy" />
        ) : (
          <span className="rec-card__photo-icon">📦</span>
        )}
      </div>
      <div className="rec-card__name">{product.name}</div>
      <div className="rec-card__maker">{product.maker}</div>
      <div className={`rec-card__stock ${inStock ? 'rec-card__stock--in' : 'rec-card__stock--out'}`}>
        {inStock ? '在庫あり' : '在庫なし'}
      </div>
    </div>
  );
}

export function RecommendBar({ products, stock, onAiOpen }: Props) {
  const [open, setOpen] = useState(true);

  const recommended = useMemo(() => {
    try {
      const counts = JSON.parse(localStorage.getItem(PROPOSAL_RANK_KEY) ?? '{}') as Record<string, number>;
      const ranked = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => products.find(p => p.id === id))
        .filter((p): p is Product => !!p)
        .slice(0, 6);
      if (ranked.length >= 2) return ranked;
    } catch { /* ignore */ }

    // フォールバック: 在庫ありのfeatured商品
    return products
      .filter(p => p.featured && (stock[p.id] ?? 0) > 0)
      .slice(0, 6);
  }, [products, stock]);

  if (recommended.length === 0) return null;

  return (
    <div className="rec-bar">
      <div className="rec-bar__header" onClick={() => setOpen(v => !v)}>
        <span className="rec-bar__title">
          <Star size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          おすすめ商品
        </span>
        <div className="rec-bar__actions">
          <button
            className="rec-bar__ai-btn"
            onClick={e => { e.stopPropagation(); onAiOpen(); }}
          >
            AI で選定する
          </button>
          <span className="rec-bar__toggle">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>
      </div>
      {open && (
        <div className="rec-bar__scroll">
          {recommended.map(p => (
            <MiniCard key={p.id} product={p} stock={stock} />
          ))}
        </div>
      )}
    </div>
  );
}
