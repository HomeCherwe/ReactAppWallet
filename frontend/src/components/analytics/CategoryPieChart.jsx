import { useState, useEffect, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react'
import BaseModal from '../BaseModal'
import Row from '../transactions/Row'
import DetailsModal from '../transactions/DetailsModal'
import EditTxModal from '../transactions/EditTxModal'
import DeleteTxModal from '../transactions/DeleteTxModal'
import { apiFetch } from '../../utils.jsx'
import { fmtAmount } from '../../utils/format'
import { listCards } from '../../api/cards'
import { deleteTransaction, archiveTransaction } from '../../api/transactions'
import useMonoRates from '../../hooks/useMonoRates'
import { txBus } from '../../utils/txBus'
import toast, { Toaster } from 'react-hot-toast'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7', '#F43F5E', '#22C55E', '#EAB308'
]

const CustomTooltip = ({ active, payload, type }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    
    // Отримуємо суму в UAH та EUR (вже конвертовані)
    const totalUAH = data.totalUAH || 0
    const totalEUR = data.totalEUR || 0
    
    // Визначаємо чи це витрати чи доходи
    const isExpense = type === 'expenses'
    const sign = isExpense ? '-' : '+'
    const colorClass = isExpense ? 'text-red-600' : 'text-green-600'
    
    return (
      <div className="bg-white shadow-lg rounded-lg px-4 py-3 border border-gray-200">
        <div className="font-semibold text-sm mb-2">{data.name || 'Без категорії'}</div>
        <div className="text-xs text-gray-600 mb-1">
          Сума UAH: <span className={`font-semibold ${colorClass}`}>{sign}{fmtAmount(totalUAH, 'UAH')}</span>
        </div>
        <div className="text-xs text-gray-600 mb-1">
          Сума EUR: <span className={`font-semibold ${colorClass}`}>{sign}{fmtAmount(totalEUR, 'EUR')}</span>
        </div>
        <div className="text-xs text-gray-600">
          Транзакцій: <span className="font-semibold">{data.count || 0}</span>
        </div>
      </div>
    )
  }
  return null
}

export default function CategoryPieChart() {
  const [periodType, setPeriodType] = useState('month') // 'week', 'month', 'year', 'custom'
  // Ініціалізуємо currentDate на 1 число поточного місяця
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [customMode, setCustomMode] = useState(false) // Режим вибору вручну
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [customToDate, setCustomToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [appliedCustomDates, setAppliedCustomDates] = useState({ from: null, to: null })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryTransactions, setCategoryTransactions] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [cardMap, setCardMap] = useState({})
  const rates = useMonoRates()
  
  // Модалки для транзакцій
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)
  const [selectedTxCurrency, setSelectedTxCurrency] = useState(null)
  
  // Загальні суми
  const [totalIncome, setTotalIncome] = useState({ uah: 0, eur: 0 })
  const [totalExpense, setTotalExpense] = useState({ uah: 0, eur: 0 })

  // Обчислюємо період на основі типу та поточної дати
  const period = useMemo(() => {
    // Якщо режим вручну, використовуємо застосовані дати
    if (customMode && appliedCustomDates.from && appliedCustomDates.to) {
      const start = new Date(appliedCustomDates.from)
      start.setHours(0, 0, 0, 0)
      const end = new Date(appliedCustomDates.to)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }

    // Створюємо нові об'єкти дат, щоб уникнути мутації
    const now = new Date(currentDate.getTime())
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let start, end

    if (periodType === 'week') {
      // Тиждень: з понеділка по неділю
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Понеділок
      start = new Date(now.getFullYear(), now.getMonth(), diff)
      start.setHours(0, 0, 0, 0)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      // Якщо це поточний тиждень, обмежуємо до сьогодні
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)
      if (end > todayEnd) {
        end = todayEnd
      }
    } else if (periodType === 'month') {
      // Місяць: завжди з 1 числа по сьогодні (якщо поточний місяць) або до кінця місяця
      // Гарантуємо, що починаємо з 1 числа, незалежно від того, яка дата в currentDate
      const month = now.getMonth()
      const year = now.getFullYear()
      start = new Date(year, month, 1)
      start.setHours(0, 0, 0, 0)
      
      const todayMonth = today.getMonth()
      const todayYear = today.getFullYear()
      
      // Якщо це поточний місяць, обмежуємо до сьогодні
      if (month === todayMonth && year === todayYear) {
        end = new Date(today)
        end.setHours(23, 59, 59, 999)
      } else {
        // Інакше до кінця місяця
        end = new Date(year, month + 1, 0)
        end.setHours(23, 59, 59, 999)
      }
    } else if (periodType === 'year') {
      // Рік: з 1 січня по сьогодні (якщо поточний рік) або до кінця року
      start = new Date(now.getFullYear(), 0, 1)
      start.setHours(0, 0, 0, 0)
      // Якщо це поточний рік, обмежуємо до сьогодні
      if (now.getFullYear() === today.getFullYear()) {
        end = new Date(today)
        end.setHours(23, 59, 59, 999)
      } else {
        // Інакше до кінця року
        end = new Date(now.getFullYear(), 11, 31)
        end.setHours(23, 59, 59, 999)
      }
    }

    return { start, end }
  }, [periodType, currentDate])

  // Завантажуємо карти для мапінгу валют та визначення Binance та Savings
  useEffect(() => {
    listCards().then(cards => {
      const map = {}
      cards.forEach(c => { 
        const bank = (c.bank || '').toLowerCase()
        const name = (c.name || '').toLowerCase()
        map[c.id] = {
          currency: c.currency || 'UAH',
          isBinance: bank.includes('binance') || name.includes('binance'),
          isSavings: bank.includes('збер') || bank.includes('savings') || name.includes('збер') || name.includes('savings')
        }
      })
      setCardMap(map)
    }).catch(() => {})
  }, [])

  // Захист від дублювання через AbortController
  const abortControllerRef = useRef(null)

  // Завантажуємо дані по категоріях
  useEffect(() => {
    // Скасовуємо попередній запит, якщо він є
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Створюємо новий AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const fetchData = async () => {
      setLoading(true)
      
      try {
        // Форматуємо дати з урахуванням часу для включення всього дня
        const formatDate = (date, isEndDate = false) => {
          if (isEndDate) {
            // Для end_date встановлюємо час на кінець дня (23:59:59.999) у локальному часовому поясі
            // Потім конвертуємо в ISO формат для передачі на backend
            const endDate = new Date(date)
            endDate.setHours(23, 59, 59, 999)
            // Використовуємо toISOString() для конвертації в UTC
            // Це гарантує, що весь день включено, навіть якщо локальний час конвертується в UTC
            return endDate.toISOString()
          }
          
          // Для start_date встановлюємо час на початок дня (00:00:00) у локальному часовому поясі
          const startDate = new Date(date)
          startDate.setHours(0, 0, 0, 0)
          return startDate.toISOString()
        }
        
        const startDate = formatDate(period.start, false)
        const endDate = formatDate(period.end, true)
        
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
          fields: 'id,amount,category,card_id,created_at,card,is_transfer,is_savings'
        })

        // Перевіряємо перед виконанням запиту
        if (abortController.signal.aborted) {
          setLoading(false)
          return
        }
        
        // Отримуємо транзакції з карток (card_id не null)
        let cardTransactions = []
        try {
          cardTransactions = await apiFetch(`/api/transactions?${params}`, {
            signal: abortController.signal
          }) || []
        } catch (error) {
          // Якщо запит був скасований, просто виходимо
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            setLoading(false)
            return
          }
          throw error
        }
        
        // Перевіряємо після отримання відповіді
        if (abortController.signal.aborted) {
          setLoading(false)
          return
        }
        
        // Отримуємо готівкові транзакції (card_id = null)
        const cashParams = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
          card_id: 'null',
          fields: 'id,amount,category,card_id,created_at,card,is_transfer,is_savings'
        })
        
        let cashTransactions = []
        try {
          cashTransactions = await apiFetch(`/api/transactions?${cashParams}`, {
            signal: abortController.signal
          }) || []
        } catch (error) {
          // Якщо запит був скасований, просто виходимо
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            setLoading(false)
            return
          }
          throw error
        }
        
        // Перевіряємо після отримання відповіді
        if (abortController.signal.aborted) {
          setLoading(false)
          return
        }
        
        // Об'єднуємо транзакції з карток та готівкові
        const transactions = [...cardTransactions, ...cashTransactions]
        
        // Фільтруємо трансфери, Binance, Savings та "ПОВЕРНЕННЯ" транзакції
        const filteredTransactions = transactions.filter(tx => {
          // Виключаємо трансфери
          if (tx.is_transfer) return false
          
          // Виключаємо категорію "ТРАНСФЕР"
          if (tx.category === 'ТРАНСФЕР') return false

          // Виключаємо повернення (linked refunds)
          if (String(tx.category || '').toUpperCase() === 'ПОВЕРНЕННЯ') return false
          if (String(tx.note || '').includes('[refund_for:')) return false
          
          // Виключаємо Binance транзакції (перевіряємо по card_id або по card)
          if (tx.card_id && cardMap[tx.card_id]?.isBinance) return false
          
          const card = (tx.card || '').toLowerCase()
          if (card.includes('binance')) return false
          
          // Виключаємо Savings транзакції (перевіряємо по card_id або по card)
          if (tx.card_id && cardMap[tx.card_id]?.isSavings) return false
          
          if (card.includes('збер') || card.includes('savings')) return false
          
          // Виключаємо транзакції з is_savings флагом
          if (tx.is_savings) return false
          
          return true
        })
        
        // Функція конвертації валют
        const convertCurrency = (amount, fromCurrency, toCurrency) => {
          if (!fromCurrency || fromCurrency === toCurrency) return amount
          
          const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }
          const fromCode = codeMap[fromCurrency] || 980
          const toCode = codeMap[toCurrency] || 980
          
          if (fromCode === toCode) return amount
          
          // Конвертуємо через UAH як проміжну валюту
          let inUAH = amount
          if (fromCode !== 980) {
            const rateToUAH = rates?.[`${fromCode}->980`]
            if (!rateToUAH) return amount
            inUAH = amount * rateToUAH
          }
          
          // Потім конвертуємо з UAH в цільову валюту
          if (toCode === 980) return inUAH
          const rateFromUAH = rates?.[`${toCode}->980`]
          if (!rateFromUAH) return inUAH
          return inUAH / rateFromUAH
        }

        // Групуємо по категоріях, розділяючи на доходи та витрати
        const expenseMap = {}
        const incomeMap = {}

        filteredTransactions.forEach(tx => {
          const category = tx.category || 'Без категорії'
          const amount = Number(tx.amount || 0)
          // Для готівкових транзакцій (card_id = null) валюта завжди UAH
          const txCurrency = tx.card_id ? (cardMap[tx.card_id]?.currency || 'UAH') : 'UAH'
          const absAmount = Math.abs(amount)
          
          // Конвертуємо в UAH та EUR
          const amountUAH = convertCurrency(absAmount, txCurrency, 'UAH')
          const amountEUR = convertCurrency(absAmount, txCurrency, 'EUR')
          
          if (amount < 0) {
            // Витрата
            if (!expenseMap[category]) {
              expenseMap[category] = { 
                name: category, 
                value: 0, // Для графіка використовуємо UAH
                totalUAH: 0,
                totalEUR: 0,
                count: 0,
                transactions: []
              }
            }
            expenseMap[category].value += amountUAH
            expenseMap[category].totalUAH += amountUAH
            expenseMap[category].totalEUR += amountEUR
            expenseMap[category].count += 1
            expenseMap[category].transactions.push(tx)
          } else if (amount > 0) {
            // Дохід
            if (!incomeMap[category]) {
              incomeMap[category] = { 
                name: category, 
                value: 0, // Для графіка використовуємо UAH
                totalUAH: 0,
                totalEUR: 0,
                count: 0,
                transactions: []
              }
            }
            incomeMap[category].value += amountUAH
            incomeMap[category].totalUAH += amountUAH
            incomeMap[category].totalEUR += amountEUR
            incomeMap[category].count += 1
            incomeMap[category].transactions.push(tx)
          }
        })

        // Конвертуємо в масиви
        const expenses = Object.values(expenseMap)
        const incomes = Object.values(incomeMap)

        // Сортуємо за сумою
        expenses.sort((a, b) => b.value - a.value)
        incomes.sort((a, b) => b.value - a.value)

        // Розраховуємо загальні суми
        const totalIncomeUAH = incomes.reduce((sum, cat) => sum + (cat.totalUAH || 0), 0)
        const totalIncomeEUR = incomes.reduce((sum, cat) => sum + (cat.totalEUR || 0), 0)
        const totalExpenseUAH = expenses.reduce((sum, cat) => sum + (cat.totalUAH || 0), 0)
        const totalExpenseEUR = expenses.reduce((sum, cat) => sum + (cat.totalEUR || 0), 0)

        setTotalIncome({ uah: totalIncomeUAH, eur: totalIncomeEUR })
        setTotalExpense({ uah: totalExpenseUAH, eur: totalExpenseEUR })

        setData({ expenses, incomes })
        setLoading(false)
      } catch (error) {
        // Не логуємо помилку, якщо запит був скасований (це нормальна поведінка)
        if (error.name === 'AbortError' || abortController.signal.aborted) {
          setLoading(false)
          return
        }
        // Логуємо тільки реальні помилки
        console.error('Failed to fetch category data:', error)
        setData({ expenses: [], incomes: [] })
        setLoading(false)
      }
    }

    fetchData()
    
    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [period.start.toISOString(), period.end.toISOString(), Object.keys(cardMap).join(','), rates ? Object.keys(rates).join(',') : ''])

  const handlePeriodChange = (direction) => {
    const newDate = new Date(currentDate)
    if (periodType === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else if (periodType === 'month') {
      // Змінюємо місяць, а потім встановлюємо на 1 число
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
      newDate.setDate(1)
      newDate.setHours(0, 0, 0, 0)
    } else if (periodType === 'year') {
      // Змінюємо рік, а потім встановлюємо на 1 січня
      newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
      newDate.setMonth(0)
      newDate.setDate(1)
      newDate.setHours(0, 0, 0, 0)
    }
    setCurrentDate(newDate)
  }

  const handleSliceClick = (clickData, type) => {
    if (!clickData || !clickData.name) return
    
    const category = clickData.name
    setSelectedCategory(category)
    
    // Знаходимо транзакції цієї категорії
    const categories = type === 'expenses' ? (data.expenses || []) : (data.incomes || [])
    const categoryData = categories.find(cat => cat.name === category)
    
    if (categoryData && categoryData.transactions) {
      setCategoryTransactions(categoryData.transactions)
      setModalOpen(true)
    }
  }

  const formatPeriodLabel = () => {
    if (customMode && appliedCustomDates.from && appliedCustomDates.to) {
      const from = new Date(appliedCustomDates.from)
      const to = new Date(appliedCustomDates.to)
      return `${from.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })} - ${to.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}`
    }
    
    if (periodType === 'week') {
      const start = period.start
      const end = period.end
      return `${start.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })}`
    } else if (periodType === 'month') {
      return currentDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    } else if (periodType === 'year') {
      return currentDate.getFullYear().toString()
    }
    return ''
  }

  const handleApplyCustomDates = () => {
    setAppliedCustomDates({ from: customFromDate, to: customToDate })
    setCustomMode(true)
    setPeriodType('custom')
  }

  const handleCustomModeToggle = () => {
    if (customMode) {
      // Виходимо з режиму вручну
      setCustomMode(false)
      setPeriodType('month')
      setAppliedCustomDates({ from: null, to: null })
    } else {
      // Входимо в режим вручну
      setCustomMode(true)
      setPeriodType('custom')
    }
  }

  // Закриваємо date picker при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker])

  // Генеруємо список місяців
  const getMonthsList = () => {
    const months = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ]
    const currentYear = new Date().getFullYear()
    const years = []
    for (let i = currentYear; i >= currentYear - 10; i--) {
      years.push(i)
    }
    
    const result = []
    years.forEach(year => {
      months.forEach((month, index) => {
        result.push({ year, month, monthIndex: index })
      })
    })
    return result
  }

  // Генеруємо список років
  const getYearsList = () => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let i = currentYear; i >= currentYear - 20; i--) {
      years.push(i)
    }
    return years
  }

  // Генеруємо список тижнів місяця
  const getWeeksOfMonth = () => {
    const now = new Date(currentDate)
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    const weeks = []
    let currentWeekStart = new Date(firstDay)
    
    // Знаходимо понеділок першого тижня
    const dayOfWeek = firstDay.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    currentWeekStart.setDate(firstDay.getDate() - daysToMonday)
    
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(currentWeekStart.getDate() + 6)
      
      // Обмежуємо до кінця місяця
      if (weekEnd > lastDay) {
        weekEnd.setTime(lastDay.getTime())
      }
      
      weeks.push({
        start: new Date(currentWeekStart),
        end: new Date(weekEnd)
      })
      
      currentWeekStart.setDate(currentWeekStart.getDate() + 7)
    }
    
    return weeks
  }

  const handleDateSelect = (value) => {
    if (periodType === 'month') {
      const { year, monthIndex } = value
      const newDate = new Date(year, monthIndex, 1)
      newDate.setHours(0, 0, 0, 0)
      setCurrentDate(newDate)
      setShowDatePicker(false)
    } else if (periodType === 'year') {
      const newDate = new Date(value, 0, 1)
      newDate.setHours(0, 0, 0, 0)
      setCurrentDate(newDate)
      setShowDatePicker(false)
    } else if (periodType === 'week') {
      const newDate = new Date(value.start)
      newDate.setHours(0, 0, 0, 0)
      setCurrentDate(newDate)
      setShowDatePicker(false)
    }
  }

  // Обробники для транзакцій
  const handleDetails = (tx) => {
    const currency = cardMap[tx.card_id]?.currency || 'UAH'
    setSelectedTx(tx)
    setSelectedTxCurrency(currency)
    setDetailsModalOpen(true)
  }

  const handleEdit = (tx) => {
    const currency = cardMap[tx.card_id]?.currency || 'UAH'
    setSelectedTx(tx)
    setSelectedTxCurrency(currency)
    setEditModalOpen(true)
  }

  const handleAskDelete = (tx) => {
    const currency = cardMap[tx.card_id]?.currency || 'UAH'
    setSelectedTx(tx)
    setSelectedTxCurrency(currency)
    setDeleteModalOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedTx) return
    try {
      await deleteTransaction(selectedTx.id)
      // Оновити список транзакцій
      setCategoryTransactions(prev => prev.filter(tx => tx.id !== selectedTx.id))
      // Оновити дані графіка
      const categories = [...(data.expenses || []), ...(data.incomes || [])]
      const categoryData = categories.find(cat => cat.name === selectedCategory)
      if (categoryData) {
        categoryData.transactions = categoryData.transactions.filter(tx => tx.id !== selectedTx.id)
        categoryData.count -= 1
        // Перерахувати суми
        const convertCurrency = (amount, fromCurrency, toCurrency) => {
          if (!fromCurrency || fromCurrency === toCurrency) return amount
          const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }
          const fromCode = codeMap[fromCurrency] || 980
          const toCode = codeMap[toCurrency] || 980
          if (fromCode === toCode) return amount
          let inUAH = amount
          if (fromCode !== 980) {
            const rateToUAH = rates?.[`${fromCode}->980`]
            if (!rateToUAH) return amount
            inUAH = amount * rateToUAH
          }
          if (toCode === 980) return inUAH
          const rateFromUAH = rates?.[`${toCode}->980`]
          if (!rateFromUAH) return inUAH
          return inUAH / rateFromUAH
        }
        const txCurrency = cardMap[selectedTx.card_id]?.currency || 'UAH'
        const absAmount = Math.abs(Number(selectedTx.amount || 0))
        const amountUAH = convertCurrency(absAmount, txCurrency, 'UAH')
        const amountEUR = convertCurrency(absAmount, txCurrency, 'EUR')
        categoryData.value -= amountUAH
        categoryData.totalUAH -= amountUAH
        categoryData.totalEUR -= amountEUR
        
        // Оновити загальні суми
        if (Number(selectedTx.amount) < 0) {
          setTotalExpense(prev => ({
            uah: prev.uah - amountUAH,
            eur: prev.eur - amountEUR
          }))
        } else {
          setTotalIncome(prev => ({
            uah: prev.uah - amountUAH,
            eur: prev.eur - amountEUR
          }))
        }
      }
      // Інформувати інші компоненти
      txBus.emit({ 
        card_id: selectedTx.card_id || null, 
        delta: Number(selectedTx.amount || 0) * -1 
      })
      toast.success('Транзакцію видалено')
      setDeleteModalOpen(false)
      setSelectedTx(null)
    } catch (error) {
      console.error('Delete tx error:', error)
      toast.error('Не вдалося видалити транзакцію')
    }
  }

  const handleArchive = async () => {
    if (!selectedTx) return
    try {
      await archiveTransaction(selectedTx.id)
      // Оновити список транзакцій
      setCategoryTransactions(prev => prev.filter(tx => tx.id !== selectedTx.id))
      // Оновити дані графіка та загальні суми (аналогічно до handleDelete)
      const categories = [...(data.expenses || []), ...(data.incomes || [])]
      const categoryData = categories.find(cat => cat.name === selectedCategory)
      if (categoryData) {
        categoryData.transactions = categoryData.transactions.filter(tx => tx.id !== selectedTx.id)
        categoryData.count -= 1
        const convertCurrency = (amount, fromCurrency, toCurrency) => {
          if (!fromCurrency || fromCurrency === toCurrency) return amount
          const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }
          const fromCode = codeMap[fromCurrency] || 980
          const toCode = codeMap[toCurrency] || 980
          if (fromCode === toCode) return amount
          let inUAH = amount
          if (fromCode !== 980) {
            const rateToUAH = rates?.[`${fromCode}->980`]
            if (!rateToUAH) return amount
            inUAH = amount * rateToUAH
          }
          if (toCode === 980) return inUAH
          const rateFromUAH = rates?.[`${toCode}->980`]
          if (!rateFromUAH) return inUAH
          return inUAH / rateFromUAH
        }
        const txCurrency = cardMap[selectedTx.card_id]?.currency || 'UAH'
        const absAmount = Math.abs(Number(selectedTx.amount || 0))
        const amountUAH = convertCurrency(absAmount, txCurrency, 'UAH')
        const amountEUR = convertCurrency(absAmount, txCurrency, 'EUR')
        categoryData.value -= amountUAH
        categoryData.totalUAH -= amountUAH
        categoryData.totalEUR -= amountEUR
        
        // Оновити загальні суми
        if (Number(selectedTx.amount) < 0) {
          setTotalExpense(prev => ({
            uah: prev.uah - amountUAH,
            eur: prev.eur - amountEUR
          }))
        } else {
          setTotalIncome(prev => ({
            uah: prev.uah - amountUAH,
            eur: prev.eur - amountEUR
          }))
        }
      }
      // Інформувати інші компоненти
      txBus.emit({ 
        card_id: selectedTx.card_id || null, 
        delta: Number(selectedTx.amount || 0) * -1 
      })
      toast.success('Транзакцію архівовано')
      setDeleteModalOpen(false)
      setSelectedTx(null)
    } catch (error) {
      console.error('Archive tx error:', error)
      toast.error('Не вдалося архівувати транзакцію')
    }
  }

  const handleSaved = (updatedTx) => {
    // Оновити транзакцію в списку
    setCategoryTransactions(prev => 
      prev.map(tx => tx.id === updatedTx.id ? updatedTx : tx)
    )
    setEditModalOpen(false)
    setSelectedTx(null)
  }

  return (
    <div className="space-y-6">
      {/* Селектор періоду */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {!customMode ? (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePeriodChange('prev')}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <ChevronLeft size={20} />
              </button>
              
              <div 
                ref={datePickerRef}
                className="relative"
              >
                <div
                  className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg min-w-[200px] justify-between cursor-pointer hover:bg-gray-100 transition"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-500" />
                    <span className="font-medium text-sm">{formatPeriodLabel()}</span>
                  </div>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                </div>
                
                <AnimatePresence>
                  {showDatePicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto"
                      style={{ minWidth: '280px' }}
                    >
                      {periodType === 'month' && (
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Виберіть місяць та рік</div>
                          <div className="space-y-1">
                            {getMonthsList().map((item, index) => {
                              const isSelected = currentDate.getFullYear() === item.year && 
                                                currentDate.getMonth() === item.monthIndex
                              return (
                                <button
                                  key={index}
                                  onClick={() => handleDateSelect(item)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {item.month} {item.year}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {periodType === 'year' && (
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Виберіть рік</div>
                          <div className="grid grid-cols-3 gap-1">
                            {getYearsList().map((year) => {
                              const isSelected = currentDate.getFullYear() === year
                              return (
                                <button
                                  key={year}
                                  onClick={() => handleDateSelect(year)}
                                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {year}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {periodType === 'week' && (
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Виберіть тиждень</div>
                          <div className="space-y-1">
                            {getWeeksOfMonth().map((week, index) => {
                              const weekStartStr = week.start.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })
                              const weekEndStr = week.end.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })
                              const isCurrentWeek = currentDate >= week.start && currentDate <= week.end
                              return (
                                <button
                                  key={index}
                                  onClick={() => handleDateSelect(week)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isCurrentWeek
                                      ? 'bg-indigo-600 text-white'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {weekStartStr} - {weekEndStr}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <button
                onClick={() => handlePeriodChange('next')}
                className="p-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  (periodType === 'month' && 
                   currentDate.getMonth() >= new Date().getMonth() && 
                   currentDate.getFullYear() >= new Date().getFullYear()) ||
                  (periodType === 'year' && currentDate.getFullYear() >= new Date().getFullYear())
                }
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="flex gap-2">
              {['week', 'month', 'year'].map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setPeriodType(type)
                    setCustomMode(false)
                    setShowDatePicker(false)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    periodType === type
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'week' ? 'Тиждень' : type === 'month' ? 'Місяць' : 'Рік'}
                </button>
              ))}
              <button
                onClick={handleCustomModeToggle}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  customMode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Вибрати вручну
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 flex-wrap w-full">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm text-gray-600 min-w-[80px]">З дати:</label>
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm text-gray-600 min-w-[80px]">По дату:</label>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApplyCustomDates}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Застосувати
              </button>
              <button
                onClick={handleCustomModeToggle}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Графіки */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Завантаження...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Витрати */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-rose-600">Витрати по категоріям</h3>
            {/* Загальна витрата */}
            <div className="bg-rose-50 rounded-xl p-3 mb-4 border border-rose-200">
              <div className="text-xs text-rose-600 font-medium mb-1">Загальна витрата</div>
              <div className="text-xl font-bold text-rose-700 transition-colors cursor-default hover:text-red-600">
                -{fmtAmount(totalExpense.uah, 'UAH')}
              </div>
              <div className="text-xs text-rose-600 mt-1 transition-colors cursor-default hover:text-red-600">
                -{fmtAmount(totalExpense.eur, 'EUR')}
              </div>
            </div>
            {data.expenses && data.expenses.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.expenses}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={800}
                      onClick={(data) => handleSliceClick(data, 'expenses')}
                      style={{ cursor: 'pointer' }}
                    >
                      {data.expenses.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip type="expenses" />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Список категорій */}
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {data.expenses.map((entry, index) => {
                    const percentage = totalExpense.uah > 0 
                      ? ((entry.totalUAH / totalExpense.uah) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <div 
                        key={index} 
                        className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedCategory(entry.name)
                          setCategoryTransactions(entry.transactions || [])
                          setModalOpen(true)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{entry.name || 'Без категорії'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-600">-{fmtAmount(entry.totalUAH, 'UAH')}</span>
                          <span className="text-gray-600">-{fmtAmount(entry.totalEUR, 'EUR')}</span>
                          <span className="text-gray-400 font-medium min-w-[50px] text-right">{percentage}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Немає витрат за цей період
              </div>
            )}
          </div>

          {/* Доходи */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-emerald-600">Доходи по категоріям</h3>
            {/* Загальний дохід */}
            <div className="bg-emerald-50 rounded-xl p-3 mb-4 border border-emerald-200">
              <div className="text-xs text-emerald-600 font-medium mb-1">Загальний дохід</div>
              <div className="text-xl font-bold text-emerald-700 transition-colors cursor-default hover:text-green-600">
                +{fmtAmount(totalIncome.uah, 'UAH')}
              </div>
              <div className="text-xs text-emerald-600 mt-1 transition-colors cursor-default hover:text-green-600">
                +{fmtAmount(totalIncome.eur, 'EUR')}
              </div>
            </div>
            {data.incomes && data.incomes.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.incomes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={800}
                      onClick={(data) => handleSliceClick(data, 'incomes')}
                      style={{ cursor: 'pointer' }}
                    >
                      {data.incomes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip type="incomes" />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Список категорій */}
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {data.incomes.map((entry, index) => {
                    const percentage = totalIncome.uah > 0 
                      ? ((entry.totalUAH / totalIncome.uah) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <div 
                        key={index} 
                        className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedCategory(entry.name)
                          setCategoryTransactions(entry.transactions || [])
                          setModalOpen(true)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{entry.name || 'Без категорії'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-600">+{fmtAmount(entry.totalUAH, 'UAH')}</span>
                          <span className="text-gray-600">+{fmtAmount(entry.totalEUR, 'EUR')}</span>
                          <span className="text-gray-400 font-medium min-w-[50px] text-right">{percentage}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Немає доходів за цей період
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка з транзакціями */}
      <BaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Транзакції: ${selectedCategory || ''}`}
        maxWidth="lg"
        zIndex={110}
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {categoryTransactions.length > 0 ? (
            categoryTransactions.map(tx => {
              const currency = cardMap[tx.card_id]?.currency || 'UAH'
              return (
                <Row
                  key={tx.id}
                  tx={tx}
                  currency={currency}
                  onDetails={handleDetails}
                  onAskDelete={handleAskDelete}
                  onEdit={handleEdit}
                />
              )
            })
          ) : (
            <div className="text-center text-gray-500 py-8">Немає транзакцій</div>
          )}
        </div>
      </BaseModal>

      {/* Модалка деталей транзакції */}
      <DetailsModal
        open={detailsModalOpen}
        tx={selectedTx}
        currency={selectedTxCurrency}
        onClose={() => {
          setDetailsModalOpen(false)
          setSelectedTx(null)
        }}
      />

      {/* Модалка редагування транзакції */}
      <EditTxModal
        open={editModalOpen}
        tx={selectedTx}
        onClose={() => {
          setEditModalOpen(false)
          setSelectedTx(null)
        }}
        onSaved={handleSaved}
      />

      {/* Модалка видалення транзакції */}
      <DeleteTxModal
        open={deleteModalOpen}
        transaction={selectedTx}
        onDelete={handleDelete}
        onArchive={handleArchive}
        onCancel={() => {
          setDeleteModalOpen(false)
          setSelectedTx(null)
        }}
      />
      <Toaster position="top-right" />
    </div>
  )
}

