import { apiFetch } from '../utils.jsx'

export async function listBanks() {
  return await apiFetch('/api/banks')
}

export async function createBank({ name, iban, bic, beneficiary }) {
  return await apiFetch('/api/banks', {
    method: 'POST',
    body: JSON.stringify({ name, iban, bic, beneficiary })
  })
}

export async function updateBank(id, patch) {
  return await apiFetch(`/api/banks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  })
}

export async function deleteBank(id) {
  return await apiFetch(`/api/banks/${id}`, {
    method: 'DELETE'
  })
}

