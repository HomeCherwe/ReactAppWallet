import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { accountKind, goalProgress, KIND_META } from '../utils/accountKind'
import { convertCurrency, formatBreakdown, formatMoney, RatesMap } from '../utils/currency'
import { triggerLightHaptic } from '../utils/haptics'
import GlassCard from './GlassCard'
import { GlassPressable } from './LiquidGlass'
import Skeleton from './Skeleton'

const ACCENT = KIND_META.savings.accent
// A bank name that says nothing about where the money is
const NO_BANK = new Set(['', 'інші'])

interface SavingsCardProps {
  cards: Card[]
  balances: Record<string, number>
  rates: RatesMap | null
  primaryCurrency: string
  hidden?: boolean
  loading?: boolean
  onPressAccount: (card: Card) => void
  onAdd: () => void
}

const signed = (v: number, cur: string, hideCents = false) => (v < 0 ? '-' : '') + formatMoney(v, cur, { hideCents })

/**
 * «Скарбнички» on Home (the web dashboard has the same block): everything put aside in the main
 * currency, the currencies it is in, and every piggy bank with its goal.
 */
export default function SavingsCard({
  cards,
  balances,
  rates,
  primaryCurrency,
  hidden,
  loading,
  onPressAccount,
  onAdd,
}: SavingsCardProps) {
  // Like the totals: not archived, not in a bank switched off; an empty one only with a goal
  const piggies = useMemo(
    () =>
      cards
        .filter(c => accountKind(c) === 'savings' && !c.archived && !c.bank_exclude_from_stats)
        .map(c => {
          const balance = balances[c.id] ?? Number(c.initial_balance || 0)
          return { card: c, balance, inPrimary: convertCurrency(balance, c.currency || 'UAH', primaryCurrency, rates) }
        })
        .filter(p => Math.abs(p.balance) >= 0.005 || Number(p.card.goal_amount) > 0)
        .sort((a, b) => b.inPrimary - a.inPrimary),
    [cards, balances, primaryCurrency, rates]
  )
  const byCurrency = useMemo(() => {
    const out: Record<string, number> = {}
    for (const p of piggies) {
      const cur = (p.card.currency || 'UAH').toUpperCase()
      out[cur] = (out[cur] || 0) + p.balance
    }
    return out
  }, [piggies])
  const total = piggies.reduce((s, p) => s + p.inPrimary, 0)

  return (
    <GlassCard style={styles.card} padding={20}>
      <View style={styles.header}>
        <Text style={styles.title}>🐷 Скарбнички</Text>
        <GlassPressable
          style={styles.addBtn}
          onPress={() => {
            triggerLightHaptic()
            onAdd()
          }}
        >
          <Text style={styles.addBtnText}>+ Нова</Text>
        </GlassPressable>
      </View>

      {loading ? (
        <View>
          <Skeleton width="50%" height={28} radius={10} />
          <View style={{ height: 12 }} />
          <Skeleton width="100%" height={44} radius={14} />
        </View>
      ) : piggies.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Поки що жодної скарбнички</Text>
          <Text style={styles.emptySub}>Гроші, які відкладаєте, — окремо від карток: видно, скільки зібрано і на що</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={onAdd}>
            <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Створити скарбничку</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
            {hidden ? '••••••' : signed(total, primaryCurrency)}
          </Text>
          {/* The euros and dollars as they are, not converted */}
          <Text style={styles.breakdown} numberOfLines={1}>
            {hidden || !Object.keys(byCurrency).some(c => c !== primaryCurrency) ? ' ' : formatBreakdown(byCurrency)}
          </Text>

          <View style={styles.list}>
            {piggies.map(({ card, balance }) => {
              const progress = goalProgress(card, balance)
              const bank = String(card.bank || '').trim()
              const where = NO_BANK.has(bank.toLowerCase()) ? '' : bank
              return (
                <TouchableOpacity
                  key={card.id}
                  activeOpacity={0.7}
                  style={styles.row}
                  onPress={() => {
                    triggerLightHaptic()
                    onPressAccount(card)
                  }}
                >
                  <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
                    <Text style={styles.iconText}>🐷</Text>
                  </LinearGradient>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
                      <Text style={[styles.amount, balance < 0 && styles.negative]} numberOfLines={1}>
                        {hidden ? '••••' : signed(balance, card.currency)}
                      </Text>
                    </View>
                    {progress != null ? (
                      <>
                        <View style={styles.track}>
                          <LinearGradient
                            colors={ACCENT}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.fill, { width: `${progress * 100}%` }]}
                          />
                        </View>
                        <View style={styles.rowBottom}>
                          <Text style={styles.sub} numberOfLines={1}>
                            {where ? `${where} · ` : ''}ціль {hidden ? '••••' : formatMoney(Number(card.goal_amount), card.currency, { hideCents: true })}
                          </Text>
                          <Text style={[styles.sub, progress >= 1 && styles.reached]}>
                            {progress >= 1 ? '✓ зібрано' : `${Math.floor(progress * 100)}%`}
                          </Text>
                        </View>
                      </>
                    ) : (
                      !!where && <Text style={styles.sub} numberOfLines={1}>{where}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { borderColor: 'rgba(52, 211, 153, 0.22)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 13, fontWeight: '700', color: 'rgba(52, 211, 153, 0.95)', textTransform: 'uppercase', letterSpacing: 1.2 },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.30)',
  },
  addBtnText: { fontSize: 12, fontWeight: '800', color: '#6EE7B7' },
  total: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: Colors.white, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  breakdown: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: Colors.white60, marginTop: 2, fontVariant: ['tabular-nums'] },
  list: { marginTop: 10, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.white },
  amount: { fontSize: 15, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  negative: { color: '#FF6B6B' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 7 },
  fill: { height: '100%', borderRadius: 3 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  sub: { fontSize: 11, color: Colors.textSub, marginTop: 2, fontVariant: ['tabular-nums'] },
  reached: { color: '#6EE7B7', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.white },
  emptySub: { fontSize: 12, lineHeight: 17, color: Colors.textSub, textAlign: 'center', marginTop: 4, marginHorizontal: 8 },
  emptyBtn: { marginTop: 12, paddingHorizontal: 18, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
})
