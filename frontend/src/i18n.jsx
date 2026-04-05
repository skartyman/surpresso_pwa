import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const I18nContext = createContext(null);

const messages = {
  uk: {
    nav_home: 'Головна',
    nav_service: 'Сервіс',
    nav_equipment: 'Обладн.',
    nav_support: 'Підтримка',
    action_open: 'Відкрити',
    lang_switch: 'Мова',
    hero_subtitle: 'Єдина точка керування сервісом, обладнанням та замовленнями в Telegram.',
    create_request: 'Створити заявку',
    contact_manager: 'Зв\'язатися з менеджером',
    my_equipment: 'Моє обладнання',
    serial_short: 'Серійний №',
    status: 'Статус',
    loading: 'Завантаження...',
    serial_number: 'Серійний номер',
    internal_number: 'Внутрішній номер',
    service_history: 'Історія обслуговування',
    support: 'Підтримка',
    support_subtitle: 'Чат із менеджером і SLA по заявках.',
    placeholder_subtitle: 'Розділ підготовлено як точку розширення для наступного релізу.',
    forbidden_text: 'У вас немає прав для цього розділу. Поверніться у доступний розділ адмінки або на головну сторінку.',
    go_allowed: 'Перейти в доступний розділ',
    go_home: 'На головну',
    login_title: 'Вхід в адмінку',
    login_password: 'Пароль',
    login_btn: 'Увійти',
    login_error: 'Невірний логін або пароль',
    service: 'Сервіс',
    service_new: 'Нова заявка',
    service_intro: 'Створіть звернення у кілька кроків, а нижче відстежуйте статуси.',
    sent_ok: 'Заявку успішно відправлено.',
    go_status: 'Перейти до статусу заявки',
    no_equipment: 'У вас поки немає прив\'язаного обладнання.',
    can_submit_anyway: 'Ви все одно можете надіслати заявку.',
    equipment_optional: 'Обладнання (якщо відомо)',
    equipment_skip: 'Не вказувати обладнання',
    problem_category: 'Категорія проблеми',
    topic: 'Тема звернення',
    topic_short: 'Коротка тема звернення',
    problem_desc: 'Опис проблеми',
    request_priority: 'Пріоритет заявки',
    low: 'Низький', normal: 'Середній', high: 'Високий', critical: 'Критичний',
    can_operate: 'Можна продовжувати працювати',
    photo_video: 'Фото або відео',
    upload_hint: 'Додайте матеріал, щоб інженер швидше оцінив ситуацію.',
    files_selected: 'Вибрано файлів',
    sending: 'Надсилаємо…',
    send_request: 'Надіслати заявку',
    selected_equipment: 'Вибране обладнання',
    requests_history: 'Історія заявок',
    no_requests: 'Поки немає заявок.',
    current_status: 'Поточний статус',
    in_progress: 'В роботі',
    engineer_assigned: 'Інженера призначено, очікуємо підтвердження часу візиту.',
    request_status: 'Статус заявки',
    status_new: 'Нова',
    status_waiting_client: 'Очікує клієнта',
    status_resolved: 'Вирішена',
    status_cancelled: 'Скасована',
    cat_coffee_machine: 'Кавомашина',
    cat_grinder: 'Кавомолка',
    cat_water: 'Фільтрація води',
    type_service_repair: 'Ремонт і сервіс',
    type_coffee_order: 'Замовити каву',
    type_coffee_tasting: 'Дегустація',
    type_grinder_check: 'Перевірка помелу',
    type_rental_auto: 'Оренда авто',
    type_rental_pro: 'Оренда проф.',
    type_feedback: 'Зворотний зв\'язок',
    generic_request: 'Звернення',
    history_load_error: 'Не вдалося завантажити історію заявок.',
    err_category_required: 'Оберіть категорію заявки.',
    err_description_required: 'Додайте опис проблеми.',
    err_urgency_required: 'Оберіть терміновість заявки.',
    err_equipment_not_found: 'Вибране обладнання не знайдено.',
    err_equipment_client_mismatch: 'Вибране обладнання не належить вашому профілю.',
    err_service_unavailable: 'Сервіс тимчасово недоступний. Спробуйте знову за хвилину.',
    err_invalid: 'Не вдалося підтвердити Telegram-сесію. Перезапустіть Mini App.',
    err_request_failed: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
    err_request_failed_late: 'Не вдалося надіслати заявку. Спробуйте пізніше.',
    rentals: 'Оренда', coffee: 'Кава', supplies: 'Витратники', guides: 'Інструкції',
  },
  ru: {
    nav_home: 'Главная', nav_service: 'Сервис', nav_equipment: 'Оборуд.', nav_support: 'Поддержка',
    action_open: 'Открыть', lang_switch: 'Язык', hero_subtitle: 'Единая точка управления сервисом, оборудованием и заказами внутри Telegram.',
    create_request: 'Создать заявку', contact_manager: 'Связаться с менеджером', my_equipment: 'Мое оборудование',
    serial_short: 'Серийный №', status: 'Статус', loading: 'Загрузка...', serial_number: 'Серийный номер', internal_number: 'Внутренний номер',
    service_history: 'История обслуживания', support: 'Поддержка', support_subtitle: 'Чат с менеджером и SLA по заявкам.',
    placeholder_subtitle: 'Раздел подготовлен как точка расширения для следующего релиза.', forbidden_text: 'У вас нет прав для этого раздела. Вернитесь в доступный раздел админки или на главную страницу.',
    go_allowed: 'Перейти в доступный раздел', go_home: 'На главную', login_title: 'Вход в админку', login_password: 'Пароль', login_btn: 'Войти', login_error: 'Неверный логин или пароль',
    service: 'Сервис', service_new: 'Новая заявка', service_intro: 'Создайте обращение в пару шагов, а ниже отслеживайте статусы.', sent_ok: 'Заявка успешно отправлена.', go_status: 'Перейти к статусу заявки',
    no_equipment: 'У вас пока нет привязанного оборудования.', can_submit_anyway: 'Вы все равно можете отправить заявку.',
    equipment_optional: 'Оборудование (если известно)', equipment_skip: 'Не указывать оборудование', problem_category: 'Категория проблемы',
    topic: 'Тема обращения', topic_short: 'Краткая тема обращения', problem_desc: 'Описание проблемы', request_priority: 'Приоритет заявки',
    low: 'Низкая', normal: 'Средняя', high: 'Высокая', critical: 'Критичная', can_operate: 'Можно продолжать работать',
    photo_video: 'Фото или видео', upload_hint: 'Приложите материал, чтобы инженер быстрее оценил ситуацию.', files_selected: 'Выбрано файлов',
    sending: 'Отправляем…', send_request: 'Отправить заявку', selected_equipment: 'Выбрано оборудование', requests_history: 'История заявок',
    no_requests: 'Пока нет заявок.', current_status: 'Текущий статус', in_progress: 'В работе', engineer_assigned: 'Инженер назначен, ожидаем подтверждение времени визита.',
    request_status: 'Статус заявки', status_new: 'Новая', status_waiting_client: 'Ожидает клиента', status_resolved: 'Решена', status_cancelled: 'Отменена',
    cat_coffee_machine: 'Кофемашина', cat_grinder: 'Кофемолка', cat_water: 'Фильтрация воды',
    type_service_repair: 'Ремонт и сервис', type_coffee_order: 'Заказать кофе', type_coffee_tasting: 'Дегустация', type_grinder_check: 'Проверка помола',
    type_rental_auto: 'Аренда авто', type_rental_pro: 'Аренда проф.', type_feedback: 'Обратная связь', generic_request: 'Обращение',
    history_load_error: 'Не удалось загрузить историю заявок.', err_category_required: 'Выберите категорию заявки.', err_description_required: 'Добавьте описание проблемы.',
    err_urgency_required: 'Выберите срочность заявки.', err_equipment_not_found: 'Выбранное оборудование не найдено.', err_equipment_client_mismatch: 'Выбранное оборудование не принадлежит вашему профилю.',
    err_service_unavailable: 'Сервис временно недоступен. Попробуйте снова через минуту.', err_invalid: 'Не удалось подтвердить Telegram-сессию. Перезапустите Mini App.',
    err_request_failed: 'Не удалось отправить заявку. Попробуйте еще раз.', err_request_failed_late: 'Не удалось отправить заявку. Попробуйте позже.',
    rentals: 'Аренда', coffee: 'Кофе', supplies: 'Расходники', guides: 'Инструкции',
  }};

const defaultLocale = 'uk';


export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => localStorage.getItem('ui_locale') || defaultLocale);

  useEffect(() => {
    localStorage.setItem('ui_locale', locale);
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key) => messages[locale]?.[key] || messages.uk[key] || key,
    dateLocale: locale === 'uk' ? 'uk-UA' : 'ru-RU',
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
