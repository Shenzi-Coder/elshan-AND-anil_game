/* ─────────────────────────────────────────────
   Socket.IO Global — یک اتصال واحد برای کل سایت
   بقیه فایل‌ها از window.__appSocket استفاده می‌کنند
   ───────────────────────────────────────────── */

// فقط یک بار اتصال ساخته می‌شود
window.__appSocket = window.__appSocket || io();

// نام کاربر (یک بار پرسیده می‌شود)
window.__appUsername = window.__appUsername || (function () {
  let u = sessionStorage.getItem('username');
  if (!u) {
    u = (prompt('اسمت چیه؟') || '').trim().slice(0, 20) || 'مهمان';
    sessionStorage.setItem('username', u);
  }
  return u;
})();

// توست سراسری
window.showToast = function (msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
};

// پل بین CustomEvent و توست
window.addEventListener('app-toast', (e) => {
  const d = e.detail || {};
  window.showToast(d.msg || '', d.type || '');
});