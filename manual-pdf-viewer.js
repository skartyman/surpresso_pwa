const statusEl = document.getElementById('status');
const pagesEl = document.getElementById('pages');
const emptyEl = document.getElementById('empty');

const params = new URLSearchParams(window.location.search);
const manualId = String(params.get('manualId') || '').trim();
const cacheBust = String(params.get('t') || '').trim();
const previewUrl = manualId ? `/api/manuals/${encodeURIComponent(manualId)}/preview${cacheBust ? `?t=${encodeURIComponent(cacheBust)}` : ''}` : '';

let pdfDoc = null;
let pdfjsLib = null;
let renderToken = 0;
let resizeTimer = null;

function setStatus(message, { error = false } = {}) {
  if (!statusEl) return;
  statusEl.classList.toggle('error', error);
  statusEl.hidden = !message || !error;
  statusEl.innerHTML = `<strong>${error ? 'Ошибка preview' : 'Предпросмотр PDF'}</strong> ${message}`;
}

function showEmpty(message) {
  if (pagesEl) {
    pagesEl.hidden = true;
    pagesEl.replaceChildren();
  }
  if (emptyEl) {
    emptyEl.hidden = false;
    emptyEl.textContent = message;
  }
}

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
  return pdfjsLib;
}

async function renderPage(pageNumber, width) {
  const page = await pdfDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = width / unscaledViewport.width;
  const viewport = page.getViewport({ scale });
  const outputScale = Math.max(window.devicePixelRatio || 1, 1);

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  const canvas = document.createElement('canvas');
  canvas.className = 'page';
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const context = canvas.getContext('2d', { alpha: false });
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  await page.render({ canvasContext: context, viewport }).promise;

  const label = document.createElement('div');
  label.className = 'page-label';
  label.textContent = `${pageNumber} / ${pdfDoc.numPages}`;

  shell.append(canvas, label);
  return shell;
}

async function renderDocument() {
  if (!pdfDoc || !pagesEl) return;
  const currentToken = ++renderToken;
  setStatus('');
  pagesEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;
  pagesEl.replaceChildren();

  const availableWidth = Math.max(Math.min(pagesEl.clientWidth || window.innerWidth || 980, 980) - 2, 280);

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    if (currentToken !== renderToken) return;
    const pageNode = await renderPage(pageNumber, availableWidth);
    if (currentToken !== renderToken) return;
    pagesEl.append(pageNode);
  }
}

async function init() {
  if (!manualId || !previewUrl) {
    setStatus('manualId не передан в viewer.', { error: true });
    showEmpty('Откройте мануал из списка заново: viewer не получил идентификатор PDF.');
    return;
  }

  try {
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({
      url: previewUrl,
      withCredentials: true,
      cMapPacked: true,
    });

    pdfDoc = await loadingTask.promise;
    await renderDocument();
  } catch (error) {
    console.error('MANUAL PDF VIEWER ERROR', error);
    setStatus('Не удалось открыть PDF во встроенном viewer.', { error: true });
    showEmpty('Телефонный предпросмотр не загрузился. Если проблема повторится после npm install, используйте кнопку «Открыть в новой вкладке».');
  }
}

window.addEventListener('resize', () => {
  if (!pdfDoc) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderDocument().catch((error) => {
      console.error('MANUAL PDF VIEWER RESIZE ERROR', error);
      setStatus('Не удалось перерисовать PDF после изменения размера окна.', { error: true });
    });
  }, 180);
});

init();
