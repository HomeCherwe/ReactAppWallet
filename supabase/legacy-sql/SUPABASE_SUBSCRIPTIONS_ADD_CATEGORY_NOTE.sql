-- ============================================
-- Додавання полів category та note до таблиці subscriptions
-- ============================================
-- Виконайте цей скрипт, якщо таблиця subscriptions вже існує

-- Додати колонку category (якщо не існує)
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS category VARCHAR(255);

-- Додати колонку note (якщо не існує)
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS note TEXT;

