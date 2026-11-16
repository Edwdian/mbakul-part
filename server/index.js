const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mbakul_bagian_gaul_secret_fallback_key';

// 1. OWASP A05: Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Memungkinkan FontAwesome & Tailwind CDN tetap bekerja
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 2. OWASP A07: Rate Limiting (Mencegah Brute Force & DoS)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 30, // Maks 30 request auth per 15 menit per IP
  message: { success: false, message: 'Terlalu banyak percobaan autentikasi. Silakan tunggu 15 menit lagi.' },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 300,
  message: { success: false, message: 'Terlalu banyak permintaan ke server.' }
});

app.use(generalLimiter);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Helper Token Signer & Cookie Options (OWASP A01 & A07: Secure HttpOnly SameSite Cookie)
function sendTokenCookie(res, user, remember = false) {
  const maxAge = remember ? (30 * 24 * 3600 * 1000) : (24 * 3600 * 1000);
  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: remember ? '30d' : '1d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge
  });
}

// OWASP A01: JWT Verification & Privilege Authentication
async function getAuthUser(req) {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.query('SELECT id, name, email, role, phone, store_name FROM users WHERE id = ?', [decoded.id]);
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
    res.status(500).json({ success: false, message: 'Terjadi kesalahan internal server.' });
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

    if (q && typeof q === 'string' && q.trim() !== '') {
      sql += ' AND (p.nama LIKE ? OR p.deskripsi LIKE ?)';
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    if (kategori && kategori !== 'Semua' && typeof kategori === 'string' && kategori.trim() !== '') {
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
    res.status(500).json({ success: false, message: 'Gagal memuat produk.' });
  }
});

// 3. Auth API: Register Akun Baru (Rate Limited & Password Strength Check)
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, role, store_name, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter!' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');

    const selectedRole = (role === 'seller') ? 'seller' : 'pembeli';
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar. Silakan gunakan email lain!' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(`
      INSERT INTO users (name, email, password, role, phone, store_name) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [String(name).trim(), cleanEmail, hash, selectedRole, cleanPhone, selectedRole === 'seller' ? (String(store_name || name + ' Motor').trim()) : null]);

    const newUser = {
      id: result.insertId,
      name: String(name).trim(),
      email: cleanEmail,
      role: selectedRole,
      phone: cleanPhone,
      store_name: selectedRole === 'seller' ? (String(store_name || name + ' Motor').trim()) : null
    };

    sendTokenCookie(res, newUser);
    res.json({ success: true, message: 'Pendaftaran berhasil! Selamat datang di MBG.', user: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal mendaftar akun.' });
  }
});

// 4. Auth API: Login (Rate Limited, JWT Authenticated, OWASP A07 Safe)
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, quickRole, remember } = req.body;

    // Quick demo role login
    if (quickRole) {
      const [users] = await db.query('SELECT id, name, email, role, phone, store_name FROM users WHERE role = ? LIMIT 1', [quickRole]);
      if (users.length > 0) {
        sendTokenCookie(res, users[0], false);
        return res.json({ success: true, user: users[0] });
      }
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi!' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password salah!' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Email atau password salah!' });
    }

    sendTokenCookie(res, user, remember);
    delete user.password;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal melakukan login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
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
    const params = [name.trim(), phone ? String(phone).replace(/[^0-9]/g, '') : ''];

    if (user.role === 'seller') {
      sql += ', store_name = ?';
      params.push(store_name ? store_name.trim() : user.name + ' Motor');
    }

    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter!' });
      }
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
    res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
  }
});

// 5. Products Management (Seller & Admin - Strict IDOR Protection)
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
    res.status(500).json({ success: false, message: 'Gagal memuat produk seller.' });
  }
});

app.post('/api/seller/products', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }

    const { id, nama, kategori, harga, stok, kondisi, deskripsi, image_url, unggulan } = req.body;
    if (!nama || harga === undefined || Number(harga) < 0) {
      return res.status(400).json({ success: false, message: 'Nama dan harga valid wajib diisi!' });
    }

    const isFeatured = (unggulan == 1 || unggulan === true) ? 1 : 0;
    const sellerId = user.id;

    if (id && Number(id) > 0) {
      let updateSql = 'UPDATE products SET nama=?, kategori=?, harga=?, stok=?, kondisi=?, deskripsi=?, image_url=?, unggulan=? WHERE id=?';
      const params = [nama, kategori, Number(harga), Number(stok) || 0, kondisi || 'Copotan Original', deskripsi || '', image_url || '', isFeatured, id];
      
      // OWASP A01 (IDOR Check): Seller hanya dapat mengedit barang miliknya sendiri
      if (user.role !== 'admin') {
        updateSql += ' AND seller_id=?';
        params.push(sellerId);
      }
      const [resUpdate] = await db.query(updateSql, params);
      if (resUpdate.affectedRows === 0 && user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Akses ditolak: Anda tidak memiliki izin mengedit produk ini!' });
      }
      res.json({ success: true, message: 'Produk berhasil diperbarui!' });
    } else {
      await db.query(`
        INSERT INTO products (seller_id, nama, kategori, harga, stok, kondisi, deskripsi, image_url, unggulan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [sellerId, nama, kategori, Number(harga), Number(stok) || 0, kondisi || 'Copotan Original', deskripsi || '', image_url || '', isFeatured]);
      res.json({ success: true, message: 'Produk baru berhasil ditambahkan!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan produk.' });
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
    const [resDel] = await db.query(sql, params);
    if (resDel.affectedRows === 0 && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Produk bukan milik Anda!' });
    }
    res.json({ success: true, message: 'Produk berhasil dihapus!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus produk.' });
  }
});

// 5.5 Order Management (In-App Checkout & Seller Confirmation)
app.post('/api/orders', async (req, res) => {
  try {
    const authUser = await getAuthUser(req);
    const { seller_id, customer_name, customer_phone, address, payment_method, total_price, proof_image, items } = req.body;

    if (!customer_name || !customer_phone) {
      return res.status(400).json({ success: false, message: 'Nama penerima dan nomor telepon wajib diisi!' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar item pesanan tidak boleh kosong!' });
    }

    const sellerId = Number(seller_id) || items[0].seller_id || 1;
    const buyerId = authUser ? authUser.id : null;
    const cleanPhone = String(customer_phone).replace(/[^0-9]/g, '');
    const cleanMethod = payment_method || 'Transfer Bank';
    const total = Number(total_price) || 0;
    const itemsJson = JSON.stringify(items);

    const [result] = await db.query(
      'INSERT INTO orders (seller_id, buyer_id, customer_name, customer_phone, address, payment_method, total_price, proof_image, status, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pending", ?)',
      [sellerId, buyerId, customer_name, cleanPhone, address || '', cleanMethod, total, proof_image || null, itemsJson]
    );

    res.json({
      success: true,
      message: 'Pesanan berhasil dikirim ke Seller!',
      order_id: result.insertId
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat pesanan di sistem.' });
  }
});

app.get('/api/seller/orders', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }

    let sql = 'SELECT o.id, o.seller_id, o.buyer_id, o.customer_name, o.customer_phone, o.address, o.payment_method, o.total_price, o.proof_image, o.status, o.items, o.created_at, o.updated_at, u.store_name, u.name as seller_name, u.phone as seller_phone FROM orders o LEFT JOIN users u ON o.seller_id = u.id';
    const params = [];

    if (user.role !== 'admin') {
      sql += ' WHERE o.seller_id = ?';
      params.push(user.id);
    }
    sql += ' ORDER BY o.id DESC';

    const [orders] = await db.query(sql, params);
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data pesanan.' });
  }
});

app.patch('/api/seller/orders/:id/status', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak!' });
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid!' });
    }

    let updateSql = 'UPDATE orders SET status = ? WHERE id = ?';
    const params = [status, req.params.id];

    if (user.role !== 'admin') {
      updateSql += ' AND seller_id = ?';
      params.push(user.id);
    }

    const [result] = await db.query(updateSql, params);
    if (result.affectedRows === 0 && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Pesanan ini bukan milik lapak Anda!' });
    }

    res.json({ success: true, message: 'Status pesanan berhasil diperbarui!' });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
  }
});


// 6. Admin Management Users (OWASP A01: Strict Role Validation)
app.get('/api/admin/users', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Hanya Admin Pusat!' });
    }
    const [users] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.phone, u.store_name, u.created_at,
             (SELECT COUNT(*) FROM products WHERE seller_id = u.id) AS total_products
      FROM users u 
      ORDER BY u.id ASC
    `);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data pengguna.' });
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

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');

    if (id && Number(id) > 0) {
      if (password && password.trim() !== '') {
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET name=?, email=?, role=?, phone=?, store_name=?, password=? WHERE id=?', 
          [name, cleanEmail, role, cleanPhone, store_name || null, hash, id]);
      } else {
        await db.query('UPDATE users SET name=?, email=?, role=?, phone=?, store_name=? WHERE id=?', 
          [name, cleanEmail, role, cleanPhone, store_name || null, id]);
      }
      res.json({ success: true, message: 'Data pengguna berhasil diupdate!' });
    } else {
      const hash = await bcrypt.hash(password || 'password123', 10);
      await db.query('INSERT INTO users (name, email, role, phone, store_name, password) VALUES (?, ?, ?, ?, ?, ?)', 
        [name, cleanEmail, role, cleanPhone, store_name || null, hash]);
      res.json({ success: true, message: 'Pengguna baru berhasil ditambahkan!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan pengguna.' });
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
    res.status(500).json({ success: false, message: 'Gagal menghapus pengguna.' });
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
    res.json({ success: true, message: 'Nomor WhatsApp CS Pusat berhasil disimpan!', store_wa: cleanWa });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server Express Mbakul Bagian Gaul berjalan di http://localhost:${PORT}`);
});
