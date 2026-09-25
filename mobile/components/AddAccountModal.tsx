import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Toast from 'react-native-toast-message'
import * as WebBrowser from 'expo-web-browser'
import { Colors } from '../constants/theme'
import { BankProvider, connectBank, connectBankWithToken, listBankProviders } from '../api/bankConnections'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import BankLogo from './BankLogo'

const COUNTRIES: Record<string, { name: string; flag: string }> = {
  fr: { name: 'Франція', flag: '🇫🇷' },
  ua: { name: 'Україна', flag: '🇺🇦' },
  uk: { name: 'Велика Британія', flag: '🇬🇧' },
  de: { name: 'Німеччина', flag: '🇩🇪' },
  es: { name: 'Іспанія', flag: '🇪🇸' },
  nl: { name: 'Нідерланди', flag: '🇳🇱' },
  ie: { name: 'Ірландія', flag: '🇮🇪' },
  be: { name: 'Бельгія', flag: '🇧🇪' },
  it: { name: 'Італія', flag: '🇮🇹' },
  at: { name: 'Австрія', flag: '🇦🇹' },
  pl: { name: 'Польща', flag: '🇵🇱' },
  pt: { name: 'Португалія', flag: '🇵🇹' },
  se: { name: 'Швеція', flag: '🇸🇪' },
  fi: { name: 'Фінляндія', flag: '🇫🇮' },
  lt: { name: 'Литва', flag: '🇱🇹' },
  ee: { name: 'Естонія', flag: '🇪🇪' },
}

const CONNECT_ERRORS: Record<string, string> = {
  access_denied: 'Доступ не надано в банку',
  exchange_failed: 'Банк не підтвердив підключення. Спробуйте ще раз',
}

interface AddAccountModalProps {
  visible: boolean
  onClose: () => void
  /** Called after a bank was connected */
  onConnected: (bankName: string) => void
  /** "Власний рахунок" chosen: open the manual card form */
  onManual: () => void
  connectedProviderIds: string[]
  defaultCountry?: string
  /** Open straight on this bank's token form (reconnecting Monobank) */
  initialProvider?: BankProvider | null
}

/**
 * "Додати" on the cards screen: connect a real bank with automatic sync (catalog as the next
 * step in the same sheet), or add your own account kept up to date manually.
 */
export default function AddAccountModal({
  visible,
  onClose,
  onConnected,
  onManual,
  connectedProviderIds,
  defaultCountry = 'fr',
  initialProvider = null,
}: AddAccountModalProps) {
  const [step, setStep] = useState<'choice' | 'catalog' | 'token'>('choice')
  const [tokenProvider, setTokenProvider] = useState<BankProvider | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [providers, setProviders] = useState<BankProvider[] | null>(null)
  const [error, setError] = useState(false)
  const [country, setCountry] = useState(defaultCountry)
  const [query, setQuery] = useState('')
  const [connectingId, setConnectingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setStep(initialProvider ? 'token' : 'choice')
    setTokenProvider(initialProvider)
    setToken('')
    setShowToken(false)
    setQuery('')
    setCountry(defaultCountry)
    // Prefetch the catalog while the user reads the choice
    if (providers) return
    setError(false)
    listBankProviders()
      .then(setProviders)
      .catch(() => setError(true))
  }, [visible])

  // Countries that actually have banks, in our preferred order
  const countries = useMemo(() => {
    const present = new Set((providers ?? []).map(p => p.country))
    return Object.keys(COUNTRIES).filter(c => present.has(c))
  }, [providers])

  // Search looks through every country; otherwise show the selected country
  const visibleProviders = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = providers ?? []
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list.filter(p => p.country === country)
  }, [providers, country, query])

  const handleConnect = async (p: BankProvider) => {
    triggerLightHaptic()
    if (p.auth === 'token') {
      // Monobank: personal token instead of a bank login
      setTokenProvider(p)
      setToken('')
      setStep('token')
      return
    }
    setConnectingId(p.provider_id)
    try {
      const result = await connectBank(p.provider_id)
      if (result.status === 'ok') {
        triggerSuccessHaptic()
        Toast.show({ type: 'success', text1: `${result.bankName || p.name} підключено` })
        onConnected(result.bankName || p.name)
        onClose()
      } else if (result.status === 'error') {
        triggerErrorHaptic()
        Toast.show({
          type: 'error',
          text1: `Не вдалося підключити ${p.name}`,
          text2: CONNECT_ERRORS[result.message] ?? result.message,
        })
      }
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: `Не вдалося підключити ${p.name}`, text2: e?.message })
    } finally {
      setConnectingId(null)
    }
  }

  const handleTokenConnect = async () => {
    if (!tokenProvider || !token.trim()) return
    setTokenBusy(true)
    try {
      const res = await connectBankWithToken(tokenProvider.provider_id, token.trim())
      triggerSuccessHaptic()
      Toast.show({ type: 'success', text1: `${res.bank_name || tokenProvider.name} підключено`, text2: 'Завантажуємо транзакції…' })
      setToken('')
      onConnected(res.bank_name || tokenProvider.name)
      onClose()
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: `Не вдалося підключити ${tokenProvider.name}`, text2: e?.message })
    } finally {
      setTokenBusy(false)
    }
  }

  const goBack = () => {
    if (step === 'token') {
      if (initialProvider) onClose()
      else setStep('catalog')
    } else {
      setStep('choice')
    }
  }

  const title =
    step === 'token' ? tokenProvider?.name ?? 'Банк' : step === 'catalog' ? 'Підключити банк' : 'Додати рахунок'

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      sheetStyle={step === 'catalog' ? styles.sheetTall : styles.sheet}
    >
      <View style={styles.header}>
        {step !== 'choice' && !(step === 'token' && initialProvider) ? (
          <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Назад</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      {step === 'choice' ? (
        <View style={styles.choices}>
          <Pressable
            onPress={() => {
              triggerLightHaptic()
              setStep('catalog')
            }}
            style={({ pressed }) => [styles.option, styles.optionPrimary, pressed && styles.optionPressed]}
          >
            <View style={[styles.optionIcon, styles.optionIconPrimary]}>
              <Text style={styles.optionEmoji}>🔄</Text>
            </View>
            <View style={styles.optionText}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>Підключити банк</Text>
                <Text style={styles.badge}>РЕКОМЕНДОВАНО</Text>
              </View>
              <Text style={styles.optionDesc}>
                Транзакції й баланс підтягуються автоматично. Monobank, Revolut, Wise, BNP Paribas, Monzo та ще 80+ банків.
              </Text>
              <Text style={styles.optionNote}>🔒 Open Banking · лише читання</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerLightHaptic()
              onManual()
            }}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          >
            <View style={styles.optionIcon}>
              <Text style={styles.optionEmoji}>✍️</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Власний рахунок</Text>
              <Text style={styles.optionDesc}>
                Готівка, скарбничка або банк без синхронізації — транзакції ви додаєте самі.
              </Text>
            </View>
          </Pressable>
        </View>
      ) : step === 'token' && tokenProvider ? (
        <View style={styles.tokenWrap}>
          <View style={styles.tokenBank}>
            <BankLogo uri={tokenProvider.logo} name={tokenProvider.name} size={48} />
            <View style={styles.rowText}>
              <Text style={styles.bankName}>{tokenProvider.name}</Text>
              <Text style={styles.bankMeta}>🇺🇦 Підключення через персональний токен</Text>
            </View>
          </View>

          {[
            'Відкрийте api.monobank.ua (кнопка нижче)',
            'Увійдіть через застосунок Monobank і підтвердьте вхід',
            'Скопіюйте токен, поверніться сюди й вставте його',
          ].map((text, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}

          <Pressable
            onPress={() => {
              triggerLightHaptic()
              WebBrowser.openBrowserAsync('https://api.monobank.ua/').catch(() => {})
            }}
            style={({ pressed }) => [styles.linkBtn, pressed && styles.optionPressed]}
          >
            <Text style={styles.linkBtnText}>Відкрити api.monobank.ua ↗</Text>
          </Pressable>

          <View style={styles.tokenInputBox}>
            <TextInput
              style={styles.tokenInput}
              placeholder="Вставте токен"
              placeholderTextColor="rgba(255, 255, 255, 0.35)"
              value={token}
              onChangeText={setToken}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="none"
              returnKeyType="done"
              onSubmitEditing={handleTokenConnect}
            />
            <Pressable onPress={() => setShowToken(v => !v)} hitSlop={10}>
              <Text style={styles.eye}>{showToken ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleTokenConnect}
            disabled={tokenBusy || !token.trim()}
            style={({ pressed }) => [
              styles.connectBtn,
              (tokenBusy || !token.trim()) && styles.connectBtnDisabled,
              pressed && styles.optionPressed,
            ]}
          >
            {tokenBusy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.connectBtnText}>Підключити {tokenProvider.name}</Text>
            )}
          </Pressable>

          <Text style={styles.tokenNote}>
            🔒 Токен дає доступ лише на читання — баланс і виписка, жодних платежів. Зберігається зашифрованим;
            відкликати можна будь-коли на api.monobank.ua.
          </Text>
        </View>
      ) : (
      <>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук банку"
          placeholderTextColor="rgba(255, 255, 255, 0.35)"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {!query && countries.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.countries}
          style={styles.countriesScroll}
        >
          {countries.map(c => {
            const active = c === country
            return (
              <Pressable
                key={c}
                onPress={() => setCountry(c)}
                style={[styles.countryChip, active && styles.countryChipActive]}
              >
                <Text style={[styles.countryText, active && styles.countryTextActive]}>
                  {COUNTRIES[c].flag} {COUNTRIES[c].name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {error ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>Не вдалося завантажити список банків</Text>
          <Pressable
            onPress={() => {
              setError(false)
              listBankProviders().then(setProviders).catch(() => setError(true))
            }}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Спробувати ще раз</Text>
          </Pressable>
        </View>
      ) : !providers ? (
        <View style={styles.state}>
          <ActivityIndicator color={Colors.orange} />
        </View>
      ) : (
        <FlatList
          data={visibleProviders}
          keyExtractor={p => p.provider_id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Нічого не знайдено</Text>}
          renderItem={({ item: p }) => {
            const connected = connectedProviderIds.includes(p.provider_id)
            const busy = connectingId === p.provider_id
            return (
              <Pressable
                onPress={() => !connected && !connectingId && handleConnect(p)}
                style={({ pressed }) => [styles.row, pressed && !connected && styles.rowPressed]}
              >
                <BankLogo uri={p.logo} name={p.name} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.bankName}>{p.name}</Text>
                  {query || p.auth === 'token' ? (
                    <Text style={styles.bankMeta}>
                      {[query ? COUNTRIES[p.country]?.name ?? p.country.toUpperCase() : null, p.auth === 'token' ? 'через токен api.monobank.ua' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {busy ? (
                  <ActivityIndicator color={Colors.orange} />
                ) : connected ? (
                  <Text style={styles.connected}>Підключено</Text>
                ) : (
                  <Text style={styles.chevron}>›</Text>
                )}
              </Pressable>
            )
          }}
        />
      )}

      <Text style={styles.footnote}>
        {country === 'ua' && !query
          ? 'Monobank підключається через персональний токен — лише читання, без терміну дії.'
          : 'Підключення через TrueLayer (Open Banking). Ви входите у свій банк напряму — застосунок не бачить ваш пароль. Доступ лише на читання, діє 90 днів.'}
      </Text>
      </>
      )}
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  // Catalog step: tall fixed height so the list can scroll
  sheetTall: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    height: '88%',
  },
  backBtn: {
    paddingRight: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.orange,
  },
  choices: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  optionPrimary: {
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    borderColor: 'rgba(255, 107, 0, 0.45)',
  },
  optionPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconPrimary: {
    backgroundColor: Colors.orange,
  },
  optionEmoji: {
    fontSize: 20,
  },
  optionText: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  badge: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Colors.orange,
    backgroundColor: 'rgba(255, 107, 0, 0.16)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  optionDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSub,
    marginTop: 4,
  },
  optionNote: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
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
  closeText: {
    color: Colors.white80,
    fontSize: 15,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchIcon: {
    fontSize: 13,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: Colors.white,
    fontSize: 15,
  },
  searchClear: {
    fontSize: 13,
    color: Colors.white60,
  },
  countriesScroll: {
    flexGrow: 0,
    marginTop: 12,
  },
  countries: {
    paddingHorizontal: 16,
    gap: 8,
  },
  countryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  countryChipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
    borderColor: 'rgba(255, 107, 0, 0.5)',
  },
  countryText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  countryTextActive: {
    color: Colors.white,
  },
  list: {
    flex: 1,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  rowText: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  bankMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  connected: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.green,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  stateText: {
    fontSize: 14,
    color: Colors.textSub,
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.orange,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    paddingVertical: 30,
  },
  tokenWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    gap: 12,
  },
  tokenBank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.orange,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.white80,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.orange,
  },
  tokenInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  tokenInput: {
    flex: 1,
    paddingVertical: 13,
    color: Colors.white,
    fontSize: 15,
  },
  eye: {
    fontSize: 17,
  },
  connectBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnDisabled: {
    opacity: 0.45,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
  },
  tokenNote: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textMuted,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
  },
})
