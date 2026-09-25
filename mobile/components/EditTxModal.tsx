import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ScrollView, Platform, KeyboardAvoidingView
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { Transaction, updateTransaction, getTransactionCategories } from '../api/transactions'
import { Card } from '../api/cards'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import { hasPinTag, stripPinTag, withPinTag } from '../utils/pinned'

interface EditTxModalProps {
  visible: boolean
  tx: Transaction | null
  cards: Card[]
  onClose: () => void
  onSaved: () => void
}

export default function EditTxModal({
  visible,
  tx,
  cards,
  onClose,
  onSaved,
}: EditTxModalProps) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [cardId, setCardId] = useState('')
  const [note, setNote] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (tx) {
      const amt = Number(tx.amount || 0)
      setKind(amt < 0 ? 'expense' : 'income')
      setAmount(String(Math.abs(amt)))
      setCategory(tx.category || '')
      setCardId(tx.card_id || '')
      setNote(stripPinTag(tx.note))
    }
  }, [tx])

  useEffect(() => {
    getTransactionCategories().then(cats => {
      if (cats && cats.length > 0) setCategories(cats)
    })
  }, [])

  if (!tx) return null

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (!parsed || isNaN(parsed) || parsed <= 0) {
      setErrorMsg('Вкажіть коректну суму')
      return
    }

    setSaving(true)
    setErrorMsg('')

    try {
      const finalAmount = kind === 'expense' ? -Math.abs(parsed) : Math.abs(parsed)
      await updateTransaction(tx.id, {
        amount: finalAmount,
        category: category.trim() || 'Інше',
        card_id: cardId || null,
        // Keep the pin set elsewhere (the tag isn't shown in the editor)
        note: withPinTag(note.trim() || category.trim(), hasPinTag(tx.note)) ?? undefined,
      })
      setSaving(false)
      onSaved()
      onClose()
    } catch (e: any) {
      setSaving(false)
      setErrorMsg(e.message || 'Помилка при збереженні')
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Редагувати транзакцію</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Kind Switcher */}
            <View style={styles.typeSwitcher}>
              <GlassPressable
                style={[styles.typeBtn, kind === 'expense' && styles.typeBtnExpenseActive]}
                onPress={() => setKind('expense')}
              >
                <Text style={[styles.typeText, kind === 'expense' && styles.typeTextActive]}>
                  📉 Витрата
                </Text>
              </GlassPressable>
              <GlassPressable
                style={[styles.typeBtn, kind === 'income' && styles.typeBtnIncomeActive]}
                onPress={() => setKind('income')}
              >
                <Text style={[styles.typeText, kind === 'income' && styles.typeTextActive]}>
                  📈 Дохід
                </Text>
              </GlassPressable>
            </View>

            {/* Amount */}
            <View style={styles.amountWrap}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {/* Account/Card */}
            {cards.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Рахунок</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                  {cards.map(c => {
                    const isSel = cardId === c.id
                    return (
                      <GlassPressable
                        key={c.id}
                        style={[styles.cardPill, isSel && styles.cardPillActive]}
                        onPress={() => setCardId(c.id)}
                      >
                        <Text style={styles.cardPillBank}>{c.bank || 'КАРТКА'}</Text>
                        <Text style={[styles.cardPillName, isSel && styles.cardPillNameActive]}>
                          {c.name}
                        </Text>
                      </GlassPressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {/* Category selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Категорія</Text>
              <TextInput
                style={styles.input}
                value={category}
                onChangeText={setCategory}
                placeholder="Введіть або оберіть категорію..."
                placeholderTextColor={Colors.textMuted}
              />
              <View style={styles.catGrid}>
                {categories.map(cat => (
                  <GlassPressable
                    key={cat}
                    style={[styles.catChip, category === cat && styles.catChipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catText, category === cat && styles.catTextActive]}>
                      {cat}
                    </Text>
                  </GlassPressable>
                ))}
              </View>
            </View>

            {/* Note */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Примітка</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="Опис або примітка..."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Save */}
            <GlassButton
              label={saving ? 'Збереження...' : 'Зберегти зміни'}
              variant="primary"
              size="lg"
              loading={saving}
              style={{ marginTop: 10 }}
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.94)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '90%',
  },
  sheetBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
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
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  typeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.pill,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  typeBtnExpenseActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.50)',
  },
  typeBtnIncomeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.50)',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  typeTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  amountWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  amountInput: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
    width: '100%',
  },
  errorText: {
    color: Colors.red,
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 13,
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
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardScroll: {
    flexDirection: 'row',
  },
  cardPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    marginRight: 10,
  },
  cardPillActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
    borderColor: 'rgba(255, 107, 0, 0.55)',
  },
  cardPillBank: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.orange,
    textTransform: 'uppercase',
  },
  cardPillName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
    marginTop: 2,
  },
  cardPillNameActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  catChipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.25)',
    borderColor: 'rgba(255, 107, 0, 0.60)',
  },
  catText: {
    color: Colors.textSub,
    fontSize: 13,
  },
  catTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
})