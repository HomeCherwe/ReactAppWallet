import React from 'react'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { fmtAmount, fmtDate } from '../utils/format'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

interface DetailsModalProps {
  visible: boolean
  tx: Transaction | null
  currency?: string
  onClose: () => void
  onEdit?: (tx: Transaction) => void
  onSplit?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
}

export default function DetailsModal({
  visible,
  tx,
  currency = 'UAH',
  onClose,
  onEdit,
  onSplit,
  onDelete,
}: DetailsModalProps) {
  if (!tx) return null

  const isExpense = Number(tx.amount || 0) < 0
  const amountVal = Math.abs(Number(tx.amount || 0))
  const txCur = tx.currency || currency

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Деталі транзакції</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Amount Banner */}
            <View style={[styles.amountBanner, isExpense ? styles.bannerExpense : styles.bannerIncome]}>
              <Text style={styles.bannerLabel}>{isExpense ? 'Витрата' : 'Дохід'}</Text>
              <Text style={[styles.bannerAmount, isExpense ? styles.textExpense : styles.textIncome]}>
                {isExpense ? '-' : '+'}{fmtAmount(amountVal, txCur)}
              </Text>
            </View>

            {/* Meta Rows */}
            <View style={styles.metaCard}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Категорія</Text>
                <Text style={styles.rowValue}>{tx.category || 'Без категорії'}</Text>
              </View>
              <View style={styles.rowDivider} />

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Рахунок / Картка</Text>
                <Text style={styles.rowValue}>{tx.card || 'Загальний рахунок'}</Text>
              </View>
              <View style={styles.rowDivider} />

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Дата та час</Text>
                <Text style={styles.rowValue}>{fmtDate(tx.created_at)}</Text>
              </View>

              {tx.merchant_name ? (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Торговець</Text>
                    <Text style={styles.rowValue}>{tx.merchant_name}</Text>
                  </View>
                </>
              ) : null}

              {tx.note ? (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.noteBox}>
                    <Text style={styles.rowLabel}>Примітка</Text>
                    <Text style={styles.noteValue}>{tx.note}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              {onEdit && (
                <GlassButton
                  label="Редагувати"
                  variant="primary"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => {
                    onClose()
                    onEdit(tx)
                  }}
                />
              )}
              {onSplit && (
                <GlassButton
                  label="Розділити"
                  variant="glass"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => {
                    onClose()
                    onSplit(tx)
                  }}
                />
              )}
            </View>

            {onDelete && (
              <GlassButton
                label="Видалити транзакцію"
                variant="destructive"
                size="md"
                style={{ width: '100%', marginTop: 8 }}
                onPress={() => {
                  onClose()
                  onDelete(tx)
                }}
              />
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  overlay: {
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
    maxHeight: '85%',
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  amountBanner: {
    borderRadius: Radius.xl,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerExpense: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  bannerIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  bannerLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  bannerAmount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  textExpense: { color: Colors.red },
  textIncome: { color: Colors.green },
  metaCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radius.xl,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '700',
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  noteBox: {
    paddingVertical: 10,
  },
  noteValue: {
    fontSize: 14,
    color: Colors.white80,
    marginTop: 6,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
})