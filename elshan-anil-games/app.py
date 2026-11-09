# ─────────────────────────────────────────────
#  Elshan & Anil Games
#  app.py — Flask + Flask-SocketIO
#  ⚠️ eventlet.monkey_patch() باید قبل از هر import دیگری باشد
# ─────────────────────────────────────────────

import eventlet
eventlet.monkey_patch()

import os
import json
import random
import string
import threading

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room

# ─────────────────────────────────────────────
#  تنظیمات کلی
# ─────────────────────────────────────────────
MAX_CONNECTIONS = 4  # حداکثر اتصال همزمان کل سیستم

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "elshan-anil-secret-key-2025")

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    max_http_buffer_size=12 * 1024 * 1024,  # تا ~12MB برای فایل‌های base64
)

# ─────────────────────────────────────────────
#  State (in-memory — بدون دیتابیس)
# ─────────────────────────────────────────────
lock = threading.Lock()
active_connections = 0            # تعداد اتصال‌های همزمان
online_users = {}                 # sid -> username
game_rooms = {}                   # room_id -> { game, players: [sid], started, usernames: {} }


# ─────────────────────────────────────────────
#  Helper Functions
# ─────────────────────────────────────────────
def gen_room_id(length=6):
    """تولید شناسه یکتا برای اتاق بازی."""
    chars = string.ascii_lowercase + string.digits
    while True:
        rid = "".join(random.choice(chars) for _ in range(length))
        if rid not in game_rooms:
            return rid


def get_games_list():
    """خواندن لیست بازی‌ها از static/games/*/game.json"""
    games_dir = os.path.join(app.static_folder, "games")
    games = []
    if not os.path.isdir(games_dir):
        return games
    for name in sorted(os.listdir(games_dir)):
        meta_path = os.path.join(games_dir, name, "game.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                meta.setdefault("id", name)
                meta.setdefault("name", name)
                meta.setdefault("description", "")
                meta.setdefault("icon", "🎮")
                meta.setdefault("players", 2)
                games.append(meta)
            except Exception as e:
                print(f"[games] خطا در خواندن {meta_path}: {e}")
    return games


# ─────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat")
def chat():
    return render_template("chat.html")


@app.route("/games")
def games():
    return render_template("games.html", games=get_games_list())


@app.route("/play")
def play():
    """صفحه اجرای بازی. با ?room=xxxx وارد می‌شود."""
    room_id = request.args.get("room", "").strip()
    game_id = request.args.get("game", "").strip()

    # اگر room داده شده، بازی را از اتاق پیدا کن
    if room_id and room_id in game_rooms:
        game_id = game_rooms[room_id]["game"]

    if not game_id:
        return "بازی پیدا نشد. لینک معتبر نیست.", 404

    meta_path = os.path.join(app.static_folder, "games", game_id, "game.json")
    if not os.path.isfile(meta_path):
        return "بازی پیدا نشد.", 404

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    meta.setdefault("id", game_id)

    return render_template("play.html", game=meta, room_id=room_id)


@app.route("/api/status")
def status():
    """وضعیت آنلاین — برای پولینگ ساده."""
    with lock:
        return jsonify({
            "online": active_connections,
            "max": MAX_CONNECTIONS,
            "users": list(online_users.values()),
        })


# ─────────────────────────────────────────────
#  SocketIO: Connection
# ─────────────────────────────────────────────
@socketio.on("connect")
def on_connect():
    global active_connections
    with lock:
        if active_connections >= MAX_CONNECTIONS:
            emit("rejected", {"reason": "ظرفیت پر است (حداکثر ۴ نفر). بعداً امتحان کن."})
            return False  # رد اتصال
        active_connections += 1
        online_users[request.sid] = "مهمان"

    emit("connected", {
        "sid": request.sid,
        "online": active_connections,
        "max": MAX_CONNECTIONS,
    })

    socketio.emit("online_update", {
        "online": active_connections,
        "max": MAX_CONNECTIONS,
        "users": list(online_users.values()),
    })


@socketio.on("disconnect")
def on_disconnect():
    global active_connections
    sid = request.sid
    username = None

    with lock:
        if sid in online_users:
            username = online_users.pop(sid)
            active_connections = max(0, active_connections - 1)

        # پاک‌سازی اتاق‌های بازی
        rooms_to_remove = []
        for rid, room in game_rooms.items():
            if sid in room["players"]:
                room["players"].remove(sid)
                if not room["players"]:
                    rooms_to_remove.append(rid)
                else:
                    # به بازیکن باقی‌مانده خبر بده
                    socketio.emit(
                        "opponent_left",
                        {"room": rid, "username": username},
                        to=rid,
                    )
        for rid in rooms_to_remove:
            del game_rooms[rid]

    socketio.emit("online_update", {
        "online": active_connections,
        "max": MAX_CONNECTIONS,
        "users": list(online_users.values()),
    })


# ─────────────────────────────────────────────
#  SocketIO: Chat
# ─────────────────────────────────────────────
@socketio.on("join_chat")
def on_join_chat(data):
    username = (data or {}).get("username", "").strip()[:20] or "مهمان"
    with lock:
        online_users[request.sid] = username
    join_room("chat")
    socketio.emit("online_update", {
        "online": active_connections,
        "max": MAX_CONNECTIONS,
        "users": list(online_users.values()),
    })


@socketio.on("chat_message")
def on_chat_message(data):
    """پیام متنی یا فایل (base64). فقط broadcast، بدون ذخیره."""
    if not data:
        return

    with lock:
        username = online_users.get(request.sid, "مهمان")

    msg_type = data.get("type", "text")
    content = data.get("content", "")
    filename = data.get("filename", "")

    if msg_type == "text":
        content = str(content)[:2000]
        if not content.strip():
            return
    else:
        # محدودیت حجم base64 (تقریباً ۸MB)
        if len(content) > 12 * 1024 * 1024:
            emit("chat_error", {"message": "فایل خیلی بزرگ است (حداکثر ۸MB)."})
            return

    payload = {
        "username": username,
        "type": msg_type,
        "content": content,
        "filename": filename,
        "timestamp": data.get("timestamp", ""),
    }
    socketio.emit("chat_message", payload, to="chat")


# ─────────────────────────────────────────────
#  SocketIO: Game Lobby
# ─────────────────────────────────────────────
@socketio.on("create_lobby")
def on_create_lobby(data):
    """ساخت اتاق بازی — نفر اول."""
    game_id = (data or {}).get("game", "").strip()
    if not game_id:
        emit("lobby_error", {"message": "بازی نامعتبر است."})
        return

    meta_path = os.path.join(app.static_folder, "games", game_id, "game.json")
    if not os.path.isfile(meta_path):
        emit("lobby_error", {"message": "بازی پیدا نشد."})
        return

    with lock:
        username = online_users.get(request.sid, "مهمان")
        rid = gen_room_id()
        game_rooms[rid] = {
            "game": game_id,
            "players": [request.sid],
            "started": False,
            "usernames": {request.sid: username},
        }

    join_room(rid)
    emit("lobby_created", {
        "room": rid,
        "game": game_id,
        "link": f"/play?room={rid}",
    })


@socketio.on("join_lobby")
def on_join_lobby(data):
    """نفر دوم با لینک وارد اتاق می‌شود."""
    rid = (data or {}).get("room", "").strip()
    room = None

    with lock:
        room = game_rooms.get(rid)
        if not room:
            emit("lobby_error", {"message": "اتاق پیدا نشد یا منقضی شده."})
            return

        if request.sid in room["players"]:
            # همان نفر دوباره join (مثلاً رفرش)
            join_room(rid)
            emit("lobby_joined", {
                "room": rid,
                "game": room["game"],
                "players": len(room["players"]),
            })
            return

        if len(room["players"]) >= 2:
            emit("lobby_error", {"message": "این اتاق پر است (بازی دو نفره)."})
            return

        username = online_users.get(request.sid, "مهمان")
        room["players"].append(request.sid)
        room["usernames"][request.sid] = username
        room["started"] = True
        players = list(room["players"])
        usernames = [room["usernames"][p] for p in players]

    join_room(rid)

    # به هر دو نفر بگو بازی شروع شد
    socketio.emit("game_start", {
        "room": rid,
        "game": room["game"],
        "players": players,
        "usernames": usernames,
        "you_are_first": players[0],
    }, to=rid)


@socketio.on("game_move")
def on_game_move(data):
    """حرکت بازی — فقط relay بین دو نفر."""
    rid = (data or {}).get("room", "").strip()

    with lock:
        room = game_rooms.get(rid)
        if not room or request.sid not in room["players"]:
            return
        if not room["started"]:
            return

        payload = dict(data or {})
        payload["from"] = request.sid

    socketio.emit("game_move", payload, to=rid, skip_sid=request.sid)


@socketio.on("game_reset")
def on_game_reset(data):
    rid = (data or {}).get("room", "").strip()
    with lock:
        room = game_rooms.get(rid)
        if not room or request.sid not in room["players"]:
            return
    socketio.emit("game_reset", {"room": rid}, to=rid)


# ─────────────────────────────────────────────
#  Main (فقط برای اجرای محلی)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True)
