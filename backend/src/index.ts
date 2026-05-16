import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())

// === 1. ENDPOINT GET (Mengambil Data - Diurutkan berdasarkan tanggal terbaru) ===
app.get('/api/activities', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM activities ORDER BY activity_date DESC, time_start ASC'
    ).all();
    return c.json({ success: true, data: results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal mengambil data' }, 500);
  }
})

// === 2. ENDPOINT POST (Menambah Data + Tanggal) ===
app.post('/api/activities', async (c) => {
  try {
    const body = await c.req.json();
    
    await c.env.DB.prepare(
      `INSERT INTO activities (period, time_start, time_end, activity_name, activity_date) VALUES (?, ?, ?, ?, ?)`
    ).bind(body.period, body.time_start, body.time_end, body.activity_name, body.activity_date).run();
    
    return c.json({ success: true, message: 'Mantap, jadwal ditambah!' }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal menambah jadwal' }, 500);
  }
})

// === 3. ENDPOINT PUT (Mengupdate/Edit Data berdasarkan ID) ===
app.put('/api/activities/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await c.env.DB.prepare(
      `UPDATE activities SET period = ?, time_start = ?, time_end = ?, activity_name = ?, activity_date = ? WHERE id = ?`
    ).bind(body.period, body.time_start, body.time_end, body.activity_name, body.activity_date, id).run();

    return c.json({ success: true, message: 'Jadwal berhasil diperbarui!' });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal memperbarui jadwal' }, 500);
  }
})

// === 4. ENDPOINT DELETE (Menghapus Data berdasarkan ID) ===
app.delete('/api/activities/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    await c.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();
    
    return c.json({ success: true, message: 'Jadwal berhasil dihapus!' });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal menghapus jadwal' }, 500);
  }
})

export default app