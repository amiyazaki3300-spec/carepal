import type { Product, StockMap } from '../types';

/**
 * 代替品提案ロジック:
 * 在庫切れ商品と同カテゴリで在庫のある商品を、タグ(名称キーワード)一致数の
 * 多い順に最大3件返す。マットレスは硬さが近いものを優先する。
 */
export function suggestAlternatives(
  product: Product,
  allProducts: Product[],
  stock: StockMap,
  limit = 3,
): Product[] {
  return allProducts
    .filter(
      (p) =>
        p.id !== product.id &&
        p.categoryId === product.categoryId &&
        (stock[p.id] ?? 0) > 0,
    )
    .map((p) => {
      const tagScore = p.tags.filter((t) => product.tags.includes(t)).length;
      const firmnessPenalty =
        product.firmness !== undefined && p.firmness !== undefined
          ? Math.abs(product.firmness - p.firmness) * 0.4
          : 0;
      return { p, score: tagScore - firmnessPenalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
}
