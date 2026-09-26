import { Star } from 'lucide-react'
import { getCardTheme, cardBackground, formatMaskedNumber, formatMoney } from '../../utils/cardTheme'
import { convertAmount } from '../../utils/primaryCurrency'

/**
 * A payment card drawn like on the iPhone Home carousel: bank tag, name, currency badge,
 * balance (plus ≈ in the main currency), masked number and the chip. A skin is shown under a dark veil.
 */
export default function WalletCard({
  card,
  balance = 0,
  primaryCurrency,
  rates,
  hidden = false,
  excluded = false,
  isFavorite = false,
  onToggleFavorite,
  onClick,
  className = '',
}) {
  const theme = getCardTheme(card.bank, card.name)
  const skin = !!card.bg_url
  const cur = String(card.currency || 'UAH').toUpperCase()
  const showConverted = !hidden && primaryCurrency && cur !== primaryCurrency && Math.abs(balance) > 0
  const converted = showConverted ? convertAmount(balance, cur, primaryCurrency, rates) : null
  const minus = balance < 0 ? '−' : ''
  // On a skin the text is always white
  const text = skin ? '#FFFFFF' : theme.textColor
  const sub = skin ? 'rgba(255, 255, 255, 0.72)' : theme.subColor
  const circle = theme.isLight && !skin ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.06)'

  return (
    <div
      onClick={(e) => {
        if (e.target.closest('button')) return
        onClick?.(card)
      }}
      className={`relative h-[195px] rounded-[32px] overflow-hidden select-none ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
      style={{
        backgroundImage: skin ? `url(${card.bg_url})` : cardBackground(theme),
        backgroundColor: theme.gradient[0],
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: `1px solid ${theme.borderColor}`,
      }}
    >
      {skin && <div className="absolute inset-0 bg-black/45" />}

      {/* Soft circles, like the iPhone cards */}
      <div className="absolute -top-[60px] -right-[60px] h-[220px] w-[220px] rounded-full" style={{ background: circle }} />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full" style={{ background: skin || !theme.isLight ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }} />

      <div className="relative h-full p-5 flex flex-col justify-between">
        {/* Top: bank, name, currency */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[0.15em] truncate" style={{ color: sub }}>
              {(card.bank || 'КАРТКА').toUpperCase()}
            </div>
            <div className="text-lg font-extrabold tracking-tight truncate mt-0.5" style={{ color: text }}>
              {card.name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(card.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-6 w-6 grid place-items-center rounded-full transition-colors"
                  style={{ background: isFavorite ? 'rgba(250, 204, 21, 0.25)' : theme.badgeBg }}
                  title={isFavorite ? 'Прибрати з вибраних' : 'Додати до вибраних'}
                >
                  <Star
                    size={12}
                    className={isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}
                    style={isFavorite ? undefined : { color: theme.badgeText }}
                  />
                </button>
              )}
              <span
                className="px-2 py-[3px] rounded-full text-[11px] font-extrabold tracking-wide"
                style={{ background: theme.badgeBg, color: theme.badgeText }}
              >
                {card.currency}
              </span>
            </div>
            {excluded && (
              <span className="px-2 py-[3px] rounded-lg bg-black/45 text-[10px] font-bold text-white/85">
                Поза статистикою
              </span>
            )}
          </div>
        </div>

        {/* Balance */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: sub }}>Баланс</div>
          <div className="text-[26px] leading-tight font-extrabold tracking-tight tabular-nums" style={{ color: text }}>
            {hidden ? '••••' : `${minus}${formatMoney(balance, card.currency)}`}
          </div>
          {converted != null && (
            <div className="text-xs font-semibold mt-0.5" style={{ color: sub }}>
              ≈ {minus}{formatMoney(converted, primaryCurrency, { hideCents: true })}
            </div>
          )}
        </div>

        {/* Number and chip */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[13px] font-bold tracking-[0.12em]" style={{ color: sub }}>
            {hidden ? '•••• •••• •••• ••••' : formatMaskedNumber(card.card_number, card.bank, card.name)}
          </span>
          <span className="h-6 w-8 rounded-[5px] p-[3px]" style={{ background: theme.chipBg }}>
            <span className="block h-full w-full rounded-[3px] border" style={{ borderColor: theme.chipBorder }} />
          </span>
        </div>
      </div>
    </div>
  )
}
