import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, Calendar, CreditCard, DollarSign, Repeat, Users } from 'lucide-react'
import { apiFetch } from '../utils.jsx'
import { listCards } from '../api/cards'
import { getTransactionCategories } from '../api/transactions'
import BaseModal from '../components/BaseModal'
import DeleteSubscriptionModal from '../components/subscriptions/DeleteSubscriptionModal'
import useMonoRates from '../hooks/useMonoRates'
import toast from 'react-hot-toast'

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false)
  const [subscriptionToDelete, setSubscriptionToDelete] = useState(null)
  const [subscriptionForParticipants, setSubscriptionForParticipants] = useState(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const categoryInputRef = useRef(null)
  const categoryDropdownRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [participants, setParticipants] = useState([])
  const [totalParticipants, setTotalParticipants] = useState(1)
  const rates = useMonoRates()
  const [form, setForm] = useState({
    name: '',
    amount: '',
    card_id: '',
    frequency: 'monthly',
    day_of_week: 1,
    day_of_month: 1,
    is_expense: true,
    category: 'Підписки',
    note: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  // Close category dropdown when clicking outside
  useEffect(() => {
    if (!showCategoryDropdown) return
    const handleClickOutside = (e) => {
      if (categoryInputRef.current && !categoryInputRef.current.contains(e.target) &&
          categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCategoryDropdown])

  const loadData = async () => {
    try {
      setLoading(true)
      const [subs, cardsData, cats] = await Promise.all([
        apiFetch('/api/subscriptions'),
        listCards(),
        getTransactionCategories().catch(() => [])
      ])
      setSubscriptions(subs || [])
      setCards(cardsData || [])
      setCategories(cats || [])
    } catch (e) {
      console.error('Failed to load subscriptions:', e)
      toast.error('Не вдалося завантажити підписки')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    console.log('[SubscriptionsPage] handleSave called', { editing, form })
    
    if (!form.name || !form.amount) {
      console.log('[SubscriptionsPage] Validation failed', { name: form.name, amount: form.amount })
      toast.error('Заповніть всі обов\'язкові поля')
      return
    }
    
    console.log('[SubscriptionsPage] Validation passed, proceeding...')

    try {
      console.log('[SubscriptionsPage] Saving subscription...', { editing, form })
      
      if (editing) {
        const response = await apiFetch(`/api/subscriptions/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        })
        console.log('[SubscriptionsPage] Update response:', response)
        toast.success('Підписку оновлено!')
      } else {
        const response = await apiFetch('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify(form)
        })
        console.log('[SubscriptionsPage] Create response:', response)
        toast.success('Підписку створено!')
      }
      
      setModalOpen(false)
      setEditing(null)
      setForm({
        name: '',
        amount: '',
        card_id: '',
        frequency: 'monthly',
        day_of_week: 1,
        day_of_month: 1,
        is_expense: true,
        category: 'Підписки',
        note: ''
      })
      await loadData()
    } catch (e) {
      console.error('[SubscriptionsPage] Failed to save subscription:', e)
      toast.error(`Не вдалося зберегти підписку: ${e.message || 'Невідома помилка'}`)
    }
  }

  const handleDeleteClick = (sub) => {
    setSubscriptionToDelete(sub)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!subscriptionToDelete) return

    try {
      await apiFetch(`/api/subscriptions/${subscriptionToDelete.id}`, {
        method: 'DELETE'
      })
      toast.success('Підписку видалено!')
      setDeleteModalOpen(false)
      setSubscriptionToDelete(null)
      loadData()
    } catch (e) {
      console.error('Failed to delete subscription:', e)
      toast.error('Не вдалося видалити підписку')
    }
  }

  const handleEdit = (sub) => {
    setEditing(sub)
    setForm({
      name: sub.name,
      amount: String(Math.abs(sub.amount)),
      card_id: sub.card_id || '',
      frequency: sub.frequency,
      day_of_week: sub.day_of_week || 1,
      day_of_month: sub.day_of_month || 1,
      is_expense: sub.is_expense !== false,
      category: sub.category || 'Підписки',
      note: sub.note || ''
    })
    setModalOpen(true)
  }

  const handleOpenParticipants = (sub) => {
    setSubscriptionForParticipants(sub)
    setParticipants(Array.isArray(sub.participants) ? [...sub.participants] : [])
    setTotalParticipants(sub.total_participants || 1)
    setParticipantsModalOpen(true)
  }

  const handleSaveParticipants = async () => {
    if (!subscriptionForParticipants) return

    try {
      await apiFetch(`/api/subscriptions/${subscriptionForParticipants.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          total_participants: totalParticipants,
          participants: participants
        })
      })
      toast.success('Учасників оновлено!')
      setParticipantsModalOpen(false)
      setSubscriptionForParticipants(null)
      loadData()
    } catch (e) {
      console.error('Failed to save participants:', e)
      toast.error('Не вдалося зберегти учасників')
    }
  }

  const handleAddParticipant = () => {
    setParticipants([...participants, ''])
  }

  const handleRemoveParticipant = (index) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const handleParticipantNameChange = (index, value) => {
    const newParticipants = [...participants]
    newParticipants[index] = value
    setParticipants(newParticipants)
  }

  const handleToggleActive = async (sub) => {
    try {
      await apiFetch(`/api/subscriptions/${sub.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !sub.is_active })
      })
      toast.success(sub.is_active ? 'Підписку деактивовано' : 'Підписку активовано')
      loadData()
    } catch (e) {
      console.error('Failed to toggle subscription:', e)
      toast.error('Не вдалося змінити статус')
    }
  }

  const getFrequencyLabel = (sub) => {
    if (sub.frequency === 'weekly') {
      const days = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота', 'Неділя']
      return `Щотижня (${days[sub.day_of_week - 1]})`
    } else {
      return `Щомісяця (${sub.day_of_month} число)`
    }
  }

  const getNextExecutionDate = (sub) => {
    if (sub.next_execution_at) {
      const nextDate = new Date(sub.next_execution_at)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      nextDate.setHours(0, 0, 0, 0)
      
      const diffTime = nextDate - today
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      
      const dateStr = nextDate.toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      
      let daysText = ''
      if (diffDays === 0) {
        daysText = '(сьогодні)'
      } else if (diffDays === 1) {
        daysText = '(завтра)'
      } else if (diffDays === -1) {
        daysText = '(вчора)'
      } else if (diffDays > 1) {
        daysText = `(через ${diffDays} днів)`
      } else {
        daysText = `(просрочено ${Math.abs(diffDays)} днів)`
      }
      
      return `${dateStr} ${daysText}`
    }
    return 'Не встановлено'
  }

  // Розрахунок загальної витрати на місяць для всіх активних підписок
  const totalMonthlyExpense = useMemo(() => {
    if (!subscriptions.length || !cards.length) return { UAH: 0, EUR: 0 }

    // Функція конвертації валют через UAH
    const convertCurrency = (amount, fromCurrency, toCurrency) => {
      if (!fromCurrency || fromCurrency === toCurrency) return amount
      
      const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, CHF: 756, CZK: 203, HUF: 348, USDT: 840 }
      const fromCode = codeMap[fromCurrency] || 980
      const toCode = codeMap[toCurrency] || 980
      
      if (fromCode === toCode) return amount
      
      // Конвертуємо через UAH як проміжну валюту
      let inUAH = amount
      if (fromCode !== 980) {
        const rateToUAH = rates?.[`${fromCode}->980`]
        if (!rateToUAH) return amount // Якщо курс не знайдено, повертаємо оригінальну суму
        inUAH = amount * rateToUAH
      }
      
      // Потім конвертуємо з UAH в цільову валюту
      if (toCode === 980) return inUAH
      const rateFromUAH = rates?.[`${toCode}->980`]
      if (!rateFromUAH) return inUAH // Якщо курс не знайдено, повертаємо суму в UAH
      return inUAH / rateFromUAH
    }

    let totalInUAH = 0

    subscriptions
      .filter(sub => sub.is_active && sub.is_expense)
      .forEach(sub => {
        const card = cards.find(c => c.id === sub.card_id)
        const currency = card?.currency || 'UAH'
        const amount = Math.abs(sub.amount || 0)
        const frequency = sub.frequency || 'monthly'
        const participantsCount = sub.total_participants || 1
        
        // Розрахунок суми на місяць
        let monthlyAmount = 0
        if (frequency === 'monthly') {
          monthlyAmount = amount / participantsCount
        } else if (frequency === 'weekly') {
          monthlyAmount = (amount * 4.33) / participantsCount
        }
        
        // Конвертуємо в UAH
        const inUAH = convertCurrency(monthlyAmount, currency, 'UAH')
        totalInUAH += inUAH
      })

    return {
      UAH: totalInUAH,
      EUR: convertCurrency(totalInUAH, 'UAH', 'EUR')
    }
  }, [subscriptions, cards, rates])

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
      className="bg-white rounded-2xl shadow-soft border border-gray-200 p-4 sm:p-6"
    >
      {/* Загальна витрата на місяць */}
      {subscriptions.length > 0 && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
          <div>
            <h3 className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Загальна витрата на місяць (всі активні підписки)</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-bold text-indigo-700">
                  {totalMonthlyExpense.UAH.toFixed(2)} UAH
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-bold text-purple-700">
                  {totalMonthlyExpense.EUR.toFixed(2)} EUR
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Repeat size={20} className="sm:w-6 sm:h-6" />
          Підписки
        </h2>
        <button
          onClick={() => {
            setEditing(null)
            setForm({
              name: '',
              amount: '',
              card_id: '',
              frequency: 'monthly',
              day_of_week: 1,
              day_of_month: 1,
              is_expense: true,
              category: 'Підписки',
              note: ''
            })
            setModalOpen(true)
          }}
          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm sm:text-base"
        >
          <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
          <span className="hidden sm:inline">Додати підписку</span>
          <span className="sm:hidden">Додати</span>
        </button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Repeat size={48} className="mx-auto mb-4 opacity-50" />
          <p>Немає підписок</p>
          <p className="text-sm mt-2">Додайте підписку для автоматичного додавання транзакцій</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className={`p-3 sm:p-4 rounded-lg border-2 transition-all ${
                sub.is_active
                  ? 'border-gray-200 bg-white hover:border-indigo-300'
                  : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{sub.name}</h3>
                    {!sub.is_active && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">Неактивна</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-xs sm:text-sm mb-2">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <DollarSign size={16} />
                      <span className={sub.is_expense ? 'text-red-600' : 'text-green-600'}>
                        {sub.is_expense ? '-' : '+'}{Math.abs(sub.amount).toLocaleString()} {sub.card_id ? (cards.find(c => c.id === sub.card_id)?.currency || '') : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Repeat size={16} />
                      <span>{getFrequencyLabel(sub)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <CreditCard size={16} />
                      <span>
                        {sub.card_id 
                          ? (() => {
                              const card = cards.find(c => c.id === sub.card_id)
                              return card ? `${card.bank} ${card.name}` : 'Карта'
                            })()
                          : 'Готівка'
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Calendar size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="break-words">Наступна: {getNextExecutionDate(sub)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1 mt-2">
                    <div>Категорія: <span className="font-medium">{sub.category || 'Підписки'}</span></div>
                    {sub.note && (
                      <div>Опис: <span className="font-medium">{sub.note}</span></div>
                    )}
                    {(sub.total_participants > 1 || (Array.isArray(sub.participants) && sub.participants.length > 0)) && (() => {
                      const totalAmount = Math.abs(sub.amount || 0)
                      const participantsCount = sub.total_participants || 1
                      const frequency = sub.frequency || 'monthly'
                      
                      // Розрахунок суми на місяць
                      let monthlyAmount = 0
                      if (frequency === 'monthly') {
                        monthlyAmount = totalAmount / participantsCount
                      } else if (frequency === 'weekly') {
                        // Приблизно 4.33 тижні в місяці
                        monthlyAmount = (totalAmount * 4.33) / participantsCount
                      }
                      
                      // Розрахунок суми на рік
                      const yearlyAmount = monthlyAmount * 12
                      const currency = sub.card_id ? (cards.find(c => c.id === sub.card_id)?.currency || '') : ''
                      
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            <span>
                              Скидаються: {sub.total_participants || 1} {sub.total_participants === 1 ? 'людина' : 'люди'}
                              {Array.isArray(sub.participants) && sub.participants.length > 0 && (
                                <span className="ml-1">
                                  ({sub.participants.filter(p => p && p.trim()).join(', ')})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 pl-5">
                            На місяць: <span className="font-medium">{monthlyAmount.toFixed(2)} {currency}</span> | 
                            На рік: <span className="font-medium">{yearlyAmount.toFixed(2)} {currency}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-4 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(sub)}
                    className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      sub.is_active
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        : 'bg-green-100 hover:bg-green-200 text-green-700'
                    }`}
                  >
                    <span className="hidden sm:inline">{sub.is_active ? 'Деактивувати' : 'Активувати'}</span>
                    <span className="sm:hidden">{sub.is_active ? 'Вимк' : 'Увімк'}</span>
                  </button>
                  <button
                    onClick={() => handleOpenParticipants(sub)}
                    className="p-1.5 sm:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Учасники"
                  >
                    <Users size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button
                    onClick={() => handleEdit(sub)}
                    className="p-1.5 sm:p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(sub)}
                    className="p-1.5 sm:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BaseModal
        open={modalOpen}
        onClose={() => {
          console.log('[SubscriptionsPage] Modal onClose called')
          setModalOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Редагувати підписку' : 'Додати підписку'}
      >
        <form
          onSubmit={(e) => {
            console.log('[SubscriptionsPage] Form submitted', e)
            e.preventDefault()
            e.stopPropagation()
            handleSave(e)
            return false
          }}
          onClick={(e) => {
            console.log('[SubscriptionsPage] Form clicked', e.target)
            e.stopPropagation()
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Назва підписки *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Наприклад: Netflix, Spotify"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Сума *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Карта
              </label>
              <select
                value={form.card_id}
                onChange={(e) => setForm({ ...form, card_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Готівка</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.bank} {card.name} ({card.currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, is_expense: true })}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  form.is_expense
                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                }`}
              >
                Витрата
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_expense: false })}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  !form.is_expense
                    ? 'bg-green-100 text-green-700 border-2 border-green-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                }`}
              >
                Дохід
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Частота *
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, frequency: 'weekly' })}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  form.frequency === 'weekly'
                    ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                }`}
              >
                Тиждень
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, frequency: 'monthly' })}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  form.frequency === 'monthly'
                    ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                }`}
              >
                Місяць
              </button>
            </div>
          </div>

          {form.frequency === 'weekly' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                День тижня *
              </label>
              <select
                value={form.day_of_week}
                onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value={1}>Понеділок</option>
                <option value={2}>Вівторок</option>
                <option value={3}>Середа</option>
                <option value={4}>Четвер</option>
                <option value={5}>П'ятниця</option>
                <option value={6}>Субота</option>
                <option value={7}>Неділя</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                День місяця * (1-31)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          )}

          <div className="relative" ref={categoryInputRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Категорія
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              onFocus={() => setShowCategoryDropdown(true)}
              placeholder="Категорія (напр. Підписки)"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            
            <AnimatePresence>
              {showCategoryDropdown && categories.length > 0 && (() => {
                const filteredCategories = form.category.trim() 
                  ? categories.filter(cat => cat.toLowerCase().includes(form.category.toLowerCase()))
                  : categories
                
                return filteredCategories.length > 0 && (
                  <motion.div
                    ref={categoryDropdownRef}
                    className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto shadow-lg"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {filteredCategories.map((cat, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                        onClick={() => {
                          setForm({ ...form, category: cat })
                          setShowCategoryDropdown(false)
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </motion.div>
                )
              })()}
            </AnimatePresence>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Опис
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Опис для автоматичних транзакцій (необов'язково)"
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setModalOpen(false)
                setEditing(null)
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              onClick={(e) => {
                console.log('[SubscriptionsPage] Submit button clicked!', e)
                e.preventDefault()
                e.stopPropagation()
                console.log('[SubscriptionsPage] Calling handleSave...')
                handleSave(e)
                return false
              }}
              onMouseDown={(e) => {
                console.log('[SubscriptionsPage] Button mouseDown!', e)
                e.stopPropagation()
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer relative z-10"
              style={{ pointerEvents: 'auto' }}
            >
              {editing ? 'Зберегти' : 'Створити'}
            </button>
          </div>
        </form>
      </BaseModal>

      <DeleteSubscriptionModal
        open={deleteModalOpen}
        subscription={subscriptionToDelete}
        onDelete={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false)
          setSubscriptionToDelete(null)
        }}
      />

      <BaseModal
        open={participantsModalOpen}
        onClose={() => {
          setParticipantsModalOpen(false)
          setSubscriptionForParticipants(null)
          setParticipants([])
          setTotalParticipants(1)
        }}
        title={
          <div className="flex items-center gap-2">
            <Users size={20} />
            <span>Учасники підписки "{subscriptionForParticipants?.name}"</span>
          </div>
        }
      >
        <div className="space-y-4">
          {subscriptionForParticipants && (() => {
            const totalAmount = Math.abs(subscriptionForParticipants.amount || 0)
            const participantsCount = totalParticipants || 1
            const frequency = subscriptionForParticipants.frequency || 'monthly'
            
            // Розрахунок суми на місяць
            let monthlyAmount = 0
            if (frequency === 'monthly') {
              monthlyAmount = totalAmount / participantsCount
            } else if (frequency === 'weekly') {
              // Приблизно 4.33 тижні в місяці
              monthlyAmount = (totalAmount * 4.33) / participantsCount
            }
            
            // Розрахунок суми на рік
            const yearlyAmount = monthlyAmount * 12
            
            return (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-indigo-900 mb-2">Розрахунок на учасника:</h4>
                <div className="space-y-1 text-sm text-indigo-700">
                  <div className="flex justify-between">
                    <span>На місяць:</span>
                    <span className="font-medium">{monthlyAmount.toFixed(2)} {subscriptionForParticipants.card_id ? (cards.find(c => c.id === subscriptionForParticipants.card_id)?.currency || '') : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>На рік:</span>
                    <span className="font-medium">{yearlyAmount.toFixed(2)} {subscriptionForParticipants.card_id ? (cards.find(c => c.id === subscriptionForParticipants.card_id)?.currency || '') : ''}</span>
                  </div>
                  <div className="text-xs text-indigo-600 mt-2 pt-2 border-t border-indigo-200">
                    Загальна сума: {totalAmount.toLocaleString()} {subscriptionForParticipants.card_id ? (cards.find(c => c.id === subscriptionForParticipants.card_id)?.currency || '') : ''} / {frequency === 'monthly' ? 'місяць' : 'тиждень'}
                  </div>
                </div>
              </div>
            )
          })()}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Загальна кількість учасників (включаючи вас)
            </label>
            <input
              type="number"
              min="1"
              value={totalParticipants}
              onChange={(e) => setTotalParticipants(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Вкажіть скільки всього людей скидається на цю підписку (включаючи вас)
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Імена учасників (необов'язково)
              </label>
              <button
                type="button"
                onClick={handleAddParticipant}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                + Додати ім'я
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {participants.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Немає доданих імен</p>
              ) : (
                participants.map((name, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => handleParticipantNameChange(index, e.target.value)}
                      placeholder={`Ім'я учасника ${index + 1}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Додайте імена людей, які скидаються (не обов'язково вказувати всіх)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setParticipantsModalOpen(false)
                setSubscriptionForParticipants(null)
                setParticipants([])
                setTotalParticipants(1)
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleSaveParticipants}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Зберегти
            </button>
          </div>
        </div>
      </BaseModal>
    </motion.div>
  )
}

