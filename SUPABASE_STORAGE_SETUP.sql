-- ============================================
-- Налаштування Supabase Storage для аватарок
-- ============================================
-- Цей скрипт створює bucket 'avatars' та налаштовує RLS політики

-- 1. Створити bucket 'avatars' (якщо ще не існує)
-- Примітка: Це потрібно зробити через Supabase Dashboard -> Storage -> Create Bucket
-- Або через API, але для простоти робимо через Dashboard

-- 2. Налаштувати RLS політики для bucket 'avatars'
-- Видаліть старі політики, якщо вони існують
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Дозволити публічне читання аватарок
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Дозволити користувачам завантажувати свої аватарки
-- Файли мають формат: {user_id}-{timestamp}.{ext}
-- Використовуємо split_part для витягування user_id з імені файлу
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (
    -- Перевірка, що ім'я файлу починається з user_id
    split_part(name, '-', 1) = auth.uid()::text
    OR name LIKE (auth.uid()::text || '-%')
  )
);

-- Дозволити користувачам оновлювати свої аватарки
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (
    split_part(name, '-', 1) = auth.uid()::text
    OR name LIKE (auth.uid()::text || '-%')
  )
);

-- Дозволити користувачам видаляти свої аватарки
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (
    split_part(name, '-', 1) = auth.uid()::text
    OR name LIKE (auth.uid()::text || '-%')
  )
);

-- ============================================
-- Інструкції:
-- ============================================
-- 1. Перейдіть до Supabase Dashboard -> Storage
-- 2. Натисніть "Create Bucket"
-- 3. Назвіть bucket: "avatars"
-- 4. Встановіть "Public bucket" = true (для публічного доступу до аватарок)
-- 5. Виконайте SQL запити вище в SQL Editor для налаштування RLS
-- 6. Перевірте, що bucket створено та політики застосовано

