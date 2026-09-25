import React, { useState } from 'react'
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
import { SUPPORTED_CURRENCIES } from '../utils/settings'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

const BANKS = [
  { id: 'monobank', name: 'Monobank', icon: '🖤' },
  { id: 'privatbank', name: 'ПриватБанк', icon: '🟢' },
  { id: 'binance', name: 'Binance', icon: '🟡' },
  { id: 'revolut', name: 'Revolut', icon: '🔵' },
  { id: 'cash', name: 'Готівка', icon: '💵' },
  { id: 'other', name: 'Інший банк', icon: '🏦' },
]

interface AddCardModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  defaultCurrency?: string
}

export default function AddCardModal({
  visible,
  onClose,
  onSuccess,
  defaultCurrency = 'UAH',
}: AddCardModalProps) {
  const [name, setName] = useState('')
  const [selectedBank, setSelectedBank] = useState(BANKS[0].id)
  const [currency, setCurrency] = useState(defaultCurrency)
  const [initialBalance, setInitialBalance] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMsg('Вкажіть назву картки або рахунку')
      return
    }

    setErrorMsg('')
    setLoading(true)

    try {
      const balanceNum = parseFloat(initialBalance.replace(',', '.')) || 0

      await createCard({
        name: name.trim(),
        currency: currency,
        initial_balance: balanceNum,
        card_number: cardNumber.trim() || undefined,
      })

      setName('')
      setInitialBalance('')
      setCardNumber('')
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
            <Text style={styles.title}>Нова картка / рахунок</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Bank Picker */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Оберіть банк або тип</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
                {BANKS.map((b) => {
                  const isSelected = selectedBank === b.id
                  return (
                    <GlassPressable
                      key={b.id}
                      style={[styles.bankPill, isSelected && styles.bankPillActive]}
                      onPress={() => setSelectedBank(b.id)}
                    >
                      <Text style={styles.bankIcon}>{b.icon}</Text>
                      <Text style={[styles.bankName, isSelected && styles.bankNameActive]}>
                        {b.name}
                      </Text>
                    </GlassPressable>
                  )
                })}
              </ScrollView>
            </View>

            {/* 2. Card Name */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Назва картки</Text>
              <TextInput
                style={styles.input}
                placeholder="напр. Monobank Black, Зарплатна..."
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

            {/* 4. Initial Balance */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Початковий баланс</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="rgba(255, 255, 255, 0.35)"
                keyboardType="decimal-pad"
                value={initialBalance}
                onChangeText={setInitialBalance}
              />
            </View>

            {/* 5. Last 4 Digits (Optional) */}
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

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <GlassButton
              label={loading ? 'Збереження...' : 'Створити картку'}
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