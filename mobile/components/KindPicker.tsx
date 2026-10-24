import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { ACCOUNT_KINDS, AccountKind, KIND_META } from '../utils/accountKind'
import { GlassPressable } from './LiquidGlass'

/** Картка / Скарбничка / Готівка / Інвестиції — what the account is for (the web has the same chips) */
export default function KindPicker({ value, onChange }: { value: AccountKind; onChange: (kind: AccountKind) => void }) {
  return (
    <View style={styles.grid}>
      {ACCOUNT_KINDS.map(kind => {
        const meta = KIND_META[kind]
        const active = value === kind
        return (
          <GlassPressable
            key={kind}
            style={[styles.chip, active && { borderColor: meta.accent[0], backgroundColor: `${meta.accent[0]}2E` }]}
            onPress={() => onChange(kind)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {meta.icon} {meta.one}
            </Text>
            <Text style={styles.hint} numberOfLines={2}>
              {meta.hint}
            </Text>
          </GlassPressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '47%',
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  label: { fontSize: 14, fontWeight: '700', color: Colors.white80 },
  labelActive: { color: Colors.white },
  hint: { fontSize: 11, lineHeight: 14, color: Colors.textSub, marginTop: 2 },
})
