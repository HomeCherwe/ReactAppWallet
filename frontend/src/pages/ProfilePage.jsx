import { useState, useEffect, useRef } from 'react'
import { supabase, invalidateUserCache } from '../lib/supabase'
import { motion } from 'framer-motion'
import { User, Mail, Save, Upload, Key, CreditCard, Copy, Eye, EyeOff, RefreshCw, BarChart3, LogOut, Landmark, CheckCircle, XCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUserAPIs, getApiKey, generateApiKey, updatePreferencesSection, invalidatePreferencesCache } from '../api/preferences'
import { getApiUrl, apiFetch } from '../utils.jsx'
import { useSettingsStore } from '../store/useSettingsStore'
import ConfirmModal from '../components/ConfirmModal'

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)

  // Ref to prevent double execution
  const waitingForTrueLayer = useRef(false)

  // API keys state
  const [binanceApiKey, setBinanceApiKey] = useState('')
  const [binanceApiSecret, setBinanceApiSecret] = useState('')
  const [monobankToken, setMonobankToken] = useState('')
  const [monobankBlackCardId, setMonobankBlackCardId] = useState('')
  const [monobankWhiteCardId, setMonobankWhiteCardId] = useState('')
  // TrueLayer state
  const [trueLayerClientId, setTrueLayerClientId] = useState('')
  const [trueLayerClientSecret, setTrueLayerClientSecret] = useState('')
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [trueLayerAccessToken, setTrueLayerAccessToken] = useState('')
  const [truelayerTokenChecking, setTruelayerTokenChecking] = useState(false)
  const [truelayerExpired, setTruelayerExpired] = useState(false)

  // Guide visibility state
  const [showBinanceGuide, setShowBinanceGuide] = useState(false)
  const [showMonobankGuide, setShowMonobankGuide] = useState(false)

  // Defaults - Live keys should be in Backend .env or entered manually
  const TRUELAYER_DEFAULT_ID = '' // 'appwallet-ddbe1e'
  const TRUELAYER_DEFAULT_SECRET = ''

  // API Key state
  const [apiKey, setApiKey] = useState(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyLoading, setApiKeyLoading] = useState(false)
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false)

  // Dashboard settings - використовуємо новий store
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const getNestedSetting = useSettingsStore((state) => state.getNestedSetting)
  const showUsdtInChart = getNestedSetting('dashboard.showUsdtInChart', true)

  // Logout modal
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        setDisplayName(
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          (user.email ? user.email.split('@')[0] : '')
        )
        setAvatarPreview(user.user_metadata?.avatar_url || null)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setDisplayName(
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.display_name ||
          (session.user.email ? session.user.email.split('@')[0] : '')
        )
        setAvatarPreview(session.user.user_metadata?.avatar_url || null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load API keys from separate APIs column
  const loadApiKeys = async () => {
    try {
      const APIs = await getUserAPIs()
      if (APIs) {
        // Binance API
        if (APIs.binance) {
          setBinanceApiKey(APIs.binance.api_key || '')
          setBinanceApiSecret(APIs.binance.api_secret || '')
        }

        // Monobank API
        if (APIs.monobank) {
          setMonobankToken(APIs.monobank.token || '')
          setMonobankBlackCardId(APIs.monobank.black_card_id || '')
          setMonobankWhiteCardId(APIs.monobank.white_card_id || '')
        }


        // TrueLayer API
        if (APIs.truelayer) {
          setTrueLayerClientId(APIs.truelayer.client_id || '')
          setTrueLayerClientSecret(APIs.truelayer.client_secret || '')

          // Only set the token if it's a REAL token (not a masked placeholder like "abcd****efgh")
          // The backend returns masked values in GET /api/preferences/apis
          // A real connected state comes from revolut_api column being non-null
          // We detect "connected" by whether the access_token field exists and is non-masked
          const rawToken = APIs.truelayer.access_token
          const isMaskedToken = typeof rawToken === 'string' && rawToken.includes('****')
          if (rawToken && !isMaskedToken) {
            // Real unmasked token (shouldn't normally happen from this endpoint)
            setTrueLayerAccessToken(rawToken)
            localStorage.setItem('truelayer_access_token', rawToken)
          } else if (rawToken && isMaskedToken) {
            // Token exists in DB (masked = real token is there), mark as connected
            // Use a sentinel value so UI shows "connected" state
            setTrueLayerAccessToken('__connected__')
          }
        } else {
          // Set defaults if not present
          setTrueLayerClientId(TRUELAYER_DEFAULT_ID)
          setTrueLayerClientSecret(TRUELAYER_DEFAULT_SECRET)
        }
      }
      setPrefsLoaded(true)
    } catch (e) {
      console.error('Failed to load API keys:', e)
      setPrefsLoaded(true)
    }
  }

  // Load API keys from separate APIs column
  useEffect(() => {
    loadApiKeys()
    loadApiKey()
    // Note: we do NOT load from localStorage here anymore — it caused the re-bind bug.
    // Token state is set only from DB (via loadApiKeys) or after successful exchange.
  }, [])

  // Handle Disconnect
  const handleDisconnectTrueLayer = async () => {
    if (!confirm('Ви дійсно хочете відключити Revolut? Ви більше не зможете синхронізувати транзакції.')) return

    const loadingToast = toast.loading('Відключення...')
    try {
      // Use backend endpoint — it uses service role key, guaranteed to bypass RLS
      const result = await apiFetch('/api/truelayer/disconnect', { method: 'DELETE' })

      if (!result?.success) {
        throw new Error(result?.error || 'Server returned failure')
      }

      // Clear local state and localStorage AFTER confirmed server-side deletion
      localStorage.removeItem('truelayer_access_token')
      setTrueLayerAccessToken('')
      setTruelayerExpired(false)

      // Invalidate preferences cache so next loadApiKeys gets fresh data from DB
      invalidatePreferencesCache()

      toast.dismiss(loadingToast)
      toast.success('Revolut успішно відключено')
    } catch (e) {
      toast.dismiss(loadingToast)
      console.error('Failed to disconnect TrueLayer:', e)
      toast.error('Не вдалося відключити: ' + e.message)
    }
  }

  // Dashboard settings - використовуємо новий store напряму
  // showUsdtInChart вже отримується з store через getNestedSetting

  // Handle TrueLayer Callback
  useEffect(() => {
    // Robust way to find 'code' in URL, regardless of Router type (Hash/Browser)
    // We check search params, hash params, and even a manual regex fallback

    console.log('🔄 Checking URL for code...')
    console.log('Current href:', window.location.href)
    console.log('Current hash:', window.location.hash)
    console.log('Current search:', window.location.search)

    let code = null

    // 1. Check standard search params (?code=...)
    const urlParams = new URLSearchParams(window.location.search)
    code = urlParams.get('code')

    // 2. Check hash params (#/profile?code=...)
    if (!code && window.location.hash.includes('?')) {
      const hashParts = window.location.hash.split('?')
      if (hashParts.length > 1) {
        // Fix: Use the part AFTER the ?
        const queryPart = hashParts[1]
        console.log('Parsing hash query:', queryPart)
        const hashParams = new URLSearchParams(queryPart)
        code = hashParams.get('code')
      }
    }

    // 3. Fallback: Manual regex (in case of weird duplications like /?code=...#/...)
    if (!code) {
      // Look for code=... anywhere in the string
      // Match code=VALUE up to & or end of string
      const match = window.location.href.match(/[?&]code=([^&]+)/)
      if (match) {
        code = match[1]
      }
    }

    if (code) {
      console.log('✅ Auth Code FOUND:', code)

      // Prevent multiple calls if code is already being processed
      if (waitingForTrueLayer.current) return

      waitingForTrueLayer.current = true

      toast.success('Код знайдено! Починаємо обмін...')
      // Call exchange function immediately
      handleTrueLayerExchange(code)

      // Clean URL logic
      const cleanUrl = window.location.href.replace(/[?&]code=[^&]+/, '').replace(/[?&]scope=[^&]+/, '')
      window.history.replaceState({}, document.title, cleanUrl)
    } else {
      console.log('❌ No code found in URL')
    }
  }, [prefsLoaded])

  const handleTrueLayerExchange = async (code) => {
    const loadingToast = toast.loading('Підключення до Revolut (TrueLayer)...')
    try {
      // For HashRouter, the redirect URI MUST MATCH what is registered in Console and what was used in the AUTH URL
      // We are using origin + '/#/profile'
      const redirectUri = window.location.origin + '/#/profile'

      console.log('Exchanging code:', code)
      console.log('Using Redirect URI:', redirectUri)

      // We do NOT send client_id/secret here anymore. The backend uses defaults from .env
      const response = await apiFetch('/api/truelayer/exchange', {
        method: 'POST',
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri
        })
      })

      if (response.access_token) {
        toast.success('Revolut успішно підключено!')
        console.log('TrueLayer Token Data:', response)

        // Save token for testing
        setTrueLayerAccessToken(response.access_token)
        localStorage.setItem('truelayer_access_token', response.access_token)

        // Verify storage immediately
        const stored = localStorage.getItem('truelayer_access_token')
        console.log('📦 Token saved to localStorage:', stored ? 'YES' : 'NO', stored)

        // Show token info for debug
        setTrueLayerData({ endpoint: 'Token Info', data: { expires_in: response.expires_in, scope: response.scope } })

        toast.success('Токен отримано! Тепер ви можете протестувати отримання даних.')
      } else {
        console.error('Exchange failed:', response)
        // If the error is 'invalid_grant', it might mean the code is expired or redirect URI mismatch
        toast.error('Помилка підключення: ' + (response.error || 'Unknown error'))
      }
    } catch (e) {
      console.error('TrueLayer logic error:', e)
      toast.error('Помилка підключення')
    } finally {
      toast.dismiss(loadingToast)
      waitingForTrueLayer.current = false
    }
  }

  // Check TrueLayer token validity on mount (after prefs loaded)
  useEffect(() => {
    if (!prefsLoaded || !trueLayerAccessToken) return

    const checkValidity = async () => {
      setTruelayerTokenChecking(true)
      try {
        const result = await apiFetch('/api/truelayer/check-token')
        if (result?.connected === false) {
          if (result.reason === 'consent_expired' || result.reason === 'no_token') {
            // Token expired or cleared server-side
            setTrueLayerAccessToken('')
            localStorage.removeItem('truelayer_access_token')
            setTruelayerExpired(true)
            if (result.reason === 'consent_expired') {
              toast('⚠️ Термін дії підключення Revolut сплив (90 днів). Підключіть знову.', {
                duration: 8000,
                icon: '🔄'
              })
            }
          }
        } else if (result?.connected === true) {
          setTruelayerExpired(false)
        }
      } catch (e) {
        console.warn('[TrueLayer] Token check failed:', e.message)
      } finally {
        setTruelayerTokenChecking(false)
      }
    }

    checkValidity()
  }, [prefsLoaded, trueLayerAccessToken])

  // Load API Key
  const loadApiKey = async () => {
    setApiKeyLoading(true)
    try {
      const result = await getApiKey()
      if (result.success && result.has_api_key) {
        setApiKey(result.api_key)
      } else {
        setApiKey(null)
      }
    } catch (e) {
      console.error('Failed to load API key:', e)
      setApiKey(null)
    } finally {
      setApiKeyLoading(false)
    }
  }

  // Generate new API Key
  const handleGenerateApiKey = async () => {
    if (!confirm('Створити новий API ключ? Старий ключ буде замінений і перестане працювати.')) {
      return
    }

    setApiKeyGenerating(true)
    try {
      const result = await generateApiKey()
      if (result.success && result.api_key) {
        setApiKey(result.api_key)
        toast.success('API ключ успішно згенеровано! Збережіть його в безпечному місці.')
      } else {
        toast.error(result.message || 'Не вдалося згенерувати API ключ')
      }
    } catch (e) {
      console.error('Failed to generate API key:', e)
      toast.error('Не вдалося згенерувати API ключ')
    } finally {
      setApiKeyGenerating(false)
    }
  }

  // Copy API Key to clipboard
  const handleCopyApiKey = async () => {
    if (!apiKey) return
    try {
      await navigator.clipboard.writeText(apiKey)
      toast.success('API ключ скопійовано в буфер обміну!')
    } catch (e) {
      console.error('Failed to copy API key:', e)
      toast.error('Не вдалося скопіювати API ключ')
    }
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Розмір файлу перевищує 5MB. Будь ласка, виберіть менший файл.')
      return
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Будь ласка, виберіть файл зображення.')
      return
    }

    setAvatarFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  // Helper function to compress image
  const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.8) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              resolve(blob || file)
            },
            file.type,
            quality
          )
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    try {
      let avatarUrl = user.user_metadata?.avatar_url

      // Upload avatar if changed
      if (avatarFile) {
        // Compress image before upload
        const compressedFile = await compressImage(avatarFile)

        // Get file extension from original file or determine from MIME type
        const originalExt = avatarFile.name.split('.').pop()?.toLowerCase()
        const mimeExt = avatarFile.type.includes('png') ? 'png' :
          avatarFile.type.includes('gif') ? 'gif' : 'jpg'
        const fileExt = originalExt || mimeExt
        const fileName = `${user.id}-${Date.now()}.${fileExt}`

        // Delete old avatar if exists (only if it's in Storage, not base64)
        if (avatarUrl && avatarUrl.includes('/storage/v1/object/public/avatars/')) {
          // Extract filename from URL (handles both with and without query params)
          const urlParts = avatarUrl.split('/avatars/')
          if (urlParts.length > 1) {
            const oldFileName = urlParts[1].split('?')[0].split('#')[0]
            if (oldFileName && oldFileName.startsWith(user.id)) {
              try {
                await supabase.storage.from('avatars').remove([oldFileName])
              } catch (e) {
                console.warn('Failed to delete old avatar:', e)
                // Don't throw - continue with upload even if deletion fails
              }
            }
          }
        }

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, compressedFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('Upload error:', uploadError)
          console.error('Upload details:', {
            fileName,
            userId: user.id,
            bucket: 'avatars',
            errorMessage: uploadError.message,
            errorStatus: uploadError.statusCode
          })

          // Check if bucket doesn't exist
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            throw new Error(
              'Bucket "avatars" не знайдено в Supabase Storage. ' +
              'Будь ласка, створіть bucket через Supabase Dashboard: ' +
              'Storage → Create Bucket → назва "avatars" → Public bucket = true'
            )
          }

          // Check if RLS policy violation
          if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('RLS')) {
            throw new Error(
              'Помилка політики безпеки (RLS). ' +
              'Будь ласка, переконайтеся, що ви виконали SQL скрипт з файлу SUPABASE_STORAGE_SETUP.sql ' +
              'в SQL Editor Supabase Dashboard для налаштування політик доступу до Storage.'
            )
          }

          // Other errors
          throw new Error(`Не вдалося завантажити аватар: ${uploadError.message || 'Невідома помилка'}`)
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName)

        avatarUrl = urlData.publicUrl
      }

      // Update user metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName,
          display_name: displayName,
          avatar_url: avatarUrl
        }
      })

      if (error) throw error

      // Save API keys to preferences
      const apis = {
        binance: {
          api_key: binanceApiKey.trim(),
          api_secret: binanceApiSecret.trim()
        },
        monobank: {
          token: monobankToken.trim(),
          black_card_id: monobankBlackCardId.trim(),
          white_card_id: monobankWhiteCardId.trim()
        }
        // TrueLayer keys are handled via .env and backend now
      }

      await updatePreferencesSection('apis', apis)

      toast.success('Профіль оновлено!')

      // Refresh user data
      const { data: { user: updatedUser } } = await supabase.auth.getUser()
      if (updatedUser) {
        setUser(updatedUser)
        setAvatarPreview(updatedUser.user_metadata?.avatar_url || null)
      }

      // Reload API keys to get masked versions from backend
      invalidatePreferencesCache()
      await loadApiKeys()

    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Не вдалося оновити профіль')
    } finally {
      setSaving(false)
    }
  }

  const handleConnectTrueLayer = () => {
    // This Client ID is public and safe to use in frontend purely for redirection URL construction
    const clientId = 'appwallet-ddbe1e'

    // ВАЖЛИВО: Для HashRouter ми МАЄМО вказати # в redirect URI
    // TrueLayer поверне користувача сюди
    const redirectUri = window.location.origin + '/#/profile'

    // Scopes: info accounts balance cards transactions direct_debits standing_orders offline_access
    const scope = 'info accounts balance cards transactions direct_debits standing_orders offline_access'

    // LIVE URL (Production) - Updated for France support
    // Providers: uk-ob-all, uk-oauth-all, fr-ob-revolut
    const authUrl = `https://auth.truelayer.com/?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&providers=uk-ob-all%20uk-oauth-all%20fr-ob-revolut`

    console.log('--- TrueLayer Connect Debug (LIVE - France) ---')
    console.log('Client ID:', clientId)
    console.log('Redirect URI:', redirectUri)
    console.log('Auth URL:', authUrl)
    console.log('-------------------------------')

    if (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')) {
      // Інформаційне повідомлення
      console.info(`Redirect URI: ${redirectUri}`)
    }

    window.location.href = authUrl
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    invalidateUserCache() // Очистити кеш користувача
    setShowLogoutModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl shadow-soft border border-gray-200 p-6"
    >
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <User size={24} />
        Налаштування профілю
      </h2>

      <div className="space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-gray-200">
          <div className="flex-shrink-0">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Фото профілю
            </label>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
              <Upload size={16} className="text-gray-600" />
              <span className="text-sm text-gray-700">Завантажити фото</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">JPG, PNG або GIF. Макс. 5MB</p>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ім'я
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Введіть ваше ім'я"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            />
          </div>
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Email не можна змінити</p>
        </div>

        {/* Binance API Section */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key size={20} className="text-yellow-600" />
              <h3 className="text-lg font-semibold text-gray-900">Binance API</h3>
            </div>
            <button
              onClick={() => setShowBinanceGuide(!showBinanceGuide)}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
            >
              <HelpCircle size={16} />
              <span>Як отримати ключі?</span>
              {showBinanceGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Binance Guide */}
          <motion.div
            initial={false}
            animate={{ height: showBinanceGuide ? 'auto' : 0, opacity: showBinanceGuide ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-gray-800">
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <ExternalLink size={16} />
                Інструкція отримання ключів Binance:
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Перейдіть на сторінку <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">API Management</a>.</li>
                <li>Натисніть <strong>Create API</strong> та виберіть <strong>System Generated</strong>.</li>
                <li>Введіть назву (наприклад: <code>WalletApp</code>) та пройдіть верифікацію.</li>
                <li>Скопіюйте <strong>API Key</strong> та <strong>Secret Key</strong>. <span className="text-red-600 font-medium">Важливо: Secret Key показується тільки один раз!</span></li>
                <li>У налаштуваннях API поставте галочку <strong>Enable Reading</strong> (зазвичай увімкнено за замовчуванням).</li>
                <li>Вставте ключі у поля нижче та натисніть <strong>Зберегти зміни</strong>.</li>
              </ol>
            </div>
          </motion.div>

          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="text"
                value={binanceApiKey}
                onChange={(e) => setBinanceApiKey(e.target.value)}
                placeholder="Введіть Binance API Key"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Secret
              </label>
              <input
                type="text"
                value={binanceApiSecret}
                onChange={(e) => setBinanceApiSecret(e.target.value)}
                placeholder="Введіть Binance API Secret"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition"
              />
            </div>
            <p className="text-xs text-gray-500">
              Ключі зберігаються безпечно в вашому обліковому записі
            </p>
          </div>
        </div>

        {/* Monobank API Section */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Monobank API</h3>
            </div>
            <button
              onClick={() => setShowMonobankGuide(!showMonobankGuide)}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
            >
              <HelpCircle size={16} />
              <span>Як отримати токен?</span>
              {showMonobankGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Monobank Guide */}
          <motion.div
            initial={false}
            animate={{ height: showMonobankGuide ? 'auto' : 0, opacity: showMonobankGuide ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 text-sm text-gray-800">
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <ExternalLink size={16} />
                Інструкція отримання токена Monobank:
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Перейдіть на офіційний сайт <a href="https://api.monobank.ua/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">api.monobank.ua</a>.</li>
                <li>Відскануйте QR-код через мобільний додаток Monobank.</li>
                <li>Підтвердіть вхід у додатку.</li>
                <li>Після входу скопіюйте довгий рядок під назвою <strong>Токен для особистого використання</strong>.</li>
                <li>Вставте цей токен у поле нижче. ID карток можна буде отримати автоматично після збереження.</li>
              </ol>
            </div>
          </motion.div>

          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monobank Token
              </label>
              <input
                type="text"
                value={monobankToken}
                onChange={(e) => setMonobankToken(e.target.value)}
                placeholder="Введіть Monobank Token"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID Чорної картки
              </label>
              <input
                type="text"
                value={monobankBlackCardId}
                onChange={(e) => setMonobankBlackCardId(e.target.value)}
                placeholder="Введіть ID чорної картки"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID Білої картки
              </label>
              <input
                type="text"
                value={monobankWhiteCardId}
                onChange={(e) => setMonobankWhiteCardId(e.target.value)}
                placeholder="Введіть ID білої картки"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>
            <p className="text-xs text-gray-500">
              Token та ID карток зберігаються безпечно в вашому обліковому записі
            </p>
          </div>
        </div>

        {/* TrueLayer API Section */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Landmark size={20} className="text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">TrueLayer API (Revolut)</h3>
          </div>
          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div className="pt-2">
              <p className="text-sm text-gray-700 mb-4">
                Підключіть ваш обліковий запис Revolut через TrueLayer для синхронізації балансу та транзакцій.
                TrueLayer надає доступ на <strong>90 днів</strong> — після чого потрібно підключити знову.
              </p>

              {/* Expiry banner — stays permanently until reconnected */}
              {truelayerExpired && (
                <div className="mb-4 flex items-start gap-3 bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
                  <AlertTriangle size={22} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-amber-900">⚠️ Revolut відключено — термін дозволу (90 днів) сплив</h4>
                    <p className="text-xs text-amber-800 mt-1">
                      Синхронізація транзакцій Revolut призупинена. Натисніть кнопку нижче для повторного підключення.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectTrueLayer}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                    >
                      <Landmark size={16} />
                      Підключити Revolut знову
                    </button>
                  </div>
                </div>
              )}

              {!truelayerExpired && trueLayerAccessToken ? (
                <div className="flex items-center justify-between bg-white border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      {truelayerTokenChecking
                        ? <RefreshCw size={18} className="animate-spin" />
                        : <CheckCircle size={20} />
                      }
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Revolut підключено</h4>
                      <p className="text-xs text-gray-500">
                        {truelayerTokenChecking ? 'Перевірка статусу токену...' : 'Автоматична синхронізація активна'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectTrueLayer}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-md transition-colors border border-red-200"
                  >
                    <XCircle size={14} />
                    Відключити
                  </button>
                </div>
              ) : !truelayerExpired ? (
                <button
                  type="button"
                  onClick={handleConnectTrueLayer}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  <Landmark size={16} />
                  Підключити Revolut
                </button>
              ) : null}
            </div>

            <p className="text-xs text-gray-400 mt-2">
              Використовується TrueLayer Live. Redirect URI: {window.location.origin}/#/profile
            </p>
          </div>

        </div>

        {/* Dashboard Settings Section */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Налаштування дашборду</h3>
          </div>
          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Показувати USDT в графіку (режим ALL)
                </label>
                <p className="text-xs text-gray-500">
                  Коли вибрано "ALL" в графіку витрат і доходів, показувати USDT разом з іншими валютами
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={showUsdtInChart}
                  onChange={(e) => {
                    const newValue = e.target.checked
                    // Оновлюємо локальний стейт (джерело правди) - автоматично зберігається через debounce
                    updateNestedSetting('dashboard.showUsdtInChart', newValue)
                    toast.success('Налаштування збережено')
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* API Key Section для автоматизації */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Key size={20} className="text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">API Key для автоматизації</h3>
          </div>
          <div className="space-y-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-700 mb-4">
              API Key дозволяє автоматично синхронізувати транзакції з Monobank через iPhone Shortcuts або інші автоматизації.
              Ключ не має терміну дії, на відміну від JWT токену.
            </p>

            {/* API URL для зручності */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API URL (для використання в автоматизаціях)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  defaultValue={getApiUrl()}
                  onChange={(e) => {
                    const newUrl = e.target.value.trim()
                    if (newUrl) {
                      localStorage.setItem('api_url_override', newUrl)
                      toast.success('API URL збережено! Перезавантажте сторінку.')
                    } else {
                      localStorage.removeItem('api_url_override')
                      toast.success('API URL скинуто до значення за замовчуванням')
                    }
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-white font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  placeholder="http://192.168.1.100:8787"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(getApiUrl())
                      toast.success('API URL скопійовано!')
                    } catch (e) {
                      toast.error('Не вдалося скопіювати URL')
                    }
                  }}
                  className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Скопіювати URL"
                >
                  <Copy size={18} className="text-gray-600" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('api_url_override')
                    toast.success('API URL скинуто! Перезавантажте сторінку.')
                    setTimeout(() => window.location.reload(), 1000)
                  }}
                  className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  title="Скинути до значення за замовчуванням"
                >
                  ↻
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Використай цей URL разом з API Key для налаштування автоматизації.
                <br />
                <span className="text-amber-600 font-medium">На мобільних:</span> введіть IP-адресу вашого комп'ютера (наприклад: http://192.168.1.100:8787)
              </p>
            </div>

            {apiKeyLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
              </div>
            ) : apiKey ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ваш API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      value={apiKey}
                      readOnly
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-white font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyVisible(!apiKeyVisible)}
                      className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title={apiKeyVisible ? 'Приховати' : 'Показати'}
                    >
                      {apiKeyVisible ? <EyeOff size={18} className="text-gray-600" /> : <Eye size={18} className="text-gray-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyApiKey}
                      className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Скопіювати"
                    >
                      <Copy size={18} className="text-gray-600" />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateApiKey}
                  disabled={apiKeyGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={16} className={apiKeyGenerating ? 'animate-spin' : ''} />
                  {apiKeyGenerating ? 'Генерація...' : 'Створити новий ключ'}
                </button>
                <p className="text-xs text-gray-600">
                  ⚠️ При створенні нового ключа старий перестане працювати
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  У вас поки немає API ключа. Створіть його для використання в автоматизаціях.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateApiKey}
                  disabled={apiKeyGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Key size={16} />
                  {apiKeyGenerating ? 'Генерація...' : 'Створити API Key'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Збереження...' : 'Зберегти зміни'}
          </motion.button>
        </div>

        {/* Logout Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
          >
            <LogOut size={18} />
            Вийти з акаунту
          </motion.button>
        </div>
      </div>

      <ConfirmModal
        open={showLogoutModal}
        onConfirm={handleSignOut}
        onCancel={() => setShowLogoutModal(false)}
        title="Вихід з акаунту"
        message="Ви справді хочете вийти з акаунту?"
        confirmLabel="Вийти"
        cancelLabel="Скасувати"
        danger={true}
      />
    </motion.div>
  )
}

