import { useEffect, useState } from "react";

type Activity = {
  id: number;
  period: string;
  time_start: string;
  time_end: string;
  activity_name: string;
};

export default function App() {
  const [jadwal, setJadwal] = useState<Activity[]>([]);

  // State untuk nyimpen isian form
  const [period, setPeriod] = useState("Pagi");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [activityName, setActivityName] = useState("");

  // Fungsi untuk ngambil data (dipisah biar bisa dipanggil ulang)
  const fetchJadwal = () => {
    fetch("https://backend.nadrvi.workers.dev/api/activities")
      .then((response) => response.json())
      .then((data) => setJadwal(data.data || []))
      .catch((err) => console.error("Gagal ngambil data:", err));
  };

  useEffect(() => {
    // 1. Ambil data saat web pertama kali dibuka
    fetchJadwal();

    // 2. Pasang "alarm" untuk otomatis ngecek data terbaru setiap 5 detik (5000 ms)
    const interval = setInterval(() => {
      fetchJadwal();
    }, 5000);

    // 3. Bersihkan alarm saat pindah halaman/tutup web biar RAM nggak bocor
    return () => clearInterval(interval);
  }, []);

  // Fungsi saat tombol "Simpan Jadwal" diklik
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Biar web nggak ke-refresh saat submit

    const dataBaru = {
      period,
      time_start: timeStart,
      time_end: timeEnd,
      activity_name: activityName,
    };

    try {
      const response = await fetch(
        "https://backend.nadrvi.workers.dev/api/activities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataBaru),
        },
      );

      if (response.ok) {
        // Kalau sukses nyimpen, kosongin form inputnya
        setTimeStart("");
        setTimeEnd("");
        setActivityName("");
        // Refresh daftar jadwal di bawahnya
        fetchJadwal();
      }
    } catch (error) {
      console.error("Gagal nambah jadwal:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-10 font-sans text-slate-800 select-none ">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-blue-600 mb-6">
          Daily Noted Activity 📝
        </h1>

        {/* FORM INPUT JADWAL BARU */}
        <form
          onSubmit={handleSubmit}
          className="mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200"
        >
          <h2 className="text-lg font-semibold mb-3">Tambah Jadwal Baru</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Periode
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Pagi 🌤️">Pagi 🌤️</option>
                <option value="Pagi Menjelang Siang 📚">
                  Pagi Menjelang Siang 📚
                </option>
                <option value="Siang ☀️">Siang ☀️</option>
                <option value="Sore 🌥️">Sore 🌥️</option>
                <option value="Malam 🌙">Malam 🌙</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Kegiatan
              </label>
              <input
                type="text"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Cth: Belajar Mengetik"
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Mulai (Waktu)
              </label>
              <input
                type="text"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                placeholder="Cth: 09.00"
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Selesai (Waktu)
              </label>
              <input
                type="text"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                placeholder="Cth: 09.15"
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Simpan Jadwal
          </button>
        </form>

        {/* DAFTAR JADWAL */}
        <div>
          <h2 className="text-xl font-bold border-b pb-2 mb-4">
            Daftar Kegiatan
          </h2>
          {jadwal.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              Belum ada jadwal nih, isi form di atas bro!
            </p>
          ) : (
            <ul className="space-y-4">
              {jadwal.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between items-center border-b pb-3"
                >
                  <div>
                    <p className="font-semibold text-gray-800">
                      {item.time_start} - {item.time_end}
                    </p>
                    <p className="text-gray-600">{item.activity_name}</p>
                  </div>
                  <span className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                    {item.period}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
