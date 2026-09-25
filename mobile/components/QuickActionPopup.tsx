import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import SheetModal from './SheetModal'

interface QuickActionPopupProps {
  visible: boolean
  onClose: () => void
  onAddTransaction: () => void
  onAddCard: () => void
  onTransfer: () => void
  onAddGoal: () => void
}

export default function QuickActionPopup({
  visible,
  onClose,
  onAddTransaction,
  onAddCard,
  onTransfer,
  onAddGoal,
}: QuickActionPopupProps) {
  const actions = [
    {
      id: 'tx',
      icon: '💸',
      title: 'Додати транзакцію',
      desc: 'Записати витрату або дохід',
      onPress: () => {
        onClose()
        onAddTransaction()
      },
      accent: true,
    },
    {
      id: 'card',
      icon: '💳',
      title: 'Додати картку / рахунок',
      desc: 'Новий банк, рахунок або готівка',
      onPress: () => {
        onClose()
        onAddCard()
      },
      accent: false,
    },
    {
      id: 'transfer',
      icon: '🔄',
      title: 'Переказ між рахунками',
      desc: 'Перекинути кошти між своїми картками',
      onPress: () => {
        onClose()
        onTransfer()
      },
      accent: false,
    },
    {
      id: 'goal',
      icon: '🎯',
      title: 'Створити ціль / накопичення',
      desc: 'Відкласти на важливу покупку',
      onPress: () => {
        onClose()
        onAddGoal()
      },
      accent: false,
    },
  ]

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Швидкі дії</Text>
              <Text style={styles.subtitle}>Оберіть потрібну операцію</Text>
            </View>

            {/* Action Items List */}
            <View style={styles.actionsList}>
              {actions.map((act, index) => (
                <TouchableOpacity
                  key={act.id}
                  style={[
                    styles.actionItem,
                    index < actions.length - 1 && styles.actionItemBorder,
                  ]}
                  activeOpacity={0.7}
                  onPress={act.onPress}
                >
                  <View style={[styles.actionIconWrap, act.accent && styles.actionIconWrapAccent]}>
                    <Text style={styles.actionIcon}>{act.icon}</Text>
                  </View>
                  <View style={styles.actionMeta}>
                    <Text style={[styles.actionTitle, act.accent && styles.actionTitleAccent]}>
                      {act.title}
                    </Text>
                    <Text style={styles.actionDesc}>{act.desc}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetPosition: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetContainer: {
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(14, 14, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.60,
    shadowRadius: 28,
    elevation: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  topSpecular: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 1.5,
    backgroundColor: 'rgba(255, 220, 180, 0.55)',
    borderRadius: 1,
  },
  rimBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionsList: {
    paddingHorizontal: 14,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 14,
  },
  actionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  actionIconWrapAccent: {
    backgroundColor: 'rgba(255, 107, 0, 0.20)',
    borderColor: 'rgba(255, 107, 0, 0.40)',
  },
  actionIcon: {
    fontSize: 22,
  },
  actionMeta: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  actionTitleAccent: {
    color: Colors.orange,
  },
  actionDesc: {
    fontSize: 12,
    color: Colors.textSub,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.30)',
  },
})