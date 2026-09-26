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

  // API keys state
  const [binanceApiKey, setBinanceApiKey] = useState('')
  const [binanceApiSecret, setBinanceApiSecret] = useState('')
  const [monobankToken, setMonobankToken] = useState('')
  const [monobankBlackCardId, setMonobankBlackCardId] = useState('')
  const [monobankWhiteCardId, setMonobankWhiteCardId] = useState('')

  // Guide visibility state
  const [showBinanceGuide, setShowBinanceGuide] = useState(false)
  const [showMonobankGuide, setShowMonobankGuide] = useState(false)

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
  const pinnedCategories = getNestedSetting('dashboard.pinnedCategories', [])

  const [newCategoryInput, setNewCategoryInput] = useState('')

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


      }
    } catch (e) {
      console.error('Failed to load API keys:', e)
    }
  }

  // Load API keys from separate APIs column
  useEffect(() => {
    loadApiKeys()
    loadApiKey()
    // Note: we do NOT load from localStorage here anymore — it caused the re-bind bug.
    // Token state is set only from DB (via loadApiKeys) or after successful exchange.
  }, [])

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    invalidateUserCache() // Очистити кеш користувача
    setShowLogoutModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl rounded-3xl shadow-glass p-6 border border-white/10"
    >
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <User size={24} />
        Налаштування профілю
      </h2>

      <div className="space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-white/10">
          <div className="flex-shrink-0">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="h-20 w-20 rounded-full object-cover border-2 border-white/10"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center text-white text-2xl font-bold">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/85 mb-2">
              Фото профілю
            </label>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg cursor-pointer transition-colors">
              <Upload size={16} className="text-white/70" />
              <span className="text-sm text-white/85">Завантажити фото</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-white/55 mt-1">JPG, PNG або GIF. Макс. 5MB</p>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-white/85 mb-2">
            Ім'я
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Введіть ваше ім'я"
              className="w-full pl-10 pr-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
            />
          </div>
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-white/85 mb-2">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full pl-10 pr-4 py-2.5 border border-white/[0.14] rounded-lg bg-white/[0.03] text-white/55 cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-white/55 mt-1">Email не можна змінити</p>
        </div>

        {/* Binance API Section */}
        <div className="pt-6 border-t border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key size={20} className="text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Binance API</h3>
            </div>
            <button
              onClick={() => setShowBinanceGuide(!showBinanceGuide)}
              className="flex items-center gap-1 text-sm text-brand hover:text-brand-light font-medium bg-brand/10 hover:bg-brand/15 px-3 py-1.5 rounded-full transition-colors"
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
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-lg p-4 mb-6 text-sm text-white">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <ExternalLink size={16} />
                Інструкція отримання ключів Binance:
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Перейдіть на сторінку <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">API Management</a>.</li>
                <li>Натисніть <strong>Create API</strong> та виберіть <strong>System Generated</strong>.</li>
                <li>Введіть назву (наприклад: <code>WalletApp</code>) та пройдіть верифікацію.</li>
                <li>Скопіюйте <strong>API Key</strong> та <strong>Secret Key</strong>. <span className="text-red-400 font-medium">Важливо: Secret Key показується тільки один раз!</span></li>
                <li>У налаштуваннях API поставте галочку <strong>Enable Reading</strong> (зазвичай увімкнено за замовчуванням).</li>
                <li>Вставте ключі у поля нижче та натисніть <strong>Зберегти зміни</strong>.</li>
              </ol>
            </div>
          </motion.div>

          <div className="space-y-4 bg-white/[0.03] rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
                API Key
              </label>
              <input
                type="text"
                value={binanceApiKey}
                onChange={(e) => setBinanceApiKey(e.target.value)}
                placeholder="Введіть Binance API Key"
                className="w-full px-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
                API Secret
              </label>
              <input
                type="text"
                value={binanceApiSecret}
                onChange={(e) => setBinanceApiSecret(e.target.value)}
                placeholder="Введіть Binance API Secret"
                className="w-full px-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition"
              />
            </div>
            <p className="text-xs text-white/55">
              Ключі зберігаються безпечно в вашому обліковому записі
            </p>
          </div>
        </div>

        {/* Monobank API Section */}
        <div className="pt-6 border-t border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-brand" />
              <h3 className="text-lg font-semibold text-white">Monobank API</h3>
            </div>
            <button
              onClick={() => setShowMonobankGuide(!showMonobankGuide)}
              className="flex items-center gap-1 text-sm text-brand hover:text-brand-light font-medium bg-brand/10 hover:bg-brand/15 px-3 py-1.5 rounded-full transition-colors"
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
            <div className="bg-brand/10 border border-brand/25 rounded-lg p-4 mb-6 text-sm text-white">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <ExternalLink size={16} />
                Інструкція отримання токена Monobank:
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Перейдіть на офіційний сайт <a href="https://api.monobank.ua/" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">api.monobank.ua</a>.</li>
                <li>Відскануйте QR-код через мобільний додаток Monobank.</li>
                <li>Підтвердіть вхід у додатку.</li>
                <li>Після входу скопіюйте довгий рядок під назвою <strong>Токен для особистого використання</strong>.</li>
                <li>Вставте цей токен у поле нижче. ID карток можна буде отримати автоматично після збереження.</li>
              </ol>
            </div>
          </motion.div>

          <div className="space-y-4 bg-white/[0.03] rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
                Monobank Token
              </label>
              <input
                type="text"
                value={monobankToken}
                onChange={(e) => setMonobankToken(e.target.value)}
                placeholder="Введіть Monobank Token"
                className="w-full px-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
                ID Чорної картки
              </label>
              <input
                type="text"
                value={monobankBlackCardId}
                onChange={(e) => setMonobankBlackCardId(e.target.value)}
                placeholder="Введіть ID чорної картки"
                className="w-full px-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
                ID Білої картки
              </label>
              <input
                type="text"
                value={monobankWhiteCardId}
                onChange={(e) => setMonobankWhiteCardId(e.target.value)}
                placeholder="Введіть ID білої картки"
                className="w-full px-4 py-2.5 border border-white/[0.14] rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
              />
            </div>
            <p className="text-xs text-white/55">
              Token та ID карток зберігаються безпечно в вашому обліковому записі
            </p>
          </div>
        </div>

        {/* Dashboard Settings Section */}
        <div className="pt-6 border-t border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Налаштування дашборду</h3>
          </div>
          <div className="space-y-4 bg-white/[0.03] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-white/85 mb-1">
                  Показувати USDT в графіку (режим ALL)
                </label>
                <p className="text-xs text-white/55">
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
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/35 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white/20 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface/90 after:border-white/[0.14] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm font-medium text-white/85 mb-2">
                Закріплені категорії транзакцій
              </label>
              <p className="text-xs text-white/55 mb-3">
                Додайте категорії, які будуть завжди відображатися зверху на головній сторінці. Введіть назву вручну і натисніть «+».
              </p>

              {/* Input row */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const trimmed = newCategoryInput.trim()
                      if (trimmed && !pinnedCategories.includes(trimmed)) {
                        updateNestedSetting('dashboard.pinnedCategories', [...pinnedCategories, trimmed])
                        toast.success(`Категорію "${trimmed}" додано`)
                      }
                      setNewCategoryInput('')
                    }
                  }}
                  placeholder="Назва категорії..."
                  className="flex-1 px-3 py-2 border border-white/[0.14] rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newCategoryInput.trim()
                    if (!trimmed) return
                    if (!pinnedCategories.includes(trimmed)) {
                      updateNestedSetting('dashboard.pinnedCategories', [...pinnedCategories, trimmed])
                      toast.success(`Категорію "${trimmed}" додано`)
                    } else {
                      toast('Така категорія вже є в списку', { icon: 'ℹ️' })
                    }
                    setNewCategoryInput('')
                  }}
                  className="px-3 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-1"
                >
                  +
                </button>
              </div>

              {/* Pinned tags */}
              <div className="flex flex-wrap gap-2">
                {pinnedCategories.length > 0 ? pinnedCategories.map(cat => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/35 text-amber-300 rounded-full text-xs font-medium"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={() => {
                        updateNestedSetting('dashboard.pinnedCategories', pinnedCategories.filter(c => c !== cat))
                      }}
                      className="ml-0.5 hover:text-amber-200 text-amber-400 font-bold leading-none"
                      title="Видалити"
                    >
                      ×
                    </button>
                  </span>
                )) : (
                  <span className="text-xs text-white/40 italic">Немає закріплених категорій. Додайте першу вище.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* API Key Section для автоматизації */}
        <div className="pt-6 border-t border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Key size={20} className="text-green-400" />
            <h3 className="text-lg font-semibold text-white">API Key для автоматизації</h3>
          </div>
          <div className="space-y-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg p-4 border border-green-500/25">
            <p className="text-sm text-white/85 mb-4">
              API Key дозволяє автоматично синхронізувати транзакції з Monobank через iPhone Shortcuts або інші автоматизації.
              Ключ не має терміну дії, на відміну від JWT токену.
            </p>

            {/* API URL для зручності */}
            <div>
              <label className="block text-sm font-medium text-white/85 mb-2">
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
                  className="flex-1 px-4 py-2.5 border border-white/[0.14] rounded-lg bg-surface/90 font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
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
                  className="p-2.5 border border-white/[0.14] rounded-lg hover:bg-white/[0.03] transition-colors"
                  title="Скопіювати URL"
                >
                  <Copy size={18} className="text-white/70" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('api_url_override')
                    toast.success('API URL скинуто! Перезавантажте сторінку.')
                    setTimeout(() => window.location.reload(), 1000)
                  }}
                  className="p-2.5 border border-white/[0.14] rounded-lg hover:bg-white/[0.03] transition-colors text-sm"
                  title="Скинути до значення за замовчуванням"
                >
                  ↻
                </button>
              </div>
              <p className="text-xs text-white/70 mt-1">
                Використай цей URL разом з API Key для налаштування автоматизації.
                <br />
                <span className="text-amber-400 font-medium">На мобільних:</span> введіть IP-адресу вашого комп'ютера (наприклад: http://192.168.1.100:8787)
              </p>
            </div>

            {apiKeyLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
              </div>
            ) : apiKey ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-white/85 mb-2">
                    Ваш API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      value={apiKey}
                      readOnly
                      className="flex-1 px-4 py-2.5 border border-white/[0.14] rounded-lg bg-surface/90 font-mono text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyVisible(!apiKeyVisible)}
                      className="p-2.5 border border-white/[0.14] rounded-lg hover:bg-white/[0.03] transition-colors"
                      title={apiKeyVisible ? 'Приховати' : 'Показати'}
                    >
                      {apiKeyVisible ? <EyeOff size={18} className="text-white/70" /> : <Eye size={18} className="text-white/70" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyApiKey}
                      className="p-2.5 border border-white/[0.14] rounded-lg hover:bg-white/[0.03] transition-colors"
                      title="Скопіювати"
                    >
                      <Copy size={18} className="text-white/70" />
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
                <p className="text-xs text-white/70">
                  ⚠️ При створенні нового ключа старий перестане працювати
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/70">
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
        <div className="flex justify-end pt-4 border-t border-white/10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand to-brand-deep hover:from-brand-deep hover:to-brand-deep text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Збереження...' : 'Зберегти зміни'}
          </motion.button>
        </div>

        {/* Logout Button */}
        <div className="flex justify-end pt-4 border-t border-white/10">
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

