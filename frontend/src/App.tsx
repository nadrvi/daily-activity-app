import { useState, useEffect } from 'react';

interface Activity {
  id: number;
  period: string;
  time_start: string;
  time_end: string;
  activity_name: string;
  activity_date: string;
}

export default function App() {
  const API_URL = 'https://backend.nadrvi.workers.dev/api/activities';

  // === State Utama (Untuk Form Tambah Jadwal) ===
  const [activities, setActivities] = useState<Activity[]>([]);
  const [period, setPeriod] = useState('Pagi 🌅');
  const [activityName, setActivityName] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [activityDate, setActivityDate] = useState('');
  
  // === State Khusus Modal Pop-up (Untuk Form Edit Jadwal) ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editPeriod, setEditPeriod] = useState('Pagi 🌅');
  const [editActivityName, setEditActivityName] = useState('');
  const [editTimeStart, setEditTimeStart] = useState('');
  const [editTimeEnd, setEditTimeEnd] = useState('');
  const [editActivityDate, setEditActivityDate] = useState('');

  // Ambil Data dari Backend Cloudflare D1
  const fetchJadwal = async () => {
    try {
      const res = await fetch(API_URL);
      const resData = await res.json();
      if (resData.success) setActivities(resData.data);
    } catch (err) {
      console.error('Gagal mengambil data:', err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJadwal();
    const interval = setInterval(fetchJadwal, 5000); // Auto-refresh tiap 5 detik
    return () => clearInterval(interval);
  }, []);

  // === HANDLE TAMBAH DATA BARU (POST) ===
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityName || !timeStart || !timeEnd || !activityDate) {
      alert('Isi semua data dulu bro!');
      return;
    }

    const payload = {
      period,
      time_start: timeStart,
      time_end: timeEnd,
      activity_name: activityName,
      activity_date: activityDate,
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Reset Form Tambah
        setActivityName('');
        setTimeStart('');
        setTimeEnd('');
        setActivityDate('');
        fetchJadwal();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // === HANDLE SIMPAN PERUBAHAN EDIT (PUT dari Modal) ===
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editActivityName || !editTimeStart || !editTimeEnd || !editActivityDate) {
      alert('Data edit nggak boleh kosong bro!');
      return;
    }

    const payload = {
      period: editPeriod,
      time_start: editTimeStart,
      time_end: editTimeEnd,
      activity_name: editActivityName,
      activity_date: editActivityDate,
    };

    try {
      const response = await fetch(`${API_URL}/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsModalOpen(false); // Tutup Pop-up Modal
        fetchJadwal(); // Refresh data terbaru
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Aktifkan Pop-up Modal dan Isi Data Lama
  const openEditModal = (act: Activity) => {
    setEditId(act.id);
    setEditPeriod(act.period);
    setEditActivityName(act.activity_name);
    setEditTimeStart(act.time_start);
    setEditTimeEnd(act.time_end);
    setEditActivityDate(act.activity_date);
    setIsModalOpen(true); // Buka modal melayang
  };

  // HANDLE HAPUS DATA (DELETE)
  const handleDelete = async (id: number) => {
    if (!confirm('Yakin mau hapus jadwal ini bro?')) return;

    try {
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (response.ok) fetchJadwal();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 font-sans text-slate-800 relative">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-3xl font-bold text-blue-600 mb-6 flex items-center gap-2">
          Daily Noted Activity 📝
        </h1>

        {/* ================= FORM TAMBAH BARU ================= */}
        <form onSubmit={handleAddSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-slate-700 flex items-center gap-1">
            ➕ Tambah Jadwal Baru
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Periode</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg">
                <option>Pagi 🌅</option>
                <option>Siang ☀️</option>
                <option>Sore 🌆</option>
                <option>Malam 🌌</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tanggal</label>
              <input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Kegiatan</label>
              <input type="text" placeholder="Contoh: Ngoding Hono.js" value={activityName} onChange={(e) => setActivityName(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Mulai</label>
              <input type="text" placeholder="09.00" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Selesai</label>
              <input type="text" placeholder="11.00" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg" />
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition shadow-md">
            Simpan Jadwal
          </button>
        </form>

        {/* ================= LIST TAMPILAN KEGIATAN ================= */}
        <div>
          <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-slate-200">Daftar Kegiatan</h2>
          {activities.length === 0 ? (
            <p className="text-center text-slate-500 my-4">Belum ada jadwal nih, isi form di atas bro!</p>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => (
                <div key={act.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:shadow-md transition">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{act.period}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">📅 {act.activity_date || 'No Date'}</span>
                      <span className="text-sm text-slate-500 font-medium">{act.time_start} - {act.time_end}</span>
                    </div>
                    <p className="font-semibold text-slate-800 text-lg">{act.activity_name}</p>
                  </div>
                  
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(act)} className="p-2 hover:bg-amber-100 rounded-lg text-amber-600 transition" title="Edit">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(act.id)} className="p-2 hover:bg-red-100 rounded-lg text-red-600 transition" title="Hapus">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================= POP-UP MODAL EDIT (MELAYANG) ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                ✏️ Edit Jadwal Kegiatan
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600">Periode</label>
                <select value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none">
                  <option>Pagi 🌅</option>
                  <option>Siang ☀️</option>
                  <option>Sore 🌆</option>
                  <option>Malam 🌌</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600">Tanggal</label>
                <input type="date" value={editActivityDate} onChange={(e) => setEditActivityDate(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600">Nama Kegiatan</label>
                <input type="text" value={editActivityName} onChange={(e) => setEditActivityName(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600">Jam Mulai</label>
                  <input type="text" value={editTimeStart} onChange={(e) => setEditTimeStart(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600">Jam Selesai</label>
                  <input type="text" value={editTimeEnd} onChange={(e) => setEditTimeEnd(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none" />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg transition shadow-md">
                  Simpan Perubahan
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg transition">
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