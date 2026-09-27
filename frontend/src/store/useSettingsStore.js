import { create } from 'zustand'
import debounce from 'lodash.debounce'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'

// Debounce функція для синхронізації з БД (800ms)
let syncDebounceTimer = null
let pendingChanges = {} // Зберігаємо тільки змінені поля

// Coming back to the tab re-reads the DB at most this often (the iPhone app writes there too)
const REFRESH_MIN_INTERVAL_MS = 60 * 1000
let lastRefreshAt = 0

const DB_TIMEOUT_MS = 5000
const fetchDbSettings = () =>
  Promise.race([
    apiFetch('/api/preferences'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB fetch timeout')), DB_TIMEOUT_MS)),
  ])

const writeCache = (userId, settings) =>
  localStorage.setItem('settings-cache', JSON.stringify({ userId, settings, timestamp: Date.now() }))

/**
 * Zustand store для користувацьких налаштувань
 * Локальний стейт → джерело правди у UI
 * Оновлення в БД через debounce (тільки змінені поля)
 */
export const useSettingsStore = create((set, get) => ({
      // Стан
      settings: {},
      loading: false,
      error: null,
      initialized: false,
      userId: null,

      // Ініціалізація: завантажити settings з localStorage (ДЖЕРЕЛО ПРАВДИ)
      initialize: async () => {
        const state = get()
        if (state.loading || state.initialized) {
          return
        }

        try {
          set({ loading: true, error: null })

          // СПОЧАТКУ завантажуємо з LocalStorage (ДЖЕРЕЛО ПРАВДИ) - БЕЗ перевірки userId
          const cached = localStorage.getItem('settings-cache')
          
          if (cached) {
            try {
              const parsed = JSON.parse(cached)
              
              if (parsed.settings && typeof parsed.settings === 'object') {
                // Show the cached settings right away, then catch up with the DB in the background:
                // the iPhone app writes there too (iosApp, primaryCurrency, …)
                set({
                  settings: parsed.settings,
                  userId: parsed.userId || null,
                  initialized: true,
                  loading: false,
                  error: null
                })
                get().refreshFromDatabase()
                return
              }
            } catch (e) {
              console.error('[useSettingsStore] ❌ Помилка парсингу кешу:', e)
            }
          }

          // Якщо немає кешу, спробуємо отримати userId і завантажити з БД
          let userId = null
          try {
            const sessionPromise = supabase.auth.getSession()
            const sessionTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('getSession timeout')), 2000)
            })
            const { data: { session } } = await Promise.race([sessionPromise, sessionTimeout])
            userId = session?.user?.id
          } catch (e) {
            // Ignore
          }

          if (!userId) {
            set({ 
              settings: {}, 
              userId: null, 
              initialized: true, 
              loading: false 
            })
            return
          }

          // Завантажуємо з БД тільки для синхронізації (в фоні, неблокуюче)
          try {
            const dbSettings = await fetchDbSettings() || {}
            lastRefreshAt = Date.now()
            
            // Отримуємо поточні налаштування з localStorage
            let cachedSettings = {}
            const cached = localStorage.getItem('settings-cache')
            if (cached) {
              try {
                const parsed = JSON.parse(cached)
                cachedSettings = parsed.settings || {}
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // The DB is the source of truth (every change here is saved there within a second);
            // only changes not saved yet stay on top
            const mergedSettings = {
              ...cachedSettings,
              ...dbSettings,
              ...pendingChanges
            }
            
            // Оновлюємо store тільки якщо є нові дані з БД
            if (Object.keys(dbSettings).length > 0) {
              set({
                settings: mergedSettings,
                userId,
                initialized: true,
                loading: false,
                error: null
              })
              
              // Оновлюємо кеш
              localStorage.setItem('settings-cache', JSON.stringify({
                userId,
                settings: mergedSettings,
                timestamp: Date.now()
              }))
            } else {
              // Якщо немає даних з БД, встановлюємо тільки з localStorage або порожній об'єкт
              set({
                settings: cachedSettings,
                userId,
                initialized: true,
                loading: false,
                error: null
              })
            }
          } catch (e) {
            // Якщо не вдалося завантажити з БД, використовуємо тільки localStorage
            let cachedSettings = {}
            const cached = localStorage.getItem('settings-cache')
            if (cached) {
              try {
                const parsed = JSON.parse(cached)
                cachedSettings = parsed.settings || {}
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            set({
              settings: cachedSettings,
              userId,
              initialized: true,
              loading: false,
              error: null
            })
          }
        } catch (error) {
          console.error('[useSettingsStore] Помилка ініціалізації:', error)
          set({ 
            error, 
            loading: false, 
            initialized: true 
          })
        }
      },

      // Catch up with the DB: its values win, except local changes that aren't saved yet
      refreshFromDatabase: async () => {
        lastRefreshAt = Date.now()
        try {
          const dbSettings = await fetchDbSettings()
          if (!dbSettings || typeof dbSettings !== 'object' || Object.keys(dbSettings).length === 0) return
          const state = get()
          const settings = { ...state.settings, ...dbSettings, ...pendingChanges }
          set({ settings })
          if (state.userId) writeCache(state.userId, settings)
        } catch (e) {
          // Offline or slow: keep what we have, the next visit tries again
        }
      },

      // Оновити одне поле налаштувань
      updateSetting: (key, value) => {
        const state = get()
        
        // Оновлюємо локальний стейт (джерело правди)
        const newSettings = {
          ...state.settings,
          [key]: value
        }

        set({ settings: newSettings })

        // Оновлюємо LocalStorage
        if (state.userId) {
          localStorage.setItem('settings-cache', JSON.stringify({
            userId: state.userId,
            settings: newSettings,
            timestamp: Date.now()
          }))
        }

        // Додаємо до pending changes (тільки змінені поля)
        pendingChanges[key] = value

        // Debounce синхронізація з БД
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer)
        }

        syncDebounceTimer = setTimeout(async () => {
          await get().syncToDatabase()
        }, 800) // 800ms debounce
      },

      // Оновити вкладену секцію (наприклад, dashboard.showUsdtInChart)
      updateNestedSetting: (path, value) => {
        const state = get()
        const keys = path.split('.')
        
        // Глибоке оновлення вкладеного об'єкта
        const newSettings = { ...state.settings }
        let current = newSettings
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i]
          if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {}
          } else {
            current[key] = { ...current[key] }
          }
          current = current[key]
        }
        
        current[keys[keys.length - 1]] = value

        set({ settings: newSettings })

        // Оновлюємо LocalStorage
        if (state.userId) {
          localStorage.setItem('settings-cache', JSON.stringify({
            userId: state.userId,
            settings: newSettings,
            timestamp: Date.now()
          }))
        }

        // Додаємо до pending changes (тільки змінені поля)
        // Для вкладених об'єктів зберігаємо весь об'єкт секції
        const sectionKey = keys[0]
        pendingChanges[sectionKey] = newSettings[sectionKey]

        // Debounce синхронізація з БД
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer)
        }

        syncDebounceTimer = setTimeout(async () => {
          await get().syncToDatabase()
        }, 800) // 800ms debounce
      },

      // Синхронізація з БД (PATCH - тільки змінені поля)
      syncToDatabase: async () => {
        const state = get()
        
        if (!state.userId || Object.keys(pendingChanges).length === 0) {
          return
        }

        try {
          // Відправляємо тільки змінені поля (PATCH-логіка)
          const response = await apiFetch('/api/preferences', {
            method: 'PATCH',
            body: JSON.stringify({ 
              updates: pendingChanges 
            })
          })

          if (response?.success !== false) {
            // Очищаємо pending changes після успішного збереження
            pendingChanges = {}
          } else {
            throw new Error(response?.error || 'Помилка збереження')
          }
        } catch (error) {
          console.error('[useSettingsStore] ❌ Помилка синхронізації:', error)
          // Не очищаємо pendingChanges, щоб можна було повторити спробу
          set({ error })
        }
      },

      // Отримати значення налаштування
      getSetting: (key, defaultValue = null) => {
        const state = get()
        return state.settings?.[key] ?? defaultValue
      },

      // Отримати вкладене значення
      getNestedSetting: (path, defaultValue = null) => {
        const state = get()
        const keys = path.split('.')
        let current = state.settings
        
        for (const key of keys) {
          if (current == null || typeof current !== 'object') {
            return defaultValue
          }
          current = current[key]
        }
        
        return current ?? defaultValue
      },

      // Скинути стан (при виході)
      reset: () => {
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer)
          syncDebounceTimer = null
        }
        pendingChanges = {}
        set({
          settings: {},
          userId: null,
          initialized: false,
          loading: false,
          error: null
        })
        localStorage.removeItem('settings-cache')
      }
    })
  )

// Back to the tab: pick up what changed elsewhere (e.g. the iPhone app reported it's installed)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const store = useSettingsStore.getState()
    if (document.visibilityState !== 'visible' || !store.initialized || !store.userId) return
    if (Date.now() - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return
    store.refreshFromDatabase()
  })
}

// Автоматична ініціалізація при зміні auth стану
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange(async (event, session) => {
    const store = useSettingsStore.getState()
    
    if (event === 'SIGNED_IN' && session?.user?.id) {
      // Користувач увійшов - ініціалізуємо
      if (!store.initialized || store.userId !== session.user.id) {
        await store.initialize()
      }
    } else if (event === 'SIGNED_OUT') {
      // Користувач вийшов - скидаємо
      store.reset()
    }
  })
}

