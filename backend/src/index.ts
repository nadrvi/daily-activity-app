import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())

// === ENDPOINT GET (Mengambil Data) ===
app.get('/api/activities', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM activities').all();
  return c.json({ success: true, data: results });
})

// === ENDPOINT POST (Menambah Data) ===
app.post('/api/activities', async (c) => {
  try {
    const body = await c.req.json();
    
    // Perintah memasukkan data ke Database D1
    await c.env.DB.prepare(
      `INSERT INTO activities (period, time_start, time_end, activity_name) VALUES (?, ?, ?, ?)`
    ).bind(body.period, body.time_start, body.time_end, body.activity_name).run();
    
    return c.json({ success: true, message: 'Mantap, jadwal ditambah!' }, 201);
  } catch (error) {
    console.error(error); // <-- INI YANG BENAR: Biar errornya kelihatan di terminal backend
    return c.json({ success: false, message: 'Gagal menambah jadwal' }, 500);
  }
})

export default app