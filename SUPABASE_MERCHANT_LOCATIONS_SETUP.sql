-- Створення таблиці для кешування геокодованих адрес мерчантів
CREATE TABLE IF NOT EXISTS merchant_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  address TEXT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  place_id VARCHAR(255),
  source VARCHAR(50) DEFAULT 'geocoded', -- 'monobank', 'receipt', 'manual', 'geocoded'
  confidence DECIMAL(3, 2) DEFAULT 0.5, -- впевненість (0-1)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, normalized_name)
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_merchant_locations_user_name ON merchant_locations(user_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_merchant_locations_coords ON merchant_locations(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_locations_user_id ON merchant_locations(user_id);

-- RLS політики
ALTER TABLE merchant_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own merchant locations" ON merchant_locations;
DROP POLICY IF EXISTS "Users can insert own merchant locations" ON merchant_locations;
DROP POLICY IF EXISTS "Users can update own merchant locations" ON merchant_locations;
DROP POLICY IF EXISTS "Users can delete own merchant locations" ON merchant_locations;

CREATE POLICY "Users can view own merchant locations"
ON merchant_locations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own merchant locations"
ON merchant_locations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own merchant locations"
ON merchant_locations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own merchant locations"
ON merchant_locations FOR DELETE
USING (auth.uid() = user_id);

-- Додавання полів для зберігання координат мерчанта в транзакціях
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS merchant_address TEXT,
ADD COLUMN IF NOT EXISTS merchant_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS merchant_lng DECIMAL(11, 8);

-- Індекси для швидкого пошуку транзакцій за координатами
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_coords ON transactions(merchant_lat, merchant_lng) WHERE merchant_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_name ON transactions(merchant_name) WHERE merchant_name IS NOT NULL;

-- Функція для автоматичного оновлення updated_at
CREATE OR REPLACE FUNCTION update_merchant_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Тригер для автоматичного оновлення updated_at
DROP TRIGGER IF EXISTS trigger_update_merchant_locations_updated_at ON merchant_locations;
CREATE TRIGGER trigger_update_merchant_locations_updated_at
  BEFORE UPDATE ON merchant_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_merchant_locations_updated_at();

