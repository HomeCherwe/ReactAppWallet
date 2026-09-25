import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, Platform, Image, ActivityIndicator, Alert
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Colors, Radius, Typography } from '../constants/theme'
import { createTransaction } from '../api/transactions'
import { Card } from '../api/cards'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

interface ScanReceiptModalProps {
  visible: boolean
  cards: Card[]
  onClose: () => void
  onSaved: () => void
}

export default function ScanReceiptModal({
  visible,
  cards,
  onClose,
  onSaved,
}: ScanReceiptModalProps) {
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id || '')

  if (!visible) return null

  const pickImage = async (useCamera = false) => {
    try {
      let result
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Доступ', 'Потрібен доступ до камери')
          return
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: true,
        })
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: true,
        })
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri)
      }
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалося завантажити зображення')
    }
  }

  const handleCreateMockReceiptTx = async () => {
    setSaving(true)
    try {
      // Simulating receipt parsing or direct creation
      await createTransaction({
        amount: -250.00,
        category: 'Продукти',
        card_id: selectedCardId || undefined,
        note: 'Чек відскановано',
      })
      setSaving(false)
      setImageUri(null)
      onSaved()
      onClose()
    } catch (e: any) {
      setSaving(false)
      Alert.alert('Помилка', e.message || 'Не вдалося зберегти')
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Сканування чеку</Text>
            <GlassPressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </GlassPressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {imageUri ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                <GlassPressable style={styles.retakeBtn} onPress={() => setImageUri(null)}>
                  <Text style={styles.retakeText}>🔄 Вибрати інше фото</Text>
                </GlassPressable>
              </View>
            ) : (
              <View style={styles.pickerBox}>
                <Text style={styles.pickerIcon}>🧾</Text>
                <Text style={styles.pickerTitle}>Сфотографуйте або оберіть чек</Text>
                <Text style={styles.pickerSub}>Система розпізнає суму та категорію покупки</Text>

                <View style={styles.btnGroup}>
                  <GlassButton
                    label="📷 Відкрити камеру"
                    variant="primary"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => pickImage(true)}
                  />
                  <GlassButton
                    label="🖼️ З галереї"
                    variant="glass"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => pickImage(false)}
                  />
                </View>
              </View>
            )}

            {imageUri && (
              <>
                {cards.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.sectionLabel}>Рахунок для списання</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {cards.map(c => {
                        const isSel = (selectedCardId || cards[0]?.id) === c.id
                        return (
                          <GlassPressable
                            key={c.id}
                            style={[styles.cardPill, isSel && styles.cardPillActive]}
                            onPress={() => setSelectedCardId(c.id)}
                          >
                            <Text style={styles.cardPillBank}>{c.bank || 'КАРТКА'}</Text>
                            <Text style={[styles.cardPillName, isSel && styles.cardPillNameActive]}>
                              {c.name}
                            </Text>
                          </GlassPressable>
                        )
                      })}
                    </ScrollView>
                  </View>
                )}

                <GlassButton
                  label={saving ? 'Збереження...' : 'Зберегти витрату з чеку'}
                  variant="primary"
                  size="lg"
                  loading={saving}
                  onPress={handleCreateMockReceiptTx}
                />
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.94)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '85%',
  },
  sheetBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 6 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.white },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  pickerBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerIcon: { fontSize: 44, marginBottom: 10 },
  pickerTitle: { ...Typography.h3, color: Colors.white, textAlign: 'center' },
  pickerSub: { ...Typography.caption, color: Colors.textSub, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  btnGroup: { flexDirection: 'row', gap: 10, width: '100%' },
  previewContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: Radius.lg,
    backgroundColor: '#000',
  },
  retakeBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  retakeText: { color: Colors.orange, fontWeight: '600', fontSize: 13 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255, 255, 255, 0.45)', marginBottom: 8 },
  cardScroll: { flexDirection: 'row' },
  cardPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    marginRight: 10,
  },
  cardPillActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
    borderColor: 'rgba(255, 107, 0, 0.55)',
  },
  cardPillBank: { fontSize: 10, fontWeight: '700', color: Colors.orange, textTransform: 'uppercase' },
  cardPillName: { fontSize: 13, fontWeight: '600', color: Colors.white80, marginTop: 2 },
  cardPillNameActive: { color: Colors.white, fontWeight: '700' },
})