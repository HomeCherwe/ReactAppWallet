import "react-native-url-polyfill/auto"
import React, { useEffect, useState, useRef } from "react"
import {
  View, StyleSheet, Platform, Pressable, Text,
  ActivityIndicator, Animated
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { LinearGradient } from "expo-linear-gradient"
import { Session } from "@supabase/supabase-js"
import { supabase } from "./lib/supabase"
import { Colors } from "./constants/theme"
import Toast from "react-native-toast-message"
import { triggerLightHaptic } from "./utils/haptics"
import { GlassSurface } from "./components/LiquidGlass"
import { useSettingsStore } from "./store/useSettingsStore"
import { useBankAutoSync } from "./hooks/useBankAutoSync"
import { toastConfig } from "./components/ToastConfig"
import MenuOverlayHost from "./components/MenuOverlayHost"

// Screens
import AuthScreen from "./screens/AuthScreen"
import HomeScreen from "./screens/HomeScreen"
import ArchivesScreen from "./screens/ArchivesScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import CardsScreen from "./screens/CardsScreen"

// Tabs config (Subscriptions and Debts excluded per user instructions)
const TABS = [
  { id: "home",      label: "Головна",   icon: "🏠" },
  { id: "cards",     label: "Рахунки",   icon: "💳" },
  { id: "archives",  label: "Архіви",     icon: "📁" },
  { id: "analytics", label: "Аналітика", icon: "📊" },
] as const;
type TabId = typeof TABS[number]["id"]

const DOCK_HEIGHT = 64
const DOCK_PADDING = 4

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("home")

  const indicatorX = useRef(new Animated.Value(0)).current
  const [dockWidth, setDockWidth] = useState(0)
  const tabWidth = (dockWidth - DOCK_PADDING * 2) / TABS.length

  // Keep the pill under the active tab (also after the dock is first measured)
  useEffect(() => {
    if (!dockWidth) return
    const idx = TABS.findIndex(t => t.id === activeTab)
    Animated.spring(indicatorX, {
      toValue: idx * tabWidth,
      damping: 18,
      stiffness: 200,
      useNativeDriver: true,
    }).start()
  }, [activeTab, tabWidth])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session) useSettingsStore.getState().initialize()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setLoading(false)
      if (event === 'SIGNED_IN') useSettingsStore.getState().initialize()
      if (event === 'SIGNED_OUT') useSettingsStore.getState().reset()
    })

    return () => subscription.unsubscribe()
  }, [])

  // Pull new bank transactions whenever the app is opened (signed in only)
  useBankAutoSync(!!session)

  const handleTabPress = (tab: TabId) => {
    if (activeTab !== tab) triggerLightHaptic()
    setActiveTab(tab)
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <LinearGradient colors={["#130800", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    )
  }

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen />
      </>
    )
  }

  const renderScreen = () => {
    switch (activeTab) {
      case "home":      return <HomeScreen onNavigateToCards={() => handleTabPress("cards")} />
      case "cards":     return <CardsScreen />
      case "archives":  return <ArchivesScreen />
      case "analytics": return <AnalyticsScreen />

    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={["#130800", "#0A0A0A", "#0A0A0A"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />

      {/* Main content */}
      <View style={styles.content}>
        {renderScreen()}
      </View>

      {/* Bottom Tab Bar — floating Liquid Glass dock */}
      <View style={styles.tabBarOuter} pointerEvents="box-none">
        <View
          style={styles.tabBarDock}
          onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}
        >
          <GlassSurface borderRadius={DOCK_HEIGHT / 2} tintColor="rgba(10,10,10,0.35)" />

          {/* Sliding glass pill under the active tab */}
          {dockWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                { width: tabWidth - 8, transform: [{ translateX: indicatorX }] },
              ]}
            >
              <GlassSurface
                borderRadius={(DOCK_HEIGHT - 12) / 2}
                tintColor="rgba(255,107,0,0.35)"
                interactive
              />
            </Animated.View>
          )}

          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Pressable
                key={tab.id}
                style={styles.tab}
                onPress={() => handleTabPress(tab.id)}
              >
                <Text style={[styles.tabIcon, !isActive && styles.tabIconInactive]}>{tab.icon}</Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Long-press menus (drawn above everything; the finger can slide over them) */}
      <MenuOverlayHost />

      <Toast config={toastConfig} topOffset={58} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  loader: { flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  content: { flex: 1 },
  tabBarOuter: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 28 : 14,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  tabBarDock: {
    width: "100%",
    maxWidth: 420,
    height: DOCK_HEIGHT,
    borderRadius: DOCK_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: DOCK_PADDING,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  tabIndicator: {
    position: "absolute",
    left: DOCK_PADDING + 4,
    top: 6,
    bottom: 6,
  },
  tab: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabIconInactive: {
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.white60,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: Colors.white,
    fontWeight: "700",
  },
})
