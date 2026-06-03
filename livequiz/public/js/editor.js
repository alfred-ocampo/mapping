import { api, qs, toast, renderMedia } from './shared.js';

const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];

let quiz = {
  id: null,
  title: '',
  description: '',
  questions: [newQuestion()],
};

let activeIndex = 0;
let uploadBusy = false;

function newQuestion() {
  return {
    text: '',
    mediaUrl: null,
    mediaType: null,
    timeSec: 20,
    correctIndex: 0,
    choices: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  };
}

const els = {
  title: document.getElementById('quizTitle'),
  desc: document.getElementById('quizDesc'),
  nav: document.getElementById('questionNav'),
  qText: document.getElementById('qText'),
  qTime: document.getElementById('qTime'),
  choices: document.getElementById('choicesEditor'),
  mediaFile: document.getElementById('mediaFile'),
  mediaPreview: document.getElementById('mediaPreview'),
  clearMedia: document.getElementById('clearMediaBtn'),
};

function current() {
  return quiz.questions[activeIndex];
}

function renderNav() {
  els.nav.innerHTML = '';
  quiz.questions.forEach((q, i) => {
    const li = document.createElement('li');
    li.textContent = q.text.trim() || `Question ${i + 1}`;
    li.classList.toggle('active', i === activeIndex);
    li.addEventListener('click', () => {
      syncFromForm();
      activeIndex = i;
      renderForm();
      renderNav();
    });
    els.nav.appendChild(li);
  });
}

function renderChoices() {
  const q = current();
  els.choices.innerHTML = '';
  q.choices.forEach((choice, i) => {
    const row = document.createElement('div');
    row.className = 'choice-row';
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'choice-dot' + (q.correctIndex === i ? ' correct' : '');
    dot.dataset.i = String(i);
    dot.setAttribute('aria-label', `Mark choice ${i + 1} as correct`);
    dot.addEventListener('click', () => {
      q.correctIndex = i;
      renderChoices();
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.value = choice.text;
    input.placeholder = `Answer ${i + 1}`;
    input.maxLength = 120;
    input.addEventListener('input', () => {
      choice.text = input.value;
      renderNav();
    });
    row.appendChild(dot);
    row.appendChild(input);
    els.choices.appendChild(row);
  });
}

function renderMediaBlock() {
  const q = current();
  if (q.mediaUrl) {
    els.mediaPreview.hidden = false;
    els.clearMedia.hidden = false;
    renderMedia(els.mediaPreview, q.mediaUrl, q.mediaType);
  } else {
    els.mediaPreview.hidden = true;
    els.clearMedia.hidden = true;
    els.mediaPreview.innerHTML = '';
  }
}

function renderForm() {
  const q = current();
  els.qText.value = q.text;
  els.qTime.value = q.timeSec || 20;
  renderChoices();
  renderMediaBlock();
  els.mediaFile.value = '';
}

function syncFromForm() {
  const q = current();
  q.text = els.qText.value;
  q.timeSec = Math.min(120, Math.max(5, Number(els.qTime.value) || 20));
}

document.getElementById('addQuestionBtn').addEventListener('click', () => {
  syncFromForm();
  quiz.questions.push(newQuestion());
  activeIndex = quiz.questions.length - 1;
  renderNav();
  renderForm();
});

document.getElementById('deleteQuestionBtn').addEventListener('click', () => {
  if (quiz.questions.length <= 1) {
    toast('Keep at least one question');
    return;
  }
  quiz.questions.splice(activeIndex, 1);
  activeIndex = Math.min(activeIndex, quiz.questions.length - 1);
  renderNav();
  renderForm();
});

document.getElementById('addChoiceBtn').addEventListener('click', () => {
  const q = current();
  if (q.choices.length >= 4) return;
  q.choices.push({ text: '' });
  renderChoices();
});

els.clearMedia.addEventListener('click', () => {
  const q = current();
  q.mediaUrl = null;
  q.mediaType = null;
  renderMediaBlock();
});

els.mediaFile.addEventListener('change', async () => {
  const file = els.mediaFile.files?.[0];
  if (!file || uploadBusy) return;
  uploadBusy = true;
  try {
    const fd = new FormData();
    fd.append('media', file);
    const res = await api('/api/upload', { method: 'POST', body: fd });
    const q = current();
    q.mediaUrl = res.url;
    q.mediaType = res.mediaType;
    renderMediaBlock();
    toast('Media uploaded');
  } catch (e) {
    toast(e.message || 'Upload failed');
  } finally {
    uploadBusy = false;
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  syncFromForm();
  quiz.title = els.title.value.trim() || 'Untitled Quiz';
  quiz.description = els.desc.value.trim();
  const invalid = quiz.questions.find((q) => !q.text.trim());
  if (invalid) {
    toast('Every question needs text');
    return;
  }
  try {
    const saved = await api('/api/quizzes', { method: 'POST', body: quiz });
    quiz.id = saved.id;
    history.replaceState(null, '', `?id=${quiz.id}`);
    toast('Quiz saved');
  } catch (e) {
    toast(e.message || 'Save failed');
  }
});

async function loadQuiz(id) {
  const data = await api(`/api/quizzes/${id}`);
  quiz = {
    id: data.id,
    title: data.title,
    description: data.description || '',
    questions: data.questions?.length ? data.questions : [newQuestion()],
  };
  els.title.value = quiz.title;
  els.desc.value = quiz.description;
  renderNav();
  renderForm();
}

const id = qs('id');
if (id) loadQuiz(id).catch(() => toast('Could not load quiz'));
else {
  renderNav();
  renderForm();
}
