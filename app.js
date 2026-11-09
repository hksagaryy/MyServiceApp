/* ===== MyServiceApp - Firebase Version ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  collection, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const state = {
  categories: [], seedWorkers: [], dbWorkers: [],
  selectedCategory: 'all', signupRole: 'customer',
  bookingWorker: null, user: null, unsub: null, signingUp: false
};

const FALLBACK = {
  categories: [
    { id: 'electrician', name: 'ইলেকট্রিশিয়ান', icon: 'fa-bolt' },
    { id: 'mechanic', name: 'মেকানিক', icon: 'fa-wrench' }
  ],
  workers: []
};

// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catName = (id) => (state.categories.find((x) => x.id === id) || {}).name || id;
const validPhone = (p) => /^01[3-9]\d{8}$/.test(p);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const phoneToEmail = (p) => p + '@myserviceapp.com';
const STATUS = { pending: 'অপেক্ষমাণ', accepted: 'গ্রহণ করা হয়েছে', completed: 'সম্পন্ন', rejected: 'বাতিল' };
const fmtDate = (d) => { try { return new Date(d).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d; } };

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}
function authError(e) {
  const m = {
    'auth/email-already-in-use': 'এই নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে',
    'auth/invalid-credential': 'ফোন নম্বর বা পাসওয়ার্ড ভুল',
    'auth/wrong-password': 'ফোন নম্বর বা পাসওয়ার্ড ভুল',
    'auth/user-not-found': 'ফোন নম্বর বা পাসওয়ার্ড ভুল',
    'auth/network-request-failed': 'ইন্টারনেট সংযোগ চেক করুন',
    'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে চেষ্টা করুন',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'firebase-config.js এ সঠিক config দিন',
    'auth/operation-not-allowed': 'Firebase এ Email/Password সাইন-ইন চালু করুন'
  };
  return m[e.code] || ('সমস্যা হয়েছে: ' + (e.code || e.message));
}

// ---------- Data ----------
async function loadData() {
  let data;
  try { data = await (await fetch('mechanic.json')).json(); } catch (e) { data = FALLBACK; }
  state.categories = data.categories;
  state.seedWorkers = data.workers;
  $('suCategory').innerHTML = state.categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

async function loadDbWorkers() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'worker')));
    state.dbWorkers = snap.docs.map((d) => {
      const u = d.data();
      return {
        id: d.id, name: u.name, category: u.category, rating: 5.0, reviews: 0,
        price: u.price, area: u.area, available: true, experience: u.experience || 'নতুন'
      };
    });
  } catch (e) { state.dbWorkers = []; }
}
const allWorkers = () => [...state.dbWorkers, ...state.seedWorkers];

// ---------- Auth tabs ----------
function switchAuth(mode) {
  const login = mode === 'login';
  $('tabLogin').classList.toggle('active', login);
  $('tabSignup').classList.toggle('active', !login);
  $('loginForm').classList.toggle('hidden', !login);
  $('signupForm').classList.toggle('hidden', login);
}
$('tabLogin').onclick = () => switchAuth('login');
$('tabSignup').onclick = () => switchAuth('signup');

document.querySelectorAll('.role-btn').forEach((btn) => {
  btn.onclick = () => {
    state.signupRole = btn.dataset.role;
    document.querySelectorAll('.role-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $('workerFields').classList.toggle('hidden', state.signupRole !== 'worker');
  };
});

// ---------- Signup ----------
$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('signupErr');
  const name = $('suName').value.trim();
  const phone = $('suPhone').value.trim();
  const email = $('suEmail').value.trim();
  const pass = $('suPass').value;

  if (name.length < 3) return (err.textContent = 'সঠিক নাম দিন (কমপক্ষে ৩ অক্ষর)');
  if (!validPhone(phone)) return (err.textContent = 'সঠিক ফোন নম্বর দিন (01XXXXXXXXX)');
  if (!validEmail(email)) return (err.textContent = 'সঠিক ইমেইল দিন');
  if (pass.length < 6) return (err.textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');

  const profile = { name, phone, email, role: state.signupRole, createdAt: serverTimestamp() };
  if (state.signupRole === 'worker') {
    const price = Number($('suPrice').value);
    const area = $('suArea').value.trim();
    if (!price || price < 50) return (err.textContent = 'সঠিক চার্জ দিন');
    if (area.length < 3) return (err.textContent = 'কাজের এলাকা দিন');
    Object.assign(profile, {
      category: $('suCategory').value, price, area, experience: $('suExp').value.trim()
    });
  }

  err.textContent = 'অপেক্ষা করুন...';
  state.signingUp = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), pass);
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    state.signingUp = false;
    $('signupForm').reset();
    err.textContent = '';
    toast('রেজিস্ট্রেশন সফল!');
    await handleUser(cred.user);
  } catch (ex) {
    state.signingUp = false;
    err.textContent = authError(ex);
  }
});

// ---------- Login / Logout ----------
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = $('loginPhone').value.trim();
  const pass = $('loginPass').value;
  const err = $('loginErr');
  if (!validPhone(phone)) return (err.textContent = 'সঠিক ফোন নম্বর দিন');
  if (!pass) return (err.textContent = 'পাসওয়ার্ড দিন');
  err.textContent = 'অপেক্ষা করুন...';
  try {
    await signInWithEmailAndPassword(auth, phoneToEmail(phone), pass);
    err.textContent = '';
    $('loginForm').reset();
  } catch (ex) { err.textContent = authError(ex); }
});

document.querySelectorAll('[data-logout]').forEach((b) => {
  b.onclick = () => signOut(auth);
});

// ---------- Session handling ----------
onAuthStateChanged(auth, (fbUser) => {
  if (state.signingUp) return;
  handleUser(fbUser);
});

async function handleUser(fbUser) {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  ['authView', 'customerView', 'workerView'].forEach(hide);
  if (!fbUser) { state.user = null; return show('authView'); }

  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!snap.exists()) { await signOut(auth); return; }
  state.user = { id: fbUser.uid, ...snap.data() };

  if (state.user.role === 'worker') {
    show('workerView');
    watchBookings('workerId', renderWorker);
  } else {
    show('customerView');
    $('custGreeting').textContent = 'হ্যালো, ' + state.user.name.split(' ')[0];
    await loadDbWorkers();
    renderCategories();
    renderWorkers();
    watchBookings('customerId', renderCustomerBookings);
  }
}

function watchBookings(field, render) {
  const q = query(collection(db, 'bookings'), where(field, '==', state.user.id));
  state.unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
    render(list);
  }, () => toast('ডেটা লোড করা যায়নি (Firestore rules চেক করুন)'));
}

// ---------- Customer ----------
function renderCategories() {
  const all = [{ id: 'all', name: 'সব', icon: 'fa-border-all' }, ...state.categories];
  $('categoryList').innerHTML = all.map((c) => `
    <button class="cat-card ${state.selectedCategory === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">
      <i class="fa-solid ${esc(c.icon)}"></i><span>${esc(c.name)}</span>
    </button>`).join('');
  document.querySelectorAll('.cat-card').forEach((el) => {
    el.onclick = () => { state.selectedCategory = el.dataset.cat; renderCategories(); renderWorkers(); };
  });
}

function renderWorkers() {
  const q = $('searchInput').value.trim().toLowerCase();
  const list = allWorkers().filter((w) => {
    const inCat = state.selectedCategory === 'all' || w.category === state.selectedCategory;
    const text = (w.name + ' ' + catName(w.category) + ' ' + w.area).toLowerCase();
    return inCat && (!q || text.includes(q));
  });
  $('workerList').innerHTML = list.length ? list.map((w) => `
    <div class="worker-card">
      <div class="w-head">
        <div class="avatar">${esc(w.name.charAt(0))}</div>
        <div><h3>${esc(w.name)}</h3><p>${esc(catName(w.category))}</p></div>
      </div>
      <div class="w-meta">
        <span><i class="fa-solid fa-star star"></i> ${Number(w.rating).toFixed(1)} (${bn(w.reviews)})</span>
        <span><i class="fa-solid fa-location-dot"></i> ${esc(w.area)}</span>
        <span><i class="fa-solid fa-briefcase"></i> ${esc(w.experience)}</span>
      </div>
      <div class="w-foot">
        <div class="price">৳${bn(w.price)}<small style="color:#6b7280;font-weight:400">/ঘণ্টা</small></div>
        <button class="book-btn" data-w="${esc(w.id)}" ${w.available ? '' : 'disabled'}>${w.available ? 'বুক করুন' : 'ব্যস্ত'}</button>
      </div>
    </div>`).join('') : '<div class="empty">কোনো সার্ভিস প্রোভাইডার পাওয়া যায়নি</div>';
  document.querySelectorAll('.book-btn:not([disabled])').forEach((b) => { b.onclick = () => openBooking(b.dataset.w); });
}
$('searchInput').addEventListener('input', renderWorkers);

document.querySelectorAll('[data-ctab]').forEach((b) => {
  b.onclick = () => {
    const tab = b.dataset.ctab;
    document.querySelectorAll('[data-ctab]').forEach((x) => x.classList.toggle('active', x === b));
    $('custHome').classList.toggle('hidden', tab !== 'home');
    $('custBookings').classList.toggle('hidden', tab !== 'bookings');
  };
});

// ---------- Booking modal ----------
function openBooking(workerId) {
  const w = allWorkers().find((x) => x.id === workerId);
  if (!w) return;
  state.bookingWorker = w;
  $('bmTitle').textContent = w.name + '-কে বুক করুন';
  $('bmSub').textContent = catName(w.category) + ' • ৳' + bn(w.price) + '/ঘণ্টা';
  $('bookForm').reset();
  $('bookErr').textContent = '';
  show('bookFormBox'); hide('bookSuccessBox'); show('bookModal');
}
const closeBooking = () => hide('bookModal');
$('bkCancel').onclick = closeBooking;
$('bkDone').onclick = closeBooking;
$('bookModal').addEventListener('click', (e) => { if (e.target.id === 'bookModal') closeBooking(); });

$('bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = $('bkDate').value;
  const address = $('bkAddress').value.trim();
  const note = $('bkNote').value.trim();
  if (!date) return ($('bookErr').textContent = 'তারিখ ও সময় নির্বাচন করুন');
  if (address.length < 5) return ($('bookErr').textContent = 'সঠিক ঠিকানা দিন');
  const w = state.bookingWorker;
  try {
    await addDoc(collection(db, 'bookings'), {
      customerId: state.user.id, customerName: state.user.name, customerPhone: state.user.phone,
      workerId: w.id, workerName: w.name, service: catName(w.category), price: w.price,
      date, address, note, status: 'pending', createdMs: Date.now()
    });
    hide('bookFormBox'); show('bookSuccessBox');
  } catch (ex) { $('bookErr').textContent = 'বুকিং ব্যর্থ: ' + (ex.code || ex.message); }
});

function renderCustomerBookings(list) {
  $('custBookingList').innerHTML = list.length ? list.map((b) => `
    <div class="booking-card">
      <div class="b-top"><h4>${esc(b.service)} - ${esc(b.workerName)}</h4><span class="badge ${b.status}">${STATUS[b.status]}</span></div>
      <div class="b-line"><i class="fa-regular fa-clock"></i> ${esc(fmtDate(b.date))}</div>
      <div class="b-line"><i class="fa-solid fa-location-dot"></i> ${esc(b.address)}</div>
      ${b.note ? `<div class="b-line"><i class="fa-regular fa-comment"></i> ${esc(b.note)}</div>` : ''}
    </div>`).join('') : '<div class="empty">আপনার কোনো বুকিং নেই</div>';
}

// ---------- Worker dashboard ----------
function renderWorker(list) {
  const u = state.user;
  $('workGreeting').textContent = u.name;
  $('workSub').textContent = catName(u.category) + ' • ' + u.area;
  $('stPending').textContent = bn(list.filter((b) => b.status === 'pending').length);
  const done = list.filter((b) => b.status === 'completed');
  $('stDone').textContent = bn(done.length);
  $('stEarn').textContent = '৳' + bn(done.reduce((s, b) => s + Number(b.price), 0));

  $('workBookingList').innerHTML = list.length ? list.map((b) => `
    <div class="booking-card">
      <div class="b-top"><h4>${esc(b.customerName)}</h4><span class="badge ${b.status}">${STATUS[b.status]}</span></div>
      <div class="b-line"><i class="fa-solid fa-phone"></i> ${esc(b.customerPhone)}</div>
      <div class="b-line"><i class="fa-regular fa-clock"></i> ${esc(fmtDate(b.date))}</div>
      <div class="b-line"><i class="fa-solid fa-location-dot"></i> ${esc(b.address)}</div>
      ${b.note ? `<div class="b-line"><i class="fa-regular fa-comment"></i> ${esc(b.note)}</div>` : ''}
      <div class="b-actions">
        ${b.status === 'pending' ? `
          <button class="b-accept" data-act="accepted" data-id="${b.id}">গ্রহণ করুন</button>
          <button class="b-reject" data-act="rejected" data-id="${b.id}">বাতিল</button>` : ''}
        ${b.status === 'accepted' ? `<button class="b-complete" data-act="completed" data-id="${b.id}">কাজ সম্পন্ন</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty">এখনো কোনো বুকিং রিকোয়েস্ট আসেনি</div>';

  document.querySelectorAll('.b-actions button').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await updateDoc(doc(db, 'bookings', btn.dataset.id), { status: btn.dataset.act });
        toast('স্ট্যাটাস আপডেট হয়েছে');
      } catch (ex) { toast('আপডেট ব্যর্থ'); }
    };
  });
}

// ---------- Init ----------
loadData();
