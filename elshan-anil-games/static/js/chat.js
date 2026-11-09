/* ─────────────────────────────────────────────
   Chat client — Socket.IO live chat
   Text + image + video (base64 broadcast)
   از window.__appSocket و window.__appUsername استفاده می‌کند
   ───────────────────────────────────────────── */

(function () {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

  const socket = window.__appSocket;
  const username = window.__appUsername;

  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('file-input');
  const fileBtn = document.getElementById('file-btn');
  const usersEl = document.getElementById('chat-users');

  // ── helpers
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }

  function toast(msg, type = '') {
    window.showToast ? window.showToast(msg, type) : console.log(msg);
  }

  // ── آپدیت هدر چت (تعداد آنلاین)
  socket.on('online_update', (data) => {
    if (usersEl) usersEl.textContent = `${data.online}/${data.max} آنلاین`;
  });

  // ── دریافت پیام
  socket.on('chat_message', (msg) => {
    const empty = messagesEl.querySelector('.chat-empty');
    if (empty) empty.remove();

    const mine = msg.username === username;
    const el = document.createElement('div');
    el.className = 'msg' + (mine ? ' mine' : '');

    let body = '';
    if (msg.type === 'image' && msg.content) {
      body = `<img src="${esc(msg.content)}" alt="عکس">`;
    } else if (msg.type === 'video' && msg.content) {
      body = `<video src="${esc(msg.content)}" controls></video>`;
    } else {
      body = esc(msg.content).replace(/\n/g, '<br>');
    }

    el.innerHTML = `
      <div class="meta">
        <span class="name">${esc(msg.username)}</span>
        <span>${esc(msg.timestamp || nowTime())}</span>
      </div>
      ${body}
    `;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  socket.on('chat_error', (data) => toast(data.message || 'خطا', 'error'));

  // ── ارسال متن
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      socket.emit('chat_message', {
        type: 'text',
        content: text,
        timestamp: nowTime(),
      });
      input.value = '';
      input.focus();
    });
  }

  // ── انتخاب فایل (عکس/ویدیو)
  if (fileBtn && fileInput) {
    fileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        toast('فقط عکس یا ویدیو مجاز است', 'error');
        fileInput.value = '';
        return;
      }

      const maxMB = isVideo ? 8 : 3;
      if (file.size > maxMB * 1024 * 1024) {
        toast(`حجم فایل باید کمتر از ${maxMB}MB باشد`, 'error');
        fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('chat_message', {
          type: isVideo ? 'video' : 'image',
          content: reader.result, // base64
          filename: file.name,
          timestamp: nowTime(),
        });
        toast('در حال ارسال...', '');
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
  }

  // ── قطع اتصال
  socket.on('disconnect', () => {
    messagesEl.insertAdjacentHTML(
      'beforeend',
      `<div class="msg"><em style="color:var(--warning)">⚠️ اتصال قطع شد — در حال اتصال مجدد...</em></div>`
    );
  });
})();