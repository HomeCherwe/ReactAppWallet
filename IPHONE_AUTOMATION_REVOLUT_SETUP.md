# 📱 iPhone Shortcuts — Автоматизація синхронізації Monobank та Revolut

Ця інструкція описує, як налаштувати **автоматичну синхронізацію** як Monobank, так і Revolut (через TrueLayer) через iPhone Shortcuts при оплаті карткою або за розкладом.

---

## 📋 Зміст

1. [Отримання API URL та API Key](#1-отримання-api-url-та-api-key)
2. [Ендпоінти для автоматизації](#2-ендпоінти-для-автоматизації)
3. [Налаштування Shortcuts — Monobank](#3-shortcuts--monobank)
4. [Налаштування Shortcuts — Revolut](#4-shortcuts--revolut)
5. [Комбінована автоматизація (Mono + Revolut)](#5-комбінована-автоматизація)
6. [Тестування та відповіді API](#6-тестування-та-відповіді-api)
7. [Усунення проблем](#7-усунення-проблем)
8. [Безпека](#8-безпека)

---

## 1. Отримання API URL та API Key

### API URL

1. Відкрий додаток → сторінка **Профіль**
2. Прокрути до секції **"API Key для автоматизації"**
3. Скопіюй **API URL** (кнопка 📋)

> **Приклад:** `https://your-project.vercel.app` або `http://192.168.1.100:8787` (для локальної мережі)

### API Key

1. Перейди до секції **"API Key для автоматизації"** на сторінці профілю
2. Натисни **"Створити API Key"** (якщо ключа ще немає)
3. Скопіюй ключ (кнопка 📋) та збережи у безпечному місці

> ⚠️ **Важливо:** Ключ показується тільки один раз! Якщо загублено — створи новий.

---

## 2. Ендпоінти для автоматизації

| Банк | Ендпоінт | Метод | Аутентифікація |
|------|----------|-------|----------------|
| Monobank | `POST /api/syncMonoBank` | POST | JWT або API Key |
| Revolut | `POST /api/syncTrueLayer` | POST | JWT або API Key |
| Перевірка Revolut токену | `GET /api/truelayer/check-token` | GET | JWT (тільки) |

### Формат заголовку автентифікації

```
X-API-Key: ВАШ_API_KEY
```

або

```
Authorization: Bearer ВАШ_JWT_TOKEN
```

> **Рекомендація:** Для автоматизацій завжди використовуй **API Key** — він не має терміну дії.

---

## 3. Shortcuts — Monobank

### Крок 1: Новий shortcut

1. Відкрий **Shortcuts** → вкладка **Автоматизації** → **+**
2. Вибери тригер (наприклад, **Додаток** → Monobank → "Коли відкривається")

### Крок 2: HTTP запит

| Поле | Значення |
|------|----------|
| URL | `https://YOUR-API-URL/api/syncMonoBank` |
| Метод | **POST** |
| Заголовки | `X-API-Key: ВАШ_API_KEY` |
| Тіло | `{}` (JSON) |

### Крок 3: Обробка відповіді

```
Якщо [Отримати вміст URL] містить "success":
  Показати повідомлення: "✅ Monobank синхронізовано!"
Інакше:
  Показати повідомлення: "❌ Помилка Monobank"
```

---

## 4. Shortcuts — Revolut (TrueLayer)

> **Важливо:** TrueLayer надає доступ лише на **90 днів**. Після цього потрібно переавторизуватись у профілі додатку.

### Крок 1: Новий shortcut

1. Відкрий **Shortcuts** → **+** → Вибери тригер
2. Рекомендований тригер: **При оплаті карткою** (NFC/Apple Pay)

### Крок 2: HTTP запит

| Поле | Значення |
|------|----------|
| URL | `https://YOUR-API-URL/api/syncTrueLayer` |
| Метод | **POST** |
| Заголовки | `X-API-Key: ВАШ_API_KEY` |
| Тіло | `{}` (JSON) |

### Крок 3: Обробка відповіді та помилок

```
Якщо статус 200 і "success" = true:
  Показати: "✅ Revolut синхронізовано! Додано [count] транзакцій"
Якщо "message" містить "not connected":
  Показати: "⚠️ Revolut не підключено. Відкрий профіль додатку."
Якщо "message" містить "Re-authentication":
  Показати: "🔄 Термін дії Revolut сплив (90 днів). Підключи знову у профілі."
Якщо статус 401:
  Показати: "❌ Невірний API Key"
Якщо статус 500:
  Показати: "❌ Помилка сервера. Спробуй пізніше."
```

---

## 5. Комбінована автоматизація

Один shortcut може синхронізувати **обидва банки одночасно**:

### Структура shortcut:

```
1. Отримати вміст URL  ← Monobank
   URL: https://YOUR-API-URL/api/syncMonoBank
   Метод: POST
   Заголовки: X-API-Key: YOUR_KEY
   Тіло: {}

2. Зберегти Monobank результат у змінну

3. Отримати вміст URL  ← Revolut
   URL: https://YOUR-API-URL/api/syncTrueLayer
   Метод: POST
   Заголовки: X-API-Key: YOUR_KEY
   Тіло: {}

4. Зберегти Revolut результат у змінну

5. Показати повідомлення:
   "🟡 Mono: [monobank_count] | 🔵 Rev: [revolut_count]"
```

### Приклад повідомлення:
```
🟡 Mono: 3 | 🔵 Rev: 1
```

---

## 6. Тестування та відповіді API

### Успішна відповідь Monobank:

```json
{
  "success": true,
  "count": 3,
  "message": "Sync transactions - 3",
  "transactions": [...]
}
```

### Успішна відповідь Revolut:

```json
{
  "success": true,
  "count": 1,
  "message": "Sync successful. Added 1 transactions."
}
```

### Revolut не підключено:

```json
{
  "success": false,
  "message": "TrueLayer not connected. Please connect in Profile."
}
```

### Revolut токен прострочено (після 90 днів):

```json
{
  "success": false,
  "error": "Failed to access TrueLayer accounts. Re-authentication may be required."
}
```

### Помилка аутентифікації:

```json
{
  "error": "Invalid API key"
}
```

### Помилка сервера:

```json
{
  "success": false,
  "error": "Повідомлення про помилку"
}
```

---

## 7. Усунення проблем

### ❌ "401 Unauthorized" або "Invalid API key"

- Перевір, чи правильно скопійовано API Key (без пробілів)
- Переконайся, що заголовок: `X-API-Key` (чутливий до регістру)
- Перевір, чи ключ не перезаписано (у профілі можна побачити поточний)

### ❌ Revolut: "TrueLayer not connected"

- Revolut не підключено у профілі
- Перейди в профіль → секція **TrueLayer API (Revolut)** → натисни **"Підключити Revolut"**

### ❌ Revolut: "Re-authentication may be required"

- Термін дії TrueLayer-авторизації (90 днів) сплив
- Перейди в профіль → **"Підключити Revolut знову"** (банер з'явиться автоматично)

### ❌ Monobank: "api token required"

- Токен Monobank не налаштовано
- Перейди в профіль → секція **Monobank API** → введи токен і збережи

### ❌ "500 Internal Server Error"

- Перевір, чи правильно налаштовані API ключі у профілі
- Перевір підключення до інтернету
- Спробуй пізніше (тимчасова недоступність сервера)

### ❌ "Network error" / "Connection timeout"

- Перевір, чи правильний API URL
- Якщо локальна мережа: iPhone та комп'ютер мають бути в одній Wi-Fi мережі
- Формат для локальної мережі: `http://192.168.1.XXX:8787` (заміни XXX на IP комп'ютера)

---

## 8. Безпека

### Захист API Key

- **Ніколи не публікуй** API Key (GitHub, соціальні мережі тощо)
- **Якщо ключ скомпрометовано** → створи новий у профілі (старий автоматично стане неактивним)
- Shortcuts зберігає дані **локально та зашифровано** на пристрої

### Що дозволяє API Key

| Дія | Дозволено |
|-----|-----------|
| Синхронізація Monobank | ✅ |
| Синхронізація Revolut | ✅ |
| Перегляд транзакцій | ❌ |
| Зміна налаштувань | ❌ |
| Видалення даних | ❌ |

---

## 9. Приклад повного shortcut (iOS)

```
Назва: 💳 Sync Banks

Тригер: Коли запускається Shortcut (ручний запуск для тестування)

Дії:
  1. Отримати вміст URL
     URL: https://your-api.vercel.app/api/syncMonoBank
     Метод: POST
     Заголовки:
       X-API-Key → ваш_ключ
       Content-Type → application/json
     Тіло запиту: JSON → {}

  2. Зберегти "Результат дії" у змінну "Mono Result"

  3. Отримати вміст URL
     URL: https://your-api.vercel.app/api/syncTrueLayer
     Метод: POST
     Заголовки:
       X-API-Key → ваш_ключ
       Content-Type → application/json
     Тіло запиту: JSON → {}

  4. Зберегти "Результат дії" у змінну "Rev Result"

  5. Показати повідомлення
     Текст: "Sync done: Mono=[Mono Result] Rev=[Rev Result]"
```

---

**Створено:** 2026-05-14
**Версія:** 2.0 (додано підтримку Revolut + розширена обробка помилок)
