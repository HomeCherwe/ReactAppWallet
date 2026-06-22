-- ====================================================================
-- МІГРАЦІЯ: Виправлення exclude_from_stats для трансферів
-- ====================================================================
-- Проблема: Старі транзакції-трансфери мали exclude_from_stats = false
-- (не виставлено), через що повзунок в EditTxModal показував
-- "враховувати в статистику" = увімкнено, хоча насправді статистика
-- виключала їх через хардкод is_transfer.
--
-- Рішення: Оновлюємо ВСІ транзакції де is_transfer = true,
-- встановлюючи exclude_from_stats = true.
--
-- Запускати: Supabase Dashboard → SQL Editor → вставити і виконати.
-- ====================================================================

-- Крок 1: Перевірка — скільки трансферів зараз мають exclude_from_stats = false або null
SELECT
  COUNT(*) AS total_transfers,
  COUNT(*) FILTER (WHERE exclude_from_stats = false OR exclude_from_stats IS NULL) AS to_fix,
  COUNT(*) FILTER (WHERE exclude_from_stats = true) AS already_fixed
FROM transactions
WHERE is_transfer = true;

-- Крок 2: Оновлення — виставляємо exclude_from_stats = true для всіх трансферів
UPDATE transactions
SET exclude_from_stats = true
WHERE is_transfer = true
  AND (exclude_from_stats = false OR exclude_from_stats IS NULL);

-- Крок 3: Перевірка результату — всі трансфери мають бути виправлені
SELECT
  COUNT(*) AS total_transfers,
  COUNT(*) FILTER (WHERE exclude_from_stats = true) AS correctly_excluded,
  COUNT(*) FILTER (WHERE exclude_from_stats = false OR exclude_from_stats IS NULL) AS still_not_excluded
FROM transactions
WHERE is_transfer = true;

-- Очікуваний результат:
-- total_transfers = correctly_excluded
-- still_not_excluded = 0
