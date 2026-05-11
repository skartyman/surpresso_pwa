import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';
import { ActionRail, ActionRailButton, Icon, StatusBadge } from '../components/AdminUi';
import { useAuth } from '../../auth/AuthContext';
import { ROLES } from '../roleConfig';

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '-';
}

function getLocationAddress(location = {}) {
  return String(location.address || location.name || '').trim();
}

function buildMapsUrl(value = '') {
  const address = String(value || '').trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

function getEquipmentTitle(item = {}) {
  return `${item.brand || 'Оборудование'} ${item.model || ''}`.trim();
}

const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const DEFAULT_MAP_CENTER = [48.3794, 31.1656];

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = LEAFLET_JS_URL;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function buildGeocodeQuery(point = {}, client = {}) {
  const address = getLocationAddress(point);
  const raw = [address, client?.companyName].filter(Boolean).join(', ');
  if (!raw) return '';
  return /укра|ukraine|київ|киев|львів|львов|одеса|одесса|дніпро|днепр|харків|харьков/i.test(raw) ? raw : `${raw}, Ukraine`;
}

async function geocodeLocation(point, client) {
  const query = buildGeocodeQuery(point, client);
  if (!query) return null;
  const cacheKey = `surpresso-map:${query.toLowerCase()}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const [match] = await response.json();
  if (!match?.lat || !match?.lon) return null;
  const coords = { lat: Number(match.lat), lng: Number(match.lon), label: match.display_name || query };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(coords));
  } catch {
    // Best-effort cache only.
  }
  return coords;
}

function normalizeMapAddress(value = '') {
  return String(value || '')
    .replace(/\bм\.\s*/gi, '')
    .replace(/\bг\.\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function transliterateAddress(value = '') {
  const prepared = String(value || '')
    .replace(/вулиця|улица/gi, 'street')
    .replace(/проспект/gi, 'avenue')
    .replace(/площа|площадь/gi, 'square');
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ъ: '',
  };
  return prepared.split('').map((char) => {
    const lower = char.toLowerCase();
    const converted = map[lower];
    if (converted === undefined) return char;
    return char === lower ? converted : converted.charAt(0).toUpperCase() + converted.slice(1);
  }).join('').replace(/\s+/g, ' ').trim();
}

function buildRobustGeocodeQueries(point = {}, client = {}) {
  const address = normalizeMapAddress(point.address || point.name || '');
  const pointName = normalizeMapAddress(point.name || '');
  const clientName = normalizeMapAddress(client?.companyName || '');
  const variants = [address];
  if (pointName && address && pointName !== address) variants.push(`${address}, ${pointName}`);
  if (clientName && address && clientName !== address && clientName !== pointName) variants.push(`${address}, ${clientName}`);
  variants.push(...variants.map(transliterateAddress).filter(Boolean));
  return Array.from(new Set(variants
    .filter(Boolean)
    .flatMap((raw) => {
      const hasCountry = /укра|ukraine/i.test(raw);
      return hasCountry ? [raw] : [raw, `${raw}, Україна`, `${raw}, Ukraine`];
    })));
}

async function fetchNominatimCoords(query) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&countrycodes=ua&accept-language=uk,ru&q=${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const [match] = await response.json();
  if (!match?.lat || !match?.lon) return null;
  return { lat: Number(match.lat), lng: Number(match.lon), label: match.display_name || query };
}

async function fetchPhotonCoords(query) {
  const response = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const feature = payload?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return { lat: Number(coords[1]), lng: Number(coords[0]), label: feature?.properties?.name || query };
}

async function geocodeLocationRobust(point, client) {
  const queries = buildRobustGeocodeQueries(point, client);
  if (!queries.length) return null;
  const cacheKey = `surpresso-map-v2:${queries[0].toLowerCase()}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Best-effort cache only.
  }
  for (const query of queries) {
    const coords = await fetchNominatimCoords(query).catch(() => null) || await fetchPhotonCoords(query).catch(() => null);
    if (!coords) continue;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(coords));
    } catch {
      // Best-effort cache only.
    }
    return coords;
  }
  return null;
}

export function AdminClientsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const mapRootRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const basePath = getBaseAdminPath(location.pathname);
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [form, setForm] = useState({ companyName: '', contactName: '', phone: '', locationName: '', locationAddress: '' });
  const [editForm, setEditForm] = useState({ companyName: '', contactName: '', phone: '', locationId: '', locationName: '', locationAddress: '' });
  const [linkForm, setLinkForm] = useState({ equipmentId: '', equipmentSearch: '', locationId: '', locationName: '', locationAddress: '' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mapState, setMapState] = useState({ status: 'idle', count: 0 });

  async function load(nextSearch = search) {
    setLoading(true);
    try {
      const payload = await adminServiceApi.clients({ q: nextSearch });
      setClients(payload.items || []);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Не удалось загрузить клиентов.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    if (!id) {
      setSelected(null);
      return;
    }
    try {
      const payload = await adminServiceApi.clientById(id);
      setSelected(payload.item || null);
      setError('');
    } catch (detailError) {
      setSelected(null);
      setError(detailError?.message || 'Клиент не найден.');
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDetail(clientId); }, [clientId]);
  useEffect(() => {
    if (!clientId && clients[0]?.id) {
      navigate(`${basePath}/clients/${clients[0].id}`, { replace: true });
    }
  }, [basePath, clientId, clients, navigate]);

  const listClient = clientId ? clients.find((item) => item.id === clientId) : clients[0];
  const selectedMatchesActive = Boolean(selected?.id && (!clientId || selected.id === clientId));
  const activeClient = selectedMatchesActive ? selected : (listClient || selected || null);
  const activeDetail = selected?.id === activeClient?.id ? selected : null;
  const locations = useMemo(() => {
    const rows = activeDetail?.locations || activeClient?.locations || [];
    return rows.filter((item) => getLocationAddress(item));
  }, [activeClient, activeDetail]);
  const equipment = activeDetail?.equipment || [];
  const detailLoading = Boolean(activeClient?.id && selected?.id !== activeClient.id);
  const canDeleteClient = [ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  useEffect(() => {
    if (!activeClient) return;
    const firstLocation = (activeDetail?.locations || activeClient.locations || [])[0] || {};
    setEditForm({
      companyName: activeClient.companyName || '',
      contactName: activeClient.contactName || '',
      phone: activeClient.phone || '',
      locationId: firstLocation.id || '',
      locationName: firstLocation.name || '',
      locationAddress: firstLocation.address || '',
    });
  }, [activeClient, activeDetail]);
  const selectedEquipmentOption = equipmentOptions.find((item) => item.id === linkForm.equipmentId) || null;
  const filteredEquipmentOptions = useMemo(() => {
    const query = linkForm.equipmentSearch.trim().toLowerCase();
    const source = query
      ? equipmentOptions.filter((item) => [
          item.id,
          item.brand,
          item.model,
          item.name,
          item.serial,
          item.internalNumber,
          item.clientName,
          item.locationName,
          item.companyLocation,
        ].filter(Boolean).join(' ').toLowerCase().includes(query))
      : equipmentOptions;
    return source.slice(0, 10);
  }, [equipmentOptions, linkForm.equipmentSearch]);

  useEffect(() => {
    let cancelled = false;
    if (!mapRootRef.current) return undefined;
    if (!locations.length) {
      setMapState({ status: 'empty', count: 0 });
      return undefined;
    }

    setMapState({ status: 'loading', count: 0 });
    ensureLeaflet()
      .then(async (L) => {
        if (cancelled || !mapRootRef.current) return;
        if (!mapRef.current) {
          mapRef.current = L.map(mapRootRef.current, { scrollWheelZoom: false }).setView(DEFAULT_MAP_CENTER, 5);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
          }).addTo(mapRef.current);
          markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
        }

        markerLayerRef.current.clearLayers();
        const resolved = await Promise.all(locations.map(async (point) => ({
          point,
          coords: await geocodeLocationRobust(point, activeClient),
        })));
        if (cancelled || !mapRef.current || !markerLayerRef.current) return;

        const markers = resolved.filter((item) => item.coords);
        markers.forEach(({ point, coords }) => {
          const address = getLocationAddress(point);
          const mapsUrl = buildMapsUrl(address);
          const popup = `
            <div class="client-map-popup">
              <strong>${point.name || activeClient?.companyName || 'Клиент'}</strong>
              <span>${point.address || address || ''}</span>
              ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noreferrer">Навигация</a>` : ''}
            </div>
          `;
          L.marker([coords.lat, coords.lng]).addTo(markerLayerRef.current).bindPopup(popup);
        });

        if (markers.length === 1) {
          mapRef.current.setView([markers[0].coords.lat, markers[0].coords.lng], 15);
        } else if (markers.length > 1) {
          mapRef.current.fitBounds(L.latLngBounds(markers.map((item) => [item.coords.lat, item.coords.lng])), { padding: [28, 28] });
        } else {
          mapRef.current.setView(DEFAULT_MAP_CENTER, 5);
        }
        setMapState({ status: markers.length ? 'ready' : 'not_found', count: markers.length });
        setTimeout(() => mapRef.current?.invalidateSize(), 40);
      })
      .catch(() => {
        if (!cancelled) setMapState({ status: 'error', count: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [activeClient, locations]);

  async function submitCreate(event) {
    event.preventDefault();
    if (!form.companyName.trim()) {
      setError('Укажите клиента / заведение.');
      return;
    }
    setBusy(true);
    try {
      const payload = await adminServiceApi.createClient(form);
      const createdId = payload?.item?.client?.id || payload?.item?.id;
      setForm({ companyName: '', contactName: '', phone: '', locationName: '', locationAddress: '' });
      setCreateOpen(false);
      await load('');
      if (createdId) navigate(`${basePath}/clients/${createdId}`);
    } catch (createError) {
      setError(createError?.message || 'Не удалось создать клиента.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEditClient(event) {
    event.preventDefault();
    if (!activeClient?.id) return;
    if (!editForm.companyName.trim()) {
      setError('Укажите клиента / заведение.');
      return;
    }
    setBusy(true);
    try {
      const payload = await adminServiceApi.updateClient(activeClient.id, {
        companyName: editForm.companyName,
        contactName: editForm.contactName,
        phone: editForm.phone,
        locationId: editForm.locationId,
        locationName: editForm.locationName,
        locationAddress: editForm.locationAddress,
      });
      setSelected(payload.item || null);
      await load(search);
      setEditOpen(false);
      setError('');
    } catch (updateError) {
      setError(updateError?.message || 'Не удалось сохранить клиента.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteActiveClient() {
    if (!activeClient?.id || busy) return;
    const ok = window.confirm(`Удалить клиента "${activeClient.companyName}"?`);
    if (!ok) return;
    setBusy(true);
    try {
      await adminServiceApi.deleteClient(activeClient.id);
      setSelected(null);
      setEditOpen(false);
      await load(search);
      navigate(`${basePath}/clients`);
      setError('');
    } catch (deleteError) {
      const message = deleteError?.message === 'client_has_links'
        ? 'Нельзя удалить клиента, пока к нему привязано оборудование или заявки.'
        : (deleteError?.message || 'Не удалось удалить клиента.');
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function openLinkForm() {
    setLinkOpen((prev) => !prev);
    if (!equipmentOptions.length) {
      try {
        const payload = await adminServiceApi.equipmentList({});
        setEquipmentOptions(payload.items || []);
      } catch (loadError) {
        setError(loadError?.message || 'Не удалось загрузить оборудование.');
      }
    }
  }

  function selectEquipment(item) {
    setLinkForm((prev) => ({
      ...prev,
      equipmentId: item.id,
      equipmentSearch: [item.brand, item.model, item.internalNumber || item.serial || item.id].filter(Boolean).join(' · '),
    }));
  }

  async function submitLinkEquipment(event) {
    event.preventDefault();
    if (!activeClient?.id || !linkForm.equipmentId) {
      setError('Выберите карточку оборудования для привязки.');
      return;
    }
    if (!linkForm.locationId && !linkForm.locationName.trim() && !linkForm.locationAddress.trim() && !locations.length) {
      setError('Укажите точку клиента или адрес.');
      return;
    }
    setBusy(true);
    try {
      await adminServiceApi.linkClientEquipment(activeClient.id, {
        equipmentId: linkForm.equipmentId,
        locationId: linkForm.locationId || null,
        locationName: linkForm.locationName,
        locationAddress: linkForm.locationAddress,
        comment: 'Привязано из карточки клиента',
      });
      setLinkForm({ equipmentId: '', equipmentSearch: '', locationId: '', locationName: '', locationAddress: '' });
      setLinkOpen(false);
      await Promise.all([load(search), loadDetail(activeClient.id)]);
      setError('');
    } catch (linkError) {
      setError(linkError?.message || 'Не удалось привязать оборудование.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="clients-page">
      <header className="clients-hero">
        <div>
          <small>CRM</small>
          <h2>Клиенты и заведения</h2>
          <p>Карточки клиентов, точки, привязанное оборудование и быстрый переход к навигации по адресу.</p>
        </div>
        <ActionRail>
          <ActionRailButton tone="brand" onClick={() => setCreateOpen((prev) => !prev)}>
            {createOpen ? 'Отмена' : 'Добавить клиента'}
          </ActionRailButton>
        </ActionRail>
      </header>

      {createOpen ? (
        <form className="clients-create-form" onSubmit={submitCreate}>
          <input value={form.companyName} placeholder="Клиент / заведение" onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
          <input value={form.contactName} placeholder="Контактное лицо" onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} />
          <input value={form.phone} placeholder="Телефон" onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <input value={form.locationName} placeholder="Название точки" onChange={(e) => setForm((p) => ({ ...p, locationName: e.target.value }))} />
          <input value={form.locationAddress} placeholder="Адрес точки" onChange={(e) => setForm((p) => ({ ...p, locationAddress: e.target.value }))} />
          <button type="submit" disabled={busy}>{busy ? 'Сохраняем...' : 'Создать'}</button>
        </form>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="clients-workspace">
        <aside className="clients-list">
          <div className="clients-search">
            <input
              type="search"
              value={search}
              placeholder="Поиск клиента, телефона или оборудования"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') load(event.currentTarget.value);
              }}
            />
            <button type="button" onClick={() => load(search)}>{loading ? '...' : 'Найти'}</button>
          </div>
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              className={`client-list-card ${activeClient?.id === client.id ? 'active' : ''}`}
              onClick={() => navigate(`${basePath}/clients/${client.id}`)}
            >
              <strong>{client.companyName}</strong>
              <span>{client.phone || 'Телефон не указан'}</span>
              <small>{client.equipmentCount || 0} ед. оборудования · {client.locations?.length || 0} точек</small>
            </button>
          ))}
          {!clients.length ? <p className="empty-copy">Клиенты не найдены.</p> : null}
        </aside>

        <main className="client-detail">
          {!activeClient ? <p className="empty-copy">Выберите клиента.</p> : (
            <>
              <section className="client-profile-panel">
                <div>
                  <small>Карточка клиента</small>
                  <h3>{activeClient.companyName}</h3>
                  <button type="button" className="client-profile-edit-button" onClick={() => setEditOpen((prev) => !prev)}>
                    {editOpen ? 'Отмена' : 'Редактировать'}
                  </button>
                  <p>{activeClient.contactName || 'Контакт не указан'} · {activeClient.phone || 'телефон не указан'}</p>
                </div>
                <div className="client-profile-metrics">
                  {canDeleteClient ? (
                    <button type="button" className="client-profile-delete-button" onClick={deleteActiveClient} disabled={busy}>
                      Удалить
                    </button>
                  ) : null}
                  <article><span>Оборудование</span><strong>{activeDetail?.equipmentCount ?? activeClient.equipmentCount ?? 0}</strong></article>
                  <article><span>Заявки</span><strong>{activeDetail?.requestCount ?? activeClient.requestCount ?? 0}</strong></article>
                  <article><span>Обновлен</span><strong>{formatDate(activeClient.updatedAt)}</strong></article>
                </div>
              </section>
              {editOpen ? (
                <form className="client-edit-form" onSubmit={submitEditClient}>
                  <input value={editForm.companyName} placeholder="Клиент / заведение" onChange={(e) => setEditForm((p) => ({ ...p, companyName: e.target.value }))} />
                  <input value={editForm.contactName} placeholder="Контактное лицо" onChange={(e) => setEditForm((p) => ({ ...p, contactName: e.target.value }))} />
                  <input value={editForm.phone} placeholder="Телефон" onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                  <select value={editForm.locationId} onChange={(e) => {
                    const point = locations.find((item) => item.id === e.target.value) || {};
                    setEditForm((p) => ({
                      ...p,
                      locationId: e.target.value,
                      locationName: point.name || p.locationName,
                      locationAddress: point.address || p.locationAddress,
                    }));
                  }}>
                    <option value="">Точка не выбрана</option>
                    {locations.map((point) => (
                      <option key={point.id || point.name} value={point.id || ''}>{point.name} {point.address ? `· ${point.address}` : ''}</option>
                    ))}
                  </select>
                  <input value={editForm.locationName} placeholder="Название точки" onChange={(e) => setEditForm((p) => ({ ...p, locationName: e.target.value }))} />
                  <input value={editForm.locationAddress} placeholder="Полный адрес точки" onChange={(e) => setEditForm((p) => ({ ...p, locationAddress: e.target.value }))} />
                  <button type="submit" disabled={busy}>{busy ? 'Сохраняем...' : 'Сохранить изменения'}</button>
                </form>
              ) : null}

              <section className="clients-map-panel">
                <header>
                  <div>
                    <small>Карта клиентов</small>
                    <h3>Адреса в базе</h3>
                  </div>
                  <span>{locations.length}</span>
                </header>
                <div className="clients-map-surface">
                  <div ref={mapRootRef} className="clients-map-leaflet" />
                  {mapState.status === 'loading' ? <p className="clients-map-status">Загружаем карту и адреса...</p> : null}
                  {mapState.status === 'not_found' ? <p className="clients-map-status">Адрес есть, но координаты не найдены. Уточните город или полный адрес.</p> : null}
                  {mapState.status === 'error' ? <p className="clients-map-status">Карта сейчас не загрузилась. Навигация по адресу остается доступной ниже.</p> : null}
                  {locations.map((point, index) => {
                    const mapsUrl = buildMapsUrl(getLocationAddress(point));
                    return (
                      <article key={`${point.id || point.name}-${index}`} className="client-map-pin" style={{ '--pin-x': `${18 + ((index * 31) % 64)}%`, '--pin-y': `${22 + ((index * 23) % 52)}%` }}>
                        <Icon name="clients" />
                        <strong>{point.name}</strong>
                        <small>{point.address || 'Адрес не указан'}</small>
                        {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer">Навигация</a> : null}
                      </article>
                    );
                  })}
                  {!locations.length ? <p className="empty-copy">У клиента пока нет адресов для карты.</p> : null}
                </div>
              </section>

              <section className="client-equipment-panel">
                <header>
                  <div>
                    <small>Привязанные карточки</small>
                    <h3>Оборудование клиента</h3>
                  </div>
                  <button type="button" onClick={openLinkForm}>{linkOpen ? 'Отмена' : 'Добавить оборудование'}</button>
                </header>
                {linkOpen ? (
                  <form className="client-equipment-link-form" onSubmit={submitLinkEquipment}>
                    <label>
                      <span>Карточка оборудования</span>
                      <input
                        value={linkForm.equipmentSearch}
                        placeholder="Введите номер, серийник, бренд или модель"
                        onChange={(event) => setLinkForm((prev) => ({ ...prev, equipmentSearch: event.target.value, equipmentId: '' }))}
                      />
                    </label>
                    <div className="client-equipment-link-results">
                      {filteredEquipmentOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={linkForm.equipmentId === item.id ? 'active' : ''}
                          onClick={() => selectEquipment(item)}
                        >
                          <strong>{getEquipmentTitle(item)}</strong>
                          <span>{item.internalNumber || item.serial || item.id}</span>
                          <small>{item.clientName || item.companyLocation || 'Без привязки'}</small>
                        </button>
                      ))}
                      {!filteredEquipmentOptions.length ? <p className="empty-copy">Карточки не найдены.</p> : null}
                    </div>
                    {selectedEquipmentOption ? (
                      <p className="client-equipment-link-selected">
                        Выбрано: {getEquipmentTitle(selectedEquipmentOption)} · {selectedEquipmentOption.internalNumber || selectedEquipmentOption.serial || selectedEquipmentOption.id}
                      </p>
                    ) : null}
                    <label>
                      <span>Точка клиента</span>
                      <select value={linkForm.locationId} onChange={(event) => setLinkForm((prev) => ({ ...prev, locationId: event.target.value }))}>
                        <option value="">Создать / указать вручную</option>
                        {locations.map((point) => (
                          <option key={point.id || point.name} value={point.id || ''}>{point.name} {point.address ? `· ${point.address}` : ''}</option>
                        ))}
                      </select>
                    </label>
                    {!linkForm.locationId ? (
                      <div className="client-equipment-link-fields">
                        <input
                          value={linkForm.locationName}
                          placeholder="Название точки"
                          onChange={(event) => setLinkForm((prev) => ({ ...prev, locationName: event.target.value }))}
                        />
                        <input
                          value={linkForm.locationAddress}
                          placeholder="Адрес точки"
                          onChange={(event) => setLinkForm((prev) => ({ ...prev, locationAddress: event.target.value }))}
                        />
                      </div>
                    ) : null}
                    <div className="client-equipment-link-actions">
                      <button type="submit" disabled={busy || !linkForm.equipmentId}>{busy ? 'Привязываем...' : 'Привязать карточку'}</button>
                      <button type="button" onClick={() => setLinkOpen(false)}>Закрыть</button>
                    </div>
                  </form>
                ) : null}
                <div className="client-equipment-grid">
                  {equipment.map((item) => (
                    <article key={item.id} className="client-equipment-card">
                      <header>
                        <strong>{getEquipmentTitle(item)}</strong>
                        <StatusBadge status={item.serviceStatus || item.currentPlacement || 'none'}>{item.serviceStatus || item.currentPlacement || 'нет статуса'}</StatusBadge>
                      </header>
                      <p>{item.locationName || item.clientLocation || item.companyLocation || 'Точка не указана'}</p>
                      <small>{item.internalNumber || item.serial || item.id}</small>
                      <ActionRail compact>
                        <ActionRailButton onClick={() => navigate(`${basePath}/equipment/${item.id}`)}>Открыть карточку</ActionRailButton>
                        {buildMapsUrl(item.address || item.locationName) ? (
                          <a className="action-rail__button" href={buildMapsUrl(item.address || item.locationName)} target="_blank" rel="noreferrer">Маршрут</a>
                        ) : null}
                      </ActionRail>
                    </article>
                  ))}
                  {detailLoading ? <p className="empty-copy">Загружаем оборудование клиента...</p> : null}
                  {!detailLoading && !equipment.length ? <p className="empty-copy">К этому клиенту пока не привязано оборудование.</p> : null}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </section>
  );
}
