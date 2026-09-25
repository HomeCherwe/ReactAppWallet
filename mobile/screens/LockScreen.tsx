import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as LocalAuthentication from 'expo-local-authentication'
import { Colors, Radius, Typography } from '../constants/theme'
import { GlassView } from 'expo-glass-effect'
import { GlassPressable } from '../components/LiquidGlass'

interface LockScreenProps {
  onUnlock: () => void
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const authenticate = async () => {
    try {
      setIsAuthenticating(true)
      setErrorMsg(null)

      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      if (!hasHardware) {
        setErrorMsg('Біометрія не підтримується на цьому пристрої.')
        setIsAuthenticating(false)
        return
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync()
      if (!isEnrolled) {
        setErrorMsg('Біометрію не налаштовано (Enrolled).')
        setIsAuthenticating(false)
        return
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Увійдіть за допомогою Face ID / Touch ID',
        cancelLabel: 'Скасувати',
        disableDeviceFallback: true,
      })

      if (result.success) {
        onUnlock()
      } else {
        setErrorMsg('Не вдалося розпізнати.')
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Помилка авторизації')
    } finally {
      setIsAuthenticating(false)
    }
  }

  useEffect(() => {
    authenticate()
  }, [])

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#180A02', '#0A0A0E', '#060608']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      
      {/* Decorative Glows */}
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            colorScheme="dark"
            tintColor="rgba(255,107,0,0.05)"
          />
          <View style={styles.iconBoxBorder} />
          <Text style={styles.lockIcon}>🔒</Text>
        </View>

        <Text style={styles.title}>Додаток заблоковано</Text>
        <Text style={styles.subtitle}>
          Щоб продовжити, використовуйте Face ID або Touch ID
        </Text>

        {errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>

      <View style={styles.footer}>
        {isAuthenticating ? (
          <View style={styles.loadingBtn}>
            <ActivityIndicator color={Colors.white} />
          </View>
        ) : (
          <GlassPressable
            style={styles.btn}
            onPress={authenticate}
          >
            <LinearGradient
              colors={['#FF6B00', '#FF3D00']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            <Text style={styles.btnText}>Розблокувати</Text>
          </GlassPressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  glowTop: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255, 107, 0, 0.15)', top: -100, left: -50,
  },
  glowBottom: {
    position: 'absolute', width: 400, height: 400, borderRadius: 200,
    backgroundColor: 'rgba(255, 60, 0, 0.1)', bottom: -150, right: -100,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconBoxBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)', borderRadius: 36,
  },
  lockIcon: {
    fontSize: 42,
  },
  title: {
    ...Typography.h2,
    color: Colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSub,
    textAlign: 'center',
    maxWidth: '80%',
  },
  errorText: {
    marginTop: 20,
    color: Colors.red,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    padding: 32,
    paddingBottom: 48,
  },
  btn: {
    height: 56,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    ...Typography.button,
    color: Colors.white,
  },
  loadingBtn: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
