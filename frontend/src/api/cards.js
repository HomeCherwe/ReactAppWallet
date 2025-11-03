
import { supabase } from '../lib/supabase'

export async function listCards() {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] // Return empty if not authenticated

  const { data, error } = await supabase
    .from('cards')
    .select('id, bank, name, currency, initial_balance, bg_url, card_number, created_at')
    .eq('user_id', user.id) // Filter by current user
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
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  let bg_url = null
  if (file) {
    bg_url = await fileToBase64(file)
  }

  const payload = { bank, name, card_number, currency, initial_balance, bg_url, user_id: user?.id }
  const { data, error } = await supabase.from('cards').insert([payload]).select().single()
  if (error) throw error
  return data
}

export async function updateCard(id, patch, file) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  let finalPatch = { ...patch }
  
  // If file is 'REMOVE', clear the bg_url
  if (file === 'REMOVE') {
    finalPatch.bg_url = null
  }
  // If file provided, convert to base64
  else if (file && typeof file === 'object') {
    finalPatch.bg_url = await fileToBase64(file)
  }
  
  const { data, error } = await supabase
    .from('cards')
    .update(finalPatch)
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user can only update their own cards
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCard(id) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Update transactions to remove card reference (only user's transactions)
  await supabase
    .from('transactions')
    .update({ card_id: null, card: null })
    .eq('card_id', id)
    .eq('user_id', user.id)
  
  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user can only delete their own cards
  if (error) throw error
}
