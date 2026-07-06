/**
 * 画像のdataURLを縮小・再圧縮して容量を削減する。
 * localStorage(約5MB)に複数画像を保存してもあふれないようにするのが目的。
 *
 * @param dataUrl    元画像の dataURL
 * @param maxSize    長辺の最大ピクセル数（既定 800px）
 * @param quality    JPEG品質 0〜1（既定 0.7）
 * @returns 圧縮後の dataURL（失敗時は元の dataURL をそのまま返す）
 */
export function compressImageDataUrl(
  dataUrl: string,
  maxSize = 800,
  quality = 0.7,
): Promise<string> {
  return new Promise((resolve) => {
    // dataURL以外（既に小さいSVG等）はそのまま
    if (!dataUrl.startsWith('data:image')) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        // 透過画像を白背景でJPEG化（PNGの巨大化を防ぐ）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const out = canvas.toDataURL('image/jpeg', quality);
        // 圧縮で逆に大きくなった場合は元を返す
        resolve(out.length < dataUrl.length ? out : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Fileを読み込み、縮小・圧縮済みのdataURLにして返す */
export function fileToCompressedDataUrl(file: File, maxSize = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(compressImageDataUrl(reader.result as string, maxSize, quality));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
