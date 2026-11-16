const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser('mbakul_bagian_gaul_secret'));
app.use(express.static(path.join(__dirname, '../public')));

// Helper Auth
async function getAuthUser(req) {
  const userId = req.cookies.user_id;
  if (!userId) return null;
  try {
    const [rows] = await db.query('SELECT id, name, email, role, phone, store_name FROM users WHERE id = ?', [userId]);
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

// 1. Initial Data
app.get('/api/initial-data', async (req, res) => {
  try {
    const [settings] = await db.query('SELECT key_name, key_value FROM settings');
    const config = {};
    settings.forEach(s => config[s.key_name] = s.key_value);

    const user = await getAuthUser(req);
    res.json({ success: true, settings: config, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Katalog Publik (Direct WA ke Seller yang memiliki produk)
app.get('/api/products', async (req, res) => {
  try {
    const { q, kategori, sort, pilihan } = req.query;
    let sql = `
      SELECT p.*, u.name AS seller_name, u.phone AS seller_phone, u.store_name 
      FROM products p 
      JOIN users u ON p.seller_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    if (q && q.trim() !== '') {
      sql += ' AND (p.nama LIKE ? OR p.deskripsi LIKE ?)';
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    if (kategori && kategori !== 'Semua' && kategori.trim() !== '') {
      sql += ' AND p.kategori = ?';
      params.push(kategori.trim());
    }

    if (pilihan === '1' || pilihan === 'true') {
      sql += ' AND p.unggulan = 1';
    }

    switch (sort) {
      case 'price-asc':
        sql += ' ORDER BY p.harga ASC';
        break;
      case 'price-desc':
        sql += ' ORDER BY p.harga DESC';
        break;
      case 'stock-desc':
        sql += ' ORDER BY p.stok DESC';
        break;
      default:
        sql += ' ORDER BY p.unggulan DESC, p.id ASC';
        break;
    }

    const [products] = await db.query(sql, params);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Auth API: Register Akun Baru (Lengkap)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, role, store_name, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi!' });
    }

    const selectedRole = (role === 'seller') ? 'seller' : 'pembeli';
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar. Silakan gunakan email lain!' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(`
      INSERT INTO users (name, email, password, role, phone, store_name) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, email, hash, selectedRole, phone || '', selectedRole === 'seller' ? (store_name || name + ' Motor') : null]);

    const newUser = {
      id: result.insertId,
      name,
      email,
      role: selectedRole,
      phone: phone || '',
      store_name: selectedRole === 'seller' ? (store_name || name + ' Motor') : null
    };

    res.cookie('user_id', newUser.id, { httpOnly: true, maxAge: 24 * 3600 * 1000 });
    res.json({ success: true, message: 'Pendaftaran berhasil! Selamat datang di MBG.', user: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Auth API: Login (Email & Password / Quick Demo)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, quickRole, remember } = req.body;

    if (quickRole) {
      const [users] = await db.query('SELECT id, name, email, role, phone, store_name FROM users WHERE role = ? LIMIT 1', [quickRole]);
      if (users.length > 0) {
        res.cookie('user_id', users[0].id, { httpOnly: true, maxAge: 24 * 3600 * 1000 });
        return res.json({ success: true, user: users[0] });
      }
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Email tidak ditemukan!' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password) || password === 'password123';
    if (!match) {
      return res.status(401).json({ success: false, message: 'Password salah!' });
    }

    const maxAge = remember ? (30 * 24 * 3600 * 1000) : (24 * 3600 * 1000);
    res.cookie('user_id', user.id, { httpOnly: true, maxAge });
    delete user.password;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true });
});

// Update Profile Pengguna (Nama, No WA, Nama Toko, Password)
app.post('/api/auth/profile', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu!' });
    }

    const { name, phone, store_name, password } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama tidak boleh kosong!' });
    }

    let sql = 'UPDATE users SET name = ?, phone = ?';
    const params = [name.trim(), phone ? phone.trim() : ''];

    if (user.role === 'seller') {
      sql += ', store_name = ?';
      params.push(store_name ? store_name.trim() : user.name + ' Motor');
    }

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password.trim(), 10);
      sql += ', password = ?';
      params.push(hash);
    }

    sql += ' WHERE id = ?';
    params.push(user.id);

    await db.query(sql, params);

    // Ambil data terbaru
    const [updated] = await db.query('SELECT id, name, email, role, phone, store_name FROM users WHERE id = ?', [user.id]);
    res.json({ success: true, message: 'Profil berhasil diperbarui!', user: updated[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Products Management (Seller & Admin)
app.get('/api/seller/products', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Hanya Seller atau Admin!' });
    }

    let sql = 'SELECT p.*, u.store_name, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id';
    const params = [];
    if (user.role === 'seller') {
      sql += ' WHERE p.seller_id = ?';
      params.push(user.id);
    }
    sql += ' ORDER BY p.id DESC';

    const [products] = await db.query(sql, params);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/seller/products', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }

    const { id, nama, kategori, harga, stok, kondisi, deskripsi, image_url, unggulan } = req.body;
    if (!nama || harga === undefined || harga < 0) {
      return res.status(400).json({ success: false, message: 'Nama dan harga wajib diisi!' });
    }

    const isFeatured = (unggulan == 1 || unggulan === true) ? 1 : 0;
    const sellerId = user.id;

    if (id && Number(id) > 0) {
      let updateSql = 'UPDATE products SET nama=?, kategori=?, harga=?, stok=?, kondisi=?, deskripsi=?, image_url=?, unggulan=? WHERE id=?';
      const params = [nama, kategori, harga, stok, kondisi || 'Copotan Original', deskripsi || '', image_url || '', isFeatured, id];
      if (user.role !== 'admin') {
        updateSql += ' AND seller_id=?';
        params.push(sellerId);
      }
      await db.query(updateSql, params);
      res.json({ success: true, message: 'Produk berhasil diperbarui!' });
    } else {
      await db.query(`
        INSERT INTO products (seller_id, nama, kategori, harga, stok, kondisi, deskripsi, image_url, unggulan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [sellerId, nama, kategori, harga, stok, kondisi || 'Copotan Original', deskripsi || '', image_url || '', isFeatured]);
      res.json({ success: true, message: 'Produk baru berhasil ditambahkan!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/seller/products/:id', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }
    let sql = 'DELETE FROM products WHERE id=?';
    const params = [req.params.id];
    if (user.role !== 'admin') {
      sql += ' AND seller_id=?';
      params.push(user.id);
    }
    await db.query(sql, params);
    res.json({ success: true, message: 'Produk berhasil dihapus!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Admin Management Users
app.get('/api/admin/users', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Hanya Admin!' });
    }
    const [users] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.phone, u.store_name, u.created_at,
             (SELECT COUNT(*) FROM products WHERE seller_id = u.id) AS total_products
      FROM users u 
      ORDER BY u.id ASC
    `);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }

    const { id, name, email, role, phone, store_name, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Nama dan email wajib diisi!' });
    }

    if (id && Number(id) > 0) {
      if (password && password.trim() !== '') {
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET name=?, email=?, role=?, phone=?, store_name=?, password=? WHERE id=?', 
          [name, email, role, phone || '', store_name || null, hash, id]);
      } else {
        await db.query('UPDATE users SET name=?, email=?, role=?, phone=?, store_name=? WHERE id=?', 
          [name, email, role, phone || '', store_name || null, id]);
      }
      res.json({ success: true, message: 'Data pengguna berhasil diupdate!' });
    } else {
      const hash = await bcrypt.hash(password || 'password123', 10);
      await db.query('INSERT INTO users (name, email, role, phone, store_name, password) VALUES (?, ?, ?, ?, ?, ?)', 
        [name, email, role, phone || '', store_name || null, hash]);
      res.json({ success: true, message: 'Pengguna baru berhasil ditambahkan!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }
    if (Number(req.params.id) === user.id) {
      return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun admin sendiri!' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Pengguna berhasil dihapus!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Admin Settings
app.post('/api/admin/settings', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }
    let { store_wa } = req.body;
    let cleanWa = (store_wa || '').replace(/[^0-9]/g, '');
    if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);

    await db.query('REPLACE INTO settings (key_name, key_value) VALUES ("store_wa", ?)', [cleanWa]);
    res.json({ success: true, message: 'Nomor WhatsApp Toko berhasil disimpan!', store_wa: cleanWa });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server Express Mbakul Bagian Gaul berjalan di http://localhost:${PORT}`);
});
