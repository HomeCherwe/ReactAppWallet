import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'
import { setCachedPreferences, getCachedPreferences, invalidatePreferencesCache, setCacheUpdateCallback } from '../api/preferences'

const PreferencesContext = createContext({
  preferences: null,
  loading: false,
  error: null,
  refresh: async () => {}
})

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [userId, setUserId] = useState(null)
  const loadedRef = useRef(false)

  // Track auth changes to know when to (re)load preferences
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        setUserId(session?.user?.id || null)
      } catch {
        if (!mounted) return
        setUserId(null)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id || null
      setUserId(newUserId)
      // Reset loaded flag when user changes
      if (newUserId !== userId) {
        loadedRef.current = false
        invalidatePreferencesCache()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [userId])

  const loadPreferences = async () => {
    if (!userId) {
      setPreferences(null)
      setCachedPreferences(null)
      return
    }

    // Перевіряємо чи є кеш (може бути встановлений з API функцій)
    const cached = getCachedPreferences()
    if (cached && loadedRef.current) {
      console.log('[PreferencesContext] Використовую кеш, не завантажую з БД')
      setPreferences(cached)
      return
    }

    console.log('[PreferencesContext] Завантажую preferences з БД...')
    setLoading(true)
    setError(null)

    try {
      // Робимо запит тільки якщо кешу немає
      const prefs = await apiFetch('/api/preferences') || {}
      console.log('[PreferencesContext] Отримано з БД:', prefs)
      
      // Зберігаємо в глобальний кеш для синхронізації з API функціями
      // Але НЕ викликаємо callback, щоб не перезаписати локальні зміни
      setCachedPreferences(prefs, true) // skipCallback = true
      loadedRef.current = true
      
      setPreferences(prefs)
      console.log('[PreferencesContext] Preferences завантажено')
    } catch (e) {
      setError(e)
      console.error('[PreferencesContext] Failed to load preferences:', e)
    } finally {
      setLoading(false)
    }
  }

  // ВИМКНУТО: Не синхронізуємо контекст з кешем автоматично
  // Компоненти працюють з локальним станом, а збереження в БД відбувається через debounce
  // useEffect(() => {
  //   setCacheUpdateCallback((newPrefs) => {
  //     if (loadedRef.current) {
  //       setPreferences(newPrefs)
  //     }
  //   })
  //   return () => {
  //     setCacheUpdateCallback(null)
  //   }
  // }, [])

  // Load once per authenticated session
  useEffect(() => {
    if (!userId) {
      setPreferences(null)
      setCachedPreferences(null)
      loadedRef.current = false
      return
    }
    
    // Завантажуємо тільки якщо ще не завантажено
    if (!loadedRef.current) {
      loadPreferences()
    } else {
      // Якщо вже завантажено, перевіряємо кеш
      const cached = getCachedPreferences()
      if (cached) {
        setPreferences(cached)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <PreferencesContext.Provider value={{ 
      preferences, 
      loading, 
      error, 
      refresh: loadPreferences
    }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  return useContext(PreferencesContext)
}


