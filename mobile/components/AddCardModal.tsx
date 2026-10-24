import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { createCard } from '../api/cards'
import { Bank, createBank, listBanks } from '../api/banks'
import { SUPPORTED_CURRENCIES } from '../utils/settings'
import { AccountKind, parseGoal } from '../utils/accountKind'
import GlassButton from './GlassButton'
import KindPicker from './KindPicker'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

// Cash lives in a bank named "Готівка"
const CASH_BANK_NAME = 'Готівка'
const NEW_BANK = '__new__'

interface AddCardModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  defaultCurrency?: string
  /** 'savings' = «Нова скарбничка» (the + menu's goal, Home's piggy banks) */
  initialKind?: AccountKind
}

/**
 * "Власний рахунок" (the web's OwnAccountModal): a card, a piggy bank with an optional goal, cash or
 * investments, kept up to date by hand.
 */
export default function AddCardModal({
  visible,
  onClose,
  onSuccess,
  defaultCurrency = 'UAH',
  initialKind = 'card',
}: AddCardModalProps) {
  const [kind, setKind] = useState<AccountKind>(initialKind)
  const [goal, setGoal] = useState('')
  const [name, setName] = useState('')
  // The user's own banks; pick one, "Готівка", or create a new one
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [selectedBank, setSelectedBank] = useState<string>(NEW_BANK)
  const [newBankName, setNewBankName] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [initialBalance, setInitialBalance] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!visible) return
    setErrorMsg('')
    setKind(initialKind)
    setGoal('')
    listBanks().then(list => {
      const own = list.filter(b => b.name !== CASH_BANK_NAME)
      setBanks(own)
      setSelectedBank(own[0]?.id ?? NEW_BANK)
    })
  }, [visible, initialKind])

  // Bank id for the new account: the cash bank for cash, an existing one, or a bank created now
  const resolveBankId = async (): Promise<string> => {
    if (kind === 'cash') {
      const all = await listBanks()
      const cash = all.find(b => b.name === CASH_BANK_NAME)
      return cash ? cash.id : (await createBank(CASH_BANK_NAME)).id
    }
    if (selectedBank === NEW_BANK) return (await createBank(newBankName)).id
    return selectedBank
  }

  const handleSave = async () => {
    if (kind !== 'cash' && selectedBank === NEW_BANK && !newBankName.trim()) {
      setErrorMsg('Вкажіть назву банку')
      return
    }
    if (!name.trim()) {
      setErrorMsg(kind === 'savings' ? 'Вкажіть назву скарбнички' : 'Вкажіть назву картки або рахунку')
      return
    }

    setErrorMsg('')
    setLoading(true)

    try {
      const balanceNum = parseFloat(initialBalance.replace(',', '.')) || 0

      const bankId = await resolveBankId()
      await createCard({
        bank_id: bankId,
        name: name.trim(),
        currency: currency,
        initial_balance: balanceNum,
        card_number: (kind === 'card' && cardNumber.trim()) || undefined,
        kind,
        goal_amount: kind === 'savings' ? parseGoal(goal) ?? undefined : undefined,
      })

      setName('')
      setNewBankName('')
      setInitialBalance('')
      setCardNumber('')
      setGoal('')
      setLoading(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Помилка при створенні картки')
      setLoading(false)
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{kind === 'savings' ? 'Нова скарбничка' : 'Власний рахунок'}</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. What the account is for */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Тип рахунку</Text>
              <KindPicker value={kind} onChange={setKind} />
            </View>

            {/* 2. Bank: one of yours or a new one (cash goes to «Готівка» by itself) */}
            {kind !== 'cash' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{kind === 'savings' ? 'Де лежать гроші' : 'Банк'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
                {(banks ?? []).map(b => {
                  const isSelected = selectedBank === b.id
                  return (
                    <GlassPressable
                      key={b.id}
                      style={[styles.bankPill, isSelected && styles.bankPillActive]}
                      onPress={() => setSelectedBank(b.id)}
                    >
                      <Text style={styles.bankIcon}>🏦</Text>
                      <Text style={[styles.bankName, isSelected && styles.bankNameActive]}>{b.name}</Text>
                    </GlassPressable>
                  )
                })}
                <GlassPressable
                  style={[styles.bankPill, styles.newBankPill, selectedBank === NEW_BANK && styles.bankPillActive]}
                  onPress={() => setSelectedBank(NEW_BANK)}
                >
                  <Text style={[styles.bankName, styles.newBankText]}>＋ Новий банк</Text>
                </GlassPressable>
              </ScrollView>

              {selectedBank === NEW_BANK && (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder={kind === 'savings' ? 'Банк або «Вдома», напр. Revolut' : 'Назва банку, напр. ПриватБанк'}
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={newBankName}
                  onChangeText={setNewBankName}
                />
              )}
            </View>
            )}

            {/* 3. Name */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {kind === 'savings' ? 'Назва скарбнички' : kind === 'cash' ? 'Назва' : 'Назва картки'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={
                  kind === 'savings' ? 'напр. Подушка безпеки, На відпустку…'
                    : kind === 'cash' ? 'напр. Гаманець, Готівка EUR…'
                    : kind === 'investment' ? 'напр. Binance, Акції…'
                    : 'напр. Monobank Black, Зарплатна...'
                }
                placeholderTextColor="rgba(255, 255, 255, 0.35)"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* 3. Currency Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Валюта</Text>
              <View style={styles.curGrid}>
                {SUPPORTED_CURRENCIES.map((c) => {
                  const isSelected = currency === c.code
                  return (
                    <GlassPressable
                      key={c.code}
                      style={[styles.curChip, isSelected && styles.curChipActive]}
                      onPress={() => setCurrency(c.code)}
                    >
                      <Text style={styles.curFlag}>{c.flag}</Text>
                      <Text style={[styles.curCode, isSelected && styles.curCodeActive]}>
                        {c.code}
                      </Text>
                    </GlassPressable>
                  )
                })}
              </View>
            </View>

            {/* 5. A piggy bank's goal */}
            {kind === 'savings' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Ціль (не обов'язково)</Text>
                <TextInput
                  style={styles.input}
                  placeholder={`Скільки хочете зібрати, ${currency}`}
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  keyboardType="decimal-pad"
                  value={goal}
                  onChangeText={setGoal}
                />
              </View>
            )}

            {/* 6. Initial Balance */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{kind === 'savings' ? 'Вже відкладено' : 'Початковий баланс'}</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="rgba(255, 255, 255, 0.35)"
                keyboardType="decimal-pad"
                value={initialBalance}
                onChangeText={setInitialBalance}
              />
            </View>

            {/* 7. Last 4 Digits (Optional, cards only) */}
            {kind === 'card' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Останні 4 цифри (не обов'язково)</Text>
              <TextInput
                style={styles.input}
                placeholder="1234"
                placeholderTextColor="rgba(255, 255, 255, 0.35)"
                keyboardType="number-pad"
                maxLength={4}
                value={cardNumber}
                onChangeText={setCardNumber}
              />
            </View>
            )}

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <GlassButton
              label={loading ? 'Збереження...' : kind === 'savings' ? 'Створити скарбничку' : 'Створити рахунок'}
              variant="primary"
              size="lg"
              loading={loading}
              style={styles.saveBtn}
              onPress={handleSave}
            />

            <View style={{ height: 40 }} />
          </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.92)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '88%',
  },
  sheetBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white80,
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bankScroll: {
    flexDirection: 'row',
  },
  bankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    marginRight: 8,
    gap: 6,
  },
  bankPillActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
    borderColor: 'rgba(255, 107, 0, 0.55)',
  },
  bankIcon: {
    fontSize: 16,
  },
  bankName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  newBankPill: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 107, 0, 0.5)',
  },
  newBankText: {
    color: Colors.orange,
    fontWeight: '700',
  },
  bankNameActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  curGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  curChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  curChipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
    borderColor: 'rgba(255, 107, 0, 0.50)',
  },
  curFlag: {
    fontSize: 14,
  },
  curCode: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  curCodeActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.red,
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 10,
    width: '100%',
  },
})