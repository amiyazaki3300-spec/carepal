import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * カタログDOM(各カテゴリセクション)をA4縦のPDFに変換してダウンロードする。
 * sectionSelector に一致する要素を1要素=1ページ以上として描画する。
 */
export async function exportCatalogPdf(
  rootEl: HTMLElement,
  filename = 'carepal-catalog.pdf',
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const sections = Array.from(
    rootEl.querySelectorAll<HTMLElement>('[data-pdf-section]'),
  );
  const targets = sections.length > 0 ? sections : [rootEl];

  for (let i = 0; i < targets.length; i++) {
    const canvas = await html2canvas(targets[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (i > 0) pdf.addPage();

    // セクションが1ページに収まらない場合は分割して貼り付け
    let rendered = 0;
    while (rendered < imgH) {
      if (rendered > 0) pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        0,
        -rendered,
        imgW,
        imgH,
      );
      rendered += pageH;
    }
  }

  pdf.save(filename);
}
