import { useEffect, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function SupportPage() {
  const { t } = useI18n();
  const [chatId, setChatId] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    telegramClientApi.me().then((data) => {
      if (data?.telegramUser?.id) {
        setChatId(String(data.telegramUser.id));
      }
    }).catch(() => {});
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    await telegramClientApi.notifySupport({ chatId, message });
    setDone(true);
    setMessage('');
  };

  return (
    <section>
      <h2>{t('support')}</h2>
      <p>{t('support_subtitle')}</p>
      <form className="service-panel service-form" onSubmit={onSubmit}>
        <input
          value={chatId}
          placeholder="Telegram chat ID"
          onChange={(e) => setChatId(e.target.value)}
          required
        />
        <textarea
          value={message}
          placeholder={t('support_message')}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        <button type="submit">{t('send_request')}</button>
      </form>
      {done ? <p className="notice notice-success">{t('sent_ok')}</p> : null}
    </section>
  );
}
