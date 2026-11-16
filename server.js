const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e6,
  pingInterval: 10000,
  pingTimeout: 25000,
  cors: { origin: '*' },
  perMessageDeflate: { threshold: 1024 }
});
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const MAX_PLAYERS = 4;
const MAX_CHAR = 31;
const makeCode = () => crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const clampChar = n => { n = Number(n); return Number.isInteger(n) ? Math.max(0, Math.min(MAX_CHAR, n)) : 0; };
const cleanName = s => String(s || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Jugador';
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
function cleanMeta(m) {
  const eq = Array.isArray(m && m.eq) ? m.eq.slice(0, 12).map(x => String(x).replace(/[^\w-]/g, '').slice(0, 12)) : [];
  const g = (o, k, max) => num(o && o[k], max);
  return {
    sh: { hp: g(m && m.sh, 'hp', 5), dmg: g(m && m.sh, 'dmg', 5), spd: g(m && m.sh, 'spd', 5) },
    cu: { hp: g(m && m.cu, 'hp', 5), dmg: g(m && m.cu, 'dmg', 5), spd: g(m && m.cu, 'spd', 5) },
    eq
  };
}
const slotOf = (room, id) => room.players.findIndex(p => p.id === id);

function emitRoom(room) {
  const players = room.players.map(p => ({ name: p.name, char: p.char, gone: !!p.gone }));
  room.players.forEach((p, i) => {
    if (p.gone) return;
    io.to(p.id).emit('room', { code: room.code, private: room.private, started: room.started, host: p.id === room.host, me: i, players });
  });
}

function leave(socket) {
  const code = socket.data.room;
  if (!code) return;
  socket.leave(code);
  socket.data.room = null;
  const room = rooms.get(code);
  if (!room) return;
  const idx = slotOf(room, socket.id);
  if (idx < 0) return;
  const wasHost = room.host === socket.id;
  if (room.started) {
    if (wasHost) {
      for (const p of room.players) if (p.id !== socket.id && !p.gone) {
        io.to(p.id).emit('errorMsg', 'El anfitrión se ha desconectado. La partida ha terminado.');
        io.to(p.id).emit('roomLeft');
        const s = io.sockets.sockets.get(p.id); if (s) { s.leave(code); s.data.room = null; }
      }
      rooms.delete(code);
      return;
    }
    room.players[idx].gone = true;
    io.to(room.host).emit('playerGone', { slot: idx });
    emitRoom(room);
    return;
  }
  room.players.splice(idx, 1);
  if (!room.players.length) { rooms.delete(code); return; }
  if (wasHost) room.host = room.players[0].id;
  emitRoom(room);
}

io.on('connection', socket => {
  let inputs = 0, inputWin = Date.now();
  const newPlayer = d => ({ id: socket.id, name: cleanName(d && d.name), char: clampChar(d && d.char), meta: cleanMeta(d && d.meta), gone: false });

  socket.on('listRooms', () => {
    const list = [...rooms.values()]
      .filter(r => !r.private && !r.started && r.players.length < MAX_PLAYERS)
      .map(r => ({ code: r.code, players: r.players.length }));
    socket.emit('roomList', list);
  });

  socket.on('createRoom', d => {
    leave(socket);
    let code; do { code = makeCode(); } while (rooms.has(code));
    const room = { code, private: !!(d && d.private), host: socket.id, started: false, players: [newPlayer(d)] };
    rooms.set(code, room); socket.join(code); socket.data.room = code;
    emitRoom(room);
  });

  socket.on('joinRoom', d => {
    leave(socket);
    const code = String((d && d.code) || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit('errorMsg', 'No existe esa sala. Revisa el código.');
    if (room.started) return socket.emit('errorMsg', 'La partida ya ha empezado.');
    if (room.players.length >= MAX_PLAYERS) return socket.emit('errorMsg', 'La sala está llena (máximo 4 jugadores).');
    room.players.push(newPlayer(d));
    socket.join(code); socket.data.room = code;
    emitRoom(room);
  });

  socket.on('setChar', d => {
    const room = rooms.get(socket.data.room); if (!room || room.started) return;
    const p = room.players[slotOf(room, socket.id)]; if (!p) return;
    p.char = clampChar(d && d.char); p.meta = cleanMeta(d && d.meta);
    emitRoom(room);
  });

  const sendStart = (room, diff) => {
    room.players = room.players.filter(p => !p.gone);
    room.started = true;
    const roster = room.players.map(p => ({ name: p.name, char: p.char, meta: p.meta }));
    room.players.forEach((p, i) => io.to(p.id).emit('gameStart', { host: p.id === room.host, me: i, roster, diff }));
  };
  socket.on('startGame', d => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id) return;
    if (room.started && !(d && d.again)) return;
    sendStart(room, Math.max(0, Math.min(2, Number(d && d.diff) || 0)));
  });

  socket.on('endGame', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id || !room.started) return;
    room.started = false;
    room.players = room.players.filter(p => !p.gone);
    emitRoom(room);
    io.to(room.code).emit('toRoom');
  });

  socket.on('input', d => {
    const now = Date.now();
    if (now - inputWin > 1000) { inputWin = now; inputs = 0; }
    if (++inputs > 60) return;
    const room = rooms.get(socket.data.room); if (!room || !room.started) return;
    const idx = slotOf(room, socket.id);
    if (idx <= 0 || room.players[idx].gone) return;
    const keys = {};
    for (const k of ['up', 'down', 'left', 'right']) keys[k] = !!(d && d.keys && d.keys[k]);
    const cl = v => Math.max(-1, Math.min(1, Number(v) || 0));
    io.to(room.host).emit('input', { player: idx, keys, ax: cl(d && d.ax), ay: cl(d && d.ay) });
  });

  socket.on('snapshot', snapshot => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.started || room.host !== socket.id) return;
    if (typeof snapshot !== 'string' || snapshot.length > 1_500_000) return;
    socket.to(room.code).emit('snapshot', snapshot);
  });

  socket.on('levelup', d => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id || !room.started) return;
    const cards = Array.isArray(d && d.cards) ? d.cards.slice(0, 4).map(x => String(x).slice(0, 1500)) : [];
    const slot = v => Number.isInteger(v) ? Math.max(-1, Math.min(MAX_PLAYERS - 1, v)) : -1;
    const target = slot(d && d.target);
    const to = slot(d && d.to) >= 0 ? slot(d && d.to) : target;
    const each = d && d.each ? 1 : 0;
    const payload = {
      title: String((d && d.title) || 'Subes de nivel').slice(0, 100), cards, target, to, each,
      rr: num(d && d.rr, 9), seq: num(d && d.seq, 1e9)
    };
    const dest = to > 0 ? room.players[to] : null;
    if (each && dest && !dest.gone) io.to(dest.id).emit('levelup', payload);
    else socket.to(room.code).emit('levelup', payload);
  });

  const senderSlot = room => {
    const idx = slotOf(room, socket.id);
    if (idx <= 0 || room.players[idx].gone) return -1;
    return idx;
  };
  socket.on('choose', d => {
    const room = rooms.get(socket.data.room); if (!room || !room.started) return;
    const idx = senderSlot(room); if (idx < 0) return;
    const index = Number(d && d.index);
    if (!Number.isInteger(index) || index < 0 || index > 3) return;
    io.to(room.host).emit('choose', { index, player: idx, seq: num(d && d.seq, 1e9) });
  });
  socket.on('reroll', d => {
    const room = rooms.get(socket.data.room); if (!room || !room.started) return;
    const idx = senderSlot(room); if (idx < 0) return;
    io.to(room.host).emit('reroll', { player: idx, seq: num(d && d.seq, 1e9) });
  });

  socket.on('leaveRoom', () => { leave(socket); socket.emit('roomLeft'); });
  socket.on('lat', t => { if (typeof t === 'number' && Number.isFinite(t)) socket.emit('lat', t); });
  socket.on('disconnect', () => leave(socket));
});

server.listen(PORT, '0.0.0.0', () => console.log(`FP Survivor 3D Online escuchando en http://localhost:${PORT}`));
