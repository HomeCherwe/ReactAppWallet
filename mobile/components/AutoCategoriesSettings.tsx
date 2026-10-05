import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors, Radius } from '../constants/theme'
import { useSettingsStore } from '../store/useSettingsStore'
import {
  AUTO_CATEGORIES_MODE_PATH,
  AutoCategoriesMode,
  autoCategorize,
  CategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  ruleIsSure,
} from '../api/insights'
import { txBus } from '../utils/txBus'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import Icon from './Icon'

const MODES: { id: AutoCategoriesMode; label: string; desc: string }[] = [
  { id: 'auto', label: 'Ставити', desc: 'Знайомі продавці отримують категорію одразу (з позначкою «авто»), решта — підказку з ✓.' },
  { id: 'suggest', label: 'Підказувати', desc: 'Лише підказка з ✓ — категорію ставите ви.' },
  { id: 'off', label: 'Вимкнено', desc: 'Імпорт з банку чекає в закріплених, як раніше.' },
]

const SOURCE_LABEL: Record<CategoryRule['source'], string> = {
  learned: 'ваше',
  history: 'з історії',
  gpt: 'GPT',
}

/** Settings → «Автокатегорії»: how bank imports get their category, and the rules behind it */
export default function AutoCategoriesSettings() {
  const mode = useSettingsStore(s => s.getNestedSetting<AutoCategoriesMode>(AUTO_CATEGORIES_MODE_PATH, 'auto'))
  const updateNestedSetting = useSettingsStore(s => s.updateNestedSetting)
  const [running, setRunning] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const current = MODES.find(m => m.id === mode) ?? MODES[0]

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await autoCategorize()
      triggerSuccessHaptic()
      Toast.show({
        type: 'success',
        text1: r.applied || r.suggested ? `Поставлено: ${r.applied} · підказок: ${r.suggested}` : 'Нічого нового',
        text2: r.applied || r.suggested ? 'Дивіться закріплені на головній' : 'Закріплені вже розкладені або продавці ще незнайомі',
      })
      txBus.emit({ type: 'SYNCED' })
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <View style={styles.block}>
      <Text style={styles.desc}>
        Імпорт з банку отримує категорію за вашими звичками — як ви ставили її цьому продавцю раніше. Нових продавців
        підказує GPT, лише з ваших категорій. Змінили категорію — застосунок запам’ятав.
      </Text>

      <View style={styles.segment}>
        {MODES.map(m => {
          const active = m.id === mode
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                if (active) return
                triggerLightHaptic()
                updateNestedSetting(AUTO_CATEGORIES_MODE_PATH, m.id)
              }}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={styles.modeDesc}>{current.desc}</Text>

      <View style={styles.actions}>
        <GlassPressable style={styles.actionBtn} onPress={runNow} disabled={running || mode === 'off'}>
          {running ? (
            <ActivityIndicator size="small" color={Colors.orange} />
          ) : (
            <Text style={[styles.actionText, mode === 'off' && styles.actionTextOff]}>Розкласти закріплені</Text>
          )}
        </GlassPressable>
        <GlassPressable style={styles.actionBtn} onPress={() => setRulesOpen(true)}>
          <Text style={styles.actionText}>Правила</Text>
        </GlassPressable>
      </View>

      <CategoryRulesSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} />
    </View>
  )
}

/** Every merchant → category rule, searchable; ✕ forgets one (it's learned again when you categorize) */
function CategoryRulesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [rules, setRules] = useState<CategoryRule[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!visible) return
    setRules(null)
    listCategoryRules()
      .then(setRules)
      .catch(e => {
        setRules([])
        Toast.show({ type: 'error', text1: 'Не вдалося завантажити правила', text2: e?.message })
      })
  }, [visible])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = rules ?? []
    const found = s
      ? list.filter(r => r.merchant_key.includes(s) || (r.example || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s))
      : list
    // The user's own first, then the most used
    return [...found].sort((a, b) => Number(b.source === 'learned') - Number(a.source === 'learned') || b.hits - a.hits || b.samples - a.samples)
  }, [rules, q])

  const remove = async (r: CategoryRule) => {
    triggerLightHaptic()
    setRules(prev => prev?.filter(x => x.id !== r.id) ?? prev)
    try {
      await deleteCategoryRule(r.id)
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Не вдалося видалити', text2: e?.message })
      listCategoryRules().then(setRules).catch(() => {})
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Правила</Text>
        <Text style={styles.sheetCount}>{rules ? rules.length : ''}</Text>
      </View>
      <TextInput
        style={styles.search}
        value={q}
        onChangeText={setQ}
        placeholder="Продавець або категорія"
        placeholderTextColor={Colors.textMuted}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {rules === null ? (
        <ActivityIndicator color={Colors.orange} style={{ marginVertical: 30 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={r => r.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{q ? 'Нічого не знайдено' : 'Правил поки немає'}</Text>}
          renderItem={({ item: r }) => {
            const sure = ruleIsSure(r)
            return (
              <View style={styles.rule}>
                <View style={styles.ruleText}>
                  <Text style={styles.ruleMerchant} numberOfLines={1}>
                    {r.example || r.merchant_key}
                  </Text>
                  <Text style={styles.ruleMeta} numberOfLines={1}>
                    → <Text style={styles.ruleCategory}>{r.category}</Text>
                    {'  ·  '}
                    {SOURCE_LABEL[r.source]}
                    {r.source === 'history' ? ` (${r.samples}×, ${Math.round(r.confidence * 100)}%)` : ''}
                    {sure ? '' : ' · підказка'}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => remove(r)} style={({ pressed }) => [styles.ruleDelete, pressed && { opacity: 0.5 }]}>
                  <Icon name="close" size={14} color={Colors.white60} strokeWidth={2.4} />
                </Pressable>
              </View>
            )
          }}
        />
      )}
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  block: { padding: 16 },
  desc: { fontSize: 12, color: Colors.textSub, lineHeight: 16 },
  segment: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: 'rgba(255,107,0,0.22)' },
  segmentText: { fontSize: 13, fontWeight: '600', color: Colors.white60 },
  segmentTextActive: { color: Colors.orangeLight, fontWeight: '800' },
  modeDesc: { fontSize: 12, color: Colors.white60, marginTop: 8, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  actionText: { fontSize: 14, fontWeight: '700', color: Colors.orange },
  actionTextOff: { color: Colors.textMuted },

  sheet: { maxHeight: '85%', backgroundColor: '#121216', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  sheetCount: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  search: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.white,
    fontSize: 15,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 30 },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  ruleText: { flex: 1 },
  ruleMerchant: { fontSize: 14.5, fontWeight: '600', color: Colors.white },
  ruleMeta: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  ruleCategory: { color: Colors.orangeLight, fontWeight: '700' },
  ruleDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
})
