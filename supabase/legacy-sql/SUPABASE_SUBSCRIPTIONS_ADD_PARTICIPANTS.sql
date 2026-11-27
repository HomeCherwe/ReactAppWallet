-- ============================================
-- Додавання полів для спільних підписок
-- ============================================
-- Дозволяє вказувати скільки людей скидається на підписку та їх імена

-- Додати колонку total_participants (загальна кількість учасників)
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS total_participants INTEGER DEFAULT 1;

-- Додати колонку participants (масив імен учасників)
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]'::jsonb;

