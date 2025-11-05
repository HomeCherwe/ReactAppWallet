# Інструкція по налаштуванню Supabase Storage для аватарок

## Крок 1: Створення Bucket

1. Перейдіть до [Supabase Dashboard](https://app.supabase.com)
2. Виберіть ваш проект
3. Перейдіть до **Storage** в лівому меню
4. Натисніть кнопку **"New bucket"** або **"Create bucket"**
5. Заповніть форму:
   - **Name**: `avatars`
   - **Public bucket**: ✅ **Включити** (Public bucket = true)
   - **File size limit**: 5MB (або за замовчуванням)
   - **Allowed MIME types**: `image/*` (опціонально)
6. Натисніть **"Create bucket"**

## Крок 2: Налаштування RLS політик

1. Перейдіть до **SQL Editor** в Supabase Dashboard
2. Створіть новий запит
3. Скопіюйте та виконайте SQL скрипт з файлу `SUPABASE_STORAGE_SETUP.sql`

Або виконайте наступні SQL запити:

```sql
-- Видалити старі політики (якщо вони існують)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Дозволити публічне читання аватарок
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Дозволити користувачам завантажувати свої аватарки
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND name LIKE (auth.uid()::text || '-%')
  AND auth.role() = 'authenticated'
);

-- Дозволити користувачам оновлювати свої аватарки
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND name LIKE (auth.uid()::text || '-%')
  AND auth.role() = 'authenticated'
);

-- Дозволити користувачам видаляти свої аватарки
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND name LIKE (auth.uid()::text || '-%')
  AND auth.role() = 'authenticated'
);
```

## Крок 3: Перевірка

1. Перевірте, що bucket `avatars` створено та помічено як **Public**
2. Перевірте, що RLS політики застосовано (в **Storage** → **Policies**)
3. Спробуйте завантажити аватар через інтерфейс додатку

## Важливо

- Bucket **має бути Public**, інакше аватарки не будуть доступні для перегляду
- Файли автоматично стискаються до 800x800px перед завантаженням
- Старі аватарки автоматично видаляються при завантаженні нових
- Максимальний розмір файлу: 5MB

## Troubleshooting

### Помилка: "Bucket not found"
- Перевірте, що bucket створено з точною назвою `avatars`
- Перевірте, що ви знаходитесь в правильному проекті Supabase

### Помилка: "new row violates row-level security policy"
- Переконайтеся, що ви виконали SQL запити для створення RLS політик
- Перевірте, що користувач авторизований

### Аватарки не відображаються
- Перевірте, що bucket має статус **Public**
- Перевірте консоль браузера на наявність помилок CORS

