import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportCatalogPdf(
  rootEl: HTMLElement,
  filename = 'carepal-catalog.pdf',
  targetSections?: HTMLElement[],
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const sections = targetSections
    ?? Array.from(rootEl.querySelectorAll<HTMLElement>('[data-pdf-section]'));
  const targets = sections.length > 0 ? sections : [rootEl];

  for (let i = 0; i < targets.length; i++) {
    const canvas = await html2canvas(targets[i], {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
    });
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (i > 0) pdf.addPage();

    let rendered = 0;
    while (rendered < imgH) {
      if (rendered > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, -rendered, imgW, imgH);
      rendered += pageH;
    }
  }

  pdf.save(filename);
}
