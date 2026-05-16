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

  // State Utama
  const [activities, setActivities] = useState<Activity[]>([]);
  const [period, setPeriod] = useState('Pagi 🌅');
  const [activityName, setActivityName] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [activityDate, setActivityDate] = useState('');
  
  // State khusus Mode Edit
  const [editingId, setEditingId] = useState<number | null>(null);

  // Ambil Data dari Backend
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
    const interval = setInterval(fetchJadwal, 5000); // Auto refresh tiap 5 detik
    return () => clearInterval(interval);
  }, []);

  // Handle Simpan (Bisa Tambah Baru ATAU Simpan Hasil Edit)
  const handleSubmit = async (e: React.FormEvent) => {
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
      let response;
      if (editingId) {
        // Jika sedang mengedit, kirim ke endpoint PUT
        response = await fetch(`${API_URL}/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Jika data baru, kirim ke endpoint POST
        response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        resetForm();
        fetchJadwal();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Masuk ke Mode Edit (Ngelempar data list ke Form atas)
  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setPeriod(act.period);
    setActivityName(act.activity_name);
    setTimeStart(act.time_start);
    setTimeEnd(act.time_end);
    setActivityDate(act.activity_date);
  };

  // Handle Hapus Data
  const handleDelete = async (id: number) => {
    if (!confirm('Yakin mau hapus jadwal ini bro?')) return;

    try {
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (response.ok) fetchJadwal();
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setActivityName('');
    setTimeStart('');
    setTimeEnd('');
    setActivityDate('');
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 font-sans text-slate-800">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-3xl font-bold text-blue-600 mb-6 flex items-center gap-2">
          Daily Noted Activity 📝
        </h1>

        {/* Form Input */}
        <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-slate-700">
            {editingId ? '✏️ Edit Jadwal' : '➕ Tambah Jadwal Baru'}
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

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition">
              {editingId ? 'Simpan Perubahan' : 'Simpan Jadwal'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="bg-slate-300 hover:bg-slate-400 text-slate-700 font-semibold py-2 px-4 rounded-lg transition">
                Batal
              </button>
            )}
          </div>
        </form>

        {/* List Tampilan Kegiatan */}
        <div>
          <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-slate-200">Daftar Kegiatan</h2>
          {activities.length === 0 ? (
            <p className="text-center text-slate-500 my-4">Belum ada jadwal nih, isi form di atas bro!</p>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => (
                <div key={act.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:shadow-md transition">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{act.period}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">📅 {act.activity_date}</span>
                      <span className="text-sm text-slate-500 font-medium">{act.time_start} - {act.time_end}</span>
                    </div>
                    <p className="font-semibold text-slate-800 text-lg">{act.activity_name}</p>
                  </div>
                  
                  {/* Tombol Aksi */}
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(act)} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600 font-bold transition" title="Edit">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(act.id)} className="p-1.5 hover:bg-red-100 rounded-lg text-red-600 font-bold transition" title="Hapus">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}