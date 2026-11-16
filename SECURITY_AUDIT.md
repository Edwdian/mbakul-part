# LAPORAN ANALISIS & UJI PENETRASI KEAMANAN (OWASP TOP 10)
**Aplikasi:** Mbakul Bagian Gaul (MBG) — Katalog & Lapak Sparepart Motor Bekas  
**Arsitektur:** Node.js v22, Express.js REST API, MySQL Database  
**Tanggal Uji:** 16 November 2026  
**Status Akhir:** ✅ **LULUS UJI PENETRASI & REMEDIASI 100% SELESAI**

---

## 1. Ringkasan Eksekutif
Pengujian penetrasi dilakukan secara komprehensif mengacu pada standar keamanan **OWASP Top 10 Web Application Security Risks**. Audit ini mencakup identifikasi celah akses kontrol, manajemen sesi otentikasi, injeksi SQL/XSS, dan konfigurasi keamanan server. Seluruh celah yang ditemukan telah diperbaiki (*remediated*) dan diverifikasi ulang tanpa menimbulkan gangguan fungsional pada aplikasi.

---

## 2. Matriks Temuan & Status Remediasi

| Kode OWASP | Kategori Risiko | Temuan Awal (Vulnerability) | Tingkat Risiko | Status Remediasi |
|---|---|---|:---:|:---:|
| **A01:2021** | **Broken Access Control** | Autentikasi sesi sebelumnya hanya mengandalkan Plain Cookie `user_id` tanpa tanda tangan kriptografi (raw user ID tampering). | **Tinggi (High)** | ✅ **Diperbaiki (Fixed)** |
| **A01:2021** | **Insecure Direct Object References (IDOR)** | Endpoint edit/delete produk belum memvalidasi apakah produk tersebut benar-benar milik seller yang login. | **Tinggi (High)** | ✅ **Diperbaiki (Fixed)** |
| **A02:2021** | **Cryptographic Failures** | Cookie sesi tidak dienkripsi atau ditandatangani dengan JWT token yang aman. | **Tinggi (High)** | ✅ **Diperbaiki (Fixed)** |
| **A03:2021** | **Injection (SQLi & XSS)** | Parameter query MySQL telah menggunakan prepared statement `?`, namun payload XSS input belum disanitasi ketat. | **Sedang (Medium)** | ✅ **Diperbaiki (Fixed)** |
| **A05:2021** | **Security Misconfiguration** | Header HTTP standar masih mengekspos header Express `X-Powered-By` dan tanpa perlindungan clickjacking/sniffing. | **Sedang (Medium)** | ✅ **Diperbaiki (Fixed)** |
| **A07:2021** | **Identification & Authentication Failures** | Tidak ada pembatasan request (*rate limiting*) pada endpoint login/registrasi (rawan brute-force). Terdapat bypass backdoor `password123`. | **Tinggi (High)** | ✅ **Diperbaiki (Fixed)** |

---

## 3. Detail Hasil Pengujian & Tindakan Remediasi

### A01: Broken Access Control & IDOR
- **Skenario Uji:** Mengubah cookie `user_id` manual dari `id=2` menjadi `id=1` (Admin) atau mencoba mengubah data produk ID milik penjual lain.
- **Tindakan Perbaikan:**
  1. Mengganti sistem otentikasi menjadi **JSON Web Token (JWT)** yang ditandatangani dengan secret key di `.env` (`JWT_SECRET`).
  2. Menetapkan atribut cookie: `HttpOnly=true`, `SameSite=Lax`, dan `secure` saat production.
  3. Menambahkan klausul `AND seller_id = ?` pada query `UPDATE` dan `DELETE` produk, serta memeriksa `affectedRows === 0` untuk menolak manipulasi barang milik penjual lain.

### A02: Cryptographic Failures
- **Skenario Uji:** Mencoba mendekripsi atau memalsukan JWT token dengan kunci acak.
- **Tindakan Perbaikan:**
  - Token JWT ditandatangani menggunakan algoritma HMAC-SHA256 dengan secret key yang aman.
  - Seluruh password pengguna disimpan menggunakan **Bcrypt** dengan salt rounds 10.

### A03: Injection (SQL Injection & XSS)
- **Skenario Uji:** Menginjeksi payload SQL `' OR '1'='1` pada pencarian katalog dan form login.
- **Tindakan Perbaikan:**
  - Seluruh query database di Express backend 100% menggunakan **Parameterized Prepared Statement** (`?`), mencegah SQL injection sepenuhnya.
  - Input teks disanitasi menggunakan sanitasi tipe data dan penolakan payload tak valid.

### A05: Security Misconfiguration
- **Skenario Uji:** Analisis response header HTTP via browser DevTools.
- **Tindakan Perbaikan:**
  - Mengintegrasikan middleware **Helmet.js** untuk memasang header keamanan modern (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, pencegahan XSS filter, dll).

### A07: Identification and Authentication Failures
- **Skenario Uji:** Melakukan serangan spam/brute-force request login berulang kali dan mencoba backdoor hardcoded password.
- **Tindakan Perbaikan:**
  1. Memasang **Express Rate Limit** (`authLimiter`): Maksimal 30 percobaan autentikasi per 15 menit per IP address.
  2. Menghapus total bypass string `|| password === 'password123'`, sehingga verifikasi hanya menerima hash bcrypt valid.

---

## 4. Kesimpulan
Aplikasi **Mbakul Bagian Gaul (MBG)** kini telah memenuhi standar keamanan web modern **OWASP Top 10**. Integritas data antar peran (Admin, Seller, Pembeli), kerahasiaan sesi, dan keamanan transaksi pemesanan via WhatsApp terlindungi secara optimal.
