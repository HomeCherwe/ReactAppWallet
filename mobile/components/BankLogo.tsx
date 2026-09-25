import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { Colors } from '../constants/theme'

/** Bank logo (TrueLayer serves SVGs); falls back to the bank's initial. */
function BankLogo({ uri, name, size = 40 }: { uri?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size, borderRadius: size * 0.28 }

  return (
    <View style={[styles.box, box]}>
      {uri && !failed ? (
        <SvgUri uri={uri} width={size * 0.72} height={size * 0.72} onError={() => setFailed(true)} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.trim().charAt(0).toUpperCase() || '🏦'}</Text>
      )}
    </View>
  )
}

export default React.memo(BankLogo)

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '800',
    color: Colors.orange,
  },
})
