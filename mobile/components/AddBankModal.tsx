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
import { Colors } from '../constants/theme'
import { BankProvider, connectBank, listBankProviders } from '../api/bankConnections'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import BankLogo from './BankLogo'

const COUNTRIES: Record<string, { name: string; flag: string }> = {
  fr: { name: 'Франція', flag: '🇫🇷' },
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

interface AddBankModalProps {
  visible: boolean
  onClose: () => void
  /** Called after a bank was connected */
  onConnected: (bankName: string) => void
  connectedProviderIds: string[]
  defaultCountry?: string
}

export default function AddBankModal({
  visible,
  onClose,
  onConnected,
  connectedProviderIds,
  defaultCountry = 'fr',
}: AddBankModalProps) {
  const [providers, setProviders] = useState<BankProvider[] | null>(null)
  const [error, setError] = useState(false)
  const [country, setCountry] = useState(defaultCountry)
  const [query, setQuery] = useState('')
  const [connectingId, setConnectingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setQuery('')
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

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>Додати банк</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

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
                  {query ? <Text style={styles.bankMeta}>{COUNTRIES[p.country]?.name ?? p.country.toUpperCase()}</Text> : null}
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
        Підключення через TrueLayer (Open Banking). Ви входите у свій банк напряму — застосунок не бачить ваш
        пароль. Доступ лише на читання, діє 90 днів.
      </Text>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    height: '88%',
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
  footnote: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
  },
})
