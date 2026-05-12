import type { VercelRequest, VercelResponse } from '@vercel/node'

const KV_URL = process.env.KV_REST_API_URL!
const KV_TOKEN = process.env.KV_REST_API_TOKEN!
const SECRET = process.env.SYNC_SECRET!
const KV_KEY = 'sid:sync'

function authorized(req: VercelRequest): boolean {
  const auth = req.headers.authorization ?? ''
  return auth === `Bearer ${SECRET}`
}

async function kvGet(): Promise<string | null> {
  const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  })
  if (!res.ok) throw new Error(`KV GET failed: ${res.status}`)
  const json = await res.json() as { result: string | null }
  return json.result
}

async function kvSet(value: string): Promise<void> {
  const res = await fetch(`${KV_URL}/set/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
  if (!res.ok) throw new Error(`KV SET failed: ${res.status}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'GET') {
      const raw = await kvGet()
      return res.status(200).json({ data: raw ? JSON.parse(raw) : null })
    }

    if (req.method === 'POST') {
      const body = req.body
      if (!body || typeof body.savedAt !== 'string') {
        return res.status(400).json({ error: 'Invalid body' })
      }
      await kvSet(JSON.stringify(body))
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(502).json({ error: 'Storage error' })
  }
}
