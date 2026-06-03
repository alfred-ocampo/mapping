import { renderMedia } from './shared.js';

const socket = io();
let joined = false;
let myPlayerId = null;
let answered = false;

const joinForm = document.getElementById('joinForm');
const waitingView = document.getElementById('waitingView');
const playView = document.getElementById('playView');
const playQuestion = document.getElementById('playQuestion');
const feedbackView = document.getElementById('feedbackView');
const playLeaderboard = document.getElementById('playLeaderboard');
const playFinished = document.getElementById('playFinished');

let timerId = null;
let questionEndAt = 0;

const urlPin = new URLSearchParams(location.search).get('pin');
if (urlPin) document.getElementById('pin').value = urlPin;

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pin = document.getElementById('pin').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const err = document.getElementById('joinError');
  err.hidden = true;
  socket.emit('player:join', { pin, nickname }, (res) => {
    if (res?.error) {
      err.textContent = res.error;
      err.hidden = false;
      return;
    }
    joined = true;
    myPlayerId = res.playerId;
    joinForm.hidden = true;
    waitingView.hidden = false;
    document.getElementById('waitNick').textContent = nickname;
  });
});

function stopTimer() {
  if (timerId) cancelAnimationFrame(timerId);
  timerId = null;
}

function runTimer(sec) {
  stopTimer();
  const fill = document.getElementById('playTimer');
  questionEndAt = Date.now() + sec * 1000;
  function tick() {
    const left = Math.max(0, questionEndAt - Date.now());
    fill.style.width = `${(left / (sec * 1000)) * 100}%`;
    if (left > 0) timerId = requestAnimationFrame(tick);
  }
  tick();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function buildAnswers(q) {
  const grid = document.getElementById('answerGrid');
  grid.innerHTML = '';
  answered = false;
  q.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answer-btn';
    btn.dataset.i = String(i);
    btn.textContent = c.text;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      [...grid.children].forEach((b) => (b.disabled = true));
      btn.classList.add('selected');
      socket.emit('player:answer', { choiceIndex: i });
    });
    grid.appendChild(btn);
  });
}

function renderLb(listId, players) {
  document.getElementById(listId).innerHTML = players.slice(0, 10).map((p, i) => {
    const me = p.id === myPlayerId ? ' (you)' : '';
    return `<li><span class="rank">${i + 1}</span><span>${esc(p.nickname)}${me}</span><span class="score">${p.score}</span></li>`;
  }).join('');
}

socket.on('player:answer-result', ({ correct }) => {
  feedbackView.hidden = false;
  playQuestion.hidden = true;
  const fb = document.getElementById('feedbackText');
  fb.textContent = correct ? 'Correct!' : 'Wrong';
  fb.className = 'feedback ' + (correct ? 'correct' : 'wrong');
});

socket.on('room:update', (state) => {
  if (!joined) return;
  waitingView.hidden = state.phase !== 'lobby';
  playView.hidden = state.phase === 'lobby';
  playQuestion.hidden = !['question', 'reveal'].includes(state.phase);
  feedbackView.hidden = state.phase !== 'reveal' || !answered;
  playLeaderboard.hidden = state.phase !== 'leaderboard';
  playFinished.hidden = state.phase !== 'finished';

  if (state.phase === 'question') {
    feedbackView.hidden = true;
    const q = state.question;
    if (!q) return;
    document.getElementById('playProgress').textContent =
      `Q${state.questionIndex + 1}/${state.totalQuestions}`;
    document.getElementById('playQText').textContent = q.text;
    const media = document.getElementById('playMedia');
    if (q.mediaUrl) {
      media.hidden = false;
      renderMedia(media, q.mediaUrl, q.mediaType);
    } else media.hidden = true;
    buildAnswers(q);
    runTimer(state.questionTimeSec || 20);
  }

  if (state.phase === 'reveal') {
    stopTimer();
    document.getElementById('playTimer').style.width = '0%';
    if (!answered) {
      playQuestion.hidden = true;
      feedbackView.hidden = false;
      document.getElementById('feedbackText').textContent = 'Time\'s up!';
      document.getElementById('feedbackText').className = 'feedback wrong';
    }
  }

  if (state.phase === 'leaderboard') {
    stopTimer();
    renderLb('playLb', state.players);
  }

  if (state.phase === 'finished') {
    stopTimer();
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex((p) => p.id === myPlayerId) + 1;
    const me = sorted.find((p) => p.id === myPlayerId);
    document.getElementById('yourRank').textContent =
      rank > 0 ? `You finished #${rank} with ${me?.score ?? 0} points` : '';
    renderLb('playFinalLb', sorted);
  }
});

socket.on('room:closed', ({ message }) => {
  joinForm.hidden = true;
  playView.hidden = true;
  waitingView.hidden = true;
  const el = document.getElementById('closedMsg');
  el.textContent = message || 'Game ended';
  el.hidden = false;
});
