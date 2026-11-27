-- ============================================================
-- Виправлення: видалення глобального unique constraint на картки
-- Проблема: uq_cards_bank_name заважає різним користувачам
--           мати картки з однаковою назвою (наприклад "Основна")
-- ============================================================

-- 1. Видаляємо старий constraint (якщо існує)
ALTER TABLE cards DROP CONSTRAINT IF EXISTS uq_cards_bank_name;

-- 2. Видаляємо також можливі варіанти назви constraint
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_bank_name_key;
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_name_bank_unique;

-- 3. Якщо потрібна унікальність — тільки в межах одного користувача
--    (опційно, розкоментуйте якщо потрібно):
-- ALTER TABLE cards
--   ADD CONSTRAINT uq_cards_user_bank_name
--   UNIQUE (user_id, bank, name);

-- Перевірка: переглянути всі constraint на таблиці cards
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'cards'::regclass;
