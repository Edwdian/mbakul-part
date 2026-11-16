// app.js - Single Page Application Client untuk MBG Express (3 Roles: Admin, Seller, Pembeli)
let currentUser = null;
let storeSettings = { store_wa: '6281234567890' };
let currentKategori = 'Semua';
let onlyPilihan = false;
let searchTimeout = null;
let cachedProducts = [];
let cart = JSON.parse(localStorage.getItem('mbg_cart') || '[]');
let currentDetailProductId = null;
let selectedPaymentMethodVal = 'Transfer Bank (BCA / Mandiri / BRI)';

const categoriesList = [
  'Semua',
  'Mesin & Transmisi',
  'Kaki-kaki & Velg',
  'Pengereman',
  'Kelistrikan',
  'Body & Aksesoris',
  'Knalpot'
];

document.addEventListener('DOMContentLoaded', async () => {
  renderCategoryTabs();
  renderCategoryDropdown();
  await loadInitialData();
  await loadProducts();
  renderHomeFeaturedProducts();
  updateCartBadge();
});

// Toast Notifikasi Halus & Menarik
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const isErr = type === 'error';
  toast.className = `p-4 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-3 transform transition-all duration-300 pointer-events-auto backdrop-blur-md ${isErr ? 'bg-rose-50/95 border-rose-300 text-rose-800' : 'bg-emerald-50/95 border-emerald-300 text-emerald-800'}`;
  toast.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-xmark text-rose-600' : 'fa-circle-check text-emerald-600'} text-lg"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Inisialisasi Kategori
function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  if (!container) return;
  container.innerHTML = categoriesList.map(cat => {
    const isActive = (currentKategori === cat);
    return `
      <button onclick="setCategory('${cat}')" class="pb-3 text-xs sm:text-sm whitespace-nowrap transition relative font-bold ${isActive ? 'text-[#004B8D]' : 'text-zinc-500 hover:text-zinc-900'}">
        ${cat}
        ${isActive ? '<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#004B8D] rounded-full shadow-xs"></span>' : ''}
      </button>
    `;
  }).join('');
}

function renderCategoryDropdown() {
  const select = document.getElementById('filter-category-select');
  if (!select) return;
  select.innerHTML = `<option value="Semua">Semua Kategori (${categoriesList.length - 1})</option>` +
    categoriesList.filter(c => c !== 'Semua').map(c => `<option value="${c}">${c}</option>`).join('');
}

async function loadInitialData() {
  try {
    const res = await fetch('/api/initial-data');
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      storeSettings = data.settings || storeSettings;
      updateHeaderWa(storeSettings.store_wa);
      updateAuthUI();
    }
  } catch (e) {
    console.error('Failed to load initial data:', e);
  }
}

function updateHeaderWa(wa) {
  const clean = wa || '6281234567890';
  document.getElementById('header-wa').innerText = '+' + clean;
  document.getElementById('catalog-wa').innerText = '+' + clean;
  document.getElementById('nav-wa-link').href = `https://wa.me/${clean}`;
  const settingInput = document.getElementById('setting-wa-input');
  if (settingInput) settingInput.value = clean;
}

function updateAuthUI() {
  const navArea = document.getElementById('nav-auth-area');
  if (!navArea) return;

  if (currentUser) {
    let roleBadge = '';
    let btnDashboard = '';
    if (currentUser.role === 'admin') {
      roleBadge = '<span class="px-1.5 py-0.5 rounded-full bg-blue-600 text-[9px] font-extrabold text-white uppercase shadow-xs">Admin</span>';
      btnDashboard = `
        <button onclick="navigateTo('dashboard')" class="px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-1.5 font-bold text-xs sm:text-sm">
          <i class="fa-solid fa-gauge-high text-xs"></i>
          <span class="hidden sm:inline">Panel Admin</span>
          ${roleBadge}
        </button>
      `;
    } else if (currentUser.role === 'seller') {
      roleBadge = '<span class="px-1.5 py-0.5 rounded-full bg-emerald-600 text-[9px] font-extrabold text-white uppercase shadow-xs">Seller</span>';
      btnDashboard = `
        <button onclick="navigateTo('dashboard')" class="px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-1.5 font-bold text-xs sm:text-sm">
          <i class="fa-solid fa-store text-xs"></i>
          <span class="hidden sm:inline">Kelola Toko</span>
          ${roleBadge}
        </button>
      `;
    }

    navArea.innerHTML = `
      ${btnDashboard}
      <button onclick="openProfileModal()" class="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition flex items-center gap-1.5 text-xs sm:text-sm" title="Lihat & Edit Profil">
        <i class="fa-solid fa-circle-user text-sm text-blue-200"></i>
        <span class="hidden md:inline">${currentUser.name.split(' ')[0]}</span>
      </button>
      <button onclick="openLogoutModal()" class="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 hover:text-white font-bold transition flex items-center gap-1 text-xs" title="Keluar">
        <i class="fa-solid fa-power-off text-sm"></i>
        <span class="hidden lg:inline">Keluar</span>
      </button>
    `;
  } else {
    navArea.innerHTML = `
      <button onclick="openLoginModal()" class="px-3.5 py-1.5 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-1.5 font-bold text-xs sm:text-sm">
        <i class="fa-solid fa-arrow-right-to-bracket text-xs"></i>
        <span>Masuk / Daftar</span>
      </button>
    `;
  }
}

// 2. Load Katalog Produk
async function loadProducts() {
  const q = document.getElementById('search-input')?.value || '';
  const sort = document.getElementById('filter-sort-select')?.value || 'newest';

  const params = new URLSearchParams({
    q,
    kategori: currentKategori,
    sort,
    pilihan: onlyPilihan ? '1' : '0'
  });

  try {
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      cachedProducts = data.products || [];
      const statElem = document.getElementById('hero-stat-products');
      if (statElem) statElem.innerText = cachedProducts.length;
      renderProductsGrid(cachedProducts);
    }
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function getSvgPlaceholder(kategori, nama) {
  const themes = {
    'Mesin & Transmisi': { bg: '#f4f7fa', border: '#cbd5e1', accent: '#004b8d', tag: 'MESIN' },
    'Kelistrikan': { bg: '#f4f7fa', border: '#cbd5e1', accent: '#0072ce', tag: 'KELISTRIKAN' },
    'Body & Aksesoris': { bg: '#f4f7fa', border: '#cbd5e1', accent: '#002d5a', tag: 'BODY PART' },
    'Kaki-kaki & Velg': { bg: '#f4f7fa', border: '#cbd5e1', accent: '#004b8d', tag: 'KAKI-KAKI' },
    'Pengereman': { bg: '#fef2f2', border: '#fecaca', accent: '#e60012', tag: 'PENGEREMAN' },
    'Knalpot': { bg: '#f4f7fa', border: '#cbd5e1', accent: '#002d5a', tag: 'KNALPOT' }
  };
  const t = themes[kategori] || themes['Mesin & Transmisi'];
  const shortName = (nama || '').substring(0, 24);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 200 130">
    <rect width="200" height="130" fill="${t.bg}"/>
    <rect x="8" y="8" width="184" height="114" rx="8" fill="none" stroke="${t.border}" stroke-width="1.2" stroke-dasharray="3 3"/>
    <circle cx="100" cy="54" r="20" fill="none" stroke="${t.accent}" stroke-width="2.5"/>
    <circle cx="100" cy="54" r="7" fill="${t.accent}"/>
    <path d="M100 28v7M100 73v7M74 54h7M119 54h7" stroke="${t.accent}" stroke-width="2.5" stroke-linecap="round"/>
    <text x="100" y="92" font-family="'Plus Jakarta Sans', sans-serif" font-size="7.5" font-weight="800" fill="${t.accent}" text-anchor="middle" letter-spacing="1.2">${t.tag}</text>
    <text x="100" y="106" font-family="'Plus Jakarta Sans', sans-serif" font-size="8.5" font-weight="700" fill="#002d5a" text-anchor="middle">${shortName}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function formatRupiah(val) {
  return 'Rp ' + Number(val).toLocaleString('id-ID');
}

function renderProductsGrid(products) {
  const container = document.getElementById('product-grid');
  const countInfo = document.getElementById('count-info');
  if (!container) return;

  countInfo.innerHTML = `Menampilkan <span class="font-bold text-zinc-900">${products.length}</span> dari ${products.length} barang`;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-white border border-slate-200 rounded-3xl p-14 text-center shadow-sm">
        <div class="w-16 h-16 rounded-full bg-blue-50 text-[#004B8D] flex items-center justify-center mx-auto mb-4 text-2xl">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h3 class="text-lg font-black text-[#002D5A]">Onderdil Tidak Ditemukan</h3>
        <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto font-medium">Coba gunakan kata kunci lain atau reset filter kategori untuk melihat stok part motor lainnya.</p>
        <button onclick="resetFilters()" class="mt-5 px-5 py-2.5 bg-[#004B8D] hover:bg-[#002D5A] text-white rounded-full text-xs font-bold shadow-sm transition">Lihat Semua Stok</button>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(item => {
    const waPhone = (item.seller_phone || storeSettings.store_wa || '6281234567890').replace(/[^0-9]/g, '');
    const storeLabel = item.store_name ? `(${item.store_name})` : '';
    const waText = `Halo ${item.seller_name || 'Seller'} ${storeLabel}, saya berminat dengan sparepart *${item.nama}* (Harga: ${formatRupiah(item.harga)}) di MBG. Apakah stok masih ready?`;
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;
    const imgUrl = item.image_url ? item.image_url : getSvgPlaceholder(item.kategori, item.nama);

    let stockBadge = '';
    if (item.stok == 0) {
      stockBadge = '<span class="px-2.5 py-1 rounded-full bg-zinc-800 text-white text-[10px] font-extrabold shadow-sm">Habis</span>';
    } else if (item.stok <= 2) {
      stockBadge = `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold flex items-center gap-1.5 shadow-xs"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Sisa ${item.stok} Unit</span>`;
    } else {
      stockBadge = `<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-extrabold flex items-center gap-1.5 shadow-xs"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ready (${item.stok})</span>`;
    }

    return `
      <div class="bg-white border border-slate-200/90 rounded-3xl overflow-hidden card-hover flex flex-col justify-between group">
        <div onclick="openDetailModal(${item.id})" class="cursor-pointer">
          <div class="p-4 pb-2 flex items-center justify-between">
            <span class="text-[11px] font-black uppercase tracking-wider text-slate-500">${item.kategori}</span>
            ${item.unggulan ? '<span class="text-[11px] font-black text-[#E60012] flex items-center gap-1"><i class="fa-solid fa-star text-[10px]"></i> Pilihan!</span>' : ''}
          </div>
          <div class="relative px-4 pb-2">
            <div class="w-full h-48 rounded-2xl overflow-hidden bg-slate-50/80 border border-slate-100 flex items-center justify-center p-2">
              <img src="${imgUrl}" alt="${item.nama}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" onerror="this.src='${getSvgPlaceholder(item.kategori, item.nama)}'">
            </div>
            <div class="absolute bottom-4 left-6">${stockBadge}</div>
          </div>
          <div class="px-5 py-4">
            <div class="text-[11px] text-slate-400 font-bold mb-1 flex items-center gap-1.5 truncate">
              <i class="fa-solid fa-store text-emerald-600"></i>
              <span class="text-slate-600">${item.store_name || item.seller_name || 'Toko Mitra MBG'}</span>
            </div>
            <h3 class="font-extrabold text-[#002D5A] text-base leading-snug group-hover:text-[#004B8D] transition line-clamp-2">${item.nama}</h3>
            <p class="text-xs text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed font-medium">${item.deskripsi || 'Kondisi barang original, siap pasang tanpa kendala.'}</p>
            <div class="mt-3.5 text-xl font-black text-[#004B8D] mono">${formatRupiah(item.harga)}</div>
          </div>
        </div>
        <div class="p-5 pt-0 flex gap-2">
          <button onclick="addToCart(${item.id})" class="flex-1 py-2.5 px-3 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-98 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer">
            <i class="fa-solid fa-cart-plus text-sm"></i>
            <span>+ Keranjang</span>
          </button>
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="py-2.5 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition duration-150" title="Chat Seller">
            <i class="fa-brands fa-whatsapp text-base"></i>
            <span class="hidden sm:inline">WA</span>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// Modal Detail Interaktif
function openDetailModal(id) {
  const item = cachedProducts.find(p => p.id == id);
  if (!item) return;

  currentDetailProductId = item.id;
  const waPhone = (item.seller_phone || storeSettings.store_wa || '6281234567890').replace(/[^0-9]/g, '');
  const waText = `Halo ${item.seller_name || 'Seller'}, saya ingin tanya sparepart *${item.nama}* (Harga: ${formatRupiah(item.harga)}) di MBG. Apakah stok masih tersedia?`;
  const imgUrl = item.image_url ? item.image_url : getSvgPlaceholder(item.kategori, item.nama);

  document.getElementById('detail-title').innerText = item.nama;
  document.getElementById('detail-category').innerText = item.kategori;
  document.getElementById('detail-condition').innerText = item.kondisi || 'Copotan Original';
  document.getElementById('detail-price').innerText = formatRupiah(item.harga);
  document.getElementById('detail-desc').innerText = item.deskripsi || 'Kondisi barang bagus terawat, orisinil bawaan motor, siap pasang.';
  document.getElementById('detail-seller-name').innerText = item.store_name ? `${item.store_name} (${item.seller_name})` : (item.seller_name || 'Toko Mitra MBG');
  document.getElementById('detail-img').src = imgUrl;
  document.getElementById('detail-wa-btn').href = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;
  document.getElementById('detail-pilihan-badge').classList.toggle('hidden', item.unggulan != 1);

  document.getElementById('modal-detail').classList.remove('hidden');
}

function addToCartFromDetail() {
  if (currentDetailProductId) {
    addToCart(currentDetailProductId);
    closeDetailModal();
  }
}

function closeDetailModal() {
  document.getElementById('modal-detail').classList.add('hidden');
}

// Filter Actions
function setCategory(cat) {
  currentKategori = cat;
  document.getElementById('filter-category-select').value = cat;
  renderCategoryTabs();
  checkResetBtn();
  loadProducts();
}

function applyFilters() {
  currentKategori = document.getElementById('filter-category-select').value;
  renderCategoryTabs();
  checkResetBtn();
  loadProducts();
}

function togglePilihanFilter() {
  onlyPilihan = !onlyPilihan;
  const btn = document.getElementById('btn-filter-pilihan');
  if (onlyPilihan) {
    btn.className = 'px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition bg-red-50 border-red-300 text-[#E60012] shadow-xs';
  } else {
    btn.className = 'px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-[#004B8D] text-xs font-bold text-zinc-700 flex items-center gap-1.5 transition';
  }
  checkResetBtn();
  loadProducts();
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  const val = document.getElementById('search-input').value;
  document.getElementById('clear-search').classList.toggle('hidden', val.length === 0);
  searchTimeout = setTimeout(() => {
    checkResetBtn();
    loadProducts();
  }, 280);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search').classList.add('hidden');
  checkResetBtn();
  loadProducts();
}

function resetFilters() {
  currentKategori = 'Semua';
  onlyPilihan = false;
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search').classList.add('hidden');
  document.getElementById('filter-category-select').value = 'Semua';
  document.getElementById('filter-sort-select').value = 'newest';
  const btn = document.getElementById('btn-filter-pilihan');
  btn.className = 'px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-[#004B8D] text-xs font-bold text-zinc-700 flex items-center gap-1.5 transition';
  renderCategoryTabs();
  checkResetBtn();
  loadProducts();
}

function checkResetBtn() {
  const hasFilter = (currentKategori !== 'Semua') || onlyPilihan || (document.getElementById('search-input').value.trim() !== '') || (document.getElementById('filter-sort-select').value !== 'newest');
  document.getElementById('btn-reset-filters').classList.toggle('hidden', !hasFilter);
}

function focusSearchInput() {
  navigateTo('catalog');
  setTimeout(() => {
    const input = document.getElementById('search-input');
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

// Navigasi SPA (home, catalog, dashboard)
function selectHomeCategory(category) {
  currentKategori = category;
  document.getElementById('filter-category-select').value = category;
  renderCategoryTabs();
  checkResetBtn();
  navigateTo('catalog');
}

function renderHomeFeaturedProducts() {
  const container = document.getElementById('home-featured-grid');
  if (!container) return;

  const featured = cachedProducts.filter(p => p.unggulan == 1).slice(0, 4);
  const displayItems = featured.length > 0 ? featured : cachedProducts.slice(0, 4);

  container.innerHTML = displayItems.map(item => {
    const waPhone = (item.seller_phone || storeSettings.store_wa || '6281234567890').replace(/[^0-9]/g, '');
    const waText = `Halo ${item.seller_name || 'Seller'}, saya berminat dengan produk *${item.nama}* (Harga: ${formatRupiah(item.harga)}) di MBG. Apakah unit masih tersedia?`;
    const imgUrl = item.image_url ? item.image_url : getSvgPlaceholder(item.kategori, item.nama);

    return `
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs card-hover flex flex-col justify-between group">
        <div class="cursor-pointer" onclick='openDetailModal(${JSON.stringify(item)})'>
          <div class="h-44 bg-slate-50 border-b border-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
            <img src="${imgUrl}" alt="${item.nama}" class="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300">
            <span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">★ Pilihan</span>
          </div>
          <div class="p-4 space-y-2">
            <div class="text-[10px] font-extrabold uppercase text-[#004B8D] tracking-wide">${item.kategori}</div>
            <h4 class="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-tight">${item.nama}</h4>
            <div class="text-sm sm:text-base font-black text-[#004B8D] mono">${formatRupiah(item.harga)}</div>
            <div class="text-[11px] text-slate-500 flex items-center gap-1">
              <i class="fa-solid fa-store text-emerald-600"></i>
              <span class="truncate">${item.store_name || item.seller_name}</span>
            </div>
          </div>
        </div>
        <div class="p-4 pt-0">
          <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}" target="_blank"
            class="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>Tanya WA Seller</span>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function navigateTo(view) {
  const homeSec = document.getElementById('view-home');
  const catalogSec = document.getElementById('view-catalog');
  const dashSec = document.getElementById('view-dashboard');
  const btnHome = document.getElementById('btn-nav-home');
  const btnCatalog = document.getElementById('btn-nav-catalog');

  if (view === 'dashboard') {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'seller')) {
      openLoginModal();
      return;
    }
    if (homeSec) homeSec.classList.add('hidden');
    if (catalogSec) catalogSec.classList.add('hidden');
    if (dashSec) dashSec.classList.remove('hidden');

    if (btnHome) btnHome.className = 'px-3.5 py-1.5 rounded-lg text-white hover:bg-white/10 transition';
    if (btnCatalog) btnCatalog.className = 'px-3.5 py-1.5 rounded-lg text-white hover:bg-white/10 transition';

    const isAdmin = currentUser.role === 'admin';
    document.getElementById('dashboard-main-title').innerHTML = isAdmin 
      ? '<i class="fa-solid fa-user-shield text-[#004B8D]"></i> Panel Administrator Pusat'
      : `<i class="fa-solid fa-store text-emerald-600"></i> Panel Seller: ${currentUser.store_name || currentUser.name}`;
    document.getElementById('dashboard-sub-title').innerText = isAdmin
      ? 'Kelola seluruh pengguna (Admin, Seller, Pembeli) dan monitoring seluruh stok barang.'
      : 'Kelola inventaris dan katalog part motor milik lapak Anda.';

    document.getElementById('dash-tab-users').classList.toggle('hidden', !isAdmin);
    document.getElementById('dash-tab-settings').classList.toggle('hidden', !isAdmin);
    document.getElementById('kpi-users-card').classList.toggle('hidden', !isAdmin);

    switchDashTab('products');
    loadDashboardData();
  } else if (view === 'home') {
    if (dashSec) dashSec.classList.add('hidden');
    if (catalogSec) catalogSec.classList.add('hidden');
    if (homeSec) homeSec.classList.remove('hidden');

    if (btnHome) btnHome.className = 'px-3.5 py-1.5 rounded-lg bg-white text-[#004B8D] shadow-xs font-bold';
    if (btnCatalog) btnCatalog.className = 'px-3.5 py-1.5 rounded-lg text-white hover:bg-white/10 transition font-bold';
    renderHomeFeaturedProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    // view === 'catalog'
    // Cek apakah pengguna sudah login sebelum melihat semua part
    if (!currentUser) {
      showToast('Silakan login terlebih dahulu untuk menjelajahi seluruh part!', 'error');
      openLoginModal();
      return;
    }

    if (homeSec) homeSec.classList.add('hidden');
    if (dashSec) dashSec.classList.add('hidden');
    if (catalogSec) catalogSec.classList.remove('hidden');

    if (btnHome) btnHome.className = 'px-3.5 py-1.5 rounded-lg text-white hover:bg-white/10 transition font-bold';
    if (btnCatalog) btnCatalog.className = 'px-3.5 py-1.5 rounded-lg bg-white text-[#004B8D] shadow-xs font-bold';
    loadProducts();
  }
}

// Auth Modal & Handlers
function openLoginModal() {
  document.getElementById('view-login').classList.remove('hidden');
  switchAuthMode('login');
  selectLoginRole('admin');
}
function closeLoginModal() {
  document.getElementById('view-login').classList.add('hidden');
}

function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  const loginForm = document.getElementById('form-login-manual');
  const regForm = document.getElementById('form-register-manual');
  const quickBox = document.getElementById('quick-login-container');

  if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
  if (quickBox) quickBox.classList.toggle('hidden', !isLogin);
  if (regForm) regForm.classList.toggle('hidden', isLogin);

  const tabLogin = document.getElementById('auth-tab-btn-login');
  const tabReg = document.getElementById('auth-tab-btn-register');
  if (isLogin) {
    if (tabLogin) tabLogin.className = 'flex-1 py-3 text-[#004B8D] bg-white border-b-2 border-[#004B8D] font-bold';
    if (tabReg) tabReg.className = 'flex-1 py-3 text-slate-500 hover:text-slate-800 font-bold';
  } else {
    if (tabReg) tabReg.className = 'flex-1 py-3 text-[#004B8D] bg-white border-b-2 border-[#004B8D] font-bold';
    if (tabLogin) tabLogin.className = 'flex-1 py-3 text-slate-500 hover:text-slate-800 font-bold';
  }
}

function togglePassVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.innerHTML = `<i class="fa-regular ${isPass ? 'fa-eye-slash text-slate-700' : 'fa-eye text-slate-400'}"></i>`;
}

function toggleRegStoreField(role) {
  document.getElementById('reg-store-wrapper').classList.toggle('hidden', role !== 'seller');
}

function selectLoginRole(role) {
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  
  // Highlight active role button
  ['admin', 'seller', 'pembeli'].forEach(r => {
    const btn = document.getElementById(`role-btn-${r}`);
    if (btn) {
      if (r === role) {
        btn.className = 'py-2.5 px-1 bg-blue-50 border-2 border-[#004B8D] rounded-xl text-center shadow-xs transition cursor-pointer font-bold';
      } else {
        btn.className = 'py-2.5 px-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center shadow-xs transition cursor-pointer';
      }
    }
  });

  if (role === 'admin') {
    emailInput.value = 'admin@mbakul.com';
    passInput.value = 'password123';
  } else if (role === 'seller') {
    emailInput.value = 'seller@mbakul.com';
    passInput.value = 'password123';
  } else if (role === 'pembeli') {
    emailInput.value = 'budi@gmail.com';
    passInput.value = 'password123';
  }
}

async function quickLogin(role) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickRole: role })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      closeLoginModal();
      updateAuthUI();
      showToast(`Login sukses sebagai ${currentUser.name} (${currentUser.role.toUpperCase()})`);
      if (currentUser.role === 'admin' || currentUser.role === 'seller') {
        navigateTo('dashboard');
      } else {
        navigateTo('catalog');
      }
    }
  } catch (err) {
    showToast('Gagal login: ' + err.message, 'error');
  }
}

async function handleManualLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('login-remember')?.checked;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      closeLoginModal();
      updateAuthUI();
      showToast(`Selamat datang kembali, ${currentUser.name}!`);
      if (currentUser.role === 'admin' || currentUser.role === 'seller') {
        navigateTo('dashboard');
      } else {
        navigateTo('catalog');
      }
    } else {
      showToast(data.message || 'Email atau password salah', 'error');
    }
  } catch (err) {
    showToast('Error login: ' + err.message, 'error');
  }
}

async function handleManualRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const role = document.getElementById('reg-role').value;
  const phone = document.getElementById('reg-phone').value.replace(/[^0-9]/g, '');
  const store_name = document.getElementById('reg-store')?.value.trim();
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm')?.value;

  if (!name || !email || !password) {
    showToast('Nama, email, dan password wajib diisi!', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password minimal 6 karakter!', 'error');
    return;
  }

  if (passwordConfirm !== undefined && password !== passwordConfirm) {
    showToast('Konfirmasi password tidak cocok! Silakan periksa kembali.', 'error');
    return;
  }

  if (!phone || phone.length < 9) {
    showToast('Nomor WhatsApp harus valid (hanya angka minimal 9 digit)!', 'error');
    return;
  }

  if (role === 'seller' && !store_name) {
    showToast('Nama Toko / Lapak wajib diisi untuk Seller!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role, phone, store_name, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      closeLoginModal();
      updateAuthUI();
      showToast(`Registrasi sukses! Selamat bergabung, ${currentUser.name}`);
      if (currentUser.role === 'seller') {
        navigateTo('dashboard');
      } else {
        navigateTo('catalog');
      }
    } else {
      showToast(data.message || 'Pendaftaran gagal', 'error');
    }
  } catch (err) {
    showToast('Error register: ' + err.message, 'error');
  }
}

// Modal Konfirmasi Logout
function openLogoutModal() {
  const modal = document.getElementById('modal-logout-confirm');
  if (modal) modal.classList.remove('hidden');
}

function closeLogoutModal() {
  const modal = document.getElementById('modal-logout-confirm');
  if (modal) modal.classList.add('hidden');
}

async function confirmLogout() {
  closeLogoutModal();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    updateAuthUI();
    showToast('Berhasil keluar dari akun.');
    navigateTo('catalog');
  } catch (err) {
    showToast('Gagal logout: ' + err.message, 'error');
  }
}

// Modal Profile User
function openProfileModal() {
  if (!currentUser) return;
  const modal = document.getElementById('modal-profile');
  if (!modal) return;

  document.getElementById('prof-role-badge').innerText = currentUser.role.toUpperCase();
  document.getElementById('prof-email').innerText = currentUser.email;
  document.getElementById('prof-name').value = currentUser.name || '';
  document.getElementById('prof-phone').value = currentUser.phone || '';
  document.getElementById('prof-pass').value = '';

  const storeWrapper = document.getElementById('prof-store-wrapper');
  if (currentUser.role === 'seller') {
    storeWrapper.classList.remove('hidden');
    document.getElementById('prof-store').value = currentUser.store_name || '';
  } else {
    storeWrapper.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.classList.add('hidden');
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const name = document.getElementById('prof-name').value.trim();
  const phone = document.getElementById('prof-phone').value.trim();
  const store_name = document.getElementById('prof-store')?.value.trim();
  const password = document.getElementById('prof-pass').value;

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, store_name, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      closeProfileModal();
      updateAuthUI();
      showToast('Profil Anda berhasil diperbarui!');
      if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
        navigateTo('dashboard');
      }
    } else {
      showToast(data.message || 'Gagal update profil', 'error');
    }
  } catch (err) {
    showToast('Error update profil: ' + err.message, 'error');
  }
}

// ========================================================
// SISTEM KERANJANG BELANJA & PEMESANAN VIA WHATSAPP
// ========================================================
function saveCart() {
  localStorage.setItem('mbg_cart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const totalCount = cart.reduce((acc, item) => acc + (item.qty || 1), 0);
  badge.innerText = totalCount;
  badge.classList.toggle('hidden', totalCount === 0);
}

function addToCart(productId) {
  const product = cachedProducts.find(p => p.id == productId);
  if (!product) {
    showToast('Produk tidak ditemukan!', 'error');
    return;
  }

  if (product.stok <= 0) {
    showToast('Maaf, stok barang ini sedang habis!', 'error');
    return;
  }

  const existing = cart.find(item => item.id == product.id);
  if (existing) {
    if (existing.qty >= product.stok) {
      showToast(`Jumlah melebihi sisa stok (${product.stok} unit)!`, 'error');
      return;
    }
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      nama: product.nama,
      harga: Number(product.harga),
      kategori: product.kategori,
      stok: Number(product.stok),
      seller_id: product.seller_id,
      seller_name: product.seller_name,
      seller_phone: product.seller_phone,
      store_name: product.store_name,
      image_url: product.image_url,
      qty: 1
    });
  }

  saveCart();
  showToast(`"${product.nama}" berhasil ditambahkan ke Keranjang!`);
}

function updateCartItemQty(id, delta) {
  const item = cart.find(i => i.id == id);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id != id);
  } else if (item.qty > item.stok) {
    item.qty = item.stok;
    showToast(`Maksimal stok tersedia hanya ${item.stok} unit!`, 'error');
  }

  saveCart();
  renderCartModal();
}

function removeCartItem(id) {
  cart = cart.filter(i => i.id != id);
  saveCart();
  renderCartModal();
  showToast('Item dihapus dari keranjang.');
}

function selectPaymentMethod(methodKey) {
  ['tf', 'qris', 'cod'].forEach(m => {
    const el = document.getElementById(`opt-pay-${m}`);
    if (el) {
      if (m === methodKey) {
        el.className = 'p-3 border-2 border-[#004B8D] rounded-xl flex flex-col items-center gap-1 cursor-pointer transition payment-opt bg-blue-50/70 font-bold';
      } else {
        el.className = 'p-3 border-2 border-slate-200 hover:border-slate-300 rounded-xl flex flex-col items-center gap-1 cursor-pointer transition payment-opt bg-white';
      }
    }
  });

  if (methodKey === 'tf') {
    selectedPaymentMethodVal = 'Transfer Bank (BCA / Mandiri / BRI)';
  } else if (methodKey === 'qris') {
    selectedPaymentMethodVal = 'QRIS Semua E-Wallet (GoPay, OVO, Dana, ShopeePay)';
  } else if (methodKey === 'cod') {
    selectedPaymentMethodVal = 'COD (Bayar Tunai di Tempat / Cash On Delivery)';
  }
}

function openCartModal() {
  const modal = document.getElementById('modal-cart');
  if (!modal) return;
  renderCartModal();
  selectPaymentMethod('tf');

  // Isi data pemesan otomatis jika sudah login
  const custInfoInput = document.getElementById('order-customer-info');
  if (custInfoInput && currentUser) {
    custInfoInput.value = `${currentUser.name} (${currentUser.phone || ''})`;
  }

  modal.classList.remove('hidden');
}

function closeCartModal() {
  const modal = document.getElementById('modal-cart');
  if (modal) modal.classList.add('hidden');
}

function renderCartModal() {
  const container = document.getElementById('cart-items-container');
  const totalPriceEl = document.getElementById('cart-total-price');
  if (!container || !totalPriceEl) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-cart-shopping text-3xl mb-2 block text-slate-300"></i>
        <p class="font-bold text-slate-600 text-sm">Keranjang Belanja Masih Kosong</p>
        <p class="text-xs text-slate-400 mt-0.5">Pilih sparepart motor favorit Anda di katalog!</p>
      </div>
    `;
    totalPriceEl.innerText = 'Rp 0';
    return;
  }

  let grandTotal = 0;
  container.innerHTML = cart.map(item => {
    const subtotal = item.harga * item.qty;
    grandTotal += subtotal;
    const imgUrl = item.image_url ? item.image_url : getSvgPlaceholder(item.kategori, item.nama);

    return `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
        <img src="${imgUrl}" alt="${item.nama}" class="w-14 h-14 object-contain rounded-xl bg-white p-1 border border-slate-200">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-slate-800 truncate">${item.nama}</h4>
          <div class="text-[11px] text-[#004B8D] font-black mono mt-0.5">${formatRupiah(item.harga)}</div>
          <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
            <i class="fa-solid fa-store text-emerald-600 text-[9px]"></i>
            <span class="truncate">${item.store_name || item.seller_name || 'Mitra MBG'}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
            <button onclick="updateCartItemQty(${item.id}, -1)" class="w-6 h-6 hover:bg-slate-100 font-bold text-slate-600">-</button>
            <span class="w-7 text-center font-extrabold text-slate-800">${item.qty}</span>
            <button onclick="updateCartItemQty(${item.id}, 1)" class="w-6 h-6 hover:bg-slate-100 font-bold text-slate-600">+</button>
          </div>
          <button onclick="removeCartItem(${item.id})" class="text-rose-500 hover:text-rose-700 p-1.5" title="Hapus">
            <i class="fa-solid fa-trash-can text-sm"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  totalPriceEl.innerText = formatRupiah(grandTotal);
}

function checkoutViaWhatsApp() {
  if (cart.length === 0) {
    showToast('Keranjang Anda masih kosong!', 'error');
    return;
  }

  const customerInfo = document.getElementById('order-customer-info')?.value.trim();
  const address = document.getElementById('order-address')?.value.trim();

  if (!customerInfo) {
    showToast('Nama Pemesan & No. HP wajib diisi!', 'error');
    document.getElementById('order-customer-info')?.focus();
    return;
  }

  // Kelompokkan pesanan berdasarkan nomor WhatsApp seller (atau CS pusat jika 1 seller)
  // Ambil seller pertama atau CS pusat jika campur
  const primaryPhone = (cart[0].seller_phone || storeSettings.store_wa || '6281234567890').replace(/[^0-9]/g, '');
  const sellerTitle = cart[0].store_name || cart[0].seller_name || 'Seller MBG';

  let grandTotal = 0;
  let itemsListText = '';

  cart.forEach((item, idx) => {
    const subtotal = item.harga * item.qty;
    grandTotal += subtotal;
    itemsListText += `${idx + 1}. *${item.nama}* (${item.qty} unit) - ${formatRupiah(subtotal)}\n`;
  });

  const waMessage = 
`*PESANAN SPAREPART MOTOR MBG*
=========================
Halo *${sellerTitle}*, saya ingin memesan part motor berikut:

${itemsListText}
*TOTAL PEMBAYARAN:* ${formatRupiah(grandTotal)}
*METODE PEMBAYARAN:* ${selectedPaymentMethodVal}

*DATA PEMESAN:*
- Nama & No HP: ${customerInfo}
- Alamat / Catatan: ${address || '-'}

Mohon konfirmasi ketersediaan fisik barang dan nomor rekening / barcode QRIS / petunjuk pengiriman COD. Terima kasih!`;

  const waUrl = `https://wa.me/${primaryPhone}?text=${encodeURIComponent(waMessage)}`;
  window.open(waUrl, '_blank');

  // Bersihkan keranjang setelah order dikirim
  cart = [];
  saveCart();
  closeCartModal();
  showToast('Pesanan berhasil dibuat dan diarahkan ke WhatsApp Penjual!');
}

// Dashboard Tabs Switch
function switchDashTab(tab) {
  ['products', 'users', 'settings'].forEach(t => {
    const sec = document.getElementById(`dash-sec-${t}`);
    const tabBtn = document.getElementById(`dash-tab-${t}`);
    if (sec) sec.classList.toggle('hidden', t !== tab);
    if (tabBtn) {
      if (t === tab) {
        tabBtn.className = 'pb-3 text-[#004B8D] border-b-2 border-[#004B8D]';
      } else {
        tabBtn.className = 'pb-3 text-zinc-500 hover:text-zinc-800';
      }
    }
  });
}

async function loadDashboardData() {
  try {
    const pRes = await fetch('/api/seller/products');
    const pData = await pRes.json();
    const products = pData.products || [];

    document.getElementById('kpi-products').innerText = products.length;
    document.getElementById('kpi-stock').innerText = products.reduce((acc, p) => acc + Number(p.stok), 0);
    document.getElementById('kpi-featured').innerText = products.filter(p => p.unggulan == 1).length;

    renderDashProductsTable(products);

    if (currentUser.role === 'admin') {
      const uRes = await fetch('/api/admin/users');
      const uData = await uRes.json();
      const users = uData.users || [];
      document.getElementById('kpi-users').innerText = users.length;
      renderAdminUsersTable(users);
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

// Upload Foto Handler
function handleImageFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const base64 = evt.target.result;
    document.getElementById('p-image').value = base64;
    document.getElementById('p-image-preview').src = base64;
    document.getElementById('p-image-preview-wrapper').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function handleImageUrlInput() {
  const url = document.getElementById('p-image').value;
  if (url) {
    document.getElementById('p-image-preview').src = url;
    document.getElementById('p-image-preview-wrapper').classList.remove('hidden');
  } else {
    document.getElementById('p-image-preview-wrapper').classList.add('hidden');
  }
}

function clearProductImage() {
  document.getElementById('p-image').value = '';
  document.getElementById('p-image-file').value = '';
  document.getElementById('p-image-preview-wrapper').classList.add('hidden');
}

function renderDashProductsTable(products) {
  const tbody = document.getElementById('dash-product-tbody');
  document.getElementById('dash-product-count').innerText = `${products.length} Barang`;
  tbody.innerHTML = products.map(p => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-4">
        <div class="font-bold text-[#002D5A]">${p.nama} ${p.unggulan ? '<span class="text-[#E60012] font-black text-[10px] ml-1">★ Pilihan!</span>' : ''}</div>
        <div class="text-[11px] text-zinc-500">${p.kondisi} ${currentUser.role === 'admin' ? `&bull; <strong class="text-emerald-700">${p.store_name || p.seller_name}</strong>` : ''}</div>
      </td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-zinc-700">${p.kategori}</span></td>
      <td class="py-3 px-4 font-black text-[#004B8D] mono">${formatRupiah(p.harga)}</td>
      <td class="py-3 px-4 text-center font-bold ${p.stok > 0 ? 'text-emerald-600' : 'text-rose-600'}">${p.stok > 0 ? p.stok + ' Unit' : 'Habis'}</td>
      <td class="py-3 px-4 text-center">
        <button onclick='editProduct(${JSON.stringify(p)})' class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold mr-1">Edit</button>
        <button onclick="deleteProduct(${p.id})" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-bold">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function editProduct(p) {
  document.getElementById('form-product-title').innerHTML = `<i class="fa-solid fa-pen-to-square text-[#004B8D]"></i> Edit Sparepart #${p.id}`;
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-nama').value = p.nama;
  document.getElementById('p-kategori').value = p.kategori;
  document.getElementById('p-kondisi').value = p.kondisi;
  document.getElementById('p-harga').value = p.harga;
  document.getElementById('p-stok').value = p.stok;
  document.getElementById('p-image').value = p.image_url || '';
  document.getElementById('p-desc').value = p.deskripsi || '';
  document.getElementById('p-unggulan').checked = p.unggulan == 1;

  if (p.image_url) {
    document.getElementById('p-image-preview').src = p.image_url;
    document.getElementById('p-image-preview-wrapper').classList.remove('hidden');
  } else {
    document.getElementById('p-image-preview-wrapper').classList.add('hidden');
  }
  window.scrollTo({ top: 120, behavior: 'smooth' });
}

function resetProductForm() {
  document.getElementById('form-product-title').innerHTML = `<i class="fa-solid fa-circle-plus text-[#004B8D]"></i> Tambah Sparepart Baru`;
  document.getElementById('p-id').value = 0;
  document.getElementById('p-nama').value = '';
  document.getElementById('p-harga').value = '';
  document.getElementById('p-stok').value = 1;
  document.getElementById('p-image').value = '';
  document.getElementById('p-image-file').value = '';
  document.getElementById('p-desc').value = '';
  document.getElementById('p-unggulan').checked = false;
  document.getElementById('p-image-preview-wrapper').classList.add('hidden');
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const payload = {
    id: Number(document.getElementById('p-id').value),
    nama: document.getElementById('p-nama').value,
    kategori: document.getElementById('p-kategori').value,
    kondisi: document.getElementById('p-kondisi').value,
    harga: Number(document.getElementById('p-harga').value),
    stok: Number(document.getElementById('p-stok').value),
    image_url: document.getElementById('p-image').value,
    deskripsi: document.getElementById('p-desc').value,
    unggulan: document.getElementById('p-unggulan').checked ? 1 : 0
  };

  const res = await fetch('/api/seller/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message);
    resetProductForm();
    loadDashboardData();
  } else {
    showToast('Gagal simpan: ' + data.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Hapus produk part ini?')) return;
  const res = await fetch(`/api/seller/products/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast('Produk berhasil dihapus.');
    loadDashboardData();
  }
}

let allAdminUsers = [];
let currentAdminUserFilter = 'all';

function toggleStoreNameField(role) {
  document.getElementById('u-store-wrapper').classList.toggle('hidden', role !== 'seller');
}

function filterUserRole(role) {
  currentAdminUserFilter = role;
  ['all', 'seller', 'pembeli', 'admin'].forEach(r => {
    const btn = document.getElementById(`u-filter-${r}`);
    if (btn) {
      if (r === role) {
        btn.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#004B8D] text-white transition flex items-center gap-1';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1';
      }
    }
  });
  renderAdminUsersTable();
}

function renderAdminUsersTable(usersData) {
  if (usersData) {
    allAdminUsers = usersData;
    const sellerCount = allAdminUsers.filter(u => u.role === 'seller').length;
    const sellerBadge = document.getElementById('badge-count-seller');
    if (sellerBadge) sellerBadge.innerText = sellerCount;
  }

  const tbody = document.getElementById('dash-user-tbody');
  if (!tbody) return;

  let filtered = allAdminUsers;
  if (currentAdminUserFilter !== 'all') {
    filtered = allAdminUsers.filter(u => u.role === currentAdminUserFilter);
  }

  document.getElementById('dash-user-count').innerText = `${filtered.length} Pengguna${currentAdminUserFilter !== 'all' ? ` (${currentAdminUserFilter.toUpperCase()})` : ''}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400">
          <i class="fa-solid fa-users-slash text-2xl mb-1 block"></i>
          <span>Tidak ada pengguna dengan peran ini.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    let roleBadge = '';
    if (u.role === 'admin') {
      roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-[#004B8D] uppercase">Admin Pusat</span>';
    } else if (u.role === 'seller') {
      roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase flex items-center gap-1 w-fit"><i class="fa-solid fa-store text-[9px]"></i> Seller Lapak</span>';
    } else {
      roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase">Pembeli</span>';
    }

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4">
          <div class="font-bold text-[#002D5A]">${u.name}</div>
          <div class="text-[11px] text-slate-500">${u.store_name ? '<i class="fa-solid fa-store text-emerald-600 mr-1"></i><span class="font-bold text-emerald-800">' + u.store_name + '</span>' : '-'}</div>
        </td>
        <td class="py-3 px-4 font-mono text-zinc-600">${u.email}</td>
        <td class="py-3 px-4">${roleBadge}</td>
        <td class="py-3 px-4 font-mono text-zinc-600">
          ${u.phone ? `<a href="https://wa.me/${u.phone.replace(/[^0-9]/g, '')}" target="_blank" class="hover:text-emerald-600 hover:underline"><i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${u.phone}</a>` : '-'}
        </td>
        <td class="py-3 px-4 text-center font-bold text-slate-700">
          <span class="px-2 py-0.5 rounded-full ${u.total_products > 0 ? 'bg-blue-50 text-[#004B8D]' : 'bg-slate-100 text-slate-400'}">${u.total_products || 0} Part</span>
        </td>
        <td class="py-3 px-4 text-center">
          <button onclick='editUser(${JSON.stringify(u)})' class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold mr-1">Edit</button>
          ${currentUser && currentUser.id !== u.id ? `<button onclick="deleteUser(${u.id})" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-bold">Hapus</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function editUser(u) {
  document.getElementById('form-user-title').innerHTML = `<i class="fa-solid fa-user-pen text-[#004B8D]"></i> Edit Pengguna #${u.id}`;
  document.getElementById('u-id').value = u.id;
  document.getElementById('u-name').value = u.name;
  document.getElementById('u-email').value = u.email;
  document.getElementById('u-role').value = u.role;
  document.getElementById('u-phone').value = u.phone || '';
  document.getElementById('u-store').value = u.store_name || '';
  document.getElementById('u-pass').value = '';
  toggleStoreNameField(u.role);
}

function resetUserForm() {
  document.getElementById('form-user-title').innerHTML = `<i class="fa-solid fa-user-plus text-[#004B8D]"></i> Tambah Pengguna Baru`;
  document.getElementById('u-id').value = 0;
  document.getElementById('u-name').value = '';
  document.getElementById('u-email').value = '';
  document.getElementById('u-phone').value = '';
  document.getElementById('u-store').value = '';
  document.getElementById('u-pass').value = '';
  toggleStoreNameField('pembeli');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const payload = {
    id: Number(document.getElementById('u-id').value),
    name: document.getElementById('u-name').value,
    email: document.getElementById('u-email').value,
    role: document.getElementById('u-role').value,
    phone: document.getElementById('u-phone').value,
    store_name: document.getElementById('u-store').value,
    password: document.getElementById('u-pass').value
  };

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message);
    resetUserForm();
    loadDashboardData();
  } else {
    showToast('Gagal simpan user: ' + data.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Hapus pengguna ini?')) return;
  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast('Pengguna berhasil dihapus.');
    loadDashboardData();
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const store_wa = document.getElementById('setting-wa-input').value;
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_wa })
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message);
    storeSettings.store_wa = data.store_wa;
    updateHeaderWa(data.store_wa);
  }
}
