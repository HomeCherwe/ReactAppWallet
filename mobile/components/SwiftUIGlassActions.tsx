import React from 'react'
import { View, StyleSheet, Platform, TouchableOpacity, Text as RNText } from 'react-native'
import {
  Host,
  HStack,
  Button,
  ContextMenu,
  Menu,
} from '@expo/ui/swift-ui'
import {
  buttonStyle,
  tint,
  controlSize,
  buttonBorderShape,
} from '@expo/ui/swift-ui/modifiers'
import { Colors, Radius, Typography } from '../constants/theme'
import GlassCard from './GlassCard'

interface SwiftUIGlassActionsProps {
  onSendPress?: () => void
  onReceivePress?: () => void
  onPayPress?: () => void
  onAnalyticsPress?: () => void
  onSettingsPress?: () => void
}

export default function SwiftUIGlassActions({
  onSendPress = () => {},
  onReceivePress = () => {},
  onPayPress = () => {},
  onAnalyticsPress = () => {},
  onSettingsPress = () => {},
}: SwiftUIGlassActionsProps) {
  // If iOS, render native SwiftUI Liquid Glass buttons and Context Menu
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container}>
        <Host style={styles.host}>
          <HStack spacing={10} alignment="center">
            {/* 1. Primary Liquid Glass Button */}
            <Button
              label="Відправити"
              systemImage="paperplane.fill"
              modifiers={[
                buttonStyle('glassProminent'),
                tint(Colors.orange),
                buttonBorderShape('capsule'),
                controlSize('regular'),
              ]}
              onPress={onSendPress}
            />

            {/* 2. Glass Button - Receive */}
            <Button
              label="Отримати"
              systemImage="arrow.down.circle.fill"
              modifiers={[
                buttonStyle('glass'),
                buttonBorderShape('capsule'),
                controlSize('regular'),
              ]}
              onPress={onReceivePress}
            />

            {/* 3. Glass Button - Payment */}
            <Button
              label="Платіж"
              systemImage="creditcard.fill"
              modifiers={[
                buttonStyle('glass'),
                buttonBorderShape('capsule'),
                controlSize('regular'),
              ]}
              onPress={onPayPress}
            />

            {/* 4. Glass ContextMenu Trigger */}
            <ContextMenu>
              <ContextMenu.Items>
                <Button
                  label="Швидкий переказ"
                  systemImage="bolt.fill"
                  onPress={onSendPress}
                />
                <Button
                  label="Аналітика витрат"
                  systemImage="chart.pie.fill"
                  onPress={onAnalyticsPress}
                />
                <Menu label="Дії з рахунком" systemImage="slider.horizontal.3">
                  <Button
                    label="Налаштування валюти"
                    systemImage="dollarsign.circle"
                    onPress={onSettingsPress}
                  />
                  <Button
                    label="Експорт виписки"
                    systemImage="square.and.arrow.up"
                    onPress={() => {}}
                  />
                  <Button
                    label="Заблокувати картку"
                    systemImage="lock.fill"
                    role="destructive"
                    onPress={() => {}}
                  />
                </Menu>
              </ContextMenu.Items>
              <ContextMenu.Trigger>
                <Button
                  systemImage="ellipsis.circle.fill"
                  modifiers={[
                    buttonStyle('glass'),
                    buttonBorderShape('circle'),
                    controlSize('regular'),
                  ]}
                />
              </ContextMenu.Trigger>
            </ContextMenu>
          </HStack>
        </Host>
      </View>
    )
  }

  // Cross-platform fallback for Android/Web
  return (
    <GlassCard style={styles.fallbackCard} padding={16}>
      <View style={styles.fallbackRow}>
        <TouchableOpacity style={styles.fallbackBtn} onPress={onSendPress} activeOpacity={0.7}>
          <RNText style={styles.fallbackIcon}>📤</RNText>
          <RNText style={styles.fallbackLabel}>Відправити</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fallbackBtn} onPress={onReceivePress} activeOpacity={0.7}>
          <RNText style={styles.fallbackIcon}>📥</RNText>
          <RNText style={styles.fallbackLabel}>Отримати</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fallbackBtn} onPress={onPayPress} activeOpacity={0.7}>
          <RNText style={styles.fallbackIcon}>💳</RNText>
          <RNText style={styles.fallbackLabel}>Платіж</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fallbackBtn} onPress={onAnalyticsPress} activeOpacity={0.7}>
          <RNText style={styles.fallbackIcon}>📊</RNText>
          <RNText style={styles.fallbackLabel}>Аналітика</RNText>
        </TouchableOpacity>
      </View>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  host: {
    width: '100%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackCard: {
    marginVertical: 12,
  },
  fallbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  fallbackBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  fallbackIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  fallbackLabel: {
    ...Typography.caption,
    color: Colors.white80,
  },
})
