import crypto from 'crypto'

// A card's background picture is stored in the card itself (a data URL, often ~700 KB). Lists of
// cards used to carry those pictures, so every launch downloaded megabytes. Now lists carry a link
// (/api/cards/:id/bg?s=…) that the apps load on their own and keep in their cache. The link is
// signed, so it can't be guessed for someone else's card; a picture's ETag lets a cached copy be
// reused until the picture changes.

const sigKey = () =>
  crypto
    .createHash('sha256')
    .update(`card-bg:${process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`)
    .digest()

export const bgSig = id => crypto.createHmac('sha256', sigKey()).update(String(id)).digest('base64url').slice(0, 32)

function baseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim()
  return `${proto}://${host}`
}

export const bgUrlFor = (req, id) => `${baseUrl(req)}/api/cards/${encodeURIComponent(id)}/bg?s=${bgSig(id)}`

/** A link this server made (an app sending the card back unchanged): not a new picture */
export const isOwnBgUrl = v => typeof v === 'string' && /\/api\/cards\/[^/?]+\/bg\?s=/.test(v)

/** Cards read without bg_url get the link to their picture (null when they have none) */
export async function withBgLinks(supabase, req, userId, cards) {
  if (!cards.length) return cards
  const { data, error } = await supabase.from('cards').select('id').eq('user_id', userId).not('bg_url', 'is', null)
  if (error) throw error
  const has = new Set((data || []).map(r => r.id))
  return cards.map(c => ({ ...c, bg_url: has.has(c.id) ? bgUrlFor(req, c.id) : null }))
}

export function registerCardBackgrounds(app, { supabase }) {
  app.get('/api/cards/:id/bg', async (req, res) => {
    try {
      const id = String(req.params.id)
      const given = Buffer.from(String(req.query.s || ''))
      const expected = Buffer.from(bgSig(id))
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.sendStatus(404)

      const { data, error } = await supabase.from('cards').select('bg_url').eq('id', id).maybeSingle()
      if (error) throw error
      const value = String(data?.bg_url || '')
      if (!value) return res.sendStatus(404)

      const etag = `"${crypto.createHash('sha1').update(value).digest('base64url')}"`
      // Kept on the device for an hour, then checked (a 304 when unchanged); never on a shared cache
      res.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=604800')
      res.set('ETag', etag)
      if (req.headers['if-none-match'] === etag) return res.status(304).end()

      const m = value.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/)
      if (m) {
        res.type(m[1])
        return res.send(m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])))
      }
      if (/^https?:\/\//.test(value)) return res.redirect(302, value)
      return res.sendStatus(404)
    } catch (e) {
      console.error('[CardBg] failed:', e.message)
      res.sendStatus(500)
    }
  })
}
