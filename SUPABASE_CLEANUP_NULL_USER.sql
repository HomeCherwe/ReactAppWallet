-- ============================================
-- Очищення записів з user_id = NULL
-- ============================================
-- Цей скрипт допомагає видалити або призначити старі записи без user_id
-- 
-- ⚠️ ВАЖЛИВО: Виконайте ПІСЛЯ налаштування RLS (SUPABASE_RLS_SETUP.sql)
-- ⚠️ Зробите БЕЗПЕЧНУ копію бази даних перед виконанням DELETE!

-- ============================================
-- ВАРІАНТ 1: Видалити всі записи з user_id = NULL
-- ============================================
-- (Рекомендується, якщо старі дані не потрібні або тестові)

-- Спочатку перевірте, скільки записів буде видалено:
SELECT COUNT(*) as null_transactions_count FROM transactions WHERE user_id IS NULL;
SELECT COUNT(*) as null_cards_count FROM cards WHERE user_id IS NULL;

-- Якщо все ОК, розкоментуйте ці рядки:
-- DELETE FROM transactions WHERE user_id IS NULL;
-- DELETE FROM cards WHERE user_id IS NULL;

-- ============================================
-- ВАРІАНТ 2: Призначити всі null записи поточному користувачу
-- ============================================
-- (Використовуйте, якщо хочете зберегти старі дані)

-- Якщо ви знаєте свій user_id, використайте файл SUPABASE_ASSIGN_USER_ID.sql
-- або розкоментуйте рядки нижче і замініть 'YOUR_USER_ID_HERE':

-- UPDATE transactions SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE cards SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;

-- ============================================
-- Перевірка після очищення
-- ============================================
-- Перевірте, що більше немає записів з NULL:
SELECT COUNT(*) as null_transactions FROM transactions WHERE user_id IS NULL;
SELECT COUNT(*) as null_cards FROM cards WHERE user_id IS NULL;

