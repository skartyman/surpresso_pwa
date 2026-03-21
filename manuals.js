const manualsState = {
  manuals: [],
  filtered: [],
  activeId: null,
  aiMode: 'current',
  aiStatusById: {},
  aiBusy: false,
  previewRequestToken: 0,
};

function manualRouteId() {
  const match = window.location.pathname.match(/^\/manuals\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setManualStatus(message = '', type = 'info') {
  const el = document.getElementById('manual-upload-status');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = type;
}

function formatManualSize(bytes = 0) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function normalizeManualText(value) {
  return String(value || '').trim().toLowerCase();
}

function currentManual() {
  return manualsState.manuals.find(item => item.id === manualsState.activeId) || null;
}

function setAiFeedback(message = '', type = 'info') {
  const el = document.getElementById('manual-ai-feedback');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = type;
}

function countQuestionIntents(value = '') {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[;]+/g, '.')
    .trim();

  if (!normalized) return 0;

  let count = (normalized.match(/\?/g) || []).length;
  count += (normalized.match(/(?:^|[.!]\s+)(?:\d+[.)]\s+|[-•]\s+)/g) || []).length;

  const lines = String(value || '')
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (lines.length > 1) count = Math.max(count, lines.length);

  const parts = normalized
    .split(/[!?]+|\.(?=\s+[A-ZА-ЯЁІЇЄ])/u)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && (normalized.includes('?') || normalized.includes(';'))) {
    count = Math.max(count, parts.length);
  }

  return Math.max(count, 1);
}

function hasMultipleQuestionIntents(value = '') {
  return countQuestionIntents(value) > 1;
}

function setAiBusy(isBusy) {
  manualsState.aiBusy = Boolean(isBusy);
  const askBtn = document.getElementById('manual-ai-ask-btn');
  const textarea = document.getElementById('manual-ai-question');
  const indexBtn = document.getElementById('manual-ai-index-btn');
  if (askBtn) {
    askBtn.disabled = manualsState.aiBusy;
    askBtn.textContent = manualsState.aiBusy ? 'Ищу ответ…' : 'Спросить';
  }
  if (textarea) textarea.disabled = manualsState.aiBusy;
  if (indexBtn) indexBtn.disabled = manualsState.aiBusy;
}

function renderAiAnswer(answer = '', sources = []) {
  const answerEl = document.getElementById('manual-ai-answer');
  const sourcesEl = document.getElementById('manual-ai-sources');
  if (answerEl) {
    answerEl.innerHTML = answer
      ? `<p>${escapeHtml(answer).replace(/\n/g, '<br>')}</p>`
      : '<p class="manual-ai-empty">Задайте вопрос, чтобы получить grounded-ответ по мануалам.</p>';
  }

  if (!sourcesEl) return;
  if (!sources.length) {
    sourcesEl.innerHTML = '<div class="manual-ai-empty">Источники появятся здесь после ответа.</div>';
    return;
  }

  sourcesEl.innerHTML = sources.map((source, index) => {
    const pageLabel = source.page ? `стр. ${source.page}` : 'страница не определена';
    const canOpenCurrent = source.manualId && manualsState.manuals.some(item => item.id === source.manualId);
    return `
      <article class="manual-ai-source-card">
        <div class="manual-ai-source-top">
          <div>
            <strong>${index + 1}. ${escapeHtml(source.title || 'Мануал')}</strong>
            <div class="manual-ai-source-meta">${escapeHtml(pageLabel)}</div>
          </div>
          <div class="manual-ai-source-actions">
            <button class="btn ghost" type="button" data-open-manual="${escapeHtml(source.manualId || '')}" ${canOpenCurrent ? '' : 'disabled'}>Открыть мануал</button>
            <button class="btn ghost" type="button" data-open-viewer="${escapeHtml(source.manualId || '')}" ${canOpenCurrent ? '' : 'disabled'}>Перейти к просмотру</button>
          </div>
        </div>
        <p>${escapeHtml(source.snippet || 'Фрагмент недоступен.')}</p>
      </article>
    `;
  }).join('');
}

function updateManualCount() {
  const count = document.getElementById('manual-count');
  if (!count) return;
  const size = manualsState.filtered.length;
  count.textContent = `${size} ${size === 1 ? 'файл' : size < 5 && size !== 0 ? 'файла' : 'файлов'}`;
}

function renderManualList() {
  const list = document.getElementById('manual-list');
  if (!list) return;

  if (!manualsState.filtered.length) {
    list.innerHTML = `<div class="manual-empty-state">Ничего не найдено. Измените поиск или загрузите новый PDF.</div>`;
    updateManualCount();
    return;
  }

  list.innerHTML = manualsState.filtered.map(manual => {
    const active = manual.id === manualsState.activeId ? ' is-active' : '';
    const indexStatus = manualsState.aiStatusById[manual.id];
    const indexBadge = indexStatus?.status === 'indexed'
      ? `<span class="manual-item__badge success">AI ready</span>`
      : indexStatus?.status === 'failed'
        ? `<span class="manual-item__badge danger">Ошибка индекса</span>`
        : `<span class="manual-item__badge">Нет индекса</span>`;

    return `
      <button class="manual-item${active}" type="button" data-manual-id="${manual.id}">
        <div class="manual-item__head">
          <strong>${escapeHtml(manual.title || manual.originalName || 'Без названия')}</strong>
          <span>${formatManualSize(manual.size)}</span>
        </div>
        <div class="manual-item__meta">${escapeHtml(manual.brand || '—')} • ${escapeHtml(manual.model || '—')}</div>
        <div class="manual-item__sub">${escapeHtml(manual.originalName || 'PDF')} • ${new Date(manual.uploadedAt).toLocaleDateString()}</div>
        <div class="manual-item__status-row">${indexBadge}</div>
      </button>
    `;
  }).join('');

  updateManualCount();
}

function syncManualRoute(id = '') {
  const next = id ? `/manuals/${encodeURIComponent(id)}` : '/manuals';
  if (window.location.pathname !== next) {
    window.history.pushState({}, '', next);
  }
}

function renderAiStatus(manual = null) {
  const statusEl = document.getElementById('manual-ai-status');
  const hintEl = document.getElementById('manual-ai-hint');
  const indexBtn = document.getElementById('manual-ai-index-btn');
  if (!statusEl || !hintEl || !indexBtn) return;

  if (!manual) {
    statusEl.textContent = 'Мануал не выбран';
    hintEl.textContent = manualsState.aiMode === 'current'
      ? 'Выберите документ слева, чтобы спросить именно по нему.'
      : 'В режиме “Все мануалы” поиск пройдет по всей библиотеке.';
    indexBtn.disabled = true;
    return;
  }

  const status = manualsState.aiStatusById[manual.id];
  if (!status || status.status === 'not_indexed') {
    statusEl.textContent = 'Индекс не готов';
    hintEl.textContent = 'Для grounded-ответов сначала проиндексируйте PDF. После загрузки индексация запускается автоматически, но ее можно повторить вручную.';
  } else if (status.status === 'failed') {
    statusEl.textContent = 'Индексация не удалась';
    hintEl.textContent = status.error || 'Этот PDF пока нельзя проиндексировать автоматически.';
  } else {
    statusEl.textContent = `Индекс готов • ${status.chunksCount || 0} чанков`;
    hintEl.textContent = status.updatedAt
      ? `Обновлено: ${new Date(status.updatedAt).toLocaleString()}`
      : 'Индекс доступен для AI-поиска.';
  }
  indexBtn.disabled = manualsState.aiBusy === true;
}


function buildManualPreviewUrl(manual, { forceReload = false } = {}) {
  if (!manual?.id) return '';
  const viewerUrl = new URL('/manual-pdf-viewer.html', window.location.origin);
  viewerUrl.searchParams.set('manualId', manual.id);
  if (forceReload) viewerUrl.searchParams.set('t', String(Date.now()));
  return `${viewerUrl.pathname}${viewerUrl.search}`;
}

function setManualViewerState({
  showFrame = false,
  placeholderText = 'Выберите документ из списка или загрузите новый PDF.',
  placeholderHint = 'Для встроенного просмотра PDF загружается через серверный endpoint и открывается внутри приложения.',
} = {}) {
  const frame = document.getElementById('manual-viewer-frame');
  const placeholder = document.getElementById('manual-viewer-placeholder');
  const placeholderTextEl = document.getElementById('manual-viewer-placeholder-text');
  const placeholderHintEl = document.getElementById('manual-viewer-placeholder-hint');

  if (frame) frame.hidden = !showFrame;
  if (placeholder) placeholder.style.display = showFrame ? 'none' : 'flex';
  if (placeholderTextEl) placeholderTextEl.textContent = placeholderText;
  if (placeholderHintEl) placeholderHintEl.textContent = placeholderHint;
}

async function loadManualPreview(manual, { forceReload = false } = {}) {
  if (!manual?.id) return;

  const frame = document.getElementById('manual-viewer-frame');
  if (!frame) return;

  const previewUrl = buildManualPreviewUrl(manual, { forceReload });
  if (!previewUrl) {
    setManualViewerState({
      showFrame: false,
      placeholderText: 'Для этого мануала не удалось построить ссылку на встроенный preview.',
      placeholderHint: 'Попробуйте открыть PDF в новой вкладке или проверьте, что у документа есть корректный id.',
    });
    return;
  }

  const currentSrc = frame.dataset.manualId === manual.id ? frame.src : '';
  if (!forceReload && currentSrc === previewUrl) {
    setManualViewerState({ showFrame: true });
    return;
  }

  manualsState.previewRequestToken = Date.now();
  frame.dataset.manualId = manual.id;
  if (forceReload) {
    frame.src = 'about:blank';
  }
  frame.src = previewUrl;
  setManualViewerState({ showFrame: true });
}

function showManual(manual) {
  const title = document.getElementById('manual-viewer-title');
  const meta = document.getElementById('manual-viewer-meta');
  const previewBtn = document.getElementById('manual-preview-btn');
  const openBtn = document.getElementById('manual-open-tab');
  const deleteBtn = document.getElementById('manual-delete-btn');
  const frame = document.getElementById('manual-viewer-frame');

  manualsState.activeId = manual?.id || null;
  manualsState.previewRequestToken = Date.now();
  renderManualList();
  renderAiStatus(manual || null);

  if (!manual) {
    if (frame) {
      frame.removeAttribute('src');
      frame.dataset.manualId = '';
    }
    if (title) title.textContent = 'Выберите мануал';
    if (meta) meta.textContent = 'Встроенный PDF preview работает через серверный inline endpoint.';
    setManualViewerState({
      showFrame: false,
      placeholderText: 'Выберите документ из списка или загрузите новый PDF.',
      placeholderHint: 'PDF открывается внутри iframe через серверный endpoint /api/manuals/:id/preview.',
    });
    if (previewBtn) {
      previewBtn.disabled = true;
      previewBtn.onclick = null;
    }
    if (openBtn) {
      openBtn.disabled = true;
      openBtn.onclick = null;
    }
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.onclick = null;
    }
    syncManualRoute('');
    return;
  }

  if (title) title.textContent = manual.title || manual.originalName || 'Без названия';
  if (meta) meta.textContent = `${manual.brand || 'Без бренда'} • ${manual.model || 'Без модели'} • ${formatManualSize(manual.size)} • серверный inline PDF preview`;
  setManualViewerState({
    showFrame: false,
    placeholderText: 'Нажмите «Предпросмотр», чтобы загрузить PDF внутри приложения.',
    placeholderHint: 'Встроенный просмотр использует серверный endpoint, который отдает PDF как inline.',
  });
  if (previewBtn) {
    previewBtn.disabled = false;
    previewBtn.onclick = () => loadManualPreview(manual, { forceReload: true });
  }
  if (openBtn) {
    openBtn.disabled = false;
    openBtn.onclick = () => window.open(`/api/manuals/${encodeURIComponent(manual.id)}/file`, '_blank', 'noopener,noreferrer');
  }
  if (deleteBtn) {
    deleteBtn.disabled = false;
    deleteBtn.onclick = () => deleteManual(manual.id);
  }

  syncManualRoute(manual.id);
  loadManualPreview(manual);
}

function applyManualFilter() {
  const query = normalizeManualText(document.getElementById('manual-search')?.value || '');
  manualsState.filtered = manualsState.manuals.filter(manual => {
    if (!query) return true;
    const haystack = [manual.title, manual.brand, manual.model, manual.originalName]
      .map(normalizeManualText)
      .join(' ');
    return haystack.includes(query);
  });

  renderManualList();

  const active = manualsState.filtered.find(item => item.id === manualsState.activeId)
    || manualsState.filtered.find(item => item.id === manualRouteId())
    || manualsState.filtered[0];

  showManual(active || null);
}

async function refreshIndexStatusForManual(id) {
  if (!id) return null;

  try {
    const resp = await fetch(`/api/manuals/${encodeURIComponent(id)}/index-status`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      manualsState.aiStatusById[id] = {
        status: 'not_indexed',
        updatedAt: null,
        chunksCount: 0,
        error: data.message || data.error || null,
      };
    } else {
      manualsState.aiStatusById[id] = {
        status: data.status || 'not_indexed',
        updatedAt: data.updatedAt || null,
        chunksCount: data.chunksCount || 0,
        error: data.error || null,
      };
    }
  } catch (err) {
    console.error('manual index status failed', err);
    manualsState.aiStatusById[id] = {
      status: 'not_indexed',
      updatedAt: null,
      chunksCount: 0,
      error: err?.message || null,
    };
  }

  renderManualList();
  const manual = currentManual();
  if (manual?.id === id) renderAiStatus(manual);
  return manualsState.aiStatusById[id];
}

async function refreshVisibleIndexStatuses() {
  await Promise.all(manualsState.manuals.map(item => refreshIndexStatusForManual(item.id)));
}

async function loadManuals() {
  const resp = await fetch('/api/manuals');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  manualsState.manuals = Array.isArray(data.items) ? data.items : [];
  applyManualFilter();
  await refreshVisibleIndexStatuses();
}

async function uploadManual() {
  const fileInput = document.getElementById('manual-file');
  const titleInput = document.getElementById('manual-title');
  const brandInput = document.getElementById('manual-brand');
  const modelInput = document.getElementById('manual-model');
  const file = fileInput?.files?.[0];

  if (!file) {
    setManualStatus('Выберите PDF-файл.', 'error');
    return;
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setManualStatus('Можно загружать только PDF.', 'error');
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    setManualStatus('PDF больше 20 МБ. Уменьшите размер файла.', 'error');
    return;
  }

  setManualStatus('Загружаю PDF…', 'loading');

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(file);
  });

  const payload = {
    title: titleInput?.value?.trim() || file.name.replace(/\.pdf$/i, ''),
    brand: brandInput?.value?.trim() || '',
    model: modelInput?.value?.trim() || '',
    originalName: file.name,
    mimeType: 'application/pdf',
    data: base64,
  };

  const resp = await fetch('/api/manuals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || `upload_failed_${resp.status}`);
  }

  if (fileInput) fileInput.value = '';
  if (titleInput) titleInput.value = '';
  if (brandInput) brandInput.value = '';
  if (modelInput) modelInput.value = '';

  const autoIndex = data.indexStatus?.status === 'indexed'
    ? ' AI-индекс готов.'
    : data.indexStatus?.status === 'failed'
      ? ` AI-индексация не удалась: ${data.indexStatus?.error || 'попробуйте позже'}.`
      : '';
  setManualStatus(`Мануал загружен.${autoIndex}`, data.indexStatus?.status === 'failed' ? 'warning' : 'success');
  await loadManuals();
  const created = manualsState.manuals.find(item => item.id === data.item?.id) || manualsState.manuals[0];
  if (data.item?.id && data.indexStatus) {
    manualsState.aiStatusById[data.item.id] = data.indexStatus;
  }
  showManual(created || null);
}

async function deleteManual(id) {
  if (!id) return;
  if (!window.confirm('Удалить этот мануал?')) return;

  const resp = await fetch(`/api/manuals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    alert('Не удалось удалить мануал.');
    return;
  }

  delete manualsState.aiStatusById[id];
  setManualStatus('Мануал удалён.', 'success');
  await loadManuals();
}

async function indexCurrentManual() {
  const manual = currentManual();
  if (!manual) {
    setAiFeedback('Сначала выберите мануал для индексации.', 'warning');
    return;
  }

  setAiBusy(true);
  setAiFeedback('Индексирую PDF…', 'loading');
  try {
    const resp = await fetch(`/api/manuals/${encodeURIComponent(manual.id)}/index`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.message || data.error || `index_failed_${resp.status}`);
    }
    manualsState.aiStatusById[manual.id] = {
      status: data.status || 'not_indexed',
      updatedAt: data.updatedAt || null,
      chunksCount: data.chunksCount || 0,
      error: data.error || null,
    };
    renderAiStatus(manual);
    renderManualList();
    setAiFeedback(data.status === 'indexed'
      ? 'Индекс готов. Теперь можно задавать вопросы по мануалу.'
      : data.error || 'Индексация завершилась без готового индекса.', data.status === 'indexed' ? 'success' : 'warning');
  } catch (err) {
    console.error(err);
    await refreshIndexStatusForManual(manual.id);
    setAiFeedback(err.message || 'Не удалось проиндексировать PDF.', 'error');
  } finally {
    setAiBusy(false);
  }
}

async function askManualAssistant() {
  const questionEl = document.getElementById('manual-ai-question');
  const question = questionEl?.value?.trim() || '';
  const manual = currentManual();

  if (!question) {
    setAiFeedback('Введите вопрос по документации.', 'warning');
    return;
  }

  if (hasMultipleQuestionIntents(question)) {
    setAiFeedback('Один запрос — один вопрос. Разделите несколько вопросов на отдельные сообщения.', 'warning');
    return;
  }

  if (manualsState.aiMode === 'current' && !manual) {
    setAiFeedback('Выберите мануал или переключитесь на режим “Все мануалы”.', 'warning');
    return;
  }

  if (manualsState.aiMode === 'current') {
    const status = manualsState.aiStatusById[manual.id];
    if (!status || status.status === 'not_indexed') {
      setAiFeedback('У выбранного мануала нет индекса. Нажмите “Индексировать мануал”.', 'warning');
      renderAiAnswer('', []);
      return;
    }
    if (status.status === 'failed') {
      setAiFeedback(status.error || 'Индекс недоступен для этого PDF.', 'error');
      renderAiAnswer('', []);
      return;
    }
  }

  setAiBusy(true);
  renderAiAnswer('', []);
  setAiFeedback('Подбираю релевантные фрагменты и формирую ответ только по одному вопросу…', 'loading');

  try {
    const url = manualsState.aiMode === 'current'
      ? `/api/manuals/${encodeURIComponent(manual.id)}/ask`
      : '/api/manuals/ask';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.message || data.error || `ask_failed_${resp.status}`);
    }

    renderAiAnswer(data.answer || '', Array.isArray(data.sources) ? data.sources : []);
    setAiFeedback(data.sources?.length
      ? 'Ответ собран только по фрагментам мануалов.'
      : 'Подходящие фрагменты не найдены. Ответ ограничен найденными источниками.', data.sources?.length ? 'success' : 'warning');
  } catch (err) {
    console.error(err);
    renderAiAnswer('', []);
    setAiFeedback(err.message || 'Не удалось получить ответ по мануалам.', 'error');
  } finally {
    setAiBusy(false);
  }
}

window.addEventListener('popstate', () => {
  const id = manualRouteId();
  const manual = manualsState.manuals.find(item => item.id === id) || null;
  showManual(manual);
});

window.addEventListener('beforeunload', () => {
  revokeManualPreview();
});

window.addEventListener('DOMContentLoaded', async () => {
  if (document.body?.dataset?.page !== 'manuals') return;

  await window.SurpAuth?.init?.();
  if (!window.SurpAuth?.getCurrentUser?.()) return;

  renderAiAnswer('', []);
  renderAiStatus(null);

  document.getElementById('manual-upload-btn')?.addEventListener('click', async () => {
    try {
      await uploadManual();
    } catch (err) {
      console.error(err);
      setManualStatus('Не удалось загрузить PDF.', 'error');
    }
  });

  document.getElementById('manual-search')?.addEventListener('input', applyManualFilter);

  document.getElementById('manual-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-manual-id]');
    if (!btn) return;
    const manual = manualsState.manuals.find(item => item.id === btn.dataset.manualId);
    showManual(manual || null);
  });

  document.querySelectorAll('input[name="manual-ai-scope"]')?.forEach(input => {
    input.addEventListener('change', e => {
      manualsState.aiMode = e.target.value === 'all' ? 'all' : 'current';
      renderAiStatus(currentManual());
      setAiFeedback(manualsState.aiMode === 'all'
        ? 'Поиск будет идти по всей библиотеке мануалов.'
        : 'Поиск будет идти только по открытому мануалу.', 'info');
    });
  });

  document.getElementById('manual-ai-ask-btn')?.addEventListener('click', askManualAssistant);
  document.getElementById('manual-ai-question')?.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      askManualAssistant();
    }
  });
  document.getElementById('manual-ai-index-btn')?.addEventListener('click', indexCurrentManual);

  document.getElementById('manual-ai-sources')?.addEventListener('click', e => {
    const openManualId = e.target.closest('[data-open-manual]')?.dataset.openManual;
    if (openManualId) {
      window.open(`/api/manuals/${encodeURIComponent(openManualId)}/file`, '_blank', 'noopener,noreferrer');
      return;
    }

    const openViewerId = e.target.closest('[data-open-viewer]')?.dataset.openViewer;
    if (openViewerId) {
      const manual = manualsState.manuals.find(item => item.id === openViewerId) || null;
      if (manual) {
        showManual(manual);
        document.querySelector('.manual-viewer-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  loadManuals().catch(err => {
    console.error(err);
    setManualStatus('Не удалось загрузить список мануалов.', 'error');
  });
});
