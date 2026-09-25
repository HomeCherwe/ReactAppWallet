import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, TextStyle, View } from 'react-native'

// Each digit column holds 0-9 three times; resting position is the middle copy,
// so a digit can roll up (increase) or down (decrease) past 9↔0 without jumping back.
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10)

interface DigitProps {
  digit: number
  direction: number
  height: number
  delay: number
  textStyle: TextStyle[]
}

function Digit({ digit, direction, height, delay, textStyle }: DigitProps) {
  const y = useRef(new Animated.Value(-(digit + 10) * height)).current
  const current = useRef(digit)

  useEffect(() => {
    const from = current.current
    current.current = digit
    if (from === digit) return

    let target = digit + 10
    if (direction > 0 && digit < from) target = digit + 20 // roll up past 9 → 0
    if (direction < 0 && digit > from) target = digit // roll down past 0 → 9

    Animated.timing(y, {
      toValue: -target * height,
      duration: 650,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) y.setValue(-(digit + 10) * height)
    })
  }, [digit])

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {STRIP.map((d, i) => (
          <Text key={i} style={[...textStyle, { height, lineHeight: height }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  )
}

interface RollingNumberProps {
  value: number
  format: (value: number) => string
  style?: TextStyle | TextStyle[]
}

/**
 * Odometer-style number: when `value` changes, each digit rolls
 * up (value grew) or down (value shrank) to its new position.
 */
export default function RollingNumber({ value, format, style }: RollingNumberProps) {
  const prev = useRef(value)
  const direction = Math.sign(value - prev.current)
  useEffect(() => {
    prev.current = value
  }, [value])

  const flat = StyleSheet.flatten(style) ?? {}
  const height = Math.round((flat.fontSize ?? 17) * 1.2)
  const textStyle = [flat, styles.tabular]

  const chars = format(value).split('')
  const digitCount = chars.filter(c => c >= '0' && c <= '9').length
  let digitIndex = 0

  return (
    <View style={styles.row} accessible accessibilityLabel={format(value)}>
      {chars.map((ch, i) => {
        // Key from the right so existing digits keep their column when the number grows
        const key = chars.length - i
        if (ch >= '0' && ch <= '9') {
          const fromRight = digitCount - digitIndex++
          return (
            <Digit
              key={key}
              digit={Number(ch)}
              direction={direction}
              height={height}
              delay={Math.max(0, 6 - fromRight) * 25}
              textStyle={textStyle}
            />
          )
        }
        return (
          <Text key={key} style={[...textStyle, { height, lineHeight: height }]}>
            {ch}
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
})
