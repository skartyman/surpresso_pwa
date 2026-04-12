import { useEffect, useMemo, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

const GROUP_META = {
  coffee: { titleKey: 'showcase_group_coffee', eyebrowKey: 'showcase_group_supply' },
  accessories: { titleKey: 'showcase_group_accessories', eyebrowKey: 'showcase_group_supply' },
  equipment: { titleKey: 'showcase_group_machines', eyebrowKey: 'showcase_group_equipment' },
};

const FALLBACK_PRODUCTS = [
  {
    id: 'coffee-signature-espresso',
    category: 'coffee',
    titleKey: 'showcase_offer_signature',
    subtitleKey: 'showcase_offer_signature_note',
    facts: ['1 кг', 'espresso', 'blend'],
    priceMode: 'sale',
  },
  {
    id: 'coffee-filter-guest',
    category: 'coffee',
    titleKey: 'showcase_offer_filter',
    subtitleKey: 'showcase_offer_filter_note',
    facts: ['1 кг', 'filter', 'seasonal'],
    priceMode: 'sale',
  },
  {
    id: 'machine-la-spaziale',
    category: 'equipment',
    kind: 'machine',
    titleKey: 'showcase_offer_machine_pro',
    subtitleKey: 'showcase_offer_machine_pro_note',
    facts: ['2 grp', 'rent-buy', 'service'],
    priceMode: 'rent',
  },
  {
    id: 'machine-saeco-auto',
    category: 'equipment',
    kind: 'machine',
    titleKey: 'showcase_offer_machine_auto',
    subtitleKey: 'showcase_offer_machine_auto_note',
    facts: ['auto', 'rent-buy', 'office'],
    priceMode: 'rent',
  },
  {
    id: 'grinder-e65s',
    category: 'equipment',
    kind: 'grinder',
    titleKey: 'showcase_offer_grinder_shop',
    subtitleKey: 'showcase_offer_grinder_shop_note',
    facts: ['on-demand', 'buy', 'bar'],
    priceMode: 'sale',
  },
  {
    id: 'grinder-ek43s',
    category: 'equipment',
    kind: 'grinder',
    titleKey: 'showcase_offer_grinder_pro',
    subtitleKey: 'showcase_offer_grinder_pro_note',
    facts: ['filter', 'buy', 'lab'],
    priceMode: 'sale',
  },
];

function normalizeCatalogProduct(item, t) {
  const data = item?.data || {};
  const category = data.category || 'equipment';
  const heroMedia = data.heroMedia || null;
  const title = item?.title || data.title || t(item?.titleKey || 'showcase_title');
  const subtitle = data.subtitle || data.description || '';
  const price = data.price ? `${data.price} ${data.currency || ''}`.trim() : '';
  return {
    id: item?.key || item?.id || title,
    category,
    kind: category === 'coffee' ? 'coffee' : category === 'accessories' ? 'accessories' : 'equipment',
    title,
    subtitle,
    description: data.description || '',
    facts: [price, data.priceMode, data.availability].filter(Boolean),
    priceMode: data.priceMode || 'sale',
    ctaLabel: data.ctaLabel || '',
    imageUrl: heroMedia?.previewUrl || heroMedia?.fileUrl || '',
    isCatalog: true,
  };
}

function normalizeFallbackProduct(item, t) {
  const title = t(item.titleKey);
  return {
    ...item,
    title,
    subtitle: t(item.subtitleKey),
    imageUrl: '',
    isCatalog: false,
  };
}

function getRequestType(offer, intent) {
  if (offer.category === 'coffee' || offer.kind === 'coffee') return 'coffee_order';
  return intent === 'rent' ? 'equipment_rent' : 'equipment_purchase';
}

function getOfferIntent(offer, formIntent) {
  if (offer.category === 'coffee' || offer.kind === 'coffee') return 'order';
  if (formIntent === 'rent' || formIntent === 'buy') return formIntent;
  return offer.priceMode === 'rent' ? 'rent' : 'buy';
}

function buildLeadPayload(form, offer, t) {
  const intent = getOfferIntent(offer, form.intent);
  const type = getRequestType(offer, intent);
  const title = offer.category === 'coffee' || offer.kind === 'coffee'
    ? `${t('showcase_action_order')} · ${offer.title}`
    : intent === 'rent'
      ? `${t('showcase_action_rent')} · ${offer.title}`
      : `${t('showcase_action_buy')} · ${offer.title}`;

  const descriptionLines = [
    `${t('showcase_lead_offer')}: ${offer.title}`,
    offer.subtitle ? `${t('showcase_lead_format')}: ${offer.subtitle}` : null,
    `${t('showcase_lead_intent')}: ${intent === 'rent' ? t('showcase_action_rent') : intent === 'buy' ? t('showcase_action_buy') : t('showcase_action_order')}`,
    form.quantity ? `${t('showcase_lead_quantity')}: ${form.quantity}` : null,
    form.term ? `${t('showcase_lead_term')}: ${form.term}` : null,
    form.comment ? `${t('showcase_lead_comment')}: ${form.comment}` : null,
  ].filter(Boolean);

  const payload = new FormData();
  payload.append('type', type);
  payload.append('title', title);
  payload.append('description', descriptionLines.join('\n'));
  return payload;
}

export function StorefrontPage() {
  const { t } = useI18n();
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [activeGroup, setActiveGroup] = useState('coffee');
  const [activeOfferId, setActiveOfferId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    intent: 'order',
    quantity: '',
    term: '',
    comment: '',
  });

  useEffect(() => {
    let cancelled = false;
    telegramClientApi.catalogProducts()
      .then((payload) => {
        if (cancelled) return;
        setCatalogProducts((payload.items || []).map((item) => normalizeCatalogProduct(item, t)));
      })
      .catch(() => {
        if (!cancelled) setCatalogProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const products = useMemo(() => (
    catalogProducts.length ? catalogProducts : FALLBACK_PRODUCTS.map((item) => normalizeFallbackProduct(item, t))
  ), [catalogProducts, t]);

  const groups = useMemo(() => Object.keys(GROUP_META)
    .map((key) => ({
      key,
      ...GROUP_META[key],
      items: products.filter((item) => item.category === key || (key === 'equipment' && ['machine', 'grinder'].includes(item.kind))),
    }))
    .filter((group) => group.items.length), [products]);

  useEffect(() => {
    if (!groups.length) return;
    const currentGroup = groups.find((group) => group.key === activeGroup) || groups[0];
    if (currentGroup.key !== activeGroup) setActiveGroup(currentGroup.key);
    if (!currentGroup.items.some((item) => item.id === activeOfferId)) {
      setActiveOfferId(currentGroup.items[0]?.id || '');
    }
  }, [groups, activeGroup, activeOfferId]);

  const offers = useMemo(() => groups.find((group) => group.key === activeGroup)?.items || [], [groups, activeGroup]);
  const activeOffer = useMemo(() => offers.find((item) => item.id === activeOfferId) || offers[0] || null, [offers, activeOfferId]);
  const currentGroupMeta = GROUP_META[activeGroup] || GROUP_META.equipment;

  function selectOffer(groupKey, offerId, intent = 'order') {
    setActiveGroup(groupKey);
    setActiveOfferId(offerId);
    setForm((prev) => ({
      ...prev,
      intent,
      term: intent === 'order' ? '' : prev.term,
    }));
    setSuccess('');
    setError('');
  }

  async function submitLead(event) {
    event.preventDefault();
    if (!activeOffer) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = buildLeadPayload(form, activeOffer, t);
      const created = await telegramClientApi.createServiceRequest(payload);
      setSuccess(created?.id || 'ok');
      setForm((prev) => ({ ...prev, quantity: '', term: '', comment: '' }));
    } catch (submitError) {
      setError(submitError?.message || t('err_request_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="client-page showroom-page">
      <header className="hero hero--showroom">
        <div className="hero__copy">
          <small>{t('showcase_kicker')}</small>
          <h2>{t('showcase_title')}</h2>
          <p>{t('showcase_subtitle')}</p>
        </div>
        <div className="showroom-hero-stats">
          <article>
            <span>{t('showcase_stat_coffee')}</span>
            <strong>{products.filter((item) => item.category === 'coffee').length}</strong>
          </article>
          <article>
            <span>{t('showcase_stat_machines')}</span>
            <strong>{products.filter((item) => item.category === 'equipment' || item.kind === 'machine').length}</strong>
          </article>
          <article>
            <span>{t('showcase_stat_grinders')}</span>
            <strong>{products.filter((item) => item.kind === 'grinder').length}</strong>
          </article>
        </div>
      </header>

      <div className="showroom-group-tabs">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className={activeGroup === group.key ? 'active' : ''}
            onClick={() => {
              setActiveGroup(group.key);
              setActiveOfferId(group.items[0]?.id || '');
            }}
          >
            {t(group.titleKey)}
          </button>
        ))}
      </div>

      {loadingCatalog ? <p className="notice">{t('loading')}</p> : null}

      <div className="showroom-layout">
        <div className="showroom-cards">
          {offers.map((offer) => (
            <article key={offer.id} className={`showroom-card showroom-card--${offer.kind} ${activeOfferId === offer.id ? 'active' : ''}`}>
              <div className="showroom-card__visual" aria-hidden="true">
                {offer.imageUrl ? <img src={offer.imageUrl} alt="" loading="lazy" /> : null}
              </div>
              <div className="showroom-card__body">
                <small>{t(currentGroupMeta.eyebrowKey)}</small>
                <strong>{offer.title}</strong>
                <p>{offer.subtitle || offer.description}</p>
                <div className="showroom-card__facts">
                  {(offer.facts || []).map((fact) => <span key={fact}>{fact}</span>)}
                </div>
              </div>
              <div className="showroom-card__actions">
                {offer.category === 'coffee' || offer.kind === 'coffee' ? (
                  <button type="button" className="hero__link hero__link--primary" onClick={() => selectOffer(activeGroup, offer.id, 'order')}>
                    {offer.ctaLabel || t('showcase_action_order')}
                  </button>
                ) : (
                  <>
                    <button type="button" className="hero__link hero__link--primary" onClick={() => selectOffer(activeGroup, offer.id, 'rent')}>
                      {t('showcase_action_rent')}
                    </button>
                    <button type="button" className="hero__link" onClick={() => selectOffer(activeGroup, offer.id, 'buy')}>
                      {offer.ctaLabel || t('showcase_action_buy')}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        <form className="service-panel showroom-composer" onSubmit={submitLead}>
          <div className="showroom-composer__head">
            <small>{t('showcase_request_title')}</small>
            <h3>{activeOffer ? activeOffer.title : t('showcase_title')}</h3>
            <p>{activeOffer ? activeOffer.subtitle || activeOffer.description : t('showcase_subtitle')}</p>
          </div>

          <div className="showroom-intents">
            {(activeOffer?.category === 'coffee' || activeOffer?.kind === 'coffee'
              ? [{ key: 'order', label: activeOffer?.ctaLabel || t('showcase_action_order') }]
              : [
                  { key: 'rent', label: t('showcase_action_rent') },
                  { key: 'buy', label: activeOffer?.ctaLabel || t('showcase_action_buy') },
                ]).map((item) => (
              <button
                key={item.key}
                type="button"
                className={getOfferIntent(activeOffer, form.intent) === item.key ? 'active' : ''}
                onClick={() => setForm((prev) => ({ ...prev, intent: item.key }))}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="service-form__grid service-form__grid--triple">
            <label>
              <span className="service-field-label">{t('showcase_lead_quantity')}</span>
              <input value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} placeholder={t('showcase_quantity_placeholder')} />
            </label>

            <label>
              <span className="service-field-label">{t('showcase_lead_term')}</span>
              <input value={form.term} onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))} placeholder={t('showcase_term_placeholder')} />
            </label>
          </div>

          <label>
            <span className="service-field-label">{t('showcase_lead_comment')}</span>
            <textarea
              value={form.comment}
              onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
              placeholder={t('showcase_comment_placeholder')}
              rows={5}
            />
          </label>

          <button type="submit" disabled={submitting || !activeOffer}>
            {submitting ? t('sending') : t('showcase_submit')}
          </button>

          {success ? <p className="notice notice-success">{t('sent_ok')} {t('request_id_label')}: {success}</p> : null}
          {error ? <p className="notice notice-error">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
