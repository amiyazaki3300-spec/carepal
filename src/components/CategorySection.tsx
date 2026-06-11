import type { Category, Product, StockMap } from '../types';
import { ProductCard } from './ProductCard';

interface Props {
  category: Category;
  products: Product[];
  stock: StockMap;
}

/** カテゴリ1品目分のセクション。冒頭に選定ガイド、よく出る商品を上部に大きく表示 */
export function CategorySection({ category, products, stock }: Props) {
  const featured = products.filter((p) => p.featured);
  const others = products.filter((p) => !p.featured);

  return (
    <section className="cat" id={category.id} data-pdf-section>
      <header className="cat__header">
        <h2 className="cat__title">
          {category.name}
          <span className={`badge ${category.kind === 'rental' ? 'badge--rental' : 'badge--purchase'}`}>
            {category.kind === 'rental' ? 'レンタル' : '販売'}
          </span>
        </h2>
      </header>

      <div className="guide">
        <h3 className="guide__title">🌸 福祉用具の選定ガイド</h3>
        <p>{category.guide}</p>
      </div>

      {featured.length > 0 && (
        <div className="cat__featured">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} products={products} stock={stock} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="cat__grid">
          {others.map((p) => (
            <ProductCard key={p.id} product={p} products={products} stock={stock} />
          ))}
        </div>
      )}
    </section>
  );
}
