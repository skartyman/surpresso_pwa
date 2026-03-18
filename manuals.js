const manualsState = {
  manuals: [],
  filtered: [],
  activeId: null,
};

function manualRouteId() {
  const match = window.location.pathname.match(/^\/manuals\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setManualStatus(message = "", type = "info") {
  const el = document.getElementById("manual-upload-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = type;
}

function formatManualSize(bytes = 0) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function normalizeManualText(value) {
  return String(value || "").trim().toLowerCase();
}

function updateManualCount() {
  const count = document.getElementById("manual-count");
  if (!count) return;
  const size = manualsState.filtered.length;
  count.textContent = `${size} ${size === 1 ? "файл" : size < 5 && size !== 0 ? "файла" : "файлов"}`;
}

function renderManualList() {
  const list = document.getElementById("manual-list");
  if (!list) return;

  if (!manualsState.filtered.length) {
    list.innerHTML = `<div class="manual-empty-state">Ничего не найдено. Измените поиск или загрузите новый PDF.</div>`;
    updateManualCount();
    return;
  }

  list.innerHTML = manualsState.filtered.map(manual => {
    const active = manual.id === manualsState.activeId ? " is-active" : "";
    return `
      <button class="manual-item${active}" type="button" data-manual-id="${manual.id}">
        <div class="manual-item__head">
          <strong>${escapeHtml(manual.title || manual.originalName || "Без названия")}</strong>
          <span>${formatManualSize(manual.size)}</span>
        </div>
        <div class="manual-item__meta">${escapeHtml(manual.brand || "—")} • ${escapeHtml(manual.model || "—")}</div>
        <div class="manual-item__sub">${escapeHtml(manual.originalName || "PDF")} • ${new Date(manual.uploadedAt).toLocaleDateString()}</div>
      </button>
    `;
  }).join("");

  updateManualCount();
}

function syncManualRoute(id = "") {
  const next = id ? `/manuals/${encodeURIComponent(id)}` : "/manuals";
  if (window.location.pathname !== next) {
    window.history.pushState({}, "", next);
  }
}

function showManual(manual) {
  const title = document.getElementById("manual-viewer-title");
  const meta = document.getElementById("manual-viewer-meta");
  const frame = document.getElementById("manual-viewer-frame");
  const empty = document.getElementById("manual-viewer-empty");
  const openBtn = document.getElementById("manual-open-tab");
  const deleteBtn = document.getElementById("manual-delete-btn");

  manualsState.activeId = manual?.id || null;
  renderManualList();

  if (!manual) {
    if (title) title.textContent = "Выберите мануал";
    if (meta) meta.textContent = "PDF откроется здесь без скачивания.";
    if (frame) frame.removeAttribute("src");
    if (empty) empty.style.display = "flex";
    if (openBtn) {
      openBtn.disabled = true;
      openBtn.onclick = null;
    }
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.onclick = null;
    }
    syncManualRoute("");
    return;
  }

  if (title) title.textContent = manual.title || manual.originalName || "Без названия";
  if (meta) meta.textContent = `${manual.brand || "Без бренда"} • ${manual.model || "Без модели"} • ${formatManualSize(manual.size)}`;
  if (frame) frame.src = `/api/manuals/${encodeURIComponent(manual.id)}/file`;
  if (empty) empty.style.display = "none";
  if (openBtn) {
    openBtn.disabled = false;
    openBtn.onclick = () => window.open(`/api/manuals/${encodeURIComponent(manual.id)}/file`, "_blank", "noopener,noreferrer");
  }
  if (deleteBtn) {
    deleteBtn.disabled = false;
    deleteBtn.onclick = () => deleteManual(manual.id);
  }

  syncManualRoute(manual.id);
}

function applyManualFilter() {
  const query = normalizeManualText(document.getElementById("manual-search")?.value || "");
  manualsState.filtered = manualsState.manuals.filter(manual => {
    if (!query) return true;
    const haystack = [manual.title, manual.brand, manual.model, manual.originalName]
      .map(normalizeManualText)
      .join(" ");
    return haystack.includes(query);
  });

  renderManualList();

  const active = manualsState.filtered.find(item => item.id === manualsState.activeId)
    || manualsState.filtered.find(item => item.id === manualRouteId())
    || manualsState.filtered[0];

  showManual(active || null);
}

async function loadManuals() {
  const resp = await fetch('/api/manuals');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  manualsState.manuals = Array.isArray(data.items) ? data.items : [];
  applyManualFilter();
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

  setManualStatus('Мануал загружен.', 'success');
  await loadManuals();
  const created = manualsState.manuals.find(item => item.id === data.item?.id) || manualsState.manuals[0];
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

  setManualStatus('Мануал удалён.', 'success');
  await loadManuals();
}

window.addEventListener('popstate', () => {
  const id = manualRouteId();
  const manual = manualsState.manuals.find(item => item.id === id) || null;
  showManual(manual);
});

window.addEventListener('DOMContentLoaded', () => {
  if (document.body?.dataset?.page !== 'manuals') return;

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

  loadManuals().catch(err => {
    console.error(err);
    setManualStatus('Не удалось загрузить список мануалов.', 'error');
  });
});
