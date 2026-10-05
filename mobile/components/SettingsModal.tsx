import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, TextInput, ActivityIndicator, Alert, Share
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Colors, Radius, Typography } from '../constants/theme'
import { SUPPORTED_CURRENCIES } from '../utils/settings'
import { supabase } from '../lib/supabase'
import { getApiUrl } from '../lib/apiFetch'
import { useSettingsStore } from '../store/useSettingsStore'
import { getApiKey, generateApiKey } from '../api/preferences'
import { getTransactionCategories } from '../api/transactions'
import { EXCLUDED_CATEGORIES_PATH, useExcludedCategories } from '../utils/statsCategories'
import { isSyncCategory } from '../utils/cardExclusion'
import Toast from 'react-native-toast-message'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import AutoCategoriesSettings from './AutoCategoriesSettings'

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
  primaryCurrency: string
  onCurrencyChange: (newCurrency: string) => void
  userEmail?: string
  userName?: string
  onUserUpdate?: () => void
  usedCurrencies?: string[]
}

export default function SettingsModal({
  visible, onClose, primaryCurrency, onCurrencyChange,
  userEmail, userName, onUserUpdate, usedCurrencies = []
}: SettingsModalProps) {
  const [displayName, setDisplayName] = useState(userName || '')
  const [saving, setSaving] = useState(false)
  const [loadingApis, setLoadingApis] = useState(false)

  // Automation key (API Key): banks are connected on the cards page, not with keys here
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)

  const { getNestedSetting, updateNestedSetting } = useSettingsStore()
  const pinnedCategories = getNestedSetting<string[]>('dashboard.pinnedCategories', [])
  const [newCategory, setNewCategory] = useState('')
  // Categories left out of statistics (same list as the web)
  const excludedCategories = useExcludedCategories()
  const [excludedInput, setExcludedInput] = useState('')
  const [allCategories, setAllCategories] = useState<string[]>([])

  const lastSavedName = useRef(userName || '')

  useEffect(() => {
    if (visible) {
      setDisplayName(userName || '')
      lastSavedName.current = userName || ''
      loadData()
    }
  }, [visible, userName])

  const loadData = async () => {
    getTransactionCategories()
      .then(list => setAllCategories([...new Set(list.filter(c => c && !isSyncCategory(c)))].sort((a, b) => a.localeCompare(b, 'uk'))))
      .catch(() => {})
    setLoadingApis(true)
    try {
      setApiKey(await getApiKey())
    } catch {} finally {
      setLoadingApis(false)
    }
  }

  useEffect(() => {
    if (!visible || displayName === lastSavedName.current) return
    const t = setTimeout(() => {
      handleSaveName(true)
    }, 1000)
    return () => clearTimeout(t)
  }, [displayName, visible])

  const handleSaveName = async (silent = false) => {
    if (!displayName.trim()) return
    setSaving(true)
    try {
      lastSavedName.current = displayName.trim()
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName.trim(), display_name: displayName.trim() }
      })
      if (error) throw error
      if (!silent) Toast.show({ type: 'success', text1: "Ім'я збережено!" })
      if (onUserUpdate) onUserUpdate()
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Не вдалося зберегти' })
    } finally {
      setSaving(false)
    }
  }

  const createApiKey = async () => {
    try {
      setLoadingApis(true)
      const key = await generateApiKey()
      setApiKey(key)
      setApiKeyVisible(true)
      Toast.show({ type: 'success', text1: 'API Key створено' })
    } catch {
      Toast.show({ type: 'error', text1: 'Не вдалося створити ключ' })
    } finally {
      setLoadingApis(false)
    }
  }

  const handleGenerateApiKey = () => {
    if (!apiKey) return createApiKey()
    Alert.alert('Створити новий ключ?', 'Старий перестане працювати — оновіть його в автоматизаціях.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Створити', style: 'destructive', onPress: createApiKey },
    ])
  }

  // No clipboard module in this build: the share sheet has «Скопіювати»
  const shareText = (text: string) => Share.share({ message: text }).catch(() => {})

  const handleSignOut = async () => {
    try {
      useSettingsStore.getState().reset()
      await supabase.auth.signOut()
      onClose()
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  const handleAddCategory = () => {
    const cat = newCategory.trim()
    if (!cat) return
    const current = getNestedSetting<string[]>('dashboard.pinnedCategories', [])
    if (current.includes(cat)) return
    updateNestedSetting('dashboard.pinnedCategories', [...current, cat])
    setNewCategory('')
    Toast.show({ type: 'success', text1: 'Категорію закріплено' })
  }

  const addExcludedCategory = (name: string) => {
    const cat = name.trim()
    if (!cat || excludedCategories.includes(cat)) return
    updateNestedSetting(EXCLUDED_CATEGORIES_PATH, [...excludedCategories, cat])
    setExcludedInput('')
    Toast.show({ type: 'success', text1: `«${cat}» більше не рахується в статистиці` })
  }

  const handleRemoveCategory = (cat: string) => {
    const current = getNestedSetting<string[]>('dashboard.pinnedCategories', [])
    updateNestedSetting('dashboard.pinnedCategories', current.filter(c => c !== cat))
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

            <View style={styles.header}>
              <Text style={styles.title}>Налаштування</Text>
              <GlassButton label="Закрити" variant="primary" size="sm" onPress={onClose} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

              {/* PROFILE SECTION */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Профіль</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.profileRow}>
                    <LinearGradient
                      colors={['#FF6B00', '#FF3D00']}
                      style={styles.avatar}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.avatarText}>{(displayName || 'U').slice(0, 2).toUpperCase()}</Text>
                    </LinearGradient>
                    <View style={styles.profileMeta}>
                      <Text style={styles.profileEmail}>{userEmail}</Text>
                      <TextInput
                        style={styles.inputUnderline}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Ваше ім'я"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>
                  <View style={styles.rowBorder} />
                  <GlassPressable style={styles.actionRowBtn} onPress={handleSignOut}>
                    <Text style={[styles.actionRowBtnText, { color: Colors.red }]}>Вийти з акаунта</Text>
                  </GlassPressable>
                </View>
              </View>

              {/* CURRENCY SECTION */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Основна валюта</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  {SUPPORTED_CURRENCIES.filter(c => usedCurrencies.length === 0 || usedCurrencies.includes(c.code)).map((cur, index, arr) => {
                    const isSelected = primaryCurrency === cur.code
                    const isLast = index === arr.length - 1
                    return (
                      <TouchableOpacity
                        key={cur.code}
                        style={[styles.currencyRow, isSelected && styles.currencyRowActive, !isLast && styles.rowBorder]}
                        onPress={() => onCurrencyChange(cur.code)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.currencyLeft}>
                          <Text style={styles.flag}>{cur.flag}</Text>
                          <View>
                            <View style={styles.codeRow}>
                              <Text style={[styles.code, isSelected && styles.codeActive]}>{cur.code}</Text>
                              <Text style={[styles.symbol, isSelected && styles.symbolActive]}>({cur.symbol})</Text>
                            </View>
                            <Text style={styles.curName}>{cur.name}</Text>
                          </View>
                        </View>
                        {isSelected ? (
                          <LinearGradient colors={['#FF6B00', '#FF3D00']} style={styles.checkCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <Text style={styles.checkText}>✓</Text>
                          </LinearGradient>
                        ) : <View style={styles.uncheckCircle} />}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* DASHBOARD SETTINGS */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Налаштування панелі</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />

                  {/* Pinned Categories */}
                  <View style={styles.settingRowBlock}>
                    <Text style={styles.settingLabelTitle}>Закріплені категорії</Text>
                    <Text style={styles.settingDesc}>
                      Імпорт з банку з категорією «… Sync» (Revolut Sync, Monobank Sync) закріплений завжди — доки ви не дасте йому категорію.
                    </Text>
                    <View style={styles.categoriesWrap}>
                      {pinnedCategories.map((cat: string) => (
                        <GlassPressable key={cat} style={styles.catChip} onPress={() => handleRemoveCategory(cat)}>
                          <Text style={styles.catChipText}>{cat}</Text>
                          <Text style={styles.catChipRemove}>✕</Text>
                        </GlassPressable>
                      ))}
                    </View>
                    <View style={styles.addCatRow}>
                      <TextInput
                        style={styles.addCatInput}
                        value={newCategory}
                        onChangeText={setNewCategory}
                        placeholder="Нова категорія..."
                        placeholderTextColor={Colors.textMuted}
                      />
                      <GlassPressable style={styles.addCatBtn} onPress={handleAddCategory}>
                        <Text style={styles.addCatBtnText}>+</Text>
                      </GlassPressable>
                    </View>
                  </View>

                  <View style={styles.rowBorder} />

                  {/* Categories left out of statistics */}
                  <View style={styles.settingRowBlock}>
                    <Text style={styles.settingLabelTitle}>Категорії поза статистикою</Text>
                    <Text style={styles.settingDesc}>
                      Не входять у доходи, витрати й графіки (наприклад «МАЄ ВЕРНУТИ»). На баланс карток впливають, як і раніше. Те саме на сайті.
                    </Text>
                    <View style={styles.categoriesWrap}>
                      {excludedCategories.map(cat => (
                        <GlassPressable
                          key={cat}
                          style={[styles.catChip, styles.catChipExcluded]}
                          onPress={() => updateNestedSetting(EXCLUDED_CATEGORIES_PATH, excludedCategories.filter(c => c !== cat))}
                        >
                          <Text style={[styles.catChipText, styles.catChipTextExcluded]}>{cat}</Text>
                          <Text style={styles.catChipRemove}>✕</Text>
                        </GlassPressable>
                      ))}
                    </View>
                    <View style={styles.addCatRow}>
                      <TextInput
                        style={styles.addCatInput}
                        value={excludedInput}
                        onChangeText={setExcludedInput}
                        placeholder="Категорія..."
                        placeholderTextColor={Colors.textMuted}
                        onSubmitEditing={() => addExcludedCategory(excludedInput)}
                        returnKeyType="done"
                      />
                      <GlassPressable style={styles.addCatBtn} onPress={() => addExcludedCategory(excludedInput)}>
                        <Text style={styles.addCatBtnText}>+</Text>
                      </GlassPressable>
                    </View>
                    {allCategories.filter(c => !excludedCategories.includes(c) && (!excludedInput.trim() || c.toLowerCase().includes(excludedInput.trim().toLowerCase()))).slice(0, 12).length > 0 && (
                      <View style={styles.suggestWrap}>
                        {allCategories.filter(c => !excludedCategories.includes(c) && (!excludedInput.trim() || c.toLowerCase().includes(excludedInput.trim().toLowerCase()))).slice(0, 12).map(c => (
                          <TouchableOpacity key={c} style={styles.suggestChip} onPress={() => addExcludedCategory(c)}>
                            <Text style={styles.suggestText}>+ {c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                </View>
              </View>

              {/* AUTO-CATEGORIES: bank imports get a category from the user's habits */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Автокатегорії</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  <AutoCategoriesSettings />
                </View>
              </View>

              {/* AUTOMATION: API KEY + how to use it (same as the web's settings) */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Автоматизація · API Key</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.settingRowBlock}>
                    <Text style={styles.settingDesc}>
                      З ключем банки синхронізуються навіть тоді, коли MyWallet закритий, наприклад щоранку через Команди
                      iPhone. Ключ не має терміну дії; нікому його не показуйте.
                    </Text>

                    <Text style={styles.guideTitle}>Як налаштувати в Командах</Text>
                    {[
                      'Команди → Автоматизація → «+» → «Час доби» (наприклад, 8:00) → «Запускати одразу».',
                      'Нова пуста команда → дія «Отримати вміст URL».',
                      'URL — адреса нижче з «/api/bank-connections/sync» у кінці; Метод — POST.',
                      'Заголовки → «Додати новий заголовок»: ключ X-API-Key, значення — ваш ключ.',
                      'Готово. Банки дозволяють близько 4 таких фонових оновлень на добу; з відкритого MyWallet — без обмежень.',
                    ].map((step, i) => (
                      <View key={i} style={styles.guideStep}>
                        <Text style={styles.guideNum}>{i + 1}</Text>
                        <Text style={styles.guideText}>{step}</Text>
                      </View>
                    ))}

                    <Text style={styles.inputLabelTop}>Адреса для синхронізації</Text>
                    <View style={styles.apiKeyBox}>
                      <Text style={styles.apiKeyText} numberOfLines={1} selectable>
                        {`${getApiUrl()}/api/bank-connections/sync`}
                      </Text>
                      <TouchableOpacity onPress={() => shareText(`${getApiUrl()}/api/bank-connections/sync`)} hitSlop={8}>
                        <Text style={styles.copyText}>Копіювати</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.inputLabelTop}>Ваш API Key</Text>
                    {loadingApis ? (
                      <ActivityIndicator color={Colors.orange} style={{ marginVertical: 10 }} />
                    ) : apiKey ? (
                      <>
                        <View style={styles.apiKeyBox}>
                          <Text style={styles.apiKeyText} numberOfLines={1} selectable={apiKeyVisible}>
                            {apiKeyVisible ? apiKey : '••••••••••••••••••••••••••••'}
                          </Text>
                          <TouchableOpacity onPress={() => setApiKeyVisible(!apiKeyVisible)} hitSlop={8}>
                            <Text style={styles.toggleText}>{apiKeyVisible ? '🙈' : '👁️'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => shareText(apiKey)} hitSlop={8}>
                            <Text style={styles.copyText}>Копіювати</Text>
                          </TouchableOpacity>
                        </View>
                        <GlassPressable style={styles.actionRowBtn} onPress={handleGenerateApiKey}>
                          <Text style={styles.actionRowBtnText}>Створити новий ключ</Text>
                        </GlassPressable>
                      </>
                    ) : (
                      <GlassPressable style={styles.actionRowBtn} onPress={handleGenerateApiKey}>
                        <Text style={styles.actionRowBtnText}>Створити API Key</Text>
                      </GlassPressable>
                    )}
                  </View>
                </View>
              </View>

              <View style={{ height: 60 }} />
            </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  sheet: { maxHeight: '90%', backgroundColor: 'rgba(16, 16, 20, 0.72)', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', paddingTop: 12 },
  sheetBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  handleContainer: { alignItems: 'center', paddingVertical: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  section: { marginBottom: 26 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.orange, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase', paddingLeft: 4 },
  cardGroup: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.06)' },
  flexRow: { flexDirection: 'row' },

  // Currency Row
  currencyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  currencyRowActive: { backgroundColor: 'rgba(255, 107, 0, 0.08)' },
  currencyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { fontSize: 20 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { fontSize: 14, fontWeight: '700', color: Colors.white },
  codeActive: { color: Colors.orange },
  symbol: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  symbolActive: { color: Colors.orangeLight },
  curName: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  checkCircle: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  uncheckCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.2)' },

  // Profile Row
  profileRow: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  profileMeta: { flex: 1 },
  profileEmail: { fontSize: 12, color: Colors.textSub, marginBottom: 4 },
  inputUnderline: { fontSize: 17, fontWeight: '700', color: Colors.white, padding: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)', paddingBottom: 4 },

  // Actions
  actionRowBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  actionRowBtnText: { fontSize: 15, fontWeight: '700', color: Colors.orange },

  // Inputs
  inputGroup: { paddingHorizontal: 16, paddingVertical: 12 },
  inputLabel: { fontSize: 12, color: Colors.textSub, marginBottom: 6 },
  inputField: { fontSize: 15, color: Colors.white, padding: 0 },

  // Dashboard
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  settingRowBlock: { padding: 16 },
  settingLabelTitle: { fontSize: 15, color: Colors.white, fontWeight: '600' },
  settingDesc: { fontSize: 12, color: Colors.textSub, marginTop: 4, lineHeight: 16 },

  categoriesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,107,0,0.15)', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, gap: 6, borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)' },
  catChipText: { color: Colors.orange, fontSize: 13, fontWeight: '600' },
  catChipExcluded: { backgroundColor: 'rgba(175,82,222,0.15)', borderColor: 'rgba(175,82,222,0.35)' },
  catChipTextExcluded: { color: '#D9A8F2' },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  suggestText: { color: Colors.white60, fontSize: 12, fontWeight: '600' },
  catChipRemove: { color: Colors.textMuted, fontSize: 12 },
  addCatRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  addCatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, color: Colors.white, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  addCatBtn: { width: 42, height: 42, backgroundColor: Colors.orange, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  addCatBtnText: { color: Colors.white, fontSize: 24, fontWeight: '700' },

  apiKeyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, padding: 14, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  copyText: { fontSize: 13, fontWeight: '700', color: Colors.orange },
  inputLabelTop: { fontSize: 12, color: Colors.textSub, marginTop: 16, marginBottom: 6 },
  guideTitle: { fontSize: 14, fontWeight: '700', color: Colors.white, marginTop: 14, marginBottom: 8 },
  guideStep: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  guideNum: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,107,0,0.18)', color: Colors.orangeLight, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 20 },
  guideText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.white80 },
  apiKeyText: { flex: 1, color: Colors.white, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  toggleText: { fontSize: 20 },
})