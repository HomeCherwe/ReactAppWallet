-- ============================================
-- Призначення user_id до всіх записів з NULL
-- ============================================
-- Цей скрипт призначає user_id = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b'
-- до всіх транзакцій та карток, де user_id IS NULL

-- ============================================
-- 1. Перевірка перед оновленням
-- ============================================
-- Спочатку подивіться, скільки записів буде оновлено:

SELECT 
  COUNT(*) as null_transactions_count 
FROM transactions 
WHERE user_id IS NULL;

SELECT 
  COUNT(*) as null_cards_count 
FROM cards 
WHERE user_id IS NULL;

-- ============================================
-- 2. Оновлення транзакцій
-- ============================================

UPDATE transactions 
SET user_id = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b' 
WHERE user_id IS NULL;

-- ============================================
-- 3. Оновлення карток
-- ============================================

UPDATE cards 
SET user_id = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b' 
WHERE user_id IS NULL;

-- ============================================
-- 4. Перевірка після оновлення
-- ============================================
-- Перевірте, що всі записи тепер мають user_id:

SELECT 
  COUNT(*) as remaining_null_transactions 
FROM transactions 
WHERE user_id IS NULL;

SELECT 
  COUNT(*) as remaining_null_cards 
FROM cards 
WHERE user_id IS NULL;

-- Обидва запити мають повернути 0

-- ============================================
-- 5. Підтвердження оновлених записів
-- ============================================
-- Перевірте, що записи оновились правильно:

SELECT 
  COUNT(*) as updated_transactions_count 
FROM transactions 
WHERE user_id = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b';

SELECT 
  COUNT(*) as updated_cards_count 
FROM cards 
WHERE user_id = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b';

