import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { DuplicatePair, mergeDuplicate, pairKey } from '../api/duplicates'
import { deleteTransaction, Transaction } from '../api/transactions'
import { Colors } from '../constants/theme'
import { usePossibleDuplicates } from '../hooks/usePossibleDuplicates'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { stripPinTag } from '../utils/pinned'
import { txBus } from '../utils/txBus'
import GlassButton from './GlassButton'
import SheetModal from './SheetModal'
import { fmtMoney } from './TxRow'

const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'пара' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'пари' : 'пар'

const dateOf = (t: Transaction) =>
  new Date(t.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: '2-digit' })

/**
 * "Можливі дублі" over the transactions list: a bank transaction and one entered by hand (or by a
 * subscription) on the same card, same amount, within 3 days. The user decides for each pair —
 * nothing is removed automatically. Hidden while there are none.
 */
export default function PossibleDuplicates({ hidden }: { hidden?: boolean }) {
  const { pairs, reload, dismiss, forget } = usePossibleDuplicates()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (pairs.length === 0 && !open) return null

  const done = (ids: string[], text1: string, text2?: string) => {
    triggerSuccessHaptic()
    Toast.show({ type: 'success', text1, text2 })
    forget(ids)
    txBus.emit({ type: 'SYNCED', source: 'duplicates', count: 0 }) // lists and balances reload
    reload()
    if (pairs.length <= 1) setOpen(false)
  }

  const run = async (pair: DuplicatePair, action: 'merge' | 'keep-bank' | 'dismiss') => {
    if (busy) return
    if (action === 'dismiss') {
      triggerLightHaptic()
      dismiss(pair)
      if (pairs.length <= 1) setOpen(false)
      return
    }
    setBusy(pairKey(pair))
    try {
      if (action === 'merge') {
        await mergeDuplicate(pair)
        done([pair.manual.id, pair.bank.id], 'Об’єднано', 'Лишилась ваша транзакція, банківську копію прибрано')
      } else {
        await deleteTransaction(pair.manual.id)
        done([pair.manual.id], 'Ручну транзакцію видалено', 'Лишилась банківська')
      }
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {pairs.length > 0 && (
        <Pressable
          onPress={() => {
            triggerLightHaptic()
            setOpen(true)
          }}
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        >
          <Text style={styles.bannerIcon}>⚠️</Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              Можливі дублі: {pairs.length} {plural(pairs.length)}
            </Text>
            <Text style={styles.bannerSub}>Та сама сума з банку і вручну — перегляньте</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <SheetModal visible={open} onClose={() => setOpen(false)} sheetStyle={styles.sheet}>
        <Text style={styles.title}>Можливі дублі</Text>
        <Text style={styles.subtitle}>
          Та сама сума на тій самій картці, різниця до 3 днів: одна транзакція прийшла з банку, інша додана вручну чи
          підпискою. «Об’єднати» лишає вашу (з категорією й нотаткою) і прибирає банківську копію.
        </Text>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {pairs.map(pair => {
            const cur = pair.card_currency ?? undefined
            const amount = Number(pair.bank.amount)
            const working = busy === pairKey(pair)
            return (
              <View key={pairKey(pair)} style={styles.pair}>
                <View style={styles.pairHead}>
                  <Text style={styles.pairCard} numberOfLines={1}>
                    {pair.card_name ?? 'Картка'}
                  </Text>
                  <Text style={[styles.pairAmount, amount > 0 && styles.green]}>
                    {hidden ? '••••' : `${amount > 0 ? '+' : '−'}${fmtMoney(amount, cur)}`}
                  </Text>
                </View>
                <Side label="Вручну" tx={pair.manual} />
                <Side label="З банку" tx={pair.bank} />
                <GlassButton
                  label="Об’єднати"
                  variant="primary"
                  size="md"
                  loading={working}
                  disabled={!!busy}
                  style={styles.mergeBtn}
                  onPress={() => run(pair, 'merge')}
                />
                <View style={styles.row}>
                  <GlassButton
                    label="Лишити банківську"
                    variant="glass"
                    size="sm"
                    disabled={!!busy}
                    style={styles.flex}
                    onPress={() => run(pair, 'keep-bank')}
                  />
                  <GlassButton label="Не дубль" variant="glass" size="sm" disabled={!!busy} style={styles.flex} onPress={() => run(pair, 'dismiss')} />
                </View>
              </View>
            )
          })}
        </ScrollView>
      </SheetModal>
    </>
  )
}

function Side({ label, tx }: { label: string; tx: Transaction }) {
  const note = stripPinTag(tx.note) || tx.merchant_name || '—'
  return (
    <View style={styles.side}>
      <View style={styles.sideHead}>
        <Text style={styles.sideLabel}>{label}</Text>
        <Text style={styles.sideMeta} numberOfLines={1}>
          {[tx.category, dateOf(tx)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.sideNote} numberOfLines={2}>
        {note}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 176, 32, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 176, 32, 0.40)',
  },
  pressed: {
    opacity: 0.7,
  },
  bannerIcon: {
    fontSize: 16,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD18A',
  },
  bannerSub: {
    fontSize: 12,
    color: Colors.white60,
    marginTop: 1,
  },
  chevron: {
    fontSize: 22,
    color: Colors.white40,
  },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '88%',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.white60,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  pair: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  pairHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pairCard: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  pairAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
  },
  green: {
    color: Colors.green,
  },
  side: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  sideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.orangeLight,
  },
  sideMeta: {
    flex: 1,
    fontSize: 12,
    color: Colors.white40,
    textAlign: 'right',
  },
  sideNote: {
    fontSize: 14,
    color: Colors.white80,
    marginTop: 3,
  },
  mergeBtn: {
    width: '100%',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
})
