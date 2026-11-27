-- ============================================
-- RPC Functions for Balance Calculations
-- ============================================
-- Ці функції використовуються для розрахунку балансів та тоталів
-- Всі функції фільтрують дані по user_id для безпеки

-- ============================================
-- 1. Функція sum_tx_by_card
-- ============================================
-- Повертає суму транзакцій по кожній картці для конкретного користувача
-- Виключає archived транзакції та cash транзакції (card_id = null)

DROP FUNCTION IF EXISTS public.sum_tx_by_card(UUID);

CREATE OR REPLACE FUNCTION public.sum_tx_by_card(user_id_param UUID)
RETURNS TABLE (
  card_id UUID,
  total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.card_id,
    COALESCE(SUM(t.amount), 0) as total
  FROM transactions t
  WHERE 
    t.user_id = user_id_param
    AND t.card_id IS NOT NULL
    AND (t.archives IS NULL OR t.archives = false)
  GROUP BY t.card_id;
END;
$$;

-- ============================================
-- 2. Функція totals_by_bucket
-- ============================================
-- Повертає тотали по бакетам (cash, cards, savings) з групуванням по валюті
-- Використовує initial_balance з карток та суми транзакцій

DROP FUNCTION IF EXISTS public.totals_by_bucket(UUID);

CREATE OR REPLACE FUNCTION public.totals_by_bucket(user_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  cash_totals JSONB := '{}'::JSONB;
  cards_totals JSONB := '{}'::JSONB;
  savings_totals JSONB := '{}'::JSONB;
  card_record RECORD;
  card_sum NUMERIC;
  card_total NUMERIC;
  currency_key TEXT;
  bucket TEXT;
  is_savings BOOLEAN;
  cash_sum NUMERIC;
BEGIN
  -- Обробка карток (cards та savings)
  FOR card_record IN 
    SELECT 
      c.id,
      c.currency,
      c.initial_balance,
      c.bank,
      c.name,
      COALESCE(SUM(t.amount), 0) as tx_sum
    FROM cards c
    LEFT JOIN transactions t ON t.card_id = c.id 
      AND t.user_id = user_id_param
      AND (t.archives IS NULL OR t.archives = false)
    WHERE c.user_id = user_id_param
    GROUP BY c.id, c.currency, c.initial_balance, c.bank, c.name
  LOOP
    card_sum := COALESCE(card_record.tx_sum, 0);
    card_total := COALESCE(card_record.initial_balance, 0) + card_sum;
    
    -- Пропускаємо якщо total = 0
    IF card_total = 0 THEN
      CONTINUE;
    END IF;
    
    currency_key := UPPER(COALESCE(card_record.currency, 'UAH'));
    
    -- Визначаємо bucket (cash, cards, savings)
    is_savings := LOWER(COALESCE(card_record.bank, '') || ' ' || COALESCE(card_record.name, '')) LIKE '%збер%' 
                  OR LOWER(COALESCE(card_record.bank, '') || ' ' || COALESCE(card_record.name, '')) LIKE '%savings%';
    
    IF is_savings THEN
      bucket := 'savings';
    ELSIF LOWER(COALESCE(card_record.bank, '')) LIKE '%гот%' OR LOWER(COALESCE(card_record.bank, '')) LIKE '%cash%' THEN
      bucket := 'cash';
    ELSE
      bucket := 'cards';
    END IF;
    
    -- Додаємо до відповідного bucket
    IF bucket = 'cards' THEN
      cards_totals := jsonb_set(
        cards_totals,
        ARRAY[currency_key],
        to_jsonb(COALESCE((cards_totals->>currency_key)::NUMERIC, 0) + card_total),
        true
      );
    ELSIF bucket = 'savings' THEN
      savings_totals := jsonb_set(
        savings_totals,
        ARRAY[currency_key],
        to_jsonb(COALESCE((savings_totals->>currency_key)::NUMERIC, 0) + card_total),
        true
      );
    ELSE
      -- cash bucket (картки з "готівка" в назві)
      cash_totals := jsonb_set(
        cash_totals,
        ARRAY[currency_key],
        to_jsonb(COALESCE((cash_totals->>currency_key)::NUMERIC, 0) + card_total),
        true
      );
    END IF;
  END LOOP;
  
  -- Обробка cash транзакцій (card_id = null) - додаємо до cash bucket
  SELECT COALESCE(SUM(amount), 0) INTO cash_sum
  FROM transactions
  WHERE 
    user_id = user_id_param
    AND card_id IS NULL
    AND (archives IS NULL OR archives = false);
  
  IF cash_sum != 0 THEN
    cash_totals := jsonb_set(
      cash_totals,
      ARRAY['UAH'],
      to_jsonb(COALESCE((cash_totals->>'UAH')::NUMERIC, 0) + cash_sum),
      true
    );
  END IF;
  
  -- Формуємо результат
  result := json_build_object(
    'cash', cash_totals,
    'cards', cards_totals,
    'savings', savings_totals
  );
  
  RETURN result;
END;
$$;

-- ============================================
-- 3. Надання прав на використання функцій
-- ============================================

-- Дозволити анонімним користувачам викликати функції
GRANT EXECUTE ON FUNCTION public.sum_tx_by_card(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.totals_by_bucket(UUID) TO anon, authenticated;

-- ============================================
-- Пояснення:
-- ============================================
-- 
-- 1. sum_tx_by_card:
--    - Приймає user_id_param (UUID користувача)
--    - Повертає таблицю з card_id та сумою транзакцій (total)
--    - Виключає archived транзакції та cash транзакції
--    - Групує по card_id
--
-- 2. totals_by_bucket:
--    - Приймає user_id_param (UUID користувача)
--    - Повертає JSON об'єкт з структурою:
--      {
--        "cash": { "UAH": 0 },
--        "cards": { "UAH": 0, "USD": 0 },
--        "savings": { "UAH": 0 }
--      }
--    - Враховує initial_balance з карток
--    - Визначає bucket (cash/cards/savings) на основі назви банку/картки
--
-- 3. SECURITY DEFINER:
--    - Функції виконуються з правами створювача (не користувача)
--    - Це дозволяє обходити RLS для розрахунків
--    - Але все одно фільтруються по user_id_param для безпеки
--
-- ============================================
-- Використання:
-- ============================================
-- 
-- SELECT * FROM sum_tx_by_card('user-uuid-here');
-- SELECT totals_by_bucket('user-uuid-here');

