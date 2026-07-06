import { compressImageDataUrl } from './imageCompress';

/** 画像またはPDF(1ページ目)をdataURLに変換する（容量削減のため縮小・圧縮済み） */
export async function fileToDataUrl(file: File): Promise<string> {
  // 表紙は大きめに表示するので長辺1200pxまで許容
  if (file.type === 'application/pdf') {
    return await compressImageDataUrl(await pdfFirstPageToDataUrl(file), 1200, 0.75);
  }
  return await compressImageDataUrl(await imageFileToDataUrl(file), 1200, 0.75);
}

function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  // workerはCDNから読み込む
  GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (page.render as any)({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}
