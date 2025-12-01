import { create } from 'zustand'
import debounce from 'lodash.debounce'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'

// Debounce функція для синхронізації з БД (800ms)
let syncDebounceTimer = null
let pendingChanges = {} // Зберігаємо тільки змінені поля

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
                // Встановлюємо налаштування ОДРАЗУ з localStorage
                set({
                  settings: parsed.settings,
                  userId: parsed.userId || null,
                  initialized: true,
                  loading: false,
                  error: null
                })
                return // ВИХОДИМО - налаштування вже завантажені
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
            const dbPromise = apiFetch('/api/preferences')
            const dbTimeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('DB fetch timeout')), 5000) // 5 секунд
            })
            const dbSettings = await Promise.race([dbPromise, dbTimeout]) || {}
            
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
            
            // Об'єднуємо: localStorage має пріоритет (джерело правди), БД тільки додає нові поля
            const mergedSettings = {
              ...dbSettings, // Спочатку БД (базові значення)
              ...cachedSettings // Потім localStorage (локальні зміни мають пріоритет)
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

