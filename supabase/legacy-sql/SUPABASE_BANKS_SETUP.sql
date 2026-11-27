-- ============================================
-- Створення таблиці для банків
-- ============================================

-- Створюємо таблицю banks
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, -- Назва банку
  iban VARCHAR(34), -- IBAN рахунку
  bic VARCHAR(11), -- BIC/SWIFT код
  beneficiary VARCHAR(255), -- Бенефіціар
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Індекси
CREATE INDEX IF NOT EXISTS idx_banks_user_id ON banks(user_id);

-- RLS
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own banks" ON banks;
DROP POLICY IF EXISTS "Users can insert own banks" ON banks;
DROP POLICY IF EXISTS "Users can update own banks" ON banks;
DROP POLICY IF EXISTS "Users can delete own banks" ON banks;

CREATE POLICY "Users can view own banks"
ON banks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own banks"
ON banks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own banks"
ON banks FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own banks"
ON banks FOR DELETE
USING (auth.uid() = user_id);

-- Додаємо bank_id до таблиці cards (якщо ще немає)
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES banks(id) ON DELETE SET NULL;

-- Індекс для bank_id
CREATE INDEX IF NOT EXISTS idx_cards_bank_id ON cards(bank_id);

-- Функція для автоматичного оновлення updated_at
CREATE OR REPLACE FUNCTION update_banks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Тригер для автоматичного оновлення updated_at
DROP TRIGGER IF EXISTS trigger_update_banks_updated_at ON banks;
CREATE TRIGGER trigger_update_banks_updated_at
  BEFORE UPDATE ON banks
  FOR EACH ROW
  EXECUTE FUNCTION update_banks_updated_at();

