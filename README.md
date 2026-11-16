# Mbakul Bagian Gaul (MBG) — Express & MySQL App

Aplikasi web katalog sparepart motor bekas dan dashboard inventaris UMKM berbasis **Node.js, Express.js, & MySQL** (2 User Roles: **Admin Toko** & **Pembeli**).

---

## 📁 Struktur Direktori
```text
d:\chat\
├── database\
│   ├── schema.sql       # Skema database MySQL (users, products, settings)
│   ├── seed.js          # Seeder data dummy (8 produk & 2 user role)
│   └── setup.js         # Setup tabel otomatis
├── node_modules\        # Dependensi Express & modul backend
├── public\
│   ├── index.html       # Antarmuka Katalog & Dashboard SPA Astra Honda
│   └── app.js           # Logika klien & integrasi REST API
├── server\
│   ├── db.js            # Koneksi database MySQL Pool
│   └── index.js         # Web Server Express & REST API
├── .env                 # Port & kredensial MySQL
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── prototype_sparepat.html
└── spec.md
```

---

## 🚀 Cara Menjalankan

1. **Pastikan MySQL menyala di Laragon** (port 3306).
2. **Inisialisasi Database & Seeding Data Dummy (Sekali saja jika belum):**
   ```bash
   npm run db:setup
   npm run db:seed
   ```
3. **Jalankan Server Express:**
   ```bash
   npm start
   ```
4. **Buka di Browser:**
   👉 `http://localhost:3000`

---

## 🔑 Akun Uji Coba (Password: `password123`)
* **Admin Toko**: `admin@mbakul.com`
* **Pembeli**: `budi@gmail.com`
*(Tersedia tombol **1-Click Login Cepat** di modal login untuk beralih role seketika).*
