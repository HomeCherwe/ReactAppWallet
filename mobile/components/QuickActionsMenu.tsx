import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native'
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
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, Radius, Typography } from '../constants/theme'
import GlassButton from './GlassButton'

interface QuickActionsMenuProps {
  onSendPress?: () => void
  onReceivePress?: () => void
  onPayPress?: () => void
  onAnalyticsPress?: () => void
  onSettingsPress?: () => void
}

/**
 * Liquid Glass Quick Actions Menu:
 * A cohesive Apple-inspired Liquid Glass dock container with 4 capsule action buttons.
 * On iOS: Native SwiftUI buttons with rich haptic Context Menus and glass/glassProminent styling.
 * On Fallback/Cross-Platform: Multi-layered hardware blur, specular reflections and authentic Liquid Glass.
 */
export default function QuickActionsMenu({
  onSendPress = () => {},
  onReceivePress = () => {},
  onPayPress = () => {},
  onAnalyticsPress = () => {},
  onSettingsPress = () => {},
}: QuickActionsMenuProps) {
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.dockWrapper}>
        <View style={styles.dockContainer}>
          {/* 1. Backdrop hardware blur */}
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

          {/* 2. Native iOS glass refraction */}
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            colorScheme="dark"
            tintColor="rgba(255, 255, 255, 0.04)"
          />

          {/* 3. Specular ambient gradient highlight */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
          />

          {/* 4. Top specular light reflection */}
          <View style={styles.dockSpecular} pointerEvents="none" />

          {/* 5. Crisp glass rim border */}
          <View style={styles.dockBorder} pointerEvents="none" />

          {/* Native SwiftUI buttons inside Liquid Glass Dock */}
          <Host style={styles.host}>
            <HStack spacing={6} alignment="center">
              {/* 1. Send Button with ContextMenu */}
              <ContextMenu>
                <ContextMenu.Items>
                  <Button
                    label="Новий переказ"
                    systemImage="paperplane.fill"
                    onPress={onSendPress}
                  />
                  <Button
                    label="За номером картки"
                    systemImage="creditcard"
                    onPress={onSendPress}
                  />
                  <Button
                    label="За номером телефону"
                    systemImage="phone.fill"
                    onPress={onSendPress}
                  />
                  <Button
                    label="За реквізитами IBAN"
                    systemImage="building.columns.fill"
                    onPress={onSendPress}
                  />
                </ContextMenu.Items>
                <ContextMenu.Trigger>
                  <Button
                    label="Відправити"
                    systemImage="paperplane.fill"
                    modifiers={[
                      buttonStyle('glassProminent'),
                      tint(Colors.orange),
                      buttonBorderShape('capsule'),
                      controlSize('small'),
                    ]}
                    onPress={onSendPress}
                  />
                </ContextMenu.Trigger>
              </ContextMenu>

              {/* 2. Receive Button with ContextMenu */}
              <ContextMenu>
                <ContextMenu.Items>
                  <Button
                    label="Поповнити свою картку"
                    systemImage="arrow.down.circle.fill"
                    onPress={onReceivePress}
                  />
                  <Button
                    label="Мій QR-код"
                    systemImage="qrcode"
                    onPress={onReceivePress}
                  />
                  <Button
                    label="Скопіювати IBAN"
                    systemImage="doc.on.doc"
                    onPress={onReceivePress}
                  />
                </ContextMenu.Items>
                <ContextMenu.Trigger>
                  <Button
                    label="Отримати"
                    systemImage="arrow.down.circle.fill"
                    modifiers={[
                      buttonStyle('glass'),
                      buttonBorderShape('capsule'),
                      controlSize('small'),
                    ]}
                    onPress={onReceivePress}
                  />
                </ContextMenu.Trigger>
              </ContextMenu>

              {/* 3. Payment Button with ContextMenu */}
              <ContextMenu>
                <ContextMenu.Items>
                  <Button
                    label="Комунальні платежі"
                    systemImage="house.fill"
                    onPress={onPayPress}
                  />
                  <Button
                    label="Поповнити мобільний"
                    systemImage="iphone"
                    onPress={onPayPress}
                  />
                  <Button
                    label="Штрафи та податки"
                    systemImage="doc.text.fill"
                    onPress={onPayPress}
                  />
                </ContextMenu.Items>
                <ContextMenu.Trigger>
                  <Button
                    label="Платіж"
                    systemImage="creditcard.fill"
                    modifiers={[
                      buttonStyle('glass'),
                      buttonBorderShape('capsule'),
                      controlSize('small'),
                    ]}
                    onPress={onPayPress}
                  />
                </ContextMenu.Trigger>
              </ContextMenu>

              {/* 4. Dropdown Menu for More Actions */}
              <Menu
                label="Ще"
                systemImage="ellipsis.circle.fill"
                modifiers={[
                  buttonStyle('glass'),
                  buttonBorderShape('capsule'),
                  controlSize('small'),
                ]}
              >
                <Button
                  label="Аналітика витрат"
                  systemImage="chart.pie.fill"
                  onPress={onAnalyticsPress}
                />
                <Button
                  label="Сканувати QR"
                  systemImage="qrcode.viewfinder"
                  onPress={() => {}}
                />
                <Menu label="Налаштування" systemImage="gear">
                  <Button
                    label="Основна валюта"
                    systemImage="dollarsign.circle"
                    onPress={onSettingsPress}
                  />
                  <Button
                    label="Виписка за місяць"
                    systemImage="square.and.arrow.up"
                    onPress={() => {}}
                  />
                  <Button
                    label="Заблокувати рахунок"
                    systemImage="lock.fill"
                    role="destructive"
                    onPress={() => {}}
                  />
                </Menu>
              </Menu>
            </HStack>
          </Host>
        </View>
      </View>
    )
  }

  // Cross-platform fallback using authentic multi-layer Liquid Glass buttons
  return (
    <View style={styles.dockWrapper}>
      <View style={styles.dockContainer}>
        {/* 1. Backdrop hardware blur */}
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

        {/* 2. Native glass refraction */}
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor="rgba(255, 255, 255, 0.04)"
        />

        {/* 3. Specular reflection */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />

        {/* 4. Top specular light reflection */}
        <View style={styles.dockSpecular} pointerEvents="none" />

        {/* 5. Rim border */}
        <View style={styles.dockBorder} pointerEvents="none" />

        <View style={styles.fallbackRow}>
          <GlassButton
            label="Відправити"
            variant="primary"
            size="sm"
            style={styles.fallbackBtn}
            icon={<Text style={styles.fallbackIcon}>↗️</Text>}
            onPress={onSendPress}
          />
          <GlassButton
            label="Отримати"
            variant="glass"
            size="sm"
            style={styles.fallbackBtn}
            icon={<Text style={styles.fallbackIcon}>📥</Text>}
            onPress={onReceivePress}
          />
          <GlassButton
            label="Платіж"
            variant="glass"
            size="sm"
            style={styles.fallbackBtn}
            icon={<Text style={styles.fallbackIcon}>💳</Text>}
            onPress={onPayPress}
          />
          <GlassButton
            label="Ще"
            variant="glass"
            size="sm"
            style={styles.fallbackBtn}
            icon={<Text style={styles.fallbackIcon}>⋯</Text>}
            onPress={onAnalyticsPress}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dockWrapper: {
    marginVertical: 14,
    width: '100%',
  },
  dockContainer: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    position: 'relative',
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(12, 12, 16, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  dockSpecular: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.40)',
    borderRadius: 1,
  },
  dockBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  host: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  fallbackBtn: {
    flex: 1,
    paddingHorizontal: 8,
  },
  fallbackIcon: {
    fontSize: 13,
  },
})
