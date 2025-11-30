import { useState, useEffect, useRef } from 'react'
import { supabase, invalidateUserCache } from '../lib/supabase'
import { motion } from 'framer-motion'
import { User, Mail, Save, Upload, Key, CreditCard, Copy, Eye, EyeOff, RefreshCw, BarChart3, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUserAPIs, updatePreferencesSection, getApiKey, generateApiKey, getPreferencesSection } from '../api/preferences'
import { getApiUrl } from '../utils.jsx'
import { usePreferences } from '../context/PreferencesContext'
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
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  
  // API Key state
  const [apiKey, setApiKey] = useState(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyLoading, setApiKeyLoading] = useState(false)
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false)
  
  // Dashboard settings
  const { preferences, loading: prefsLoading } = usePreferences()
  const [showUsdtInChart, setShowUsdtInChart] = useState(true)
  
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
  useEffect(() => {
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
        setPrefsLoaded(true)
      } catch (e) {
        console.error('Failed to load API keys:', e)
        setPrefsLoaded(true)
      }
    }
    loadApiKeys()
    loadApiKey()
  }, [])
  
  // Зберігаємо початкове значення для порівняння
  const lastSavedShowUsdtInChartRef = useRef(null)
  const dashboardSettingsLoadedRef = useRef(false)

  // Load dashboard settings
  useEffect(() => {
    if (prefsLoading) return
    const dashboard = preferences?.dashboard || {}
    if (typeof dashboard.showUsdtInChart === 'boolean') {
      setShowUsdtInChart(dashboard.showUsdtInChart)
      lastSavedShowUsdtInChartRef.current = dashboard.showUsdtInChart
    } else {
      // Якщо значення немає в БД, використовуємо за замовчуванням true
      lastSavedShowUsdtInChartRef.current = true
    }
    dashboardSettingsLoadedRef.current = true
  }, [prefsLoading, preferences])

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
      }
      
      await updatePreferencesSection('apis', apis)

      toast.success('Профіль оновлено!')
      
      // Refresh user data
      const { data: { user: updatedUser } } = await supabase.auth.getUser()
      if (updatedUser) {
        setUser(updatedUser)
        setAvatarPreview(updatedUser.user_metadata?.avatar_url || null)
      }
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
          <div className="flex items-center gap-2 mb-4">
            <Key size={20} className="text-yellow-600" />
            <h3 className="text-lg font-semibold text-gray-900">Binance API</h3>
          </div>
          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="password"
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
                type="password"
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
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={20} className="text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Monobank API</h3>
          </div>
          <div className="space-y-4 bg-gray-50 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monobank Token
              </label>
              <input
                type="password"
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
                  onChange={async (e) => {
                    const newValue = e.target.checked
                    setShowUsdtInChart(newValue)
                    
                    try {
                      // Отримуємо поточні налаштування
                      const currentPrefs = preferences || {}
                      const currentDashboard = currentPrefs.dashboard || {}
                      
                      // Формуємо об'єкт для збереження
                      const prefsToSave = {
                        ...currentPrefs,
                        dashboard: {
                          ...currentDashboard,
                          showUsdtInChart: newValue
                        }
                      }
                      
                      // Отримуємо токен
                      const { data: { session } } = await supabase.auth.getSession()
                      const token = session?.access_token
                      
                      // Прямий виклик API
                      const apiUrl = getApiUrl()
                      const response = await fetch(`${apiUrl}/api/preferences`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ preferences: prefsToSave })
                      })
                      
                      if (!response.ok) {
                        throw new Error('Помилка збереження')
                      }
                      
                      toast.success('Налаштування збережено')
                    } catch (error) {
                      console.error('Failed to save:', error)
                      toast.error('Не вдалося зберегти налаштування')
                      setShowUsdtInChart(!newValue)
                    }
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

