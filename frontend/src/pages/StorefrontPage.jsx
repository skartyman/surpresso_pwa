import { useMemo, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

const OFFER_GROUPS = [
  {
    key: 'coffee',
    titleKey: 'showcase_group_coffee',
    eyebrowKey: 'showcase_group_supply',
    items: [
      {
        id: 'coffee-signature-espresso',
        kind: 'coffee',
        titleKey: 'showcase_offer_signature',
        subtitleKey: 'showcase_offer_signature_note',
        facts: ['1 кг', 'espresso', 'blend'],
        requestType: 'coffee_order',
      },
      {
        id: 'coffee-filter-guest',
        kind: 'coffee',
        titleKey: 'showcase_offer_filter',
        subtitleKey: 'showcase_offer_filter_note',
        facts: ['1 кг', 'filter', 'seasonal'],
        requestType: 'coffee_order',
      },
    ],
  },
  {
    key: 'machines',
    titleKey: 'showcase_group_machines',
    eyebrowKey: 'showcase_group_equipment',
    items: [
      {
        id: 'machine-la-spaziale',
        kind: 'machine',
        titleKey: 'showcase_offer_machine_pro',
        subtitleKey: 'showcase_offer_machine_pro_note',
        facts: ['2 grp', 'rent-buy', 'service'],
      },
      {
        id: 'machine-saeco-auto',
        kind: 'machine',
        titleKey: 'showcase_offer_machine_auto',
        subtitleKey: 'showcase_offer_machine_auto_note',
        facts: ['auto', 'rent-buy', 'office'],
      },
    ],
  },
  {
    key: 'grinders',
    titleKey: 'showcase_group_grinders',
    eyebrowKey: 'showcase_group_equipment',
    items: [
      {
        id: 'grinder-e65s',
        kind: 'grinder',
        titleKey: 'showcase_offer_grinder_shop',
        subtitleKey: 'showcase_offer_grinder_shop_note',
        facts: ['on-demand', 'buy', 'bar'],
      },
      {
        id: 'grinder-ek43s',
        kind: 'grinder',
        titleKey: 'showcase_offer_grinder_pro',
        subtitleKey: 'showcase_offer_grinder_pro_note',
        facts: ['filter', 'buy', 'lab'],
      },
    ],
  },
];

function buildLeadPayload(form, offer, t) {
  const intent = form.intent;
  const offerTitle = t(offer.titleKey);
  const offerSubtitle = t(offer.subtitleKey);
  const type = offer.kind === 'coffee'
    ? 'coffee_order'
    : intent === 'rent'
      ? 'equipment_rent'
      : 'equipment_purchase';

  const title = offer.kind === 'coffee'
    ? `${t('showcase_action_order')} · ${offerTitle}`
    : intent === 'rent'
      ? `${t('showcase_action_rent')} · ${offerTitle}`
      : `${t('showcase_action_buy')} · ${offerTitle}`;

  const descriptionLines = [
    `${t('showcase_lead_offer')}: ${offerTitle}`,
    `${t('showcase_lead_format')}: ${offerSubtitle}`,
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
  const [activeGroup, setActiveGroup] = useState('coffee');
  const [activeOfferId, setActiveOfferId] = useState(OFFER_GROUPS[0].items[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    intent: 'order',
    quantity: '',
    term: '',
    comment: '',
  });

  const offers = useMemo(() => OFFER_GROUPS.find((group) => group.key === activeGroup)?.items || [], [activeGroup]);
  const activeOffer = useMemo(() => offers.find((item) => item.id === activeOfferId) || offers[0] || null, [offers, activeOfferId]);

  function selectOffer(groupKey, offerId, intent = 'order') {
    setActiveGroup(groupKey);
    setActiveOfferId(offerId);
    setForm((prev) => ({
      ...prev,
      intent,
      term: offerId.includes('machine') || offerId.includes('grinder') ? prev.term : '',
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
            <strong>2</strong>
          </article>
          <article>
            <span>{t('showcase_stat_machines')}</span>
            <strong>2</strong>
          </article>
          <article>
            <span>{t('showcase_stat_grinders')}</span>
            <strong>2</strong>
          </article>
        </div>
      </header>

      <div className="showroom-group-tabs">
        {OFFER_GROUPS.map((group) => (
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

      <div className="showroom-layout">
        <div className="showroom-cards">
          {OFFER_GROUPS.find((group) => group.key === activeGroup)?.items.map((offer) => (
            <article key={offer.id} className={`showroom-card showroom-card--${offer.kind} ${activeOfferId === offer.id ? 'active' : ''}`}>
              <div className="showroom-card__visual" aria-hidden="true" />
              <div className="showroom-card__body">
                <small>{t(OFFER_GROUPS.find((group) => group.key === activeGroup)?.eyebrowKey || 'showcase_group_equipment')}</small>
                <strong>{t(offer.titleKey)}</strong>
                <p>{t(offer.subtitleKey)}</p>
                <div className="showroom-card__facts">
                  {offer.facts.map((fact) => <span key={fact}>{fact}</span>)}
                </div>
              </div>
              <div className="showroom-card__actions">
                {offer.kind === 'coffee' ? (
                  <button type="button" className="hero__link hero__link--primary" onClick={() => selectOffer(activeGroup, offer.id, 'order')}>
                    {t('showcase_action_order')}
                  </button>
                ) : (
                  <>
                    <button type="button" className="hero__link hero__link--primary" onClick={() => selectOffer(activeGroup, offer.id, 'rent')}>
                      {t('showcase_action_rent')}
                    </button>
                    <button type="button" className="hero__link" onClick={() => selectOffer(activeGroup, offer.id, 'buy')}>
                      {t('showcase_action_buy')}
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
            <h3>{activeOffer ? t(activeOffer.titleKey) : t('showcase_title')}</h3>
            <p>{activeOffer ? t(activeOffer.subtitleKey) : t('showcase_subtitle')}</p>
          </div>

          <div className="showroom-intents">
            {(activeOffer?.kind === 'coffee'
              ? [{ key: 'order', label: t('showcase_action_order') }]
              : [
                  { key: 'rent', label: t('showcase_action_rent') },
                  { key: 'buy', label: t('showcase_action_buy') },
                ]).map((item) => (
              <button
                key={item.key}
                type="button"
                className={form.intent === item.key ? 'active' : ''}
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
