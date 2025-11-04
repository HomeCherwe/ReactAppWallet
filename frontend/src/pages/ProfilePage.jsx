import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion } from 'framer-motion'
import { User, Mail, Save, Upload, Key, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUserAPIs, updatePreferencesSection } from '../api/preferences'

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
  }, [])

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    try {
      let avatarUrl = user.user_metadata?.avatar_url

      // Upload avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const fileName = `${user.id}-${Math.random()}.${fileExt}`
        const filePath = `avatars/${fileName}`

        // Convert to base64 or upload to Supabase Storage
        // For now, we'll store as base64 in user_metadata
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result
          avatarUrl = base64
        }
        reader.readAsDataURL(avatarFile)
        await new Promise(resolve => {
          const reader = new FileReader()
          reader.onloadend = () => {
            avatarUrl = reader.result
            resolve()
          }
          reader.readAsDataURL(avatarFile)
        })
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
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Не вдалося оновити профіль')
    } finally {
      setSaving(false)
    }
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
      </div>
    </motion.div>
  )
}

