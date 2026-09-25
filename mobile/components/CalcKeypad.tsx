import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'

type KeyKind = 'digit' | 'op' | 'fn' | 'eq'

interface KeyDef {
  key: string
  label?: string
  kind: KeyKind
}

// 3 columns of digits/functions on the left, operator column on the right
const LEFT: KeyDef[][] = [
  [{ key: 'C', kind: 'fn' }, { key: '÷', kind: 'op' }, { key: '×', kind: 'op' }],
  [{ key: '7', kind: 'digit' }, { key: '8', kind: 'digit' }, { key: '9', kind: 'digit' }],
  [{ key: '4', kind: 'digit' }, { key: '5', kind: 'digit' }, { key: '6', kind: 'digit' }],
  [{ key: '1', kind: 'digit' }, { key: '2', kind: 'digit' }, { key: '3', kind: 'digit' }],
  [{ key: '.', label: ',', kind: 'digit' }, { key: '0', kind: 'digit' }, { key: '00', kind: 'digit' }],
]
const RIGHT: KeyDef[] = [
  { key: '⌫', kind: 'fn' },
  { key: '−', kind: 'op' },
  { key: '+', kind: 'op' },
  { key: '=', kind: 'eq' }, // spans two rows
]

const KEY_HEIGHT = 48
const GAP = 8

function Key({ def, onKey, tall, inRow }: { def: KeyDef; onKey: (k: string) => void; tall?: boolean; inRow?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        triggerLightHaptic()
        onKey(def.key)
      }}
      style={({ pressed }) => [
        styles.key,
        inRow && styles.inRow,
        styles[def.kind],
        tall && { height: KEY_HEIGHT * 2 + GAP },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, def.kind === 'op' && styles.opLabel, def.kind === 'eq' && styles.eqLabel]}>
        {def.label ?? def.key}
      </Text>
    </Pressable>
  )
}

/** Calculator keypad used instead of the system keyboard for amounts. */
function CalcKeypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <View style={styles.pad}>
      <View style={styles.left}>
        {LEFT.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map(def => (
              <Key key={def.key} def={def} onKey={onKey} inRow />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.right}>
        {RIGHT.map(def => (
          <Key key={def.key} def={def} onKey={onKey} tall={def.kind === 'eq'} />
        ))}
      </View>
    </View>
  )
}

export default React.memo(CalcKeypad)

const styles = StyleSheet.create({
  pad: {
    flexDirection: 'row',
    gap: GAP,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  left: {
    flex: 3,
    gap: GAP,
  },
  right: {
    flex: 1,
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  key: {
    height: KEY_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Row keys share the width; column keys keep their fixed height
  inRow: {
    flex: 1,
  },
  digit: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  op: {
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
  },
  fn: {
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
  eq: {
    backgroundColor: Colors.orange,
  },
  pressed: {
    opacity: 0.6,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.white,
  },
  opLabel: {
    fontSize: 24,
    color: Colors.orange,
  },
  eqLabel: {
    fontSize: 26,
    fontWeight: '600',
  },
})
