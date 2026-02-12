import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, DollarSign, FileText, ArrowRight, History } from 'lucide-react'
import { getTransactionsBySubscription } from '../../api/transactions'
import Row from '../transactions/Row'
import toast from 'react-hot-toast'

export default function SubscriptionTransactionsDrawer({ open, onClose, subscription, cards = [] }) {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open && subscription) {
            loadTransactions()
        }
    }, [open, subscription])

    const loadTransactions = async () => {
        setLoading(true)
        try {
            const data = await getTransactionsBySubscription(subscription.id)
            setTransactions(data || [])
        } catch (e) {
            console.error('Failed to load transactions:', e)
            toast.error('Не вдалося завантажити історію транзакцій')
        } finally {
            setLoading(false)
        }
    }

    // Helper map for currency lookup
    const cardMap = useMemo(() => {
        const map = {}
        cards.forEach(c => { map[c.id] = c.currency || 'UAH' })
        return map
    }, [cards])

    // Grouping logic (copied from MonthlyPayment)
    const formatDateKey = (date) => {
        const d = new Date(date)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    const getDayName = (date) => {
        const days = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п\'ятниця', 'субота']
        return days[date.getDay()]
    }

    const formatDateHeader = (date) => {
        const d = new Date(date)
        const day = d.getDate()
        const month = d.toLocaleDateString('uk-UA', { month: 'long' })
        const dayName = getDayName(d).toUpperCase()
        return `${day} ${month.toUpperCase()}, ${dayName}`
    }

    const isToday = (date) => {
        const today = new Date()
        const txDate = new Date(date)
        return today.toDateString() === txDate.toDateString()
    }

    const groupedByDay = useMemo(() => {
        return transactions.reduce((acc, tx) => {
            const dayKey = formatDateKey(tx.created_at)
            if (!acc[dayKey]) {
                acc[dayKey] = {
                    date: tx.created_at,
                    dateHeader: isToday(tx.created_at) ? 'СЬОГОДНІ' : formatDateHeader(tx.created_at),
                    transactions: []
                }
            }
            acc[dayKey].transactions.push(tx)
            return acc
        }, {})
    }, [transactions])

    const sortedDays = Object.keys(groupedByDay).sort((a, b) => {
        const dateA = new Date(groupedByDay[a].date)
        const dateB = new Date(groupedByDay[b].date)
        return dateB - dateA // newest first
    })

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 z-[100]"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-[101] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <History size={20} />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900">Історія транзакцій</h2>
                                    <p className="text-xs text-gray-500">{subscription?.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                            {loading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                                    <div className="p-4 bg-gray-100 rounded-full mb-3">
                                        <History size={32} className="opacity-40" />
                                    </div>
                                    <p>Транзакцій за цією підпискою не знайдено</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {sortedDays.map(dayKey => {
                                        const group = groupedByDay[dayKey]
                                        return (
                                            <div key={dayKey}>
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                                                    {group.dateHeader}
                                                </h3>
                                                <div className="space-y-2">
                                                    {group.transactions.map((tx) => (
                                                        <Row
                                                            key={tx.id}
                                                            tx={tx}
                                                            currency={tx.currency || cardMap[tx.card_id] || 'UAH'} // Get currency from card or tx
                                                            className="bg-white"
                                                        // onDetails={() => {}} // Optional: details on click
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
