const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const QUIZZES_FILE = path.join(DATA_DIR, 'quizzes.json');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

const QUESTION_TIME_SEC = 20;
const MAX_PLAYERS = 200;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(QUIZZES_FILE)) fs.writeFileSync(QUIZZES_FILE, '[]');

function readQuizzes() {
  try {
    return JSON.parse(fs.readFileSync(QUIZZES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeQuizzes(quizzes) {
  fs.writeFileSync(QUIZZES_FILE, JSON.stringify(quizzes, null, 2));
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|mp4|webm|mov|mp3|wav|ogg)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Unsupported file type'));
  },
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

/** @type {Map<string, Room>} */
const rooms = new Map();

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(pin));
  return pin;
}

function buildPlayerJoinUrl(origin, pin) {
  const base = String(origin).replace(/\/$/, '');
  return `${base}/play.html?pin=${encodeURIComponent(pin)}`;
}

/** @param {{ get?: (name: string) => string | undefined, secure?: boolean } | undefined} req */
function getServerOrigins(req) {
  const origins = [];
  const seen = new Set();

  function add(origin) {
    const o = String(origin).replace(/\/$/, '');
    if (!o || seen.has(o)) return;
    seen.add(o);
    origins.push(o);
  }

  if (PUBLIC_URL) add(PUBLIC_URL);

  const reqHost = req?.get?.('host');
  const proto =
    req?.get?.('x-forwarded-proto') || (req?.secure ? 'https' : 'http');
  if (reqHost) {
    const hostOnly = reqHost.split(':')[0];
    const isLocal =
      hostOnly === 'localhost' ||
      hostOnly === '127.0.0.1' ||
      hostOnly.endsWith('.local');
    if (!isLocal || origins.length === 0) {
      add(`${proto}://${reqHost}`);
    }
  }

  try {
    for (const ifaces of Object.values(os.networkInterfaces())) {
      if (!ifaces) continue;
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          add(`http://${iface.address}:${PORT}`);
        }
      }
    }
  } catch {
    // networkInterfaces may fail in restricted environments
  }

  if (!origins.length) add(`http://localhost:${PORT}`);

  const isLocalOrigin = (u) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);
  origins.sort((a, b) => Number(isLocalOrigin(a)) - Number(isLocalOrigin(b)));
  return origins;
}

function originsFromSocket(socket) {
  const h = socket.handshake.headers;
  return getServerOrigins({
    get(name) {
      if (name === 'host') return h.host;
      if (name === 'x-forwarded-proto') return h['x-forwarded-proto'];
      return undefined;
    },
    secure: h['x-forwarded-proto'] === 'https',
  });
}

function scoreAnswer(timeMs, totalMs) {
  const base = 1000;
  const ratio = Math.max(0, Math.min(1, 1 - timeMs / totalMs));
  return Math.round(base * (0.5 + 0.5 * ratio));
}

function sanitizePlayer(p) {
  return { id: p.id, nickname: p.nickname, score: p.score, streak: p.streak };
}

function publicRoom(room, forHost = false) {
  const q = room.quiz;
  const idx = room.questionIndex;
  const question = idx >= 0 && q?.questions?.[idx] ? q.questions[idx] : null;
  const payload = {
    pin: room.pin,
    phase: room.phase,
    playerCount: room.players.size,
    questionIndex: idx,
    totalQuestions: q?.questions?.length ?? 0,
    questionTimeSec: QUESTION_TIME_SEC,
    players: [...room.players.values()].map(sanitizePlayer).sort((a, b) => b.score - a.score),
  };
  if (question) {
    payload.question = {
      text: question.text,
      mediaUrl: question.mediaUrl || null,
      mediaType: question.mediaType || null,
      choices: question.choices.map((c) => ({ text: c.text })),
    };
    if (room.phase === 'reveal' || room.phase === 'leaderboard' || room.phase === 'finished') {
      payload.correctIndex = question.correctIndex;
      payload.choiceCounts = room.choiceCounts;
    }
    if (forHost && (room.phase === 'reveal' || room.phase === 'question')) {
      payload.answeredCount = room.answered.size;
    }
  }
  if (room.phase === 'finished' || room.phase === 'leaderboard') {
    payload.leaderboard = payload.players.slice(0, 10);
  }
  return payload;
}

function broadcastRoom(room) {
  io.to(`room:${room.pin}`).emit('room:update', publicRoom(room));
  io.to(`host:${room.pin}`).emit('room:update', publicRoom(room, true));
}

class Room {
  constructor(pin, quiz, hostSocketId) {
    this.pin = pin;
    this.quiz = quiz;
    this.hostSocketId = hostSocketId;
    this.phase = 'lobby';
    this.questionIndex = -1;
    /** @type {Map<string, { id, nickname, score, streak, socketId }>} */
    this.players = new Map();
    this.answered = new Set();
    this.choiceCounts = [0, 0, 0, 0];
    this.questionStartedAt = 0;
  }
}

// REST API
app.get('/api/server-info', (req, res) => {
  const origins = getServerOrigins(req);
  res.json({
    port: PORT,
    origins,
    joinPath: '/play.html',
  });
});

app.get('/api/rooms/:pin', (req, res) => {
  const pin = String(req.params.pin).trim();
  const room = rooms.get(pin);
  if (!room) return res.status(404).json({ error: 'Game not found. Check the PIN.' });
  res.json({
    pin: room.pin,
    quizTitle: room.quiz.title,
    phase: room.phase,
    playerCount: room.players.size,
    canJoin: room.phase === 'lobby',
  });
});

app.get('/api/quizzes', (_req, res) => res.json(readQuizzes()));

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = readQuizzes().find((q) => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Not found' });
  res.json(quiz);
});

app.post('/api/quizzes', (req, res) => {
  const quizzes = readQuizzes();
  const body = req.body;
  const quiz = {
    id: body.id || uuidv4(),
    title: String(body.title || 'Untitled Quiz').trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 500),
    questions: normalizeQuestions(body.questions),
    updatedAt: new Date().toISOString(),
    createdAt: body.createdAt || new Date().toISOString(),
  };
  const idx = quizzes.findIndex((q) => q.id === quiz.id);
  if (idx >= 0) quizzes[idx] = quiz;
  else quizzes.push(quiz);
  writeQuizzes(quizzes);
  res.json(quiz);
});

app.delete('/api/quizzes/:id', (req, res) => {
  const quizzes = readQuizzes().filter((q) => q.id !== req.params.id);
  writeQuizzes(quizzes);
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const ext = path.extname(req.file.filename).toLowerCase();
    const video = ['.mp4', '.webm', '.mov'].includes(ext);
    const audio = ['.mp3', '.wav', '.ogg'].includes(ext);
    const mediaType = video ? 'video' : audio ? 'audio' : 'image';
    res.json({
      url: `/uploads/${req.file.filename}`,
      mediaType,
      filename: req.file.originalname,
    });
  });
});

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.slice(0, 50).map((q) => {
    const choices = (q.choices || []).slice(0, 4).map((c, i) => ({
      text: String(c.text || `Option ${i + 1}`).trim().slice(0, 120),
    }));
    while (choices.length < 2) choices.push({ text: `Option ${choices.length + 1}` });
    let correctIndex = Number(q.correctIndex);
    if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      correctIndex = 0;
    }
    return {
      text: String(q.text || '').trim().slice(0, 300),
      mediaUrl: q.mediaUrl || null,
      mediaType: q.mediaType || null,
      choices,
      correctIndex,
      timeSec: Math.min(120, Math.max(5, Number(q.timeSec) || QUESTION_TIME_SEC)),
    };
  });
}

io.on('connection', (socket) => {
  socket.on('host:create-room', ({ quizId }, ack) => {
    const quiz = readQuizzes().find((q) => q.id === quizId);
    if (!quiz || !quiz.questions?.length) {
      return ack?.({ error: 'Quiz not found or has no questions' });
    }
    const pin = generatePin();
    const room = new Room(pin, quiz, socket.id);
    rooms.set(pin, room);
    socket.join(`host:${pin}`);
    socket.data.role = 'host';
    socket.data.pin = pin;
    const origins = originsFromSocket(socket);
    const joinUrls = origins.map((o) => buildPlayerJoinUrl(o, pin));
    ack?.({
      pin,
      quizTitle: quiz.title,
      joinUrl: joinUrls[0],
      joinUrls,
    });
    broadcastRoom(room);
  });

  socket.on('player:join', ({ pin, nickname }, ack) => {
    const room = rooms.get(String(pin).trim());
    if (!room) return ack?.({ error: 'Game not found. Check the PIN.' });
    if (room.phase !== 'lobby') return ack?.({ error: 'Game already started. Ask the host to wait for the next round.' });
    if (room.players.size >= MAX_PLAYERS) return ack?.({ error: 'Room is full' });
    const name = String(nickname || 'Player').trim().slice(0, 20) || 'Player';
    const taken = [...room.players.values()].some(
      (p) => p.nickname.toLowerCase() === name.toLowerCase()
    );
    if (taken) return ack?.({ error: 'Nickname already taken' });
    const id = uuidv4();
    room.players.set(id, { id, nickname: name, score: 0, streak: 0, socketId: socket.id });
    socket.join(`room:${pin}`);
    socket.data.role = 'player';
    socket.data.pin = pin;
    socket.data.playerId = id;
    ack?.({ ok: true, playerId: id });
    broadcastRoom(room);
  });

  socket.on('host:start-game', () => {
    const room = getHostRoom(socket);
    if (!room || room.phase !== 'lobby') return;
    room.phase = 'question';
    room.questionIndex = 0;
    startQuestion(room);
  });

  socket.on('host:next', () => {
    const room = getHostRoom(socket);
    if (!room) return;
    if (room.phase === 'reveal') {
      showLeaderboard(room);
    } else if (room.phase === 'leaderboard') {
      const next = room.questionIndex + 1;
      if (next >= room.quiz.questions.length) {
        room.phase = 'finished';
        broadcastRoom(room);
        return;
      }
      room.questionIndex = next;
      room.phase = 'question';
      startQuestion(room);
    }
  });

  socket.on('host:skip-timer', () => {
    const room = getHostRoom(socket);
    if (!room || room.phase !== 'question') return;
    revealQuestion(room);
  });

  socket.on('player:answer', ({ choiceIndex }) => {
    const pin = socket.data.pin;
    const playerId = socket.data.playerId;
    const room = rooms.get(pin);
    if (!room || room.phase !== 'question' || !playerId) return;
    if (room.answered.has(playerId)) return;
    const q = room.quiz.questions[room.questionIndex];
    if (!q) return;
    const idx = Number(choiceIndex);
    if (idx < 0 || idx >= q.choices.length) return;
    room.answered.add(playerId);
    room.choiceCounts[idx] = (room.choiceCounts[idx] || 0) + 1;
    const player = room.players.get(playerId);
    const totalMs = (q.timeSec || QUESTION_TIME_SEC) * 1000;
    const timeMs = Date.now() - room.questionStartedAt;
    const correct = idx === q.correctIndex;
    if (correct) {
      player.streak = (player.streak || 0) + 1;
      const streakBonus = Math.min(player.streak - 1, 5) * 100;
      player.score += scoreAnswer(timeMs, totalMs) + streakBonus;
    } else {
      player.streak = 0;
    }
    socket.emit('player:answer-result', { correct, choiceIndex: idx });
    broadcastRoom(room);
    if (room.answered.size >= room.players.size && room.players.size > 0) {
      setTimeout(() => revealQuestion(room), 600);
    }
  });

  socket.on('host:end-game', () => {
    const room = getHostRoom(socket);
    if (!room) return;
    destroyRoom(room.pin);
    socket.emit('room:ended');
  });

  socket.on('disconnect', () => {
    const pin = socket.data.pin;
    if (!pin) return;
    const room = rooms.get(pin);
    if (!room) return;
    if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
      io.to(`room:${pin}`).emit('room:closed', { message: 'Host disconnected' });
      destroyRoom(pin);
      return;
    }
    if (socket.data.role === 'player' && socket.data.playerId) {
      room.players.delete(socket.data.playerId);
      if (room.players.size === 0 && room.phase === 'lobby') {
        // keep room for host
      } else {
        broadcastRoom(room);
      }
    }
  });
});

function getHostRoom(socket) {
  const pin = socket.data.pin;
  const room = rooms.get(pin);
  if (!room || room.hostSocketId !== socket.id) return null;
  return room;
}

function startQuestion(room) {
  const q = room.quiz.questions[room.questionIndex];
  room.answered = new Set();
  room.choiceCounts = q.choices.map(() => 0);
  room.questionStartedAt = Date.now();
  room.phase = 'question';
  broadcastRoom(room);
  const ms = (q.timeSec || QUESTION_TIME_SEC) * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => revealQuestion(room), ms);
}

function revealQuestion(room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';
  broadcastRoom(room);
}

function showLeaderboard(room) {
  room.phase = 'leaderboard';
  broadcastRoom(room);
}

function destroyRoom(pin) {
  const room = rooms.get(pin);
  if (room) clearTimeout(room.timer);
  rooms.delete(pin);
}

server.listen(PORT, HOST, () => {
  const origins = getServerOrigins();
  console.log(`LiveQuiz running on port ${PORT}`);
  for (const origin of origins) {
    console.log(`  → ${origin}`);
  }
  console.log(`Players join at /play.html with the game PIN`);
  if (PUBLIC_URL) console.log(`  (PUBLIC_URL=${PUBLIC_URL})`);
});
