const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function seedData() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || 'mbakul_part';

  console.log(`Connecting to ${database}...`);
  try {
    const connection = await mysql.createConnection({ host, port, user, password, database });

    // 1. Seed Settings
    console.log('Seeding store settings...');
    await connection.query(`
      REPLACE INTO settings (key_name, key_value) VALUES 
      ('store_wa', '6281234567890'),
      ('store_name', 'Mbakul Bagian Gaul (MBG)'),
      ('store_tagline', 'Otomotif & Suku Cadang Motor Bekas — Sinergi Kualitas Terpercaya')
    `);

    // 2. Seed Users (Admin, Reseller/Seller, Pembeli)
    console.log('Seeding accounts: 1 Admin, 4 Seller/Reseller, 1 Pembeli...');
    const defaultPasswordHash = await bcrypt.hash('password123', 10);

    await connection.query('DELETE FROM users');
    await connection.query(`
      INSERT INTO users (id, name, email, password, role, phone, store_name) VALUES 
      (1, 'Admin Toko MBG', 'admin@mbakul.com', ?, 'admin', '6281234567890', 'Kantor Pusat MBG'),
      (2, 'Pakde Joko Motogarage', 'seller@mbakul.com', ?, 'seller', '6285712345678', 'Joko Motor Bekas Gaul'),
      (3, 'Budi Santoso', 'budi@gmail.com', ?, 'pembeli', '6281311223344', NULL),
      (4, 'Asep Saepudin', 'asep@mbakul.com', ?, 'seller', '6281298765432', 'Asep Part Racing & Copotan'),
      (5, 'Hendra Wijaya', 'hendra@mbakul.com', ?, 'seller', '6285811223344', 'Hendra Kaki-Kaki & Velg'),
      (6, 'Bambang Sukoco', 'bambang@mbakul.com', ?, 'seller', '6287766554433', 'Bambang Kelistrikan Motor')
    `, [defaultPasswordHash, defaultPasswordHash, defaultPasswordHash, defaultPasswordHash, defaultPasswordHash, defaultPasswordHash]);

    // 3. Seed Products (Semua part milik Seller Pakde Joko #2)
    console.log('Seeding products for seller #2...');
    await connection.query('DELETE FROM products');
    const products = [
      [1, 2, 'Karburator Keihin PE 28 Copotan Original', 'Mesin & Transmisi', 325000, 2, 'Copotan Original', 'Copotan normal, skep masih mulus belum baret parah, langsam stabil, mudah disetting untuk harian maupun semi-korek.', '', 1],
      [2, 2, 'CDI Unit Shindengen Copotan Motor Bebek 110cc', 'Kelistrikan', 145000, 4, 'Copotan Original', 'Pengapian masih besar dan normal, soket utuh tidak ada kabel putus atau leleh. Sudah dites nyala sebelum dilepas.', '', 1],
      [3, 2, 'Kaliper Rem Depan 2 Piston + Breket Standar', 'Pengereman', 185000, 1, 'Bekas Bagus', 'Piston kaliper lancar tidak macet, seal aman tidak rembes minyak rem, kampas sisa sekitar 60%.', '', 1],
      [4, 2, 'Tangki Bensin Bebek Lawas Utuh Anti Bocor', 'Body & Aksesoris', 210000, 2, 'Copotan Original', 'Kondisi kaleng masih tebal, bagian dalam sudah dibersihkan, dudukan baut utuh, cat luar wajar pemakaian.', '', 0],
      [5, 2, 'Shockbreaker Belakang Tabung Copotan Matic', 'Kaki-kaki & Velg', 275000, 3, 'Bekas Bagus', 'Rebound masih empuk dan tidak jedug, as shock mulus tanpa baret, per cat ulang rapi.', '', 1],
      [6, 2, 'Silencer Knalpot Standar Racing Leher Stainless', 'Knalpot', 240000, 2, 'Restorasi', 'Suara adem ngebas saat RPM rendah, tidak pecah saat digas tinggi, dudukan baut aman tanpa las ulang.', '', 0],
      [7, 2, 'Kiprok / Regulator Pengisian Aki Original Bekas', 'Kelistrikan', 95000, 5, 'Copotan Original', 'Arus pengisian stabil di 13.8V - 14.2V saat gas menengah, sirip pendingin masih utuh semua.', '', 0],
      [8, 2, 'Blok Seher + Piston Kit OS 50 Copotan Sehat', 'Mesin & Transmisi', 290000, 0, 'Bekas Bagus', 'Dinding liner masih mulus, sirip blok tidak ada yang patah. Stok sementara habis, bisa tanya via WA untuk jadwal masuk berikutnya.', '', 0]
    ];

    for (const p of products) {
      await connection.query(`
        INSERT INTO products (id, seller_id, nama, kategori, harga, stok, kondisi, deskripsi, image_url, unggulan) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, p);
    }

    console.log('3-Role seeding completed successfully!');
    await connection.end();
  } catch (err) {
    console.error('Failed to seed database:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedData();
}

module.exports = seedData;
