import crypto from 'crypto'

// AES-256-GCM encryption for secrets stored in the database (bank tokens, API keys).
// The key lives only in the backend environment: ENCRYPTION_KEY = 32 random bytes, base64.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const VERSION = 'v1'

function getKey() {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY is not configured on the server')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64-encoded)')
  return key
}

export function isEncryptionConfigured() {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}

/** Encrypts a JSON-serializable value → "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
export function encryptJSON(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/** Decrypts a value produced by encryptJSON. Throws if it was tampered with or the key is wrong. */
export function decryptJSON(payload) {
  const [version, iv, tag, ciphertext] = String(payload || '').split(':')
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unsupported encrypted payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}
