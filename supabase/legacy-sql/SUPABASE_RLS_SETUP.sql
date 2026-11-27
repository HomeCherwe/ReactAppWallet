-- ============================================
-- Налаштування Row Level Security (RLS)
-- ============================================
-- Це забезпечує, що кожен користувач бачить тільки свої дані
-- Навіть якщо всі транзакції в одній таблиці, вони автоматично фільтруються

-- ============================================
-- 1. Перевірка та додавання user_id колонок
-- ============================================

-- Для transactions (якщо колонки немає)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Для cards (якщо колонки немає)
ALTER TABLE cards 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Створення індексів для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);

-- ============================================
-- 2. Увімкнення Row Level Security
-- ============================================

-- Увімкнути RLS для transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Увімкнути RLS для cards
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. Політики для таблиці transactions
-- ============================================

-- Видалити старі політики (якщо є)
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

-- Користувачі можуть бачити тільки свої транзакції (не null!)
CREATE POLICY "Users can view own transactions"
ON transactions FOR SELECT
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть створювати тільки свої транзакції
CREATE POLICY "Users can insert own transactions"
ON transactions FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть оновлювати тільки свої транзакції
CREATE POLICY "Users can update own transactions"
ON transactions FOR UPDATE
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть видаляти тільки свої транзакції
CREATE POLICY "Users can delete own transactions"
ON transactions FOR DELETE
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- ============================================
-- 4. Політики для таблиці cards
-- ============================================

-- Видалити старі політики (якщо є)
DROP POLICY IF EXISTS "Users can view own cards" ON cards;
DROP POLICY IF EXISTS "Users can insert own cards" ON cards;
DROP POLICY IF EXISTS "Users can update own cards" ON cards;
DROP POLICY IF EXISTS "Users can delete own cards" ON cards;

-- Користувачі можуть бачити тільки свої картки (не null!)
CREATE POLICY "Users can view own cards"
ON cards FOR SELECT
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть створювати тільки свої картки
CREATE POLICY "Users can insert own cards"
ON cards FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть оновлювати тільки свої картки
CREATE POLICY "Users can update own cards"
ON cards FOR UPDATE
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- Користувачі можуть видаляти тільки свої картки
CREATE POLICY "Users can delete own cards"
ON cards FOR DELETE
USING (auth.uid() = user_id AND user_id IS NOT NULL);

-- ============================================
-- Пояснення:
-- ============================================
-- 
-- 1. Всі транзакції та карти зберігаються в одних таблицях
-- 2. RLS автоматично фільтрує дані по auth.uid() (ID поточного користувача)
-- 3. Коли користувач робить запит, Supabase автоматично додає WHERE user_id = auth.uid()
-- 4. Користувач НЕ може побачити, змінити або видалити дані інших користувачів
-- 5. Це стандартний та безпечний підхід для multi-tenant додатків
--
-- ============================================
-- Перевірка:
-- ============================================
-- Після виконання цього скрипта:
-- 1. Увійдіть під різними Google аккаунтами
-- 2. Створіть транзакції під кожним аккаунтом
-- 3. Переконайтесь, що кожен користувач бачить тільки свої дані

