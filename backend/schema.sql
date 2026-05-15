CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL, -- 'Pagi', 'Siang', 'Sore', 'Malam'
  time_start TEXT NOT NULL, -- e.g., '04.40'
  time_end TEXT NOT NULL, -- e.g., '05.00'
  activity_name TEXT NOT NULL, -- 'Bangun tidur...'
  duration_mins INTEGER -- Waktu dalam menit
);