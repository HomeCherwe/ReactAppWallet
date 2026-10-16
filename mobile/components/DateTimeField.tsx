import React, { useState } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { DatePicker, Host } from '@expo/ui/swift-ui'
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'
import Icon from './Icon'

const DAY = 864e5

function label(d: Date): string {
  const today = new Date()
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (isSameDay(d, today)) return `Сьогодні, ${time}`
  if (isSameDay(d, new Date(today.getTime() - DAY))) return `Вчора, ${time}`
  return `${d.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  })}, ${time}`
}

const smooth = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))

interface Props {
  value: Date
  onChange: (date: Date) => void
  /** Shown above the row, e.g. «ДАТА І ЧАС»; empty — no label (the screen draws its own) */
  title?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Date and time of a transaction: a row with the current value; a tap opens the iOS wheel inline
 * (no pop-up over the sheet), with «Зараз» and «Вчора» to jump quickly.
 */
export default function DateTimeField({ value, onChange, title = 'ДАТА І ЧАС', style }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = () => {
    triggerLightHaptic()
    smooth()
    setOpen(o => !o)
  }

  const quick = (d: Date) => {
    triggerLightHaptic()
    onChange(d)
  }

  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionLabel}>{title}</Text> : null}
      <Pressable onPress={toggle} style={({ pressed }) => [styles.row, open && styles.rowOpen, pressed && styles.pressed]}>
        <Icon name="calendar" size={17} color={Colors.orange} strokeWidth={2.2} />
        <Text style={styles.value} numberOfLines={1}>
          {label(value)}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={18} color={Colors.white60} strokeWidth={2.2} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <View style={styles.quickRow}>
            <Pressable onPress={() => quick(new Date())} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
              <Text style={styles.quickText}>Зараз</Text>
            </Pressable>
            <Pressable
              onPress={() => quick(new Date(value.getTime() - DAY))}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <Text style={styles.quickText}>−1 день</Text>
            </Pressable>
            <Pressable
              onPress={() => quick(new Date(value.getTime() + DAY))}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <Text style={styles.quickText}>+1 день</Text>
            </Pressable>
            <Pressable onPress={toggle} style={({ pressed }) => [styles.quick, styles.done, pressed && styles.pressed]}>
              <Text style={[styles.quickText, styles.doneText]}>Готово</Text>
            </Pressable>
          </View>
          {Platform.OS === 'ios' ? (
            <Host style={styles.wheel} colorScheme="dark" seedColor={Colors.orange}>
              <DatePicker
                selection={value}
                displayedComponents={['date', 'hourAndMinute']}
                onDateChange={onChange}
                modifiers={[datePickerStyle('wheel')]}
              />
            </Host>
          ) : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255, 255, 255, 0.45)', letterSpacing: 1, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  rowOpen: { borderColor: 'rgba(255,107,0,0.45)' },
  pressed: { opacity: 0.6 },
  value: { flex: 1, fontSize: 15.5, fontWeight: '600', color: Colors.white },
  panel: { borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', paddingTop: 10, overflow: 'hidden' },
  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 10 },
  quick: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' },
  quickText: { fontSize: 13, fontWeight: '700', color: Colors.white80 },
  done: { marginLeft: 'auto', backgroundColor: 'rgba(255,107,0,0.18)' },
  doneText: { color: Colors.orangeLight },
  wheel: { height: 216, width: '100%' },
})
