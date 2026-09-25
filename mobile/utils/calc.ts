// Tiny calculator for the amount keypad. Expressions use the display operators
// + − × ÷ and '.' as the decimal point; no eval, standard × ÷ before + − precedence.

export type CalcOp = '+' | '−' | '×' | '÷'
export const CALC_OPS: CalcOp[] = ['+', '−', '×', '÷']

const isOp = (ch: string): ch is CalcOp => (CALC_OPS as string[]).includes(ch)

export function hasOperator(expr: string): boolean {
  // A leading minus is a sign, not an operation
  return [...expr.slice(1)].some(isOp)
}

/** Evaluates the expression; ignores a dangling trailing operator. Returns null if invalid. */
export function evaluate(expr: string): number | null {
  let s = expr
  while (s && isOp(s[s.length - 1])) s = s.slice(0, -1)
  if (!s) return null

  const tokens: (number | CalcOp)[] = []
  let num = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (isOp(ch) && !(ch === '−' && i === 0)) {
      if (num === '' || num === '−') return null
      tokens.push(parseFloat(num.replace('−', '-')))
      tokens.push(ch)
      num = ''
    } else {
      num += ch
    }
  }
  if (num === '' || num === '.') return null
  tokens.push(parseFloat(num.replace('−', '-')))

  // Pass 1: × ÷
  const sums: (number | CalcOp)[] = [tokens[0]]
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as CalcOp
    const rhs = tokens[i + 1] as number
    if (op === '×' || op === '÷') {
      const lhs = sums.pop() as number
      if (op === '÷' && rhs === 0) return null
      sums.push(op === '×' ? lhs * rhs : lhs / rhs)
    } else {
      sums.push(op, rhs)
    }
  }
  // Pass 2: + −
  let result = sums[0] as number
  for (let i = 1; i < sums.length; i += 2) {
    const rhs = sums[i + 1] as number
    result = sums[i] === '+' ? result + rhs : result - rhs
  }
  if (!isFinite(result)) return null
  return Math.round(result * 100) / 100
}

/** Number → expression string (max 2 decimals, no trailing zeros). */
export function toExpr(n: number): string {
  const s = String(Math.round(n * 100) / 100)
  return s.startsWith('-') ? '−' + s.slice(1) : s
}

/** Applies one keypad key to the expression. */
export function pressKey(expr: string, key: string): string {
  const last = expr[expr.length - 1] ?? ''
  const currentNumber = expr.split(/[+−×÷]/).pop() ?? ''

  if (key === 'C') return ''
  if (key === '⌫') return expr.slice(0, -1)
  if (key === '=') {
    const v = evaluate(expr)
    return v === null ? expr : toExpr(v)
  }

  if (isOp(key)) {
    if (!expr) return key === '−' ? '−' : ''
    if (expr === '−') return expr
    if (isOp(last)) return expr.slice(0, -1) + key // swap operator
    if (last === '.') return expr.slice(0, -1) + key
    return expr + key
  }

  if (key === '.') {
    if (currentNumber.includes('.')) return expr
    return expr + (currentNumber === '' || currentNumber === '−' ? '0.' : '.')
  }

  // Digits ('0'-'9', '00')
  const decimals = currentNumber.split('.')[1]
  if (decimals !== undefined && decimals.length >= 2) return expr
  if (currentNumber.replace('−', '').replace('.', '').length >= 10) return expr
  if (currentNumber === '0' || currentNumber === '−0') {
    // Replace a lone leading zero instead of producing "007"
    return key === '00' ? expr : expr.slice(0, -1) + key
  }
  if (key === '00' && (currentNumber === '' || currentNumber === '−')) return expr + '0'
  if (key === '00' && decimals !== undefined && decimals.length === 1) return expr + '0'
  return expr + key
}

/** Pretty-prints an expression with thousands separators for display. */
export function formatExpr(expr: string): string {
  return expr.replace(/\d+(\.\d*)?/g, m => {
    const [int, dec] = m.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return dec !== undefined ? `${grouped},${dec}` : grouped
  })
}
