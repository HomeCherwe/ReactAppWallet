
import { supabase } from '../lib/supabase'
import { getCachedCards, invalidateCardsCache } from '../utils/dataCache'
import { apiFetch } from '../utils.jsx'

// Внутрішня функція для реального фетча
async function _listCardsInternal() {
  return await apiFetch('/api/cards')
}

export async function listCards() {
  // Використовуємо кеш
  return getCachedCards(_listCardsInternal)
}

// Helper to convert file to base64
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function createCard({ bank, name, card_number, currency, initial_balance = 0, file }) {
  let bg_url = null
  if (file) {
    bg_url = await fileToBase64(file)
  }

  const data = await apiFetch('/api/cards', {
    method: 'POST',
    body: JSON.stringify({ bank, name, card_number, currency, initial_balance, bg_url })
  })
  
  // Інвалідувати кеш карток після створення
  invalidateCardsCache()
  
  return data
}

export async function updateCard(id, patch, file) {
  let finalPatch = { ...patch }
  
  // If file is 'REMOVE', clear the bg_url
  if (file === 'REMOVE') {
    finalPatch.bg_url = null
  }
  // If file provided, convert to base64
  else if (file && typeof file === 'object') {
    finalPatch.bg_url = await fileToBase64(file)
  }

  const data = await apiFetch(`/api/cards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(finalPatch)
  })
  
  // Інвалідувати кеш карток після оновлення
  invalidateCardsCache()
  
  return data
}

export async function deleteCard(id) {
  await apiFetch(`/api/cards/${id}`, {
    method: 'DELETE'
  })
  
  // Інвалідувати кеш карток після видалення
  invalidateCardsCache()
}
