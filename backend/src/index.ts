import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

type Status = "plan" | "progress" | "finished";
type AccountType = "activity" | "dashboard";

type Variables = {
  userId: number;
  email: string;
  accountType: AccountType;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  account_type: AccountType;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// ================= HELPERS =================

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function makeSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

async function hashPassword(password: string, saltHex = makeSalt()) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256,
  );

  const hashHex = bytesToHex(new Uint8Array(bits));

  return `${saltHex}:${hashHex}`;
}

async function comparePassword(password: string, storedHash: string) {
  const [saltHex] = storedHash.split(":");

  if (!saltHex) return false;

  const newHash = await hashPassword(password, saltHex);

  return newHash === storedHash;
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidStatus(status: unknown): status is Status {
  return status === "plan" || status === "progress" || status === "finished";
}

function isValidAccountType(accountType: unknown): accountType is AccountType {
  return accountType === "activity" || accountType === "dashboard";
}

function checkPasswordStrength(password: string) {
  const errors: string[] = [];

  if (password.length < 8) errors.push("minimal 8 karakter");
  if (!/[a-z]/.test(password)) errors.push("huruf kecil");
  if (!/[A-Z]/.test(password)) errors.push("huruf besar");
  if (!/[0-9]/.test(password)) errors.push("angka");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("simbol");

  return errors;
}

async function createToken(c: any, user: { id: number; email: string; account_type: AccountType }) {
  return sign(
    {
      sub: String(user.id),
      email: user.email,
      account_type: user.account_type,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    },
    c.env.JWT_SECRET,
    "HS256",
  );
}

const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        message: "Token tidak ada. Silakan login ulang.",
      },
      401,
    );
  }

  try {
    const token = authHeader.replace("Bearer ", "");

    const payload = (await verify(token, c.env.JWT_SECRET, "HS256")) as {
      sub?: string;
      email?: string;
      account_type?: AccountType;
    };

    if (!payload.sub || !payload.email || !isValidAccountType(payload.account_type)) {
      return c.json(
        {
          success: false,
          message: "Payload token tidak valid.",
        },
        401,
      );
    }

    c.set("userId", Number(payload.sub));
    c.set("email", payload.email);
    c.set("accountType", payload.account_type);

    await next();
  } catch (error) {
    console.error("AUTH ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Token tidak valid atau sudah expired.",
      },
      401,
    );
  }
};

function requireAccountType(requiredType: AccountType) {
  return async (c: any, next: any) => {
    const accountType = c.get("accountType") as AccountType | undefined;

    if (accountType !== requiredType) {
      return c.json(
        {
          success: false,
          message: "Akun ini tidak punya akses ke halaman tersebut.",
          required_access: requiredType,
          current_access: accountType,
        },
        403,
      );
    }

    await next();
  };
}

// ================= SERVER CHECK =================

app.get("/", (c) => {
  return c.json({
    success: true,
    message: "Daily Activity Backend is running",
  });
});

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    message: "Backend aman bro",
    hasDB: Boolean(c.env.DB),
    hasJWTSecret: Boolean(c.env.JWT_SECRET),
  });
});

// ================= AUTH =================

app.post("/api/auth/signup", async (c) => {
  try {
    const body = await c.req.json();

    const name = cleanText(body.name);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const confirmPassword = String(body.confirm_password || body.confirmPassword || "");
    const accountType = cleanText(body.account_type) as AccountType;

    if (!name || !email || !password || !accountType) {
      return c.json(
        {
          success: false,
          message: "Nama, email, password, dan tipe akun wajib diisi.",
        },
        400,
      );
    }

    if (!isValidAccountType(accountType)) {
      return c.json(
        {
          success: false,
          message: "Tipe akun tidak valid.",
        },
        400,
      );
    }

    if (name.length < 3) {
      return c.json(
        {
          success: false,
          message: "Nama minimal 3 karakter.",
        },
        400,
      );
    }

    if (!isValidEmail(email)) {
      return c.json(
        {
          success: false,
          message: "Format email tidak valid.",
        },
        400,
      );
    }

    if (confirmPassword && password !== confirmPassword) {
      return c.json(
        {
          success: false,
          message: "Konfirmasi password tidak sama.",
        },
        400,
      );
    }

    const passwordErrors = checkPasswordStrength(password);

    if (passwordErrors.length > 0) {
      return c.json(
        {
          success: false,
          message: `Password belum kuat. Wajib punya: ${passwordErrors.join(", ")}.`,
        },
        400,
      );
    }

    const existingUser = await c.env.DB.prepare(
      `
      SELECT id
      FROM users
      WHERE email = ?
      `,
    )
      .bind(email)
      .first<{ id: number }>();

    if (existingUser) {
      return c.json(
        {
          success: false,
          message: "Email sudah terdaftar. Silakan login.",
        },
        409,
      );
    }

    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(
      `
      INSERT INTO users (name, email, password_hash, account_type)
      VALUES (?, ?, ?, ?)
      `,
    )
      .bind(name, email, passwordHash, accountType)
      .run();

    const user = await c.env.DB.prepare(
      `
      SELECT id, name, email, account_type
      FROM users
      WHERE email = ?
      `,
    )
      .bind(email)
      .first<{ id: number; name: string; email: string; account_type: AccountType }>();

    if (!user) {
      return c.json(
        {
          success: false,
          message: "User gagal dibuat.",
        },
        500,
      );
    }

    const token = await createToken(c, user);

    return c.json(
      {
        success: true,
        message: "Signup berhasil.",
        token,
        user,
      },
      201,
    );
  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Gagal signup. Cek kolom account_type di tabel users.",
      },
      500,
    );
  }
});

app.post("/api/auth/login", async (c) => {
  try {
    const body = await c.req.json();

    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const accountType = cleanText(body.account_type) as AccountType;

    if (!email || !password || !accountType) {
      return c.json(
        {
          success: false,
          message: "Email, password, dan tipe halaman wajib diisi.",
        },
        400,
      );
    }

    if (!isValidAccountType(accountType)) {
      return c.json(
        {
          success: false,
          message: "Tipe halaman tidak valid.",
        },
        400,
      );
    }

    const user = await c.env.DB.prepare(
      `
      SELECT id, name, email, password_hash, COALESCE(account_type, 'activity') AS account_type
      FROM users
      WHERE email = ?
      `,
    )
      .bind(email)
      .first<UserRow>();

    if (!user) {
      return c.json(
        {
          success: false,
          message: "Email atau password salah.",
        },
        401,
      );
    }

    const passwordValid = await comparePassword(password, user.password_hash);

    if (!passwordValid) {
      return c.json(
        {
          success: false,
          message: "Email atau password salah.",
        },
        401,
      );
    }

    if (user.account_type !== accountType) {
      return c.json(
        {
          success: false,
          message: "Akun ini tidak terdaftar untuk halaman yang dipilih.",
        },
        403,
      );
    }

    const token = await createToken(c, user);

    return c.json({
      success: true,
      message: "Login berhasil.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        account_type: user.account_type,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Gagal login. Cek tabel users dan JWT_SECRET.",
      },
      500,
    );
  }
});

app.get("/api/auth/me", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const user = await c.env.DB.prepare(
    `
    SELECT id, name, email, COALESCE(account_type, 'activity') AS account_type
    FROM users
    WHERE id = ?
    `,
  )
    .bind(userId)
    .first<{ id: number; name: string; email: string; account_type: AccountType }>();

  if (!user) {
    return c.json(
      {
        success: false,
        message: "User tidak ditemukan.",
      },
      404,
    );
  }

  return c.json({
    success: true,
    user,
  });
});

// ================= ACTIVITY PAGE ONLY =================

app.use("/api/activities", authMiddleware);
app.use("/api/activities/*", authMiddleware);
app.use("/api/activities", requireAccountType("activity"));
app.use("/api/activities/*", requireAccountType("activity"));

app.get("/api/activities", async (c) => {
  try {
    const userId = c.get("userId");

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
      `,
    )
      .bind(userId)
      .all();

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("GET ACTIVITIES ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Gagal mengambil data activities.",
      },
      500,
    );
  }
});

app.post("/api/activities", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();

    const period = cleanText(body.period);
    const timeStart = cleanText(body.time_start);
    const timeEnd = cleanText(body.time_end);
    const activityName = cleanText(body.activity_name);
    const activityDate = cleanText(body.activity_date);
    const status = isValidStatus(body.status) ? body.status : "plan";

    if (!period || !timeStart || !timeEnd || !activityName || !activityDate) {
      return c.json(
        {
          success: false,
          message: "Semua data kegiatan wajib diisi.",
        },
        400,
      );
    }

    await c.env.DB.prepare(
      `
      INSERT INTO activities
        (user_id, period, time_start, time_end, activity_name, activity_date, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(userId, period, timeStart, timeEnd, activityName, activityDate, status)
      .run();

    return c.json(
      {
        success: true,
        message: "Jadwal berhasil ditambah.",
      },
      201,
    );
  } catch (error) {
    console.error("POST ACTIVITY ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Gagal menambah jadwal.",
      },
      500,
    );
  }
});

app.put("/api/activities/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    const body = await c.req.json();

    if (!id) {
      return c.json({ success: false, message: "ID activity tidak valid." }, 400);
    }

    const period = cleanText(body.period);
    const timeStart = cleanText(body.time_start);
    const timeEnd = cleanText(body.time_end);
    const activityName = cleanText(body.activity_name);
    const activityDate = cleanText(body.activity_date);
    const status = isValidStatus(body.status) ? body.status : "plan";

    if (!period || !timeStart || !timeEnd || !activityName || !activityDate) {
      return c.json(
        {
          success: false,
          message: "Semua data edit wajib diisi.",
        },
        400,
      );
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
      `,
    )
      .bind(period, timeStart, timeEnd, activityName, activityDate, status, id, userId)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ success: false, message: "Data tidak ditemukan." }, 404);
    }

    return c.json({ success: true, message: "Jadwal berhasil diperbarui." });
  } catch (error) {
    console.error("PUT ACTIVITY ERROR:", error);

    return c.json({ success: false, message: "Gagal memperbarui jadwal." }, 500);
  }
});

app.patch("/api/activities/:id/status", async (c) => {
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    const body = await c.req.json();

    if (!id) {
      return c.json({ success: false, message: "ID activity tidak valid." }, 400);
    }

    if (!isValidStatus(body.status)) {
      return c.json({ success: false, message: "Status tidak valid." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE activities
      SET status = ?
      WHERE id = ? AND user_id = ?
      `,
    )
      .bind(body.status, id, userId)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ success: false, message: "Data tidak ditemukan." }, 404);
    }

    return c.json({ success: true, message: "Status berhasil dipindah." });
  } catch (error) {
    console.error("PATCH STATUS ERROR:", error);

    return c.json({ success: false, message: "Gagal memindahkan status." }, 500);
  }
});

app.delete("/api/activities/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));

    if (!id) {
      return c.json({ success: false, message: "ID activity tidak valid." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      DELETE FROM activities
      WHERE id = ? AND user_id = ?
      `,
    )
      .bind(id, userId)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ success: false, message: "Data tidak ditemukan." }, 404);
    }

    return c.json({ success: true, message: "Jadwal berhasil dihapus." });
  } catch (error) {
    console.error("DELETE ACTIVITY ERROR:", error);

    return c.json({ success: false, message: "Gagal menghapus jadwal." }, 500);
  }
});

// ================= DASHBOARD PAGE ONLY =================

app.use("/api/dashboard", authMiddleware);
app.use("/api/dashboard/*", authMiddleware);
app.use("/api/dashboard", requireAccountType("dashboard"));
app.use("/api/dashboard/*", requireAccountType("dashboard"));

app.get("/api/dashboard/summary", async (c) => {
  try {
    const totalUsers = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users",
    ).first<{ total: number }>();

    const activityUsers = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE COALESCE(account_type, 'activity') = 'activity'",
    ).first<{ total: number }>();

    const dashboardUsers = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE account_type = 'dashboard'",
    ).first<{ total: number }>();

    const totalActivities = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM activities",
    ).first<{ total: number }>();

    const plan = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM activities WHERE COALESCE(status, 'plan') = 'plan'",
    ).first<{ total: number }>();

    const progress = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM activities WHERE status = 'progress'",
    ).first<{ total: number }>();

    const finished = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM activities WHERE status = 'finished'",
    ).first<{ total: number }>();

    const { results: recentActivities } = await c.env.DB.prepare(
      `
      SELECT
        a.id,
        a.activity_name,
        a.activity_date,
        a.period,
        COALESCE(a.status, 'plan') AS status,
        u.name AS user_name,
        u.email AS user_email
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.activity_date DESC, a.id DESC
      LIMIT 8
      `,
    ).all();

    const totalActivityCount = totalActivities?.total ?? 0;
    const finishedCount = finished?.total ?? 0;

    return c.json({
      success: true,
      data: {
        total_users: totalUsers?.total ?? 0,
        activity_users: activityUsers?.total ?? 0,
        dashboard_users: dashboardUsers?.total ?? 0,
        total_activities: totalActivityCount,
        plan: plan?.total ?? 0,
        progress: progress?.total ?? 0,
        finished: finishedCount,
        completion_rate:
          totalActivityCount === 0 ? 0 : Math.round((finishedCount / totalActivityCount) * 100),
        recent_activities: recentActivities,
      },
    });
  } catch (error) {
    console.error("DASHBOARD SUMMARY ERROR:", error);

    return c.json(
      {
        success: false,
        message: "Gagal mengambil data dashboard.",
      },
      500,
    );
  }
});

// ================= FALLBACK =================

app.notFound((c) => {
  return c.json(
    {
      success: false,
      message: "Route backend tidak ditemukan.",
      path: c.req.path,
    },
    404,
  );
});

app.onError((error, c) => {
  console.error("GLOBAL ERROR:", error);

  return c.json(
    {
      success: false,
      message: "Terjadi error di backend.",
    },
    500,
  );
});

export default app;
