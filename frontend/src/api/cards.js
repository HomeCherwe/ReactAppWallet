
import { supabase } from '../lib/supabase'

export async function listCards() {
  const { data, error } = await supabase
    .from('cards')
    .select('id, bank, name, currency, initial_balance, bg_url, card_number, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
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

  const payload = { bank, name, card_number, currency, initial_balance, bg_url }
  const { data, error } = await supabase.from('cards').insert([payload]).select().single()
  if (error) throw error
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
  
  const { data, error } = await supabase.from('cards').update(finalPatch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCard(id) {
  await supabase.from('transactions').update({ card_id: null, card: null }).eq('card_id', id)
  const { error } = await supabase.from('cards').delete().eq('id', id)
  if (error) throw error
}
