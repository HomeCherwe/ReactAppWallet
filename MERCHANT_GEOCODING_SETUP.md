# Налаштування геокодування мерчантів

## Крок 1: SQL міграція

Виконайте SQL скрипт `SUPABASE_MERCHANT_LOCATIONS_SETUP.sql` в Supabase SQL Editor.

Це створить:
- Таблицю `merchant_locations` для кешування геокодованих адрес
- Поля `merchant_name`, `merchant_address`, `merchant_lat`, `merchant_lng` в таблиці `transactions`
- Необхідні індекси та RLS політики

## Крок 2: Google Maps API Key

1. Перейдіть на [Google Cloud Console](https://console.cloud.google.com/)
2. Створіть проект або виберіть існуючий
3. Увімкніть API:
   - **Places API** (для пошуку за назвою)
   - **Geocoding API** (для геокодування адрес)
4. Створіть API Key:
   - Перейдіть в "APIs & Services" → "Credentials"
   - Натисніть "Create Credentials" → "API Key"
   - Обмежте ключ (рекомендовано):
     - Application restrictions: HTTP referrers (для production)
     - API restrictions: Places API, Geocoding API
5. Додайте ключ в `.env` файл backend:
   ```
   GOOGLE_MAPS_API_KEY=ваш_ключ_тут
   ```

## Як це працює

### Автоматичне геокодування

1. **При парсингу чека:**
   - ChatGPT витягує назву магазину та адресу (якщо є на чеку)
   - Адреса з чека має пріоритет - геокодується напряму
   - Якщо адреси немає - геокодується за назвою магазину

2. **При створенні транзакції:**
   - Якщо передано `merchant_name` - автоматично шукається в кеші
   - Якщо не знайдено в кеші - виконується геокодування
   - Результат зберігається в кеш та в транзакції

3. **При синхронізації Monobank:**
   - Назва магазину витягується з `description`
   - Геокодування виконується в фоні (не блокує створення транзакції)
   - Координати оновлюються пізніше

### Кешування

- Всі успішні геокодування зберігаються в `merchant_locations`
- Нормалізація назв (прибирає спецсимволи, нижній регістр)
- Один мерчант = один запис в кеші (UNIQUE constraint)
- При повторному використанні - координати беруться з кешу

### Endpoints

1. **POST /api/geocode-merchant**
   - Геокодує назву мерчанта
   - Параметри: `{ merchantName, city?, address? }`
   - Повертає: `{ merchantName, address, lat, lng, place_id, found }`

2. **PUT /api/merchant-location**
   - Ручне додавання/оновлення адреси
   - Параметри: `{ merchantName, address?, lat, lng, place_id? }`

## Використання

### У frontend

```javascript
// Автоматично при створенні транзакції з чека
const payload = {
  amount: -100,
  merchant_name: "АТБ",
  merchant_address: "вул. Хрещатик, 1, Київ", // з чека
  // ... інші поля
}
// Backend автоматично загеокодує та збереже координати
```

### Ручне геокодування

```javascript
const response = await apiFetch('/api/geocode-merchant', {
  method: 'POST',
  body: JSON.stringify({
    merchantName: 'АТБ',
    city: 'Київ' // опціонально
  })
})

if (response.found) {
  console.log('Координати:', response.lat, response.lng)
}
```

## Обмеження Google Maps API

- **Places API Text Search**: $32 за 1000 запитів
- **Geocoding API**: $5 за 1000 запитів
- Безкоштовний ліміт: $200 на місяць

**Рекомендації:**
- Кешування значно зменшує кількість запитів
- Популярні мережі (АТБ, Silpo) геокодуються один раз
- Використовуйте обмеження API Key для безпеки

## Troubleshooting

**Помилка: "GOOGLE_MAPS_API_KEY not set"**
- Перевірте, чи додано ключ в `.env` файл backend
- Перезапустіть backend після додавання ключа

**Геокодування не працює**
- Перевірте, чи увімкнені Places API та Geocoding API в Google Cloud Console
- Перевірте обмеження API Key (не повинні блокувати ваш домен/IP)
- Перевірте квоти в Google Cloud Console

**Не знаходить адреси**
- Спробуйте додати місто в запит: `{ merchantName: "АТБ", city: "Київ" }`
- Використайте ручне додавання через PUT /api/merchant-location
- Перевірте, чи правильно витягується адреса з чеків (ChatGPT prompt)

