import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ScrollView, Platform, KeyboardAvoidingView, Alert
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { Transaction, createTransaction, updateTransaction, getTransactionCategories } from '../api/transactions'
import { Card } from '../api/cards'
import { fmtAmount } from '../utils/format'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import { hasPinTag, stripPinTag, withPinTag } from '../utils/pinned'

interface SplitPart {
  id: string
  amount: string
  category: string
  note: string
}

interface SplitTxModalProps {
  visible: boolean
  tx: Transaction | null
  cards: Card[]
  onClose: () => void
  onDone: () => void
}

export default function SplitTxModal({
  visible,
  tx,
  cards,
  onClose,
  onDone,
}: SplitTxModalProps) {
  const [parts, setParts] = useState<SplitPart[]>([])
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (tx) {
      const origAmt = Math.abs(Number(tx.amount || 0))
      const half = (origAmt / 2).toFixed(2)
      setParts([
        { id: '1', amount: half, category: tx.category || 'Частина 1', note: stripPinTag(tx.note) },
        { id: '2', amount: (origAmt - parseFloat(half)).toFixed(2), category: 'Частина 2', note: '' },
      ])
    }
  }, [tx])

  useEffect(() => {
    getTransactionCategories().then(cats => {
      if (cats && cats.length > 0) setCategories(cats)
    })
  }, [])

  if (!tx || !visible) return null

  const origAmount = Math.abs(Number(tx.amount || 0))
  const isExpense = Number(tx.amount || 0) < 0

  const partsTotal = parts.reduce((acc, p) => acc + (parseFloat(p.amount.replace(',', '.')) || 0), 0)
  const remainder = origAmount - partsTotal

  const handleAddPart = () => {
    const nextId = String(Date.now())
    setParts([...parts, { id: nextId, amount: '0.00', category: 'Інше', note: '' }])
  }

  const handleRemovePart = (id: string) => {
    if (parts.length <= 2) {
      Alert.alert('Увага', 'Повинно бути мінімум 2 частини')
      return
    }
    setParts(parts.filter(p => p.id !== id))
  }

  const handleUpdatePart = (id: string, field: keyof SplitPart, value: string) => {
    setParts(parts.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleSave = async () => {
    if (Math.abs(remainder) > 0.01) {
      setErrorMsg(`Сума частин (${partsTotal.toFixed(2)}) не дорівнює початковій (${origAmount.toFixed(2)})`)
      return
    }

    setSaving(true)
    setErrorMsg('')

    try {
      // First part updates original transaction
      const first = parts[0]
      const firstAmt = parseFloat(first.amount.replace(',', '.'))
      await updateTransaction(tx.id, {
        amount: isExpense ? -firstAmt : firstAmt,
        category: first.category,
        note: withPinTag(first.note || stripPinTag(tx.note), hasPinTag(tx.note)) ?? undefined,
      })

      // Remaining parts are created as new transactions
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i]
        const pAmt = parseFloat(p.amount.replace(',', '.'))
        await createTransaction({
          amount: isExpense ? -pAmt : pAmt,
          category: p.category,
          card_id: tx.card_id,
          note: p.note || `Розділено від #${tx.id.slice(0, 6)}`,
          split_from: tx.id,
        })
      }

      setSaving(false)
      onDone()
      onClose()
    } catch (e: any) {
      setSaving(false)
      setErrorMsg(e.message || 'Помилка при розділенні транзакції')
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Розділити транзакцію</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Original info */}
            <View style={styles.origBox}>
              <Text style={styles.origLabel}>Початкова сума</Text>
              <Text style={styles.origVal}>{fmtAmount(origAmount, tx.currency || 'UAH')}</Text>
              <Text style={[styles.remainderVal, Math.abs(remainder) > 0.01 ? styles.remainderBad : styles.remainderGood]}>
                Залишок для розподілу: {remainder.toFixed(2)}
              </Text>
            </View>

            {/* Parts list */}
            {parts.map((part, idx) => (
              <View key={part.id} style={styles.partCard}>
                <View style={styles.partHeader}>
                  <Text style={styles.partNum}>Частина {idx + 1}</Text>
                  {parts.length > 2 && (
                    <TouchableOpacity onPress={() => handleRemovePart(part.id)}>
                      <Text style={styles.removeText}>Видалити</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.fieldLabel}>Сума</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={part.amount}
                      onChangeText={val => handleUpdatePart(part.id, 'amount', val)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Категорія</Text>
                    <TextInput
                      style={styles.input}
                      value={part.category}
                      onChangeText={val => handleUpdatePart(part.id, 'category', val)}
                    />
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Примітка</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Опис частини..."
                  placeholderTextColor={Colors.textMuted}
                  value={part.note}
                  onChangeText={val => handleUpdatePart(part.id, 'note', val)}
                />
              </View>
            ))}

            <GlassPressable style={styles.addPartBtn} onPress={handleAddPart}>
              <Text style={styles.addPartText}>+ Додати ще одну частину</Text>
            </GlassPressable>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <GlassButton
              label={saving ? 'Розділення...' : 'Підтвердити розподіл'}
              variant="primary"
              size="lg"
              loading={saving}
              style={{ marginTop: 14 }}
              onPress={handleSave}
            />

            <View style={{ height: 40 }} />
          </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
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
  handleWrap: { alignItems: 'center', paddingVertical: 6 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.white },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingTop: 10 },
  origBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radius.xl,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  origLabel: { ...Typography.caption, color: Colors.textMuted },
  origVal: { fontSize: 26, fontWeight: '800', color: Colors.white, marginTop: 4 },
  remainderVal: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  remainderGood: { color: Colors.green },
  remainderBad: { color: Colors.orange },
  partCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  partHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  partNum: { fontSize: 14, fontWeight: '700', color: Colors.orange },
  removeText: { fontSize: 12, color: Colors.red, fontWeight: '600' },
  row: { flexDirection: 'row' },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addPartBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 107, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    marginVertical: 6,
  },
  addPartText: { color: Colors.orange, fontWeight: '700', fontSize: 14 },
  errorText: { color: Colors.red, textAlign: 'center', marginVertical: 8, fontSize: 13 },
})