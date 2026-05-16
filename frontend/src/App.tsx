import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Status = "plan" | "progress" | "finished";
type AuthMode = "login" | "signup";

interface Activity {
  id: number;
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
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
  data?: T;
}

const API_BASE = "https://backend.nadrvi.workers.dev/api";
const ACTIVITY_URL = `${API_BASE}/activities`;

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

function getSavedUser(): User | null {
  const savedUser = localStorage.getItem("daily_activity_user");

  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser) as User;
  } catch {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("daily_activity_token") || "";
  });

  const [user, setUser] = useState<User | null>(() => getSavedUser());

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
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

  const logout = useCallback(() => {
    localStorage.removeItem("daily_activity_token");
    localStorage.removeItem("daily_activity_user");

    setToken("");
    setUser(null);
    setActivities([]);
    setAuthMode("login");
  }, []);

  const fetchActivities = useCallback(async () => {
    if (!token) return;

    try {
      setLoadingActivities(true);

      const response = await fetch(ACTIVITY_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json()) as ApiResponse<
        Array<Omit<Activity, "status"> & { status?: string | null }>
      >;

      if (response.status === 401) {
        logout();
        alert("Sesi login habis bro, login ulang ya.");
        return;
      }

      if (!response.ok || !result.success) {
        alert(result.message || "Gagal mengambil data kegiatan");
        return;
      }

      const normalizedActivities: Activity[] = (result.data || []).map(
        (item) => ({
          ...item,
          status: normalizeStatus(item.status),
        }),
      );

      setActivities(normalizedActivities);
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend bro.");
    } finally {
      setLoadingActivities(false);
    }
  }, [token, logout]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchActivities();
  }, [fetchActivities]);

  const handleAuthSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    const name = authName.trim();

    if (!email || !password) {
      alert("Email dan password wajib diisi bro.");
      return;
    }

    if (authMode === "signup" && !name) {
      alert("Nama wajib diisi buat signup bro.");
      return;
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
            ? { name, email, password }
            : { email, password },
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
    } catch (error) {
      console.error(error);
      alert("Gagal konek ke backend auth bro.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (
      !activityName.trim() ||
      !timeStart.trim() ||
      !timeEnd.trim() ||
      !activityDate
    ) {
      alert("Isi semua data dulu bro!");
      return;
    }

    const payload = {
      period,
      time_start: timeStart,
      time_end: timeEnd,
      activity_name: activityName,
      activity_date: activityDate,
      status: "plan" as Status,
    };

    try {
      const response = await fetch(ACTIVITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
          Authorization: `Bearer ${token}`,
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

    if (
      !editActivityName.trim() ||
      !editTimeStart.trim() ||
      !editTimeEnd.trim() ||
      !editActivityDate
    ) {
      alert("Data edit nggak boleh kosong bro!");
      return;
    }

    const payload = {
      period: editPeriod,
      time_start: editTimeStart,
      time_end: editTimeEnd,
      activity_name: editActivityName,
      activity_date: editActivityDate,
      status: editStatus,
    };

    try {
      const response = await fetch(`${ACTIVITY_URL}/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

  const filteredActivities = activities.filter((activity) => {
    const matchPeriod =
      filterPeriod === "Semua" || activity.period === filterPeriod;

    const matchDate = !filterDate || activity.activity_date === filterDate;

    return matchPeriod && matchDate;
  });

  const totalActivities = filteredActivities.length;
  const totalPlan = filteredActivities.filter(
    (activity) => activity.status === "plan",
  ).length;
  const totalProgress = filteredActivities.filter(
    (activity) => activity.status === "progress",
  ).length;
  const totalFinished = filteredActivities.filter(
    (activity) => activity.status === "finished",
  ).length;
  const isFilterActive = filterPeriod !== "Semua" || Boolean(filterDate);


  if (!token || !user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10 font-sans text-slate-800">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-7">
          <div className="mb-6 text-center">
            <div className="text-4xl mb-3">📝</div>
            <h1 className="text-3xl font-bold text-blue-600">
              Daily Noted Activity
            </h1>
            <p className="text-slate-500 mt-2">
              Login dulu buat ngatur rencana harian lu.
            </p>
          </div>

          <div className="grid grid-cols-2 bg-slate-100 rounded-2xl p-1 mb-6">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`py-2 rounded-xl font-semibold transition ${
                authMode === "login"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className={`py-2 rounded-xl font-semibold transition ${
                authMode === "signup"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "signup" && (
              <div>
                <label className="block text-sm font-semibold mb-1">Nama</label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Nama lu"
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-1">Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Password
              </label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition shadow-md"
            >
              {authLoading
                ? "Loading..."
                : authMode === "login"
                  ? "Login"
                  : "Buat Akun"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        <header className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600 flex items-center gap-2">
              Daily Noted Activity 📝
            </h1>
            <p className="text-slate-500 mt-1">
              ClickUp style board buat rencana, progress, dan kegiatan selesai.
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
              className="bg-slate-900 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl transition"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-semibold">
              Total Kegiatan
            </p>
            <h3 className="text-3xl font-bold text-slate-900 mt-2">
              {totalActivities}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Berdasarkan filter aktif
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-semibold">Rencana</p>
            <h3 className="text-3xl font-bold text-blue-600 mt-2">
              {totalPlan}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Card yang belum dimulai
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-semibold">
              On Progress
            </p>
            <h3 className="text-3xl font-bold text-orange-500 mt-2">
              {totalProgress}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Card yang sedang dikerjakan
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm text-slate-500 font-semibold">Finished</p>
            <h3 className="text-3xl font-bold text-green-600 mt-2">
              {totalFinished}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Card yang sudah selesai
            </p>
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-sm font-semibold">
                  Filter Periode
                </label>
                {isFilterActive && (
                  <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                    Filter aktif
                  </span>
                )}
              </div>
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
              <label className="block text-sm font-semibold mb-1">
                Filter Tanggal
              </label>
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

        <form
          onSubmit={handleAddSubmit}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                ➕ Tambah Rencana Baru
              </h2>
              <p className="text-slate-500 text-sm">
                Card baru otomatis masuk ke kolom Rencana.
              </p>
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition shadow-md"
            >
              Simpan Rencana
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">
                Periode
              </label>
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
              <label className="block text-sm font-semibold mb-1">
                Tanggal
              </label>
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Mulai</label>
              <input
                type="text"
                placeholder="09.00"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Selesai
              </label>
              <input
                type="text"
                placeholder="11.00"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Kegiatan
              </label>
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

        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Board Kegiatan</h2>
            <p className="text-sm text-slate-500">
              {isFilterActive
                ? "Data yang tampil sedang mengikuti filter."
                : "Semua kegiatan ditampilkan."}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchActivities}
            className="text-sm bg-white hover:bg-slate-50 border border-slate-300 px-4 py-2 rounded-xl font-semibold transition"
          >
            {loadingActivities ? "Loading..." : "Refresh"}
          </button>
        </div>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {COLUMNS.map((column) => {
            const cards = filteredActivities.filter(
              (activity) => activity.status === column.key,
            );

            return (
              <section
                key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(column.key)}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 min-h-[520px]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
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
                            <p className="font-bold text-slate-900 text-lg leading-snug">
                              {activity.activity_name}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Drag card buat pindahin status
                            </p>
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
                          <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">
                            {activity.period}
                          </span>

                          <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-full">
                            📅 {activity.activity_date || "No Date"}
                          </span>

                          <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2 py-1 rounded-full">
                            ⏰ {activity.time_start} - {activity.time_end}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                          {column.key !== "plan" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveStatus(activity.id, "plan")
                              }
                              className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl transition"
                            >
                              Ke Rencana
                            </button>
                          )}

                          {column.key !== "progress" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveStatus(activity.id, "progress")
                              }
                              className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold py-2 rounded-xl transition"
                            >
                              On Progress
                            </button>
                          )}

                          {column.key !== "finished" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveStatus(activity.id, "finished")
                              }
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
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                ✏️ Edit Card
              </h3>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">
                  Status
                </label>
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
                <label className="block text-sm font-semibold mb-1">
                  Periode
                </label>
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
                <label className="block text-sm font-semibold mb-1">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={editActivityDate}
                  onChange={(e) => setEditActivityDate(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">
                  Nama Kegiatan
                </label>
                <input
                  type="text"
                  value={editActivityName}
                  onChange={(e) => setEditActivityName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Jam Mulai
                  </label>
                  <input
                    type="text"
                    value={editTimeStart}
                    onChange={(e) => setEditTimeStart(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Jam Selesai
                  </label>
                  <input
                    type="text"
                    value={editTimeEnd}
                    onChange={(e) => setEditTimeEnd(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-xl transition shadow-md"
                >
                  Simpan
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-xl transition"
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
