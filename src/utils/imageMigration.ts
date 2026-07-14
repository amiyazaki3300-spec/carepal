import { uploadImageDataUrl } from '../lib/supabase';
import type { Overrides } from './overrides';

/**
 * overrides内のBase64画像(data:URL)をSupabase Storageへアップロードし、
 * 公開URLに差し替えたコピーを返す。アップロードに失敗した画像はBase64のまま残す
 * （データが消えることはない）。変更が無ければ同一オブジェクトを返す。
 */
export async function migrateOverrideImages(o: Overrides): Promise<Overrides> {
  let changed = false;
  const next: Overrides = { ...o };

  if (o.coverImage?.startsWith('data:')) {
    const url = await uploadImageDataUrl(o.coverImage, `covers/cover-${Date.now()}`);
    if (url) { next.coverImage = url; changed = true; }
  }
  if (o.backCoverImage?.startsWith('data:')) {
    const url = await uploadImageDataUrl(o.backCoverImage, `covers/back-cover-${Date.now()}`);
    if (url) { next.backCoverImage = url; changed = true; }
  }

  if (o.customImages && Object.keys(o.customImages).length > 0) {
    const results = await Promise.all(
      Object.entries(o.customImages).map(async ([pid, val]) => {
        if (val?.startsWith('data:')) {
          const url = await uploadImageDataUrl(val, `products/${pid}`);
          return [pid, url ?? val] as const;
        }
        return [pid, val] as const;
      }),
    );
    const newCustomImages = Object.fromEntries(results);
    if (results.some(([pid, val]) => val !== o.customImages[pid])) {
      next.customImages = newCustomImages;
      changed = true;
    }
  }

  if (o.products && Object.keys(o.products).length > 0) {
    const productEntries = await Promise.all(
      Object.entries(o.products).map(async ([pid, po]) => {
        if (!po.extraItems?.length) return [pid, po] as const;
        const newItems = await Promise.all(
          po.extraItems.map(async (item) => {
            if (item.type === 'image' && item.content.startsWith('data:')) {
              const url = await uploadImageDataUrl(item.content, `extras/${pid}-${item.id}`);
              if (url) return { ...item, content: url };
            }
            return item;
          }),
        );
        const itemsChanged = newItems.some((it, i) => it !== po.extraItems![i]);
        return [pid, itemsChanged ? { ...po, extraItems: newItems } : po] as const;
      }),
    );
    if (productEntries.some(([pid, po]) => po !== o.products[pid])) {
      next.products = Object.fromEntries(productEntries);
      changed = true;
    }
  }

  return changed ? next : o;
}
