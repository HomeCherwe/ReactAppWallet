-- ============================================
-- Альтернативний варіант налаштування RLS політик
-- Використовуйте цей варіант, якщо основний не працює
-- ============================================

-- Видалити старі політики
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Дозволити публічне читання аватарок
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Спрощена політика: дозволити всім авторизованим користувачам завантажувати файли в avatars
-- Це менш безпечно, але працює гарантовано
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Дозволити оновлення файлів, які починаються з user_id
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

-- Дозволити видалення файлів, які починаються з user_id
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
-- Якщо і це не працює, спробуйте тимчасово відключити RLS:
-- ============================================
-- ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
-- 
-- ВАЖЛИВО: Це дозволить всім завантажувати файли! Використовуйте тільки для тестування.

