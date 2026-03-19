const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDF_CACHE_NAME = 'surpresso-pdf-cache-v1';
const DEFAULT_SCALE = 1.2;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

const state = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  scale: DEFAULT_SCALE,
  isRendering: false,
  pendingPage: null,
  activeUrl: '',
  loadingTask: null,
  renderTask: null,
};

const elements = {
  canvas: document.getElementById('pdf-canvas'),
  loader: document.getElementById('loader'),
  loaderText: document.getElementById('loader-text'),
  statusBanner: document.getElementById('status-banner'),
  errorBanner: document.getElementById('error-banner'),
  pageIndicator: document.getElementById('page-indicator'),
  documentName: document.getElementById('document-name'),
  connectionState: document.getElementById('connection-state'),
  prevButton: document.getElementById('prev-page'),
  nextButton: document.getElementById('next-page'),
  zoomInButton: document.getElementById('zoom-in'),
  zoomOutButton: document.getElementById('zoom-out'),
};

const canvasContext = elements.canvas.getContext('2d', { alpha: false });

function setLoader(message = 'Loading document…', isVisible = true) {
  elements.loaderText.textContent = message;
  elements.loader.classList.toggle('is-hidden', !isVisible);
  elements.loader.setAttribute('aria-hidden', String(!isVisible));
}

function setStatus(message) {
  elements.statusBanner.textContent = message;
}

function setConnectionState(message) {
  elements.connectionState.textContent = message;
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.hidden = false;
}

function clearError() {
  elements.errorBanner.hidden = true;
  elements.errorBanner.textContent = '';
}

function updateControls() {
  const hasDocument = Boolean(state.pdfDoc);
  elements.prevButton.disabled = !hasDocument || state.currentPage <= 1 || state.isRendering;
  elements.nextButton.disabled = !hasDocument || state.currentPage >= state.totalPages || state.isRendering;
  elements.zoomOutButton.disabled = !hasDocument || state.scale <= MIN_SCALE || state.isRendering;
  elements.zoomInButton.disabled = !hasDocument || state.scale >= MAX_SCALE || state.isRendering;
  elements.pageIndicator.textContent = `${state.totalPages ? state.currentPage : 0} / ${state.totalPages}`;
}

function getRouteManualUrl() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'manuals' && segments[1] && !segments[1].includes('.')) {
    return `/api/manuals/${encodeURIComponent(segments[1])}/file`;
  }
  return '';
}

function getInitialPdfUrl() {
  const queryUrl = new URLSearchParams(window.location.search).get('file');
  return queryUrl || getRouteManualUrl() || window.PDF_URL || '/manuals/test.pdf';
}

function humanizeDocumentName(url) {
  try {
    const resolved = new URL(url, window.location.href);
    const raw = resolved.pathname.split('/').filter(Boolean).pop() || 'document.pdf';
    return decodeURIComponent(raw);
  } catch {
    return String(url || 'document.pdf');
  }
}

async function fetchPdfData(url) {
  const resolvedUrl = new URL(url, window.location.href).toString();
  const cache = 'caches' in window ? await caches.open(PDF_CACHE_NAME) : null;

  try {
    const response = await fetch(resolvedUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (cache) {
      await cache.put(resolvedUrl, response.clone());
    }

    setConnectionState('Live');
    return await response.arrayBuffer();
  } catch (networkError) {
    if (cache) {
      const cachedResponse = await cache.match(resolvedUrl);
      if (cachedResponse) {
        setConnectionState('Offline cache');
        return await cachedResponse.arrayBuffer();
      }
    }

    throw networkError;
  }
}

async function renderPage(pageNumber) {
  if (!state.pdfDoc) return;

  state.isRendering = true;
  updateControls();
  clearError();
  setLoader(`Rendering page ${pageNumber} of ${state.totalPages}…`, true);
  setStatus(`Rendering page ${pageNumber} of ${state.totalPages}.`);

  try {
    const page = await state.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: state.scale });
    const outputScale = window.devicePixelRatio || 1;

    elements.canvas.width = Math.floor(viewport.width * outputScale);
    elements.canvas.height = Math.floor(viewport.height * outputScale);
    elements.canvas.style.width = `${viewport.width}px`;
    elements.canvas.style.height = `${viewport.height}px`;

    const renderContext = {
      canvasContext,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    };

    if (state.renderTask) {
      state.renderTask.cancel();
    }

    state.renderTask = page.render(renderContext);
    await state.renderTask.promise;
    state.currentPage = pageNumber;
    setStatus(`Showing page ${state.currentPage} of ${state.totalPages} at ${Math.round(state.scale * 100)}% zoom.`);
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') {
      console.error('PDF render failed', error);
      showError('Unable to render this PDF page. Please try again.');
      setStatus('Rendering failed.');
    }
  } finally {
    state.renderTask = null;
    state.isRendering = false;
    updateControls();
    setLoader('', false);

    if (state.pendingPage && state.pendingPage !== state.currentPage) {
      const nextPage = state.pendingPage;
      state.pendingPage = null;
      renderPage(nextPage);
    }
  }
}

function queueRender(pageNumber) {
  if (!state.pdfDoc) return;

  const targetPage = Math.min(Math.max(pageNumber, 1), state.totalPages);
  if (state.isRendering) {
    state.pendingPage = targetPage;
    return;
  }

  renderPage(targetPage);
}

function changePage(delta) {
  queueRender(state.currentPage + delta);
}

function changeZoom(direction) {
  const nextScale = Number((state.scale + direction * SCALE_STEP).toFixed(2));
  state.scale = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);
  queueRender(state.currentPage);
}

async function destroyCurrentDocument() {
  if (state.renderTask) {
    try {
      state.renderTask.cancel();
    } catch {
      // ignore cancellation failures
    }
    state.renderTask = null;
  }

  if (state.loadingTask) {
    try {
      state.loadingTask.destroy();
    } catch {
      // ignore task cleanup failures
    }
    state.loadingTask = null;
  }

  if (state.pdfDoc) {
    await state.pdfDoc.destroy();
    state.pdfDoc = null;
  }
}

async function loadPDF(url) {
  const nextUrl = String(url || '').trim();
  if (!nextUrl) {
    showError('A PDF URL is required.');
    return;
  }

  clearError();
  setLoader('Loading document…', true);
  setStatus('Loading PDF…');
  setConnectionState(navigator.onLine ? 'Live' : 'Offline');
  elements.documentName.textContent = humanizeDocumentName(nextUrl);
  elements.canvas.width = 0;
  elements.canvas.height = 0;
  state.currentPage = 1;
  state.totalPages = 0;
  state.scale = DEFAULT_SCALE;
  state.pendingPage = null;
  updateControls();

  try {
    await destroyCurrentDocument();

    const pdfData = await fetchPdfData(nextUrl);
    state.activeUrl = nextUrl;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

    state.loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      useWorkerFetch: false,
    });

    state.pdfDoc = await state.loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;
    updateControls();
    await renderPage(1);
  } catch (error) {
    console.error('PDF load failed', error);
    await destroyCurrentDocument();
    updateControls();
    setLoader('', false);
    showError('Unable to load this PDF. Check the URL or open the document once online so it can be cached for offline use.');
    setStatus('Failed to load PDF document.');
  }
}

function registerEvents() {
  elements.prevButton.addEventListener('click', () => changePage(-1));
  elements.nextButton.addEventListener('click', () => changePage(1));
  elements.zoomOutButton.addEventListener('click', () => changeZoom(-1));
  elements.zoomInButton.addEventListener('click', () => changeZoom(1));

  window.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') changePage(-1);
    if (event.key === 'ArrowRight') changePage(1);
    if (event.key === '-' || event.key === '_') changeZoom(-1);
    if (event.key === '+' || event.key === '=') changeZoom(1);
  });

  window.addEventListener('online', () => setConnectionState('Live'));
  window.addEventListener('offline', () => setConnectionState('Offline'));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

async function init() {
  registerEvents();
  await registerServiceWorker();

  if (typeof pdfjsLib === 'undefined') {
    setLoader('', false);
    showError('PDF.js failed to load from the CDN.');
    setStatus('Viewer bootstrap failed.');
    return;
  }

  await loadPDF(getInitialPdfUrl());
}

window.loadPDF = loadPDF;
window.addEventListener('DOMContentLoaded', init);
