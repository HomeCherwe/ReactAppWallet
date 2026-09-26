import { useState, useEffect, useRef } from 'react'
import { supabase, invalidateUserCache } from '../lib/supabase'
import { motion } from 'framer-motion'
import { User, Mail, Save, Upload, Key, Copy, Eye, EyeOff, RefreshCw, LogOut, Check, Coins, Pin } from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiKey, generateApiKey } from '../api/preferences'
import { getApiUrl, apiFetch } from '../utils.jsx'
import { useSettingsStore } from '../store/useSettingsStore'
import ConfirmModal from '../components/ConfirmModal'
import { SUPPORTED_CURRENCIES, usePrimaryCurrency, setPrimaryCurrency } from '../utils/primaryCurrency'

// Symbol tile colors in the currency list
const CURRENCY_COLORS = {
  UAH: '#007AFF',
  EUR: '#5856D6',
  USD: '#34C759',
  PLN: '#FF3B30',
  GBP: '#AF52DE',
}

/** iOS-Settings-style section header: white glyph on a colored square */
function SectionTitle({ icon: Icon, color, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span
        className="h-8 w-8 shrink-0 rounded-[9px] grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
        style={{ background: color }}
      >
        <Icon size={17} strokeWidth={2.2} className="text-white" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold text-white leading-8">{title}</h3>
        {subtitle && <p className="text-xs text-white/50 -mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)

  // API Key state
  const [apiKey, setApiKey] = useState(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyLoading, setApiKeyLoading] = useState(false)
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false)

  // Main currency (shared with the iPhone app) and pinned categories
  const primaryCurrency = usePrimaryCurrency()
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const getNestedSetting = useSettingsStore((state) => state.getNestedSetting)
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

  // Bank and Binance keys are connected on the cards page now; only the automation key lives here
  useEffect(() => {
    loadApiKey()
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    )
  }

  const section = 'rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass border border-white/10 p-4 sm:p-5'
  const field = 'w-full pl-10 pr-4 py-2.5 border border-white/[0.14] rounded-xl focus:ring-2 focus:ring-brand focus:border-brand outline-none transition'

  const addPinnedCategory = () => {
    const trimmed = newCategoryInput.trim()
    if (!trimmed) return
    if (!pinnedCategories.includes(trimmed)) {
      updateNestedSetting('dashboard.pinnedCategories', [...pinnedCategories, trimmed])
      toast.success(`Категорію "${trimmed}" додано`)
    } else {
      toast('Така категорія вже є в списку', { icon: 'ℹ️' })
    }
    setNewCategoryInput('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <h1 className="text-[28px] font-bold tracking-tight px-1">Налаштування</h1>

      {/* Profile */}
      <section className={section}>
        <SectionTitle icon={User} color="#8E8E93" title="Профіль" />

        <div className="flex items-center gap-4 mb-5">
          {avatarPreview ? (
            <img src={avatarPreview} alt="Avatar" className="h-16 w-16 rounded-full object-cover border border-white/10" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white text-2xl font-bold">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <label className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full btn-soft cursor-pointer text-sm font-semibold">
              <Upload size={15} />
              Змінити фото
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
            <p className="text-xs text-white/45 mt-1.5">JPG, PNG або GIF. Макс. 5MB</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-white/55 mb-1.5 px-1">Ім'я</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={17} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Введіть ваше ім'я"
                className={field}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/55 mb-1.5 px-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={17} />
              <input type="email" value={user?.email || ''} disabled className={`${field} text-white/50 cursor-not-allowed`} />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </section>

      {/* Main currency */}
      <section className={section}>
        <SectionTitle
          icon={Coins}
          color="#34C759"
          title="Основна валюта"
          subtitle="Доходи, витрати й графік на головній рахуються в цій валюті. Та сама, що в застосунку на iPhone."
        />
        <div className="rounded-2xl overflow-hidden border border-white/[0.08] divide-y divide-white/[0.06]">
          {SUPPORTED_CURRENCIES.map(c => {
            const active = c.code === primaryCurrency
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  if (active) return
                  setPrimaryCurrency(c.code)
                  toast.success(`Основна валюта: ${c.name}`)
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                  active ? 'bg-brand/[0.08]' : 'bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-[10px] grid place-items-center text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                  style={{ background: CURRENCY_COLORS[c.code] }}
                >
                  {c.symbol}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-white">{c.name}</span>
                  <span className="block text-xs text-white/45">{c.code}</span>
                </span>
                {active && <Check size={20} strokeWidth={3} className="text-brand" />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Pinned categories */}
      <section className={section}>
        <SectionTitle
          icon={Pin}
          color="#FF9500"
          title="Закріплені категорії"
          subtitle="Транзакції цих категорій завжди показуються зверху на головній."
        />
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCategoryInput}
            onChange={(e) => setNewCategoryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addPinnedCategory()
              }
            }}
            placeholder="Назва категорії..."
            className="flex-1 px-3.5 py-2.5 border border-white/[0.14] rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
          />
          <button
            type="button"
            onClick={addPinnedCategory}
            className="btn-primary h-10 w-10 shrink-0 rounded-full text-lg font-bold grid place-items-center"
            title="Додати"
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pinnedCategories.length > 0 ? pinnedCategories.map(cat => (
            <span
              key={cat}
              className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-brand/[0.12] border border-brand/30 text-orange-200 rounded-full text-xs font-semibold"
            >
              {cat}
              <button
                type="button"
                onClick={() => updateNestedSetting('dashboard.pinnedCategories', pinnedCategories.filter(c => c !== cat))}
                className="h-4 w-4 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 leading-none"
                title="Видалити"
              >
                ×
              </button>
            </span>
          )) : (
            <span className="text-xs text-white/40">Немає закріплених категорій. Додайте першу вище.</span>
          )}
        </div>
      </section>

      {/* Automation key */}
      <section className={section}>
        <SectionTitle icon={Key} color="#007AFF" title="API Key для автоматизації" />
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            API Key дозволяє автоматично синхронізувати транзакції з Monobank через iPhone Shortcuts або інші автоматизації.
            Ключ не має терміну дії, на відміну від JWT токену.
          </p>

          {/* API URL для зручності */}
          <div>
            <label className="block text-xs font-semibold text-white/55 mb-1.5 px-1">
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
                className="flex-1 px-4 py-2.5 border border-white/[0.14] rounded-xl font-mono text-sm focus:ring-2 focus:ring-brand focus:border-brand outline-none"
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
                className="p-2.5 border border-white/[0.14] rounded-xl hover:bg-white/[0.06] transition-colors"
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
                className="p-2.5 border border-white/[0.14] rounded-xl hover:bg-white/[0.06] transition-colors text-sm"
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
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand"></div>
            </div>
          ) : apiKey ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-white/55 mb-1.5 px-1">
                  Ваш API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={apiKeyVisible ? 'text' : 'password'}
                    value={apiKey}
                    readOnly
                    className="flex-1 px-4 py-2.5 border border-white/[0.14] rounded-xl font-mono text-sm focus:ring-2 focus:ring-brand focus:border-brand outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setApiKeyVisible(!apiKeyVisible)}
                    className="p-2.5 border border-white/[0.14] rounded-xl hover:bg-white/[0.06] transition-colors"
                    title={apiKeyVisible ? 'Приховати' : 'Показати'}
                  >
                    {apiKeyVisible ? <EyeOff size={18} className="text-white/70" /> : <Eye size={18} className="text-white/70" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyApiKey}
                    className="p-2.5 border border-white/[0.14] rounded-xl hover:bg-white/[0.06] transition-colors"
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
                className="btn-soft inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="btn-soft inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Key size={16} />
                {apiKeyGenerating ? 'Генерація...' : 'Створити API Key'}
              </button>
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={() => setShowLogoutModal(true)}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-[#FF453A] font-semibold transition-colors"
      >
        <LogOut size={18} />
        Вийти з акаунту
      </button>

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

