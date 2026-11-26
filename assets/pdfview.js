import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// Renders every page of the PDF into the container, as wide as the container.
export async function showPdf(container, bytes) {
  container.innerHTML = '';
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const width = container.clientWidth || 720;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    container.appendChild(canvas);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  return doc.numPages;
}
