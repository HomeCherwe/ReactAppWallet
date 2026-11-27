-- ============================================
-- Додавання поля apis в user_preferences
-- ============================================
-- Це поле зберігає API ключі для Binance та Monobank

-- ВАРІАНТ 1: Окреме поле apis (рекомендовано якщо потрібно окреме поле)
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS apis JSONB DEFAULT '{}'::JSONB;

-- Створюємо індекс для швидкого пошуку по окремому полю apis
CREATE INDEX IF NOT EXISTS idx_user_preferences_apis ON user_preferences USING GIN (apis);

-- ВАРІАНТ 2: Якщо хочете зберігати в preferences->apis (замість окремого поля)
-- Закоментовано, бо використовується ВАРІАНТ 1
-- CREATE INDEX IF NOT EXISTS idx_user_preferences_apis_in_prefs ON user_preferences USING GIN ((preferences->'apis'));

-- ============================================
-- Структура поля apis:
-- ============================================
-- {
--   "binance": {
--     "api_key": "...",
--     "api_secret": "..."
--   },
--   "monobank": {
--     "token": "...",
--     "black_card_id": "...",
--     "white_card_id": "..."
--   }
-- }
--
-- Примітки:
-- - Ключі зберігаються в зашифрованому вигляді (якщо потрібно, додайте шифрування)
-- - Для безпеки можна використовувати Supabase Vault або інші методи шифрування
-- - Це поле є частиною preferences JSON структури

