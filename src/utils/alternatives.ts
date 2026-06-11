import type { Product, StockMap } from '../types';
import type { Overrides } from './overrides';

export function suggestAlternatives(
  product: Product,
  allProducts: Product[],
  stock: StockMap,
  limit = 3,
  overrides?: Overrides,
): Product[] {
  const setting = overrides?.altSettings?.[product.id];
  const excluded = new Set(setting?.excluded ?? []);
  const preferred = setting?.preferred ?? [];

  return allProducts
    .filter((p) =>
      p.id !== product.id &&
      p.categoryId === product.categoryId &&
      (stock[p.id] ?? 0) > 0 &&
      !excluded.has(p.id),
    )
    .map((p) => {
      const tagScore = p.tags.filter((t) => product.tags.includes(t)).length;
      const firmnessPenalty =
        product.firmness !== undefined && p.firmness !== undefined
          ? Math.abs(product.firmness - p.firmness) * 0.4 : 0;
      const preferBonus = preferred.includes(p.id) ? 100 : 0;
      return { p, score: tagScore - firmnessPenalty + preferBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
}
