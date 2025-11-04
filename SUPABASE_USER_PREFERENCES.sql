-- ============================================
-- Створення таблиці для збереження налаштувань користувача
-- ============================================
-- Зберігає всі параметри фільтрації та налаштувань для кожного користувача

-- ============================================
-- 1. Створення таблиці user_preferences
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- JSON поле з усіма налаштуваннями
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Забезпечимо унікальність по user_id
  UNIQUE(user_id)
);

-- ============================================
-- 2. Створення індексів для швидкого пошуку
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- ============================================
-- 3. Увімкнення Row Level Security
-- ============================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Політики безпеки
-- ============================================

-- Видалити старі політики (якщо є)
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;

-- Користувачі можуть бачити тільки свої налаштування
CREATE POLICY "Users can view own preferences"
ON user_preferences FOR SELECT
USING (auth.uid() = user_id);

-- Користувачі можуть створювати тільки свої налаштування
CREATE POLICY "Users can insert own preferences"
ON user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Користувачі можуть оновлювати тільки свої налаштування
CREATE POLICY "Users can update own preferences"
ON user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Користувачі можуть видаляти тільки свої налаштування
CREATE POLICY "Users can delete own preferences"
ON user_preferences FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 5. Приклад структури JSON preferences
-- ============================================
-- 
-- {
--   "chart": {
--     "currency": "UAH",
--     "mode": "earning",
--     "from": "2024-01-01",
--     "appliedFrom": "2024-01-01"
--     -- to та appliedTo не зберігаються, завжди сьогоднішня дата
--   },
--   "cards": {
--     "selectedBanks": ["MonoBank", "PrivatBank"],
--     "order": "balance"
--   },
--   "totals": {
--     "section": 0,
--     "isVisible": true
--   },
--   "other": {
--     "language": "uk",
--     "theme": "light"
--   }
-- }
--
-- ============================================
-- Пояснення:
-- ============================================
-- 
-- 1. Всі налаштування користувача зберігаються в одному JSON полі
-- 2. RLS автоматично забезпечує безпеку даних
-- 3. Кожен користувач має власні унікальні налаштування
-- 4. Можна легко додавати нові параметри без зміни схеми БД
-- 5. Автоматичне оновлення updated_at через триггер
--
-- ============================================

