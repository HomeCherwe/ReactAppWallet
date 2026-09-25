import React, { useEffect, useState, useRef } from 'react'
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, TextInput, ActivityIndicator, Switch, KeyboardAvoidingView
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Colors, Radius, Typography } from '../constants/theme'
import { SUPPORTED_CURRENCIES } from '../utils/settings'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/apiFetch'
import { useSettingsStore } from '../store/useSettingsStore'
import { getUserAPIs, saveUserAPI, getApiKey, generateApiKey } from '../api/preferences'
import Toast from 'react-native-toast-message'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

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

  // apis
  const [binanceApiKey, setBinanceApiKey] = useState('')
  const [binanceApiSecret, setBinanceApiSecret] = useState('')
  const [monobankToken, setMonobankToken] = useState('')
  const [monobankBlack, setMonobankBlack] = useState('')
  const [monobankWhite, setMonobankWhite] = useState('')
  
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  
  const { getNestedSetting, updateNestedSetting } = useSettingsStore()
  const pinnedCategories = getNestedSetting<string[]>('dashboard.pinnedCategories', [])
  const [newCategory, setNewCategory] = useState('')

  const lastSavedName = useRef(userName || '')
  const lastSavedApis = useRef({ binanceApiKey: '', binanceApiSecret: '', monobankToken: '', monobankBlack: '', monobankWhite: '' })

  useEffect(() => {
    if (visible) {
      setDisplayName(userName || '')
      lastSavedName.current = userName || ''
      loadData()
    }
  }, [visible, userName])

  const loadData = async () => {
    setLoadingApis(true)
    try {
      const apis = await getUserAPIs()
      setBinanceApiKey(apis.binance_api_key || '')
      setBinanceApiSecret(apis.binance_api_secret || '')
      setMonobankToken(apis.monobank_token || '')
      setMonobankBlack(apis.monobank_black_card_id || '')
      setMonobankWhite(apis.monobank_white_card_id || '')
      
      lastSavedApis.current = {
        binanceApiKey: apis.binance_api_key || '',
        binanceApiSecret: apis.binance_api_secret || '',
        monobankToken: apis.monobank_token || '',
        monobankBlack: apis.monobank_black_card_id || '',
        monobankWhite: apis.monobank_white_card_id || ''
      }

      const key = await getApiKey()
      setApiKey(key)
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

  useEffect(() => {
    if (!visible) return
    const current = { binanceApiKey, binanceApiSecret, monobankToken, monobankBlack, monobankWhite }
    if (JSON.stringify(current) === JSON.stringify(lastSavedApis.current)) return
    
    const t = setTimeout(() => {
      handleSaveApis(true)
    }, 1000)
    return () => clearTimeout(t)
  }, [binanceApiKey, binanceApiSecret, monobankToken, monobankBlack, monobankWhite, visible])

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

  const handleSaveApis = async (silent = false) => {
    setSaving(true)
    try {
      lastSavedApis.current = { binanceApiKey, binanceApiSecret, monobankToken, monobankBlack, monobankWhite }
      await Promise.all([
        saveUserAPI('binance_api_key', binanceApiKey),
        saveUserAPI('binance_api_secret', binanceApiSecret),
        saveUserAPI('monobank_token', monobankToken),
        saveUserAPI('monobank_black_card_id', monobankBlack),
        saveUserAPI('monobank_white_card_id', monobankWhite),
      ])
      if (!silent) Toast.show({ type: 'success', text1: 'API ключі збережено!' })
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Не вдалося зберегти ключі' })
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateApiKey = async () => {
    try {
      setLoadingApis(true)
      const key = await generateApiKey()
      setApiKey(key)
      Toast.show({ type: 'success', text1: 'API ключ згенеровано!' })
    } catch {
      Toast.show({ type: 'error', text1: 'Не вдалося згенерувати' })
    } finally {
      setLoadingApis(false)
    }
  }

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

  const handleRemoveCategory = (cat: string) => {
    const current = getNestedSetting<string[]>('dashboard.pinnedCategories', [])
    updateNestedSetting('dashboard.pinnedCategories', current.filter(c => c !== cat))
  }

  const handleSyncBinance = async () => {
    try {
      Toast.show({ type: 'info', text1: 'Синхронізація Binance...' })
      const result = await apiFetch('/api/syncBinance', { method: 'POST' })
      if ((result as any).success) {
        Toast.show({ type: 'success', text1: 'Binance синхронізовано!' })
      } else {
        Toast.show({ type: 'info', text1: 'Нових транзакцій немає' })
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Не вдалося синхронізувати Binance' })
    }
  }

  const handleSyncMono = async () => {
    try {
      Toast.show({ type: 'info', text1: 'Синхронізація Monobank...' })
      await apiFetch('/api/syncMono', { method: 'POST' })
      Toast.show({ type: 'success', text1: 'Monobank синхронізовано!' })
    } catch {
      Toast.show({ type: 'error', text1: 'Не вдалося синхронізувати Monobank' })
    }
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

              {/* BINANCE API */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Binance API</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>API Key</Text>
                    <TextInput style={styles.inputField} value={binanceApiKey} onChangeText={setBinanceApiKey} secureTextEntry placeholder="Binance API Key" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={styles.rowBorder} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>API Secret</Text>
                    <TextInput style={styles.inputField} value={binanceApiSecret} onChangeText={setBinanceApiSecret} secureTextEntry placeholder="Binance API Secret" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={styles.rowBorder} />
                  <View style={styles.flexRow}>
                    <GlassPressable style={[styles.actionRowBtn, { flex: 1 }]} onPress={handleSyncBinance}>
                      <Text style={[styles.actionRowBtnText, { color: Colors.green }]}>Синхронізувати з Binance</Text>
                    </GlassPressable>
                  </View>
                </View>
              </View>

              {/* MONOBANK API */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Monobank API</Text>
                <View style={styles.cardGroup}>
                  <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Токен</Text>
                    <TextInput style={styles.inputField} value={monobankToken} onChangeText={setMonobankToken} secureTextEntry placeholder="X-Token" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={styles.rowBorder} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Black Card ID</Text>
                    <TextInput style={styles.inputField} value={monobankBlack} onChangeText={setMonobankBlack} placeholder="Black Card ID" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={styles.rowBorder} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>White Card ID</Text>
                    <TextInput style={styles.inputField} value={monobankWhite} onChangeText={setMonobankWhite} placeholder="White Card ID" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={styles.rowBorder} />
                  <View style={styles.flexRow}>
                    <GlassPressable style={[styles.actionRowBtn, { flex: 1 }]} onPress={handleSyncMono}>
                      <Text style={[styles.actionRowBtnText, { color: Colors.green }]}>Синхронізувати з Monobank</Text>
                    </GlassPressable>
                  </View>
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

                  {/* API KEY */}
                  <View style={styles.settingRowBlock}>
                    <Text style={[styles.settingLabelTitle, { marginBottom: 8 }]}>API Key віджетів</Text>
                    {loadingApis ? <ActivityIndicator color={Colors.orange} /> : apiKey ? (
                      <View style={styles.apiKeyBox}>
                        <Text style={styles.apiKeyText} numberOfLines={1}>{apiKeyVisible ? apiKey : '••••••••••••••••••••••••••••'}</Text>
                        <TouchableOpacity onPress={() => setApiKeyVisible(!apiKeyVisible)}>
                          <Text style={styles.toggleText}>{apiKeyVisible ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <GlassPressable style={styles.actionRowBtn} onPress={handleGenerateApiKey}>
                        <Text style={styles.actionRowBtnText}>Згенерувати API Key</Text>
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
  catChipRemove: { color: Colors.textMuted, fontSize: 12 },
  addCatRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  addCatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, color: Colors.white, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  addCatBtn: { width: 42, height: 42, backgroundColor: Colors.orange, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  addCatBtnText: { color: Colors.white, fontSize: 24, fontWeight: '700' },
  
  apiKeyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, padding: 14, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  apiKeyText: { flex: 1, color: Colors.white, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  toggleText: { fontSize: 20 },
})