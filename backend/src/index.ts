import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign, verify } from 'hono/jwt'
import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
}

type Variables = {
  userId: number
  email: string
}

type Status = 'plan' | 'progress' | 'finished'

type UserRow = {
  id: number
  name: string
  email: string
  password_hash: string
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// ================= HELPER =================

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  return bytes
}

function makeSalt() {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

async function hashPassword(password: string, saltHex = makeSalt()) {
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    key,
    256
  )

  const hashHex = bytesToHex(new Uint8Array(bits))

  return `${saltHex}:${hashHex}`
}

async function comparePassword(password: string, storedHash: string) {
  const [saltHex] = storedHash.split(':')

  if (!saltHex) return false

  const newHash = await hashPassword(password, saltHex)

  return newHash === storedHash
}

function isValidStatus(status: unknown): status is Status {
  return status === 'plan' || status === 'progress' || status === 'finished'
}

function cleanEmail(email: unknown) {
  return String(email || '').trim().toLowerCase()
}

function cleanText(value: unknown) {
  return String(value || '').trim()
}

async function createToken(c: any, user: { id: number; email: string }) {
  return sign(
    {
      sub: String(user.id),
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    c.env.JWT_SECRET,
    'HS256'
  )
}

const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        message: 'Token tidak ada. Silakan login ulang.',
      },
      401
    )
  }

  try {
    const token = authHeader.replace('Bearer ', '')

    const payload = (await verify(token, c.env.JWT_SECRET, 'HS256')) as {
      sub?: string
      email?: string
    }

    if (!payload.sub || !payload.email) {
      return c.json(
        {
          success: false,
          message: 'Payload token tidak valid.',
        },
        401
      )
    }

    c.set('userId', Number(payload.sub))
    c.set('email', String(payload.email))

    await next()
  } catch (error) {
    console.error('AUTH ERROR:', error)

    return c.json(
      {
        success: false,
        message: 'Token tidak valid atau sudah expired.',
      },
      401
    )
  }
}

// ================= CHECK SERVER =================

app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Daily Activity Backend is running',
  })
})

app.get('/api/health', (c) => {
  return c.json({
    success: true,
    message: 'Backend aman bro',
    hasDB: Boolean(c.env.DB),
    hasJWTSecret: Boolean(c.env.JWT_SECRET),
  })
})

// ================= AUTH =================

app.post('/api/auth/signup', async (c) => {
  try {
    const body = await c.req.json()

    const name = cleanText(body.name)
    const email = cleanEmail(body.email)
    const password = String(body.password || '')

    if (!name || !email || !password) {
      return c.json(
        {
          success: false,
          message: 'Nama, email, dan password wajib diisi.',
        },
        400
      )
    }

    if (!email.includes('@')) {
      return c.json(
        {
          success: false,
          message: 'Format email tidak valid.',
        },
        400
      )
    }

    if (password.length < 6) {
      return c.json(
        {
          success: false,
          message: 'Password minimal 6 karakter.',
        },
        400
      )
    }

    const existingUser = await c.env.DB.prepare(
      `
      SELECT id
      FROM users
      WHERE email = ?
      `
    )
      .bind(email)
      .first<{ id: number }>()

    if (existingUser) {
      return c.json(
        {
          success: false,
          message: 'Email sudah terdaftar. Coba login aja bro.',
        },
        409
      )
    }

    const passwordHash = await hashPassword(password)

    await c.env.DB.prepare(
      `
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
      `
    )
      .bind(name, email, passwordHash)
      .run()

    const user = await c.env.DB.prepare(
      `
      SELECT id, name, email
      FROM users
      WHERE email = ?
      `
    )
      .bind(email)
      .first<{ id: number; name: string; email: string }>()

    if (!user) {
      return c.json(
        {
          success: false,
          message: 'User gagal dibuat.',
        },
        500
      )
    }

    const token = await createToken(c, user)

    return c.json(
      {
        success: true,
        message: 'Signup berhasil.',
        token,
        user,
      },
      201
    )
  } catch (error) {
    console.error('SIGNUP ERROR:', error)

    return c.json(
      {
        success: false,
        message:
          'Gagal signup. Cek apakah tabel users sudah dibuat di D1.',
      },
      500
    )
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()

    const email = cleanEmail(body.email)
    const password = String(body.password || '')

    if (!email || !password) {
      return c.json(
        {
          success: false,
          message: 'Email dan password wajib diisi.',
        },
        400
      )
    }

    const user = await c.env.DB.prepare(
      `
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = ?
      `
    )
      .bind(email)
      .first<UserRow>()

    if (!user) {
      return c.json(
        {
          success: false,
          message: 'Email atau password salah.',
        },
        401
      )
    }

    const passwordValid = await comparePassword(password, user.password_hash)

    if (!passwordValid) {
      return c.json(
        {
          success: false,
          message: 'Email atau password salah.',
        },
        401
      )
    }

    const token = await createToken(c, user)

    return c.json({
      success: true,
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    console.error('LOGIN ERROR:', error)

    return c.json(
      {
        success: false,
        message:
          'Gagal login. Cek apakah tabel users dan JWT_SECRET sudah benar.',
      },
      500
    )
  }
})

// ================= PROTECTED ACTIVITIES =================

app.use('/api/activities', authMiddleware)
app.use('/api/activities/*', authMiddleware)

app.get('/api/activities', async (c) => {
  try {
    const userId = c.get('userId')

    const { results } = await c.env.DB.prepare(
      `
      SELECT
        id,
        user_id,
        period,
        time_start,
        time_end,
        activity_name,
        activity_date,
        COALESCE(status, 'plan') AS status
      FROM activities
      WHERE user_id = ?
      ORDER BY activity_date DESC, time_start ASC
      `
    )
      .bind(userId)
      .all()

    return c.json({
      success: true,
      data: results,
    })
  } catch (error) {
    console.error('GET ACTIVITIES ERROR:', error)

    return c.json(
      {
        success: false,
        message: 'Gagal mengambil data activities.',
      },
      500
    )
  }
})

app.post('/api/activities', async (c) => {
  try {
    const userId = c.get('userId')
    const body = await c.req.json()

    const period = cleanText(body.period)
    const timeStart = cleanText(body.time_start)
    const timeEnd = cleanText(body.time_end)
    const activityName = cleanText(body.activity_name)
    const activityDate = cleanText(body.activity_date)
    const status = isValidStatus(body.status) ? body.status : 'plan'

    if (!period || !timeStart || !timeEnd || !activityName || !activityDate) {
      return c.json(
        {
          success: false,
          message: 'Semua data kegiatan wajib diisi.',
        },
        400
      )
    }

    await c.env.DB.prepare(
      `
      INSERT INTO activities
        (user_id, period, time_start, time_end, activity_name, activity_date, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(userId, period, timeStart, timeEnd, activityName, activityDate, status)
      .run()

    return c.json(
      {
        success: true,
        message: 'Jadwal berhasil ditambah.',
      },
      201
    )
  } catch (error) {
    console.error('POST ACTIVITY ERROR:', error)

    return c.json(
      {
        success: false,
        message:
          'Gagal menambah jadwal. Cek kolom user_id dan status di tabel activities.',
      },
      500
    )
  }
})

app.put('/api/activities/:id', async (c) => {
  try {
    const userId = c.get('userId')
    const id = Number(c.req.param('id'))
    const body = await c.req.json()

    if (!id) {
      return c.json(
        {
          success: false,
          message: 'ID activity tidak valid.',
        },
        400
      )
    }

    const period = cleanText(body.period)
    const timeStart = cleanText(body.time_start)
    const timeEnd = cleanText(body.time_end)
    const activityName = cleanText(body.activity_name)
    const activityDate = cleanText(body.activity_date)
    const status = isValidStatus(body.status) ? body.status : 'plan'

    if (!period || !timeStart || !timeEnd || !activityName || !activityDate) {
      return c.json(
        {
          success: false,
          message: 'Semua data edit wajib diisi.',
        },
        400
      )
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE activities
      SET
        period = ?,
        time_start = ?,
        time_end = ?,
        activity_name = ?,
        activity_date = ?,
        status = ?
      WHERE id = ? AND user_id = ?
      `
    )
      .bind(period, timeStart, timeEnd, activityName, activityDate, status, id, userId)
      .run()

    if ((result.meta.changes ?? 0) === 0) {
      return c.json(
        {
          success: false,
          message: 'Data tidak ditemukan.',
        },
        404
      )
    }

    return c.json({
      success: true,
      message: 'Jadwal berhasil diperbarui.',
    })
  } catch (error) {
    console.error('PUT ACTIVITY ERROR:', error)

    return c.json(
      {
        success: false,
        message: 'Gagal memperbarui jadwal.',
      },
      500
    )
  }
})

app.patch('/api/activities/:id/status', async (c) => {
  try {
    const userId = c.get('userId')
    const id = Number(c.req.param('id'))
    const body = await c.req.json()

    if (!id) {
      return c.json(
        {
          success: false,
          message: 'ID activity tidak valid.',
        },
        400
      )
    }

    if (!isValidStatus(body.status)) {
      return c.json(
        {
          success: false,
          message: 'Status tidak valid.',
        },
        400
      )
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE activities
      SET status = ?
      WHERE id = ? AND user_id = ?
      `
    )
      .bind(body.status, id, userId)
      .run()

    if ((result.meta.changes ?? 0) === 0) {
      return c.json(
        {
          success: false,
          message: 'Data tidak ditemukan.',
        },
        404
      )
    }

    return c.json({
      success: true,
      message: 'Status berhasil dipindah.',
    })
  } catch (error) {
    console.error('PATCH STATUS ERROR:', error)

    return c.json(
      {
        success: false,
        message: 'Gagal memindahkan status.',
      },
      500
    )
  }
})

app.delete('/api/activities/:id', async (c) => {
  try {
    const userId = c.get('userId')
    const id = Number(c.req.param('id'))

    if (!id) {
      return c.json(
        {
          success: false,
          message: 'ID activity tidak valid.',
        },
        400
      )
    }

    const result = await c.env.DB.prepare(
      `
      DELETE FROM activities
      WHERE id = ? AND user_id = ?
      `
    )
      .bind(id, userId)
      .run()

    if ((result.meta.changes ?? 0) === 0) {
      return c.json(
        {
          success: false,
          message: 'Data tidak ditemukan.',
        },
        404
      )
    }

    return c.json({
      success: true,
      message: 'Jadwal berhasil dihapus.',
    })
  } catch (error) {
    console.error('DELETE ACTIVITY ERROR:', error)

    return c.json(
      {
        success: false,
        message: 'Gagal menghapus jadwal.',
      },
      500
    )
  }
})

// ================= FALLBACK ERROR =================

app.notFound((c) => {
  return c.json(
    {
      success: false,
      message: 'Route backend tidak ditemukan.',
      path: c.req.path,
    },
    404
  )
})

app.onError((error, c) => {
  console.error('GLOBAL ERROR:', error)

  return c.json(
    {
      success: false,
      message: 'Terjadi error di backend.',
    },
    500
  )
})

export default app