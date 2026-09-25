import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { GlassView } from 'expo-glass-effect'
import { HAS_LIQUID_GLASS } from '../components/LiquidGlass'
import { BlurView } from 'expo-blur'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../lib/supabase'
import { Colors, Radius, Typography } from '../constants/theme'

// Required for Expo OAuth — closes browser after redirect
WebBrowser.maybeCompleteAuthSession()

export default function AuthScreen() {
  const [loading, setLoading] = React.useState(false)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      // Use app's own deep link scheme — Supabase accepts this (unlike exp://)
      const redirectTo = 'walletapp://auth/callback'

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (error) throw error

      if (data?.url) {
        // ASWebAuthenticationSession on iOS intercepts walletapp:// redirects
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          'walletapp://'   // intercept any walletapp:// URL
        )

        if (result.type === 'success' && result.url) {
          // Supabase returns tokens in URL hash: walletapp://auth/callback#access_token=...
          const hash = result.url.split('#')[1] || ''
          const params = new URLSearchParams(hash)
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')

          // Also try PKCE code flow (newer Supabase)
          const urlObj = new URL(result.url)
          const code = urlObj.searchParams.get('code')

          if (code) {
            const { error: ex } = await supabase.auth.exchangeCodeForSession(code)
            if (ex) throw ex
          } else if (accessToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })
          }
        }
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err?.message || err)
    } finally {
      setLoading(false)
    }
  }


  return (
    <View style={styles.root}>
      {/* Background */}
      <LinearGradient
        colors={['#130800', '#0A0A0A', '#0A0A0A']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <LinearGradient
            colors={['#FF6B00', '#FF3D00']}
            style={styles.logoCircle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.logoEmoji}>💳</Text>
          </LinearGradient>

          <Text style={styles.appName}>WalletApp</Text>
          <Text style={styles.appTagline}>Твої фінанси під контролем</Text>
        </View>

        {/* Features list */}
        <View style={styles.features}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="clear"
            colorScheme="dark"
            tintColor="rgba(255, 255, 255, 0.05)"
          />
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.01)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {[
            { icon: '📊', text: 'Аналітика витрат і доходів' },
            { icon: '💳', text: 'Всі картки в одному місці' },
            { icon: '🔔', text: 'Підписки та нагадування' },
          ].map((f) => (
            <View key={f.text} style={styles.featureItem}>
              <View style={styles.featureIconWrap}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Google Sign In button */}
        <View style={styles.btnSection}>
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.88}
            style={styles.googleBtnWrap}
          >
            {!HAS_LIQUID_GLASS && <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />}
            <GlassView
              style={StyleSheet.absoluteFill}
              glassEffectStyle="regular"
              colorScheme="dark"
              isInteractive
              tintColor="rgba(255, 107, 0, 0.15)"
            />
            {!HAS_LIQUID_GLASS && (
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.02)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}
            <View style={styles.googleBtnBorder} />

            {loading ? (
              <ActivityIndicator color={Colors.orange} />
            ) : (
              <>
                {/* Google G icon */}
                <View style={styles.googleIconWrap}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={styles.googleBtnText}>Увійти через Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Входячи, ви погоджуєтесь з умовами{'\n'}використання додатку
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  glowTop: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(255,107,0,0.09)',
    top: -150,
    left: -100,
  },
  glowBottom: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,61,0,0.06)',
    bottom: 0,
    right: -80,
  },

  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingBottom: Platform.OS === 'ios' ? 60 : 40,
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    gap: 16,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },
  logoEmoji: {
    fontSize: 40,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -1,
  },
  appTagline: {
    ...Typography.body,
    color: Colors.textSub,
    textAlign: 'center',
  },

  // Features
  features: {
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIcon: {
    fontSize: 22,
  },
  featureText: {
    ...Typography.body,
    color: Colors.white80,
    flex: 1,
  },

  // Button section
  btnSection: {
    gap: 16,
    alignItems: 'center',
  },
  googleBtnWrap: {
    width: '100%',
    height: 58,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  googleBtnBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  googleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.white,
  },
  disclaimer: {
    ...Typography.small,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
})
