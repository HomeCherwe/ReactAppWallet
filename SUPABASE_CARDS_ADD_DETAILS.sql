-- ============================================
-- Додавання полів для реквізитів карток
-- ============================================

-- Додаємо поля IBAN, expiry_date (термін дії), cvv, BIC, beneficiary
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS iban VARCHAR(34),
ADD COLUMN IF NOT EXISTS expiry_date VARCHAR(7), -- Формат: MM/YYYY
ADD COLUMN IF NOT EXISTS cvv VARCHAR(4), -- CVV код (3-4 цифри)
ADD COLUMN IF NOT EXISTS bic VARCHAR(11), -- BIC/SWIFT код (до 11 символів)
ADD COLUMN IF NOT EXISTS beneficiary VARCHAR(255); -- Бенефіціар (ім'я отримувача)

-- Коментарі для полів
COMMENT ON COLUMN cards.iban IS 'IBAN рахунку (до 34 символів)';
COMMENT ON COLUMN cards.expiry_date IS 'Термін дії картки (формат: MM/YYYY)';
COMMENT ON COLUMN cards.cvv IS 'CVV код картки (3-4 цифри)';
COMMENT ON COLUMN cards.bic IS 'BIC/SWIFT код банку (до 11 символів)';
COMMENT ON COLUMN cards.beneficiary IS 'Бенефіціар (ім\'я отримувача)';

