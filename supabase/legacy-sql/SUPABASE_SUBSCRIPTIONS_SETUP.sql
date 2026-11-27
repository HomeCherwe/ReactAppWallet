-- ============================================
-- Створення таблиці для підписок (subscriptions)
-- ============================================
-- Зберігає періодичні підписки для автоматичного додавання транзакцій

-- ============================================
-- 1. Створення таблиці subscriptions
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Основна інформація
  name VARCHAR(255) NOT NULL, -- Назва підписки (напр. "Netflix", "Spotify")
  amount DECIMAL(15, 2) NOT NULL, -- Сума (завжди позитивна, знак визначається типом)
  currency VARCHAR(10) NOT NULL DEFAULT 'UAH', -- Валюта
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL, -- Карта (null = готівка)
  
  -- Тип та частота
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly')), -- Тиждень або місяць
  day_of_week INTEGER CHECK (day_of_week >= 1 AND day_of_week <= 7), -- Для тижневих: 1=понеділок, 7=неділя
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31), -- Для місячних: 1-31
  
  -- Статус
  is_active BOOLEAN NOT NULL DEFAULT true, -- Активна чи ні
  is_expense BOOLEAN NOT NULL DEFAULT true, -- Витрата (true) або дохід (false)
  
  -- Категорія та опис для автоматичних транзакцій
  category VARCHAR(255), -- Категорія транзакції
  note TEXT, -- Опис/примітка для транзакції
  
  -- Відстеження виконання
  last_executed_at TIMESTAMP WITH TIME ZONE, -- Коли останній раз виконана
  next_execution_at TIMESTAMP WITH TIME ZONE, -- Коли наступний раз виконати
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. Створення індексів
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_execution ON subscriptions(next_execution_at) WHERE is_active = true;

-- ============================================
-- 3. Увімкнення Row Level Security
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Політики безпеки
-- ============================================

-- Видалити старі політики (якщо є)
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON subscriptions;

-- Політика: Користувачі можуть переглядати тільки свої підписки
CREATE POLICY "Users can view own subscriptions"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- Політика: Користувачі можуть створювати тільки свої підписки
CREATE POLICY "Users can insert own subscriptions"
ON subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Політика: Користувачі можуть оновлювати тільки свої підписки
CREATE POLICY "Users can update own subscriptions"
ON subscriptions FOR UPDATE
USING (auth.uid() = user_id);

-- Політика: Користувачі можуть видаляти тільки свої підписки
CREATE POLICY "Users can delete own subscriptions"
ON subscriptions FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 5. Функція для автоматичного оновлення updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Тригер для автоматичного оновлення updated_at
DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trigger_update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- ============================================
-- 6. Функція для обчислення next_execution_at
-- ============================================

CREATE OR REPLACE FUNCTION calculate_next_execution(
  p_frequency VARCHAR,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_last_executed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  v_next_date DATE;
  v_current_date DATE := CURRENT_DATE;
BEGIN
  IF p_frequency = 'weekly' THEN
    -- Для тижневих: наступний день тижня
    IF p_last_executed_at IS NOT NULL THEN
      v_current_date := DATE(p_last_executed_at) + INTERVAL '1 week';
    ELSE
      -- Якщо ще не виконувалась, обчислюємо наступний день тижня від сьогодні
      v_current_date := CURRENT_DATE;
    END IF;
    
    -- Знаходимо наступний день тижня
    WHILE EXTRACT(DOW FROM v_current_date) != (p_day_of_week - 1) LOOP
      v_current_date := v_current_date + INTERVAL '1 day';
    END LOOP;
    
    v_next_date := v_current_date;
    
  ELSIF p_frequency = 'monthly' THEN
    -- Для місячних: наступний день місяця
    IF p_last_executed_at IS NOT NULL THEN
      v_current_date := DATE(p_last_executed_at) + INTERVAL '1 month';
    ELSE
      v_current_date := CURRENT_DATE;
    END IF;
    
    -- Встановлюємо день місяця
    -- Якщо день більше ніж днів у місяці, встановлюємо останній день місяця
    IF p_day_of_month > EXTRACT(DAY FROM (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')) THEN
      v_next_date := DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day';
    ELSE
      v_next_date := DATE_TRUNC('month', v_current_date) + (p_day_of_month - 1) * INTERVAL '1 day';
    END IF;
    
    -- Якщо дата в минулому, беремо наступний місяць
    IF v_next_date < CURRENT_DATE THEN
      v_next_date := DATE_TRUNC('month', v_next_date) + INTERVAL '1 month';
      IF p_day_of_month > EXTRACT(DAY FROM (DATE_TRUNC('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day')) THEN
        v_next_date := DATE_TRUNC('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day';
      ELSE
        v_next_date := DATE_TRUNC('month', v_next_date) + (p_day_of_month - 1) * INTERVAL '1 day';
      END IF;
    END IF;
  END IF;
  
  RETURN v_next_date::TIMESTAMP WITH TIME ZONE;
END;
$$ LANGUAGE plpgsql;

