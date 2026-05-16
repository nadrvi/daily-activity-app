import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Status = "plan" | "progress" | "finished";
type AuthMode = "login" | "signup";
type AccountType = "activity" | "dashboard";

interface Activity {
  id: number;
  user_id?: number;
  period: string;
  time_start: string;
  time_end: string;
  activity_name: string;
  activity_date: string;
  status: Status;
}

interface User {
  id: number;
  name: string;
  email: string;
  account_type: AccountType;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
  data?: T;
}

interface DashboardSummary {
  total_users: number;
  activity_users: number;
  dashboard_users: number;
  total_activities: number;
  plan: number;
  progress: number;
  finished: number;
  completion_rate: number;
  recent_activities: Array<{
    id: number;
    activity_name: string;
    activity_date: string;
    period: string;
    status: Status;
    user_name: string | null;
    user_email: string | null;
  }>;
}

const API_BASE = "https://backend.nadrvi.workers.dev/api";
const ACTIVITY_URL = `${API_BASE}/activities`;
const DASHBOARD_URL = `${API_BASE}/dashboard/summary`;

const COLUMNS: {
  key: Status;
  title: string;
  emoji: string;
  desc: string;
  empty: string;
}[] = [
  {
    key: "plan",
    title: "Rencana",
    emoji: "🗒️",
    desc: "Ide atau jadwal yang mau dikerjain.",
    empty: "Belum ada rencana.",
  },
  {
    key: "progress",
    title: "On Progress",
    emoji: "⚡",
    desc: "Kegiatan yang lagi berjalan.",
    empty: "Belum ada yang dikerjain.",
  },
  {
    key: "finished",
    title: "Finished",
    emoji: "✅",
    desc: "Kegiatan yang sudah selesai.",
    empty: "Belum ada yang selesai.",
  },
];

function normalizeStatus(status: unknown): Status {
  if (status === "plan" || status === "progress" || status === "finished") {
    return status;
  }

  return "plan";
}

function normalizeAccountType(accountType: unknown): AccountType | null {
  if (accountType === "activity" || accountType === "dashboard") {
    return accountType;
  }

  return null;
}

function getSavedUser(): User | null {
  const savedUser = localStorage.getItem("daily_activity_user");

  if (!savedUser) return null;

  try {
    const parsed = JSON.parse(savedUser) as User;

    if (!parsed.id || !parsed.email || !normalizeAccountType(parsed.account_type)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getPasswordStrength(password: string) {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) {
    return { score, label: "Lemah", width: "35%", className: "bg-red-500" };
  }

  if (score <= 4) {
    return { score, label: "Lumayan", width: "70%", className: "bg-amber-500" };
  }

  return { score, label: "Kuat", width: "100%", className: "bg-emerald-500" };
}

function statusLabel(status: Status) {
  if (status === "plan") return "Rencana";
  if (status === "progress") return "On Progress";
  return "Finished";
}

function pageLabel(accountType: AccountType) {
  return accountType === "activity" ? "Activity Page" : "Dashboard Page";
}

export default function App() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("daily_activity_token") || "";
  });

  const [user, setUser] = useState<User | null>(() => getSavedUser());

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>("activity");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [filterPeriod, setFilterPeriod] = useState("Semua");
  const [filterDate, setFilterDate] = useState("");
  const [loadingActivities, setLoadingActivities] = useState(false);

  const [period, setPeriod] = useState("Pagi 🌅");
  const [activityName, setActivityName] = useState("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [activityDate, setActivityDate] = useState("");

  const [draggedId, setDraggedId] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editPeriod, setEditPeriod] = useState("Pagi 🌅");
  const [editActivityName, setEditActivityName] = useState("");
  const [editTimeStart, setEditTimeStart] = useState("");
  const [editTimeEnd, setEditTimeEnd] = useState("");
  const [editActivityDate, setEditActivityDate] = useState("");
  const [editStatus, setEditStatus] = useState<Status>("plan");

  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const passwordStrength = useMemo(
    () => getPasswordStrength(authPassword),
    [authPassword],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("daily_activity_token");
    localStorage.removeItem("daily_activity_user");

    setToken("");
    setUser(null);
    setActivities([]);
    setDashboardSummary(null);
    setAuthMode("login");
    setAuthPassword("");
    setAuthConfirmPassword("");
  }, []);

  const authHeaders = useCallback(() => {
    return {
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  const fetchActivities = useCallback(async () => {
    if (!token || user?.account_type !== "activity") return;

    try {
      setLoadingActivities(true);

      const response = await fetch(ACTIVITY_URL, {
        headers: authHeaders(),
      });

      const result = (await response.json()) as ApiResponse<
        Array<Omit<Activity, "status"> & { status?: string | null }>
      >;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (response.status === 403) {
        alert(result.message || "Akun ini tidak bisa masuk ke Activity Page.");
        return;
      }

      if (!response.ok || !result.success) {
        alert(result.message || "Gagal mengambil data kegiatan");
        return;
      }

      const normalizedActivities: Activity[] = (result.data || []).map((item) => ({
        ...item,
        status: normalizeStatus(item.status),
      }));

      setActivities(normalizedActivities);
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend bro.");
    } finally {
      setLoadingActivities(false);
    }
  }, [authHeaders, logout, token, user?.account_type]);

  const fetchDashboard = useCallback(async () => {
    if (!token || user?.account_type !== "dashboard") return;

    try {
      setLoadingDashboard(true);

      const response = await fetch(DASHBOARD_URL, {
        headers: authHeaders(),
      });

      const result = (await response.json()) as ApiResponse<DashboardSummary>;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (response.status === 403) {
        alert(result.message || "Akun ini tidak bisa masuk ke Dashboard Page.");
        return;
      }

      if (!response.ok || !result.success || !result.data) {
        alert(result.message || "Gagal mengambil data dashboard");
        return;
      }

      setDashboardSummary(result.data);
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke dashboard backend bro.");
    } finally {
      setLoadingDashboard(false);
    }
  }, [authHeaders, logout, token, user?.account_type]);

  useEffect(() => {
    if (!token || !user) return;

    if (user.account_type === "activity") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchActivities();
    }

    if (user.account_type === "dashboard") {
      fetchDashboard();
    }
  }, [fetchActivities, fetchDashboard, token, user]);

  const handleAuthSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    const confirmPassword = authConfirmPassword.trim();
    const name = authName.trim();

    if (!email || !password) {
      alert("Email dan password wajib diisi bro.");
      return;
    }

    if (authMode === "signup") {
      if (!name) {
        alert("Nama wajib diisi buat signup bro.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Konfirmasi password belum sama bro.");
        return;
      }

      if (passwordStrength.score < 5) {
        alert("Password belum kuat bro. Pakai huruf besar, huruf kecil, angka, simbol, minimal 8 karakter.");
        return;
      }
    }

    try {
      setAuthLoading(true);

      const response = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          authMode === "signup"
            ? {
                name,
                email,
                password,
                confirm_password: confirmPassword,
                account_type: selectedAccountType,
              }
            : {
                email,
                password,
                account_type: selectedAccountType,
              },
        ),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success || !result.token || !result.user) {
        alert(result.message || "Auth gagal bro.");
        return;
      }

      localStorage.setItem("daily_activity_token", result.token);
      localStorage.setItem("daily_activity_user", JSON.stringify(result.user));

      setToken(result.token);
      setUser(result.user);

      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend auth bro.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!activityName.trim() || !timeStart.trim() || !timeEnd.trim() || !activityDate) {
      alert("Isi semua data dulu bro!");
      return;
    }

    if (timeEnd <= timeStart) {
      alert("Jam selesai harus lebih besar dari jam mulai bro.");
      return;
    }

    const payload = {
      period,
      time_start: timeStart,
      time_end: timeEnd,
      activity_name: activityName.trim(),
      activity_date: activityDate,
      status: "plan" as Status,
    };

    try {
      const response = await fetch(ACTIVITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (response.status === 403) {
        alert(result.message || "Akun ini tidak bisa tambah activity.");
        return;
      }

      if (!response.ok || !result.success) {
        alert(result.message || "Gagal menambah jadwal");
        return;
      }

      setActivityName("");
      setTimeStart("");
      setTimeEnd("");
      setActivityDate("");

      fetchActivities();
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend bro.");
    }
  };

  const handleMoveStatus = async (id: number, newStatus: Status) => {
    const currentActivity = activities.find((activity) => activity.id === id);

    if (!currentActivity || currentActivity.status === newStatus) {
      setDraggedId(null);
      return;
    }

    const previousActivities = activities;

    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === id ? { ...activity, status: newStatus } : activity,
      ),
    );

    try {
      const response = await fetch(`${ACTIVITY_URL}/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (!response.ok || !result.success) {
        setActivities(previousActivities);
        alert(result.message || "Gagal memindahkan card");
      }
    } catch (error) {
      console.error(error);
      setActivities(previousActivities);
      alert("Gagal konek ke backend bro.");
    } finally {
      setDraggedId(null);
    }
  };

  const handleDrop = (status: Status) => {
    if (draggedId === null) return;
    handleMoveStatus(draggedId, status);
  };

  const openEditModal = (activity: Activity) => {
    setEditId(activity.id);
    setEditPeriod(activity.period);
    setEditActivityName(activity.activity_name);
    setEditTimeStart(activity.time_start);
    setEditTimeEnd(activity.time_end);
    setEditActivityDate(activity.activity_date);
    setEditStatus(activity.status);
    setIsModalOpen(true);
  };

  const handleEditSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (editId === null) return;

    if (!editActivityName.trim() || !editTimeStart.trim() || !editTimeEnd.trim() || !editActivityDate) {
      alert("Data edit nggak boleh kosong bro!");
      return;
    }

    if (editTimeEnd <= editTimeStart) {
      alert("Jam selesai harus lebih besar dari jam mulai bro.");
      return;
    }

    const payload = {
      period: editPeriod,
      time_start: editTimeStart,
      time_end: editTimeEnd,
      activity_name: editActivityName.trim(),
      activity_date: editActivityDate,
      status: editStatus,
    };

    try {
      const response = await fetch(`${ACTIVITY_URL}/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (!response.ok || !result.success) {
        alert(result.message || "Gagal update jadwal");
        return;
      }

      setIsModalOpen(false);
      fetchActivities();
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend bro.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin mau hapus card ini bro?")) return;

    try {
      const response = await fetch(`${ACTIVITY_URL}/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      const result = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (!response.ok || !result.success) {
        alert(result.message || "Gagal hapus jadwal");
        return;
      }

      setActivities((prev) => prev.filter((activity) => activity.id !== id));
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend bro.");
    }
  };

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      const matchPeriod = filterPeriod === "Semua" || activity.period === filterPeriod;
      const matchDate = !filterDate || activity.activity_date === filterDate;

      return matchPeriod && matchDate;
    });
  }, [activities, filterDate, filterPeriod]);

  const totalPlan = filteredActivities.filter((activity) => activity.status === "plan").length;
  const totalProgress = filteredActivities.filter((activity) => activity.status === "progress").length;
  const totalFinished = filteredActivities.filter((activity) => activity.status === "finished").length;
  const totalActivities = filteredActivities.length;

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10 font-sans relative overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_30%)]" />

        <div className="relative w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 items-center">
          <section className="hidden lg:block">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm text-blue-100 mb-6">
              🔐 Secure role-based access
            </div>
            <h1 className="text-5xl font-black leading-tight mb-5">
              Daily Activity App dengan akses akun terpisah.
            </h1>
            <p className="text-slate-300 text-lg leading-relaxed max-w-xl">
              Akun Activity hanya bisa masuk ke halaman card kegiatan. Akun Dashboard hanya bisa masuk ke halaman analytics. Token, role, dan endpoint backend ikut dikunci.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-8 max-w-xl">
              <div className="bg-white/10 border border-white/10 rounded-3xl p-5 backdrop-blur">
                <p className="text-3xl mb-2">🗒️</p>
                <h3 className="font-bold text-lg">Activity Page</h3>
                <p className="text-sm text-slate-300 mt-1">Tambah, edit, drag card, dan selesaikan rencana.</p>
              </div>
              <div className="bg-white/10 border border-white/10 rounded-3xl p-5 backdrop-blur">
                <p className="text-3xl mb-2">📊</p>
                <h3 className="font-bold text-lg">Dashboard Page</h3>
                <p className="text-sm text-slate-300 mt-1">Pantau statistik user dan progress activity.</p>
              </div>
            </div>
          </section>

          <section className="bg-white text-slate-900 rounded-[2rem] shadow-2xl border border-white/20 p-7 md:p-8">
            <div className="mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl shadow-lg mb-4">
                📝
              </div>
              <h2 className="text-3xl font-black">
                {authMode === "login" ? "Welcome back" : "Create secure account"}
              </h2>
              <p className="text-slate-500 mt-2">
                Pilih halaman akses dulu, lalu login atau daftar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => setSelectedAccountType("activity")}
                className={`p-4 rounded-2xl border text-left transition ${
                  selectedAccountType === "activity"
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-slate-50 hover:bg-white"
                }`}
              >
                <span className="text-2xl">🗒️</span>
                <p className="font-black mt-2">Activity</p>
                <p className="text-xs text-slate-500">Card kegiatan</p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAccountType("dashboard")}
                className={`p-4 rounded-2xl border text-left transition ${
                  selectedAccountType === "dashboard"
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-slate-50 hover:bg-white"
                }`}
              >
                <span className="text-2xl">📊</span>
                <p className="font-black mt-2">Dashboard</p>
                <p className="text-xs text-slate-500">Analytics</p>
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-100 rounded-2xl p-1 mb-6">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`py-3 rounded-xl font-bold transition ${
                  authMode === "login" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                }`}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`py-3 rounded-xl font-bold transition ${
                  authMode === "signup" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="block text-sm font-bold mb-1">Nama</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Nama lengkap"
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold mb-1">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    className="w-full p-3 pr-20 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-blue-600"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                {authMode === "signup" && (
                  <div className="mt-2">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${passwordStrength.className}`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Strength: <span className="font-bold">{passwordStrength.label}</span> · wajib huruf besar, kecil, angka, simbol.
                    </p>
                  </div>
                )}
              </div>

              {authMode === "signup" && (
                <div>
                  <label className="block text-sm font-bold mb-1">Konfirmasi Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Ulangi password"
                    autoComplete="new-password"
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 leading-relaxed">
                <span className="font-black text-slate-700">Security note:</span> akun ini akan dikunci untuk <span className="font-black text-blue-600">{pageLabel(selectedAccountType)}</span>. Akun beda page tidak bisa dipakai silang.
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-3 px-4 rounded-xl transition shadow-md"
              >
                {authLoading
                  ? "Processing..."
                  : authMode === "login"
                    ? `Login ke ${pageLabel(selectedAccountType)}`
                    : `Daftar ${pageLabel(selectedAccountType)}`}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  if (user.account_type === "dashboard") {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 font-sans text-slate-800">
        <div className="max-w-7xl mx-auto">
          <header className="bg-slate-950 text-white rounded-3xl shadow-sm p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-blue-300 text-sm font-bold mb-1">Dashboard Page Access</p>
              <h1 className="text-3xl font-black flex items-center gap-2">Dashboard Analytics 📊</h1>
              <p className="text-slate-300 mt-1">Halaman khusus akun dashboard, terpisah dari Activity Page.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-bold">{user.name}</p>
                <p className="text-sm text-slate-300">{user.email}</p>
              </div>

              <button
                type="button"
                onClick={logout}
                className="bg-white text-slate-950 hover:bg-slate-200 font-bold px-4 py-2 rounded-xl transition"
              >
                Logout
              </button>
            </div>
          </header>

          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm text-slate-500 font-bold">Total User</p>
              <h3 className="text-4xl font-black mt-2">{dashboardSummary?.total_users ?? 0}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm text-slate-500 font-bold">Activity User</p>
              <h3 className="text-4xl font-black text-blue-600 mt-2">{dashboardSummary?.activity_users ?? 0}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm text-slate-500 font-bold">Dashboard User</p>
              <h3 className="text-4xl font-black text-violet-600 mt-2">{dashboardSummary?.dashboard_users ?? 0}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm text-slate-500 font-bold">Completion Rate</p>
              <h3 className="text-4xl font-black text-emerald-600 mt-2">{dashboardSummary?.completion_rate ?? 0}%</h3>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-black">Status Overview</h2>
                  <p className="text-sm text-slate-500">Ringkasan semua activity di sistem.</p>
                </div>
                <button
                  type="button"
                  onClick={fetchDashboard}
                  className="text-sm bg-slate-950 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold transition"
                >
                  {loadingDashboard ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { label: "Total Activity", value: dashboardSummary?.total_activities ?? 0, className: "bg-slate-900" },
                  { label: "Rencana", value: dashboardSummary?.plan ?? 0, className: "bg-blue-600" },
                  { label: "On Progress", value: dashboardSummary?.progress ?? 0, className: "bg-orange-500" },
                  { label: "Finished", value: dashboardSummary?.finished ?? 0, className: "bg-emerald-600" },
                ].map((item) => (
                  <div key={item.label} className="border border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold">{item.label}</p>
                      <p className="font-black text-lg">{item.value}</p>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.className}`}
                        style={{
                          width: `${Math.min(
                            100,
                            dashboardSummary?.total_activities
                              ? (item.value / dashboardSummary.total_activities) * 100
                              : item.label === "Total Activity"
                                ? 100
                                : 0,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-xl font-black mb-1">Recent Activities</h2>
              <p className="text-sm text-slate-500 mb-5">Aktivitas terbaru dari semua Activity User.</p>

              <div className="space-y-3">
                {(dashboardSummary?.recent_activities || []).length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                    Belum ada activity masuk.
                  </div>
                ) : (
                  dashboardSummary?.recent_activities.map((activity) => (
                    <article key={activity.id} className="border border-slate-200 rounded-2xl p-4 hover:shadow-sm transition">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div>
                          <h3 className="font-black text-slate-900">{activity.activity_name}</h3>
                          <p className="text-sm text-slate-500 mt-1">
                            {activity.user_name || "Unknown User"} · {activity.user_email || "No email"}
                          </p>
                        </div>
                        <span className="text-xs font-black bg-slate-100 text-slate-700 px-3 py-1 rounded-full w-fit">
                          {statusLabel(normalizeStatus(activity.status))}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">{activity.period}</span>
                        <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-full">📅 {activity.activity_date}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        <header className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-blue-600 text-sm font-black mb-1">Activity Page Access</p>
            <h1 className="text-3xl font-black text-blue-600 flex items-center gap-2">
              Daily Noted Activity 📝
            </h1>
            <p className="text-slate-500 mt-1">
              Halaman utama buat rencana, progress, dan finished activity.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-bold">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="bg-slate-900 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl transition"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-bold">Total Kegiatan</p>
            <h3 className="text-3xl font-black text-slate-900 mt-2">{totalActivities}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-bold">Rencana</p>
            <h3 className="text-3xl font-black text-blue-600 mt-2">{totalPlan}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-bold">On Progress</p>
            <h3 className="text-3xl font-black text-orange-500 mt-2">{totalProgress}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-bold">Finished</p>
            <h3 className="text-3xl font-black text-green-600 mt-2">{totalFinished}</h3>
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold mb-1">Filter Periode</label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Semua</option>
                <option>Pagi 🌅</option>
                <option>Siang ☀️</option>
                <option>Sore 🌆</option>
                <option>Malam 🌌</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-bold mb-1">Filter Tanggal</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setFilterPeriod("Semua");
                setFilterDate("");
              }}
              className="bg-slate-900 hover:bg-slate-700 text-white font-bold px-5 py-3 rounded-xl transition"
            >
              Reset Filter
            </button>
          </div>
        </section>

        <form onSubmit={handleAddSubmit} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-xl font-black flex items-center gap-2">➕ Tambah Rencana Baru</h2>
              <p className="text-slate-500 text-sm">Card baru otomatis masuk ke kolom Rencana.</p>
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-6 rounded-xl transition shadow-md"
            >
              Simpan Rencana
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">Periode</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Pagi 🌅</option>
                <option>Siang ☀️</option>
                <option>Sore 🌆</option>
                <option>Malam 🌌</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Tanggal</label>
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Mulai</label>
              <input
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Selesai</label>
              <input
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Kegiatan</label>
              <input
                type="text"
                placeholder="Contoh: Ngoding Hono.js"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </form>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">Board Kegiatan</h2>
          <button
            type="button"
            onClick={fetchActivities}
            className="text-sm bg-white hover:bg-slate-50 border border-slate-300 px-4 py-2 rounded-xl font-bold transition"
          >
            {loadingActivities ? "Loading..." : "Refresh"}
          </button>
        </div>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {COLUMNS.map((column) => {
            const cards = filteredActivities.filter((activity) => activity.status === column.key);

            return (
              <section
                key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(column.key)}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 min-h-[520px]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-black flex items-center gap-2">
                      <span>{column.emoji}</span>
                      {column.title}
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                        {cards.length}
                      </span>
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{column.desc}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {cards.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-sm">
                      {column.empty}
                      <br />
                      Drag card ke sini.
                    </div>
                  ) : (
                    cards.map((activity) => (
                      <article
                        key={activity.id}
                        draggable
                        onDragStart={() => setDraggedId(activity.id)}
                        onDragEnd={() => setDraggedId(null)}
                        className="bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl p-4 cursor-grab active:cursor-grabbing hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-black text-slate-900 text-lg leading-snug">{activity.activity_name}</p>
                            <p className="text-xs text-slate-500 mt-1">Drag card buat pindahin status</p>
                          </div>

                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditModal(activity)}
                              className="p-2 hover:bg-amber-100 rounded-xl text-amber-600 transition"
                              title="Edit"
                            >
                              ✏️
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(activity.id)}
                              className="p-2 hover:bg-red-100 rounded-xl text-red-600 transition"
                              title="Hapus"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">{activity.period}</span>
                          <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-full">📅 {activity.activity_date || "No Date"}</span>
                          <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2 py-1 rounded-full">⏰ {activity.time_start} - {activity.time_end}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                          {column.key !== "plan" && (
                            <button
                              type="button"
                              onClick={() => handleMoveStatus(activity.id, "plan")}
                              className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl transition"
                            >
                              Ke Rencana
                            </button>
                          )}

                          {column.key !== "progress" && (
                            <button
                              type="button"
                              onClick={() => handleMoveStatus(activity.id, "progress")}
                              className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold py-2 rounded-xl transition"
                            >
                              On Progress
                            </button>
                          )}

                          {column.key !== "finished" && (
                            <button
                              type="button"
                              onClick={() => handleMoveStatus(activity.id, "finished")}
                              className="text-xs bg-green-100 hover:bg-green-200 text-green-700 font-bold py-2 rounded-xl transition"
                            >
                              Finished
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </main>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">✏️ Edit Card</h3>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as Status)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  <option value="plan">Rencana</option>
                  <option value="progress">On Progress</option>
                  <option value="finished">Finished</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1">Periode</label>
                <select
                  value={editPeriod}
                  onChange={(e) => setEditPeriod(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  <option>Pagi 🌅</option>
                  <option>Siang ☀️</option>
                  <option>Sore 🌆</option>
                  <option>Malam 🌌</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1">Tanggal</label>
                <input
                  type="date"
                  value={editActivityDate}
                  onChange={(e) => setEditActivityDate(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1">Nama Kegiatan</label>
                <input
                  type="text"
                  value={editActivityName}
                  onChange={(e) => setEditActivityName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    value={editTimeStart}
                    onChange={(e) => setEditTimeStart(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    value={editTimeEnd}
                    onChange={(e) => setEditTimeEnd(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-3 px-4 rounded-xl transition shadow-md"
                >
                  Simpan
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-3 px-4 rounded-xl transition"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
