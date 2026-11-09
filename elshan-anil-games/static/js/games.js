/* ─────────────────────────────────────────────
   Games page — create lobby & redirect
   از window.__appSocket استفاده می‌کند
   ───────────────────────────────────────────── */

(function () {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const socket = window.__appSocket;

  function toast(msg, type = '') {
    window.showToast ? window.showToast(msg, type) : console.log(msg);
  }

  // ── آپدیت شمارنده‌ی آنلاین
  socket.on('online_update', (data) => {
    const badge = document.getElementById('online-count');
    if (badge) badge.textContent = data.online;
    const list = document.getElementById('online-list');
    if (list) list.textContent = (data.users || []).join(' • ');
  });

  // ── دکمه‌های ساخت لابی
  document.querySelectorAll('[data-create-lobby]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const gameId = btn.getAttribute('data-create-lobby');
      btn.disabled = true;
      btn.dataset.original = btn.textContent;
      btn.textContent = 'در حال ساخت...';
      socket.emit('create_lobby', { game: gameId });
    });
  });

  // ── لابی ساخته شد → برو به صفحه بازی
  socket.on('lobby_created', (data) => {
    toast('لابی ساخته شد! لینک رو با دوستت به اشتراک بذار.', 'success');
    window.location.href = data.link;
  });

  // ── خطا
  socket.on('lobby_error', (data) => {
    toast(data.message || 'خطا در ساخت لابی', 'error');
    document.querySelectorAll('[data-create-lobby]').forEach((b) => {
      b.disabled = false;
      if (b.dataset.original) b.textContent = b.dataset.original;
    });
  });
})();