/* ─────────────────────────────────────────────
   Tic-Tac-Toe client (2 players online)
   server only relays moves between two players
   از window.__appSocket استفاده می‌کند
   ───────────────────────────────────────────── */

(function () {
  const boardEl = document.getElementById('ttt-board');
  if (!boardEl) return;

  const socket = window.__appSocket;
  const statusEl = document.getElementById('ttt-status');
  const resetBtn = document.getElementById('ttt-reset');
  const linkBox = document.getElementById('ttt-link-box');
  const linkInput = document.getElementById('ttt-link-input');
  const copyBtn = document.getElementById('ttt-copy-btn');

  const room = window.GAME_ROOM || '';
  const gameId = window.GAME_ID || 'tictactoe';

  let mySymbol = 'X';
  let myTurn = false;
  let board = Array(9).fill('');
  let gameOver = false;
  let mySid = null;

  function toast(msg, type = '') {
    window.showToast ? window.showToast(msg, type) : console.log(msg);
  }

  // ── ثبت sid خودم
  socket.on('connect', () => {
    mySid = socket.id;
    if (room) {
      // وارد لابی موجود شو
      socket.emit('join_lobby', { room });
    } else {
      // بازی مستقیم → خودت لابی بساز
      socket.emit('create_lobby', { game: gameId });
    }
  });

  // اگه از قبل وصل بود
  if (socket.connected) {
    mySid = socket.id;
    if (room) socket.emit('join_lobby', { room });
    else socket.emit('create_lobby', { game: gameId });
  }

  // ── لابی ساخته شد (بازیکن اول)
  socket.on('lobby_created', (data) => {
    statusEl.textContent = '⏳ منتظر نفر دوم... لینک رو برای دوستت بفرست!';
    statusEl.className = 'ttt-status';
    if (linkBox && linkInput) {
      linkBox.style.display = 'flex';
      linkInput.value = location.origin + data.link;
    }
  });

  // ── بازی شروع شد
  socket.on('game_start', (data) => {
    if (linkBox) linkBox.style.display = 'none';

    // اولین بازیکن در لیست = X
    const firstSid = data.you_are_first;
    if (mySid === firstSid) {
      mySymbol = 'X';
      myTurn = true;
    } else {
      mySymbol = 'O';
      myTurn = false;
    }

    gameOver = false;
    board = Array(9).fill('');
    render();
    updateStatus();
    toast('بازی شروع شد!', 'success');
  });

  // ── حرکت حریف
  socket.on('game_move', (data) => {
    if (typeof data.index !== 'number') return;
    if (board[data.index]) return;
    const opp = mySymbol === 'X' ? 'O' : 'X';
    board[data.index] = opp;
    render();
    myTurn = true;
    if (checkEnd()) return;
    updateStatus();
  });

  // ── ریست
  socket.on('game_reset', () => {
    board = Array(9).fill('');
    gameOver = false;
    myTurn = mySymbol === 'X';
    render();
    updateStatus();
  });

  socket.on('opponent_left', () => {
    toast('حریف از بازی خارج شد 😢', 'error');
    statusEl.textContent = '❌ حریف خارج شد. صفحه رو رفرش کن.';
    statusEl.className = 'ttt-status lose';
    gameOver = true;
    render();
  });

  socket.on('lobby_error', (data) => {
    toast(data.message || 'خطا در ورود به بازی', 'error');
    statusEl.textContent = '❌ ' + (data.message || 'خطا');
    statusEl.className = 'ttt-status lose';
    gameOver = true;
  });

  // ── حرکت
  function makeMove(index) {
    if (gameOver || !myTurn || board[index]) return;
    board[index] = mySymbol;
    render();
    socket.emit('game_move', { room, index });
    myTurn = false;
    if (checkEnd()) return;
    updateStatus();
  }

  // ── بررسی برد/مساوی
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  function checkEnd() {
    for (const [a, b, c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        gameOver = true;
        highlightWin([a, b, c]);
        if (board[a] === mySymbol) {
          statusEl.textContent = '🎉 بردی!';
          statusEl.className = 'ttt-status win';
        } else {
          statusEl.textContent = '😢 باختی!';
          statusEl.className = 'ttt-status lose';
        }
        render();
        return true;
      }
    }
    if (board.every(Boolean)) {
      gameOver = true;
      statusEl.textContent = '🤝 مساوی!';
      statusEl.className = 'ttt-status draw';
      render();
      return true;
    }
    return false;
  }

  function highlightWin(cells) {
    cells.forEach((i) => {
      const el = boardEl.querySelector(`[data-i="${i}"]`);
      if (el) el.classList.add('win-cell');
    });
  }

  // ── رندر تخته
  function render() {
    boardEl.innerHTML = '';
    board.forEach((val, i) => {
      const btn = document.createElement('button');
      btn.className = 'ttt-cell' + (val ? ' taken ' + val.toLowerCase() : '');
      btn.type = 'button';
      btn.dataset.i = i;
      btn.textContent = val;
      if (gameOver || val || !myTurn) btn.disabled = true;
      btn.addEventListener('click', () => makeMove(i));
      boardEl.appendChild(btn);
    });
  }

  function updateStatus() {
    if (gameOver) return;
    statusEl.className = 'ttt-status';
    if (!room) {
      statusEl.textContent = '⏳ در حال آماده‌سازی...';
      return;
    }
    statusEl.textContent = myTurn
      ? `🎯 نوبت توست (${mySymbol})`
      : `⏳ نوبت حریف... (${mySymbol})`;
  }

  // ── کپی لینک
  if (copyBtn && linkInput) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(linkInput.value);
        toast('لینک کپی شد!', 'success');
      } catch {
        linkInput.select();
        document.execCommand('copy');
        toast('لینک کپی شد!', 'success');
      }
    });
  }

  // ── ریست دستی
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      socket.emit('game_reset', { room });
      board = Array(9).fill('');
      gameOver = false;
      myTurn = mySymbol === 'X';
      render();
      updateStatus();
    });
  }

  render();
  updateStatus();
})();