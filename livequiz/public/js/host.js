import { api, copyText, qs, renderMedia } from './shared.js';

const socket = io();
let pin = null;
let timerId = null;
let questionEndAt = 0;

const pickQuiz = document.getElementById('pickQuiz');
const gameView = document.getElementById('gameView');
const lobbyView = document.getElementById('lobbyView');
const questionView = document.getElementById('questionView');
const leaderboardView = document.getElementById('leaderboardView');
const finishedView = document.getElementById('finishedView');

async function loadQuizPicker() {
  const list = document.getElementById('hostQuizList');
  const empty = document.getElementById('hostEmpty');
  const quizzes = await api('/api/quizzes');
  if (!quizzes.length) {
    empty.hidden = false;
    return;
  }
  for (const q of quizzes) {
    const li = document.createElement('li');
    const n = q.questions?.length ?? 0;
    li.innerHTML = `
      <div><strong>${esc(q.title)}</strong><div class="quiz-meta">${n} questions</div></div>
      <button type="button" class="btn btn-primary btn-sm" data-id="${q.id}">Host this quiz</button>`;
    li.querySelector('button').addEventListener('click', () => startHosting(q.id, q.title));
    list.appendChild(li);
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function startHosting(quizId, title) {
  socket.emit('host:create-room', { quizId }, (res) => {
    if (res?.error) {
      alert(res.error);
      return;
    }
    pin = res.pin;
    document.getElementById('quizTitleLabel').textContent = res.quizTitle || title;
    document.getElementById('pinDisplay').textContent = pin;
    showJoinShare(res.joinUrl, res.joinUrls);
    pickQuiz.hidden = true;
    gameView.hidden = false;
  });
}

function showJoinShare(primaryUrl, allUrls) {
  const box = document.getElementById('joinShare');
  const input = document.getElementById('joinUrlInput');
  const alt = document.getElementById('joinUrlAlt');
  const qr = document.getElementById('joinQr');
  const urls = [...new Set((allUrls || []).filter(Boolean))];
  const joinUrl = primaryUrl || urls[0];
  if (!joinUrl) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  input.value = joinUrl;
  if (urls.length > 1) {
    alt.hidden = false;
    alt.textContent = `Also try: ${urls.slice(1).join(' · ')}`;
  } else {
    alt.hidden = true;
  }
  qr.hidden = false;
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
}

document.getElementById('copyJoinUrlBtn').addEventListener('click', () => {
  const url = document.getElementById('joinUrlInput').value;
  if (url) copyText(url);
});

function showPhase(phase) {
  lobbyView.hidden = phase !== 'lobby';
  questionView.hidden = !['question', 'reveal'].includes(phase);
  leaderboardView.hidden = phase !== 'leaderboard';
  finishedView.hidden = phase !== 'finished';
}

function renderLobby(state) {
  document.getElementById('playerCount').textContent = state.playerCount;
  const box = document.getElementById('lobbyPlayers');
  box.innerHTML = state.players.map((p) =>
    `<span class="player-chip">${esc(p.nickname)}</span>`
  ).join('');
  document.getElementById('startGameBtn').disabled = state.playerCount < 1;
}

function stopTimer() {
  if (timerId) cancelAnimationFrame(timerId);
  timerId = null;
}

function runTimer(sec) {
  stopTimer();
  const fill = document.getElementById('hostTimer');
  questionEndAt = Date.now() + sec * 1000;
  function tick() {
    const left = Math.max(0, questionEndAt - Date.now());
    const pct = (left / (sec * 1000)) * 100;
    fill.style.width = `${pct}%`;
    if (left > 0) timerId = requestAnimationFrame(tick);
  }
  tick();
}

function renderBarChart(state) {
  const chart = document.getElementById('hostBarChart');
  const q = state.question;
  if (!q || !state.choiceCounts) {
    chart.hidden = true;
    return;
  }
  chart.hidden = false;
  const max = Math.max(1, ...state.choiceCounts);
  chart.innerHTML = q.choices.map((c, i) => {
    const count = state.choiceCounts[i] || 0;
    const w = (count / max) * 100;
    const correct = state.correctIndex === i ? ' ✓' : '';
    return `
      <div class="bar-row" data-i="${i}">
        <span class="bar-label"></span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${w}%">${count}${correct}</div>
        </div>
        <span style="flex:0 0 40%;text-align:left;font-size:14px">${esc(c.text)}</span>
      </div>`;
  }).join('');
}

function renderQuestion(state) {
  const q = state.question;
  if (!q) return;
  document.getElementById('qProgress').textContent =
    `Question ${state.questionIndex + 1} of ${state.totalQuestions}`;
  document.getElementById('hostQuestionText').textContent = q.text;
  const media = document.getElementById('hostMedia');
  if (q.mediaUrl) {
    media.hidden = false;
    renderMedia(media, q.mediaUrl, q.mediaType);
  } else media.hidden = true;

  const skipBtn = document.getElementById('skipBtn');
  const nextBtn = document.getElementById('nextBtn');
  const answered = document.getElementById('hostAnswered');
  const chart = document.getElementById('hostBarChart');

  if (state.phase === 'question') {
    skipBtn.hidden = false;
    nextBtn.hidden = true;
    chart.hidden = true;
    answered.textContent = `${state.answeredCount ?? 0} / ${state.playerCount} answered`;
    runTimer(state.questionTimeSec || 20);
  } else if (state.phase === 'reveal') {
    stopTimer();
    document.getElementById('hostTimer').style.width = '0%';
    skipBtn.hidden = true;
    nextBtn.hidden = false;
    answered.textContent = 'Results';
    renderBarChart(state);
  }
}

function renderLeaderboard(listEl, players, title) {
  document.getElementById('lbTitle').textContent = title;
  listEl.innerHTML = players.slice(0, 10).map((p, i) =>
    `<li><span class="rank">${i + 1}</span><span>${esc(p.nickname)}</span><span class="score">${p.score}</span></li>`
  ).join('');
}

socket.on('room:update', (state) => {
  showPhase(state.phase);
  if (state.phase === 'lobby') renderLobby(state);
  if (state.phase === 'question' || state.phase === 'reveal') renderQuestion(state);
  if (state.phase === 'leaderboard') {
    stopTimer();
    renderLeaderboard(document.getElementById('hostLeaderboard'), state.players, 'Leaderboard');
  }
  if (state.phase === 'finished') {
    stopTimer();
    renderLeaderboard(document.getElementById('finalLeaderboard'), state.players, 'Final leaderboard');
  }
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  socket.emit('host:start-game');
});

document.getElementById('skipBtn').addEventListener('click', () => {
  socket.emit('host:skip-timer');
});

document.getElementById('nextBtn').addEventListener('click', () => {
  socket.emit('host:next');
});

document.getElementById('lbNextBtn').addEventListener('click', () => {
  socket.emit('host:next');
});

document.getElementById('endGameBtn').addEventListener('click', () => {
  socket.emit('host:end-game');
  location.href = '/';
});

const preselect = qs('quiz');
loadQuizPicker().then(() => {
  if (preselect) startHosting(preselect, '');
}).catch(() => {
  document.getElementById('hostEmpty').textContent = 'Run: cd livequiz && npm start';
  document.getElementById('hostEmpty').hidden = false;
});
