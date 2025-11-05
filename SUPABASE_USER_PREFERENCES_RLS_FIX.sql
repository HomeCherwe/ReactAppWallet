-- ============================================
-- Виправлення RLS політик для user_preferences
-- ============================================
-- Цей скрипт налаштовує Row Level Security для таблиці user_preferences
-- Дозволяє користувачам створювати, читати, оновлювати та видаляти тільки свої налаштування

-- ============================================
-- 1. Перевірка та створення таблиці (якщо не існує)
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- JSON поля з усіма налаштуваннями
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  apis JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Забезпечимо унікальність по user_id
  UNIQUE(user_id)
);

-- ============================================
-- 2. Додавання колонки apis (якщо не існує)
-- ============================================

ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS apis JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- 3. Створення індексів для швидкого пошуку
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_apis ON user_preferences USING GIN (apis);
CREATE INDEX IF NOT EXISTS idx_user_preferences_preferences ON user_preferences USING GIN (preferences);

-- ============================================
-- 4. Увімкнення Row Level Security
-- ============================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Видалення старих політик (якщо є)
-- ============================================

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;

-- ============================================
-- 6. Створення нових політик RLS
-- ============================================

-- Користувачі можуть бачити тільки свої налаштування
CREATE POLICY "Users can view own preferences"
ON user_preferences FOR SELECT
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть створювати тільки свої налаштування
-- ВАЖЛИВО: WITH CHECK перевіряє, що user_id в новому записі = auth.uid()
CREATE POLICY "Users can insert own preferences"
ON user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть оновлювати тільки свої налаштування
-- USING - для вибору записів для оновлення
-- WITH CHECK - для перевірки нових значень
CREATE POLICY "Users can update own preferences"
ON user_preferences FOR UPDATE
USING (auth.uid() = user_id AND user_id IS NOT NULL)
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть видаляти тільки свої налаштування
CREATE POLICY "Users can delete own preferences"
ON user_preferences FOR DELETE
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- ============================================
-- 7. Перевірка політик
-- ============================================

-- Виконайте цей запит, щоб перевірити, що політики створені:
-- SELECT policyname, cmd, roles 
-- FROM pg_policies 
-- WHERE tablename = 'user_preferences';

-- ============================================
-- Пояснення:
-- ============================================
-- 
-- 1. RLS автоматично фільтрує дані по auth.uid() (ID поточного користувача)
-- 2. Коли користувач робить запит, Supabase автоматично додає WHERE user_id = auth.uid()
-- 3. Користувач НЕ може побачити, змінити або видалити дані інших користувачів
-- 4. BACKEND має використовувати SERVICE_ROLE_KEY для обходу RLS (якщо потрібно)
-- 5. FRONTEND використовує ANON_KEY і повинен передавати JWT токен в Authorization header
-- 
-- ВАЖЛИВО для BACKEND:
-- - Якщо бекенд використовує SERVICE_ROLE_KEY, RLS обходиться автоматично
-- - Якщо бекенд використовує ANON_KEY, потрібно передавати JWT токен користувача
-- - Перевірте, що в backend/.env встановлено SUPABASE_SERVICE_ROLE_KEY, а не ANON_KEY


