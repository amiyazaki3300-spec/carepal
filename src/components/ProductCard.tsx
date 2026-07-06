import { useState } from 'react';
import type { Product, StockMap } from '../types';
import { taisDetailUrl, taisPhotoUrl } from '../utils/tais';
import { suggestAlternatives } from '../utils/alternatives';
import { FirmnessMeter } from './FirmnessMeter';

interface Props {
  product: Product;
  products: Product[];
  stock: StockMap;
  officeUnits?: Record<string, number>;
  isMobile?: boolean;
  onTap?: (p: Product) => void;
}

/** 商品カード。featured は大きく表示、在庫なしなら代替品を提示 */
export function ProductCard({ product, products, stock, officeUnits, isMobile, onTap }: Props) {
  const qty = stock[product.id] ?? 0;
  const out = qty <= 0;
  const alts = out ? suggestAlternatives(product, products, stock) : [];
  const isPurchase = ['nyuyoku', 'koshikake-benza'].includes(product.categoryId);
  const [imgFailed, setImgFailed] = useState(false);

  if (isMobile) {
    return (
      <article className={`mob-card ${out ? 'mob-card--out' : 'mob-card--in'}`} onClick={() => onTap?.(product)}>
        <div className="mob-card__img">
          {product.taisCode && !imgFailed ? (
            <img
              src={taisPhotoUrl(product.taisCode)}
              alt={product.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="mob-card__noimg">📷</div>
          )}
        </div>
        <div className="mob-card__body">
          <p className="mob-card__maker">{product.maker}</p>
          <h4 className="mob-card__name">{product.name}</h4>
          <div className="mob-card__foot">
            {product.price > 0 && (
              <span className="mob-card__price">¥{product.price.toLocaleString()}<small>{isPurchase ? '(税込)' : '/月'}</small></span>
            )}
            {officeUnits && product.taisCode && officeUnits[product.taisCode] != null && (
              <span className="mob-card__units">{officeUnits[product.taisCode].toLocaleString()}<small>単位</small></span>
            )}
            <span className={`stock ${out ? 'stock--out' : 'stock--in'}`}>
              {out ? '在庫なし' : `在庫 ${qty}`}
            </span>
          </div>
          {out && alts.length > 0 && (
            <p className="mob-card__alt">💡 代替: {alts[0].name}</p>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className={`card ${product.featured ? 'card--featured' : ''} ${out ? 'card--out' : 'card--in'}`}>
      <div className="card__img">
        {/* 商品写真はテクノエイド協会(TAIS)から取得 */}
        {product.taisCode && !imgFailed ? (
          <a href={taisDetailUrl(product.taisCode)} target="_blank" rel="noreferrer" title="テクノエイド協会で詳細を見る">
            <img
              className="card__img-photo"
              src={taisPhotoUrl(product.taisCode)}
              alt={product.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          </a>
        ) : (
          <div className="card__img-placeholder">
            <span className="card__img-icon">📷</span>
            <span className="card__img-text">NO IMAGE</span>
          </div>
        )}
        {product.featured && <span className="badge badge--popular">よく出る商品</span>}
      </div>

      <div className="card__body">
        <p className="card__maker">{product.maker}</p>
        <h4 className="card__name">{product.name}</h4>
        <p className="card__desc">{product.description}</p>

        {product.firmness !== undefined && <FirmnessMeter value={product.firmness} />}

        {product.handrail && (
          <p className="card__dims">📐 {product.handrail.dimensions}</p>
        )}

        <div className="card__foot">
          {product.price > 0 ? (
            <span className="card__price">
              ¥{product.price.toLocaleString()}
              <small>{isPurchase ? '(税込)' : '/月(レンタル)'}</small>
            </span>
          ) : <span />}
          <span className={`stock ${out ? 'stock--out' : 'stock--in'}`}>
            {out ? '在庫なし' : `在庫 ${qty}`}
          </span>
        </div>

        {out && alts.length > 0 && (
          <div className="alts">
            <p className="alts__title">💡 代替品のご提案</p>
            <ul>
              {alts.map((a) => (
                <li key={a.id}>
                  <a href={taisDetailUrl(a.taisCode)} target="_blank" rel="noreferrer">
                    {a.name}
                  </a>
                  <span className="alts__stock">在庫 {stock[a.id]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
