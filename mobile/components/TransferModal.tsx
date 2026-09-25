import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ScrollView, Platform, KeyboardAvoidingView, Alert
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { Card } from '../api/cards'
import { createTransfer } from '../api/transfers'
import { listRecentTransactions, Transaction } from '../api/transactions'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

interface TransferModalProps {
  visible: boolean
  cards: Card[]
  onClose: () => void
  onDone: () => void
}

export default function TransferModal({
  visible,
  cards,
  onClose,
  onDone,
}: TransferModalProps) {
  const [fromCardId, setFromCardId] = useState('')
  const [toCardId, setToCardId] = useState('')
  const [amount, setAmount] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (cards.length >= 2) {
      setFromCardId(cards[0].id)
      setToCardId(cards[1].id)
    } else if (cards.length === 1) {
      setFromCardId(cards[0].id)
    }
  }, [cards])

  if (!visible) return null

  const handleSave = async () => {
    const fromAmt = parseFloat(amount.replace(',', '.'))
    if (!fromAmt || isNaN(fromAmt) || fromAmt <= 0) {
      setErrorMsg('Вкажіть суму списання')
      return
    }
    if (!fromCardId || !toCardId) {
      setErrorMsg('Оберіть рахунки звідки і куди')
      return
    }
    if (fromCardId === toCardId) {
      setErrorMsg('Оберіть різні рахунки')
      return
    }

    const toAmt = amountTo ? parseFloat(amountTo.replace(',', '.')) : fromAmt

    setSaving(true)
    setErrorMsg('')

    try {
      await createTransfer({
        from_card_id: fromCardId,
        to_card_id: toCardId,
        amount_from: fromAmt,
        amount_to: toAmt,
        note: note.trim() || undefined,
      })

      setAmount('')
      setAmountTo('')
      setNote('')
      setSaving(false)
      onDone()
      onClose()
    } catch (e: any) {
      setSaving(false)
      setErrorMsg(e.message || 'Помилка виконання переказу')
    }
  }

  const fromCard = cards.find(c => c.id === fromCardId)
  const toCard = cards.find(c => c.id === toCardId)
  const isDifferentCurrency = fromCard && toCard && fromCard.currency !== toCard.currency

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Переказ між рахунками</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* From Card */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>З рахунку</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                {cards.map(c => {
                  const isSel = fromCardId === c.id
                  return (
                    <GlassPressable
                      key={c.id}
                      style={[styles.cardPill, isSel && styles.cardPillActive]}
                      onPress={() => setFromCardId(c.id)}
                    >
                      <Text style={styles.cardPillBank}>{c.bank || 'КАРТКА'}</Text>
                      <Text style={[styles.cardPillName, isSel && styles.cardPillNameActive]}>
                        {c.name} ({c.currency})
                      </Text>
                    </GlassPressable>
                  )
                })}
              </ScrollView>
            </View>

            {/* To Card */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>На рахунок</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                {cards.map(c => {
                  const isSel = toCardId === c.id
                  return (
                    <GlassPressable
                      key={c.id}
                      style={[styles.cardPill, isSel && styles.cardPillActive]}
                      onPress={() => setToCardId(c.id)}
                    >
                      <Text style={styles.cardPillBank}>{c.bank || 'КАРТКА'}</Text>
                      <Text style={[styles.cardPillName, isSel && styles.cardPillNameActive]}>
                        {c.name} ({c.currency})
                      </Text>
                    </GlassPressable>
                  )
                })}
              </ScrollView>
            </View>

            {/* Amount */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Сума списання {fromCard ? `(${fromCard.currency})` : ''}
              </Text>
              <TextInput
                style={styles.inputLarge}
                placeholder="0.00"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            {/* Second amount if currencies differ */}
            {isDifferentCurrency && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  Сума зарахування {toCard ? `(${toCard.currency})` : ''}
                </Text>
                <TextInput
                  style={styles.inputLarge}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="decimal-pad"
                  value={amountTo}
                  onChangeText={setAmountTo}
                />
              </View>
            )}

            {/* Note */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Примітка</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="Наприклад: переказ на картку..."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {/* Submit */}
            <GlassButton
              label={saving ? 'Виконується...' : 'Здійснити переказ'}
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
  section: {
    marginBottom: 16,
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
  inputLarge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.white,
    fontSize: 24,
    fontWeight: '700',
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
  errorText: {
    color: Colors.red,
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 13,
  },
})