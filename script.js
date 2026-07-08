'use strict';

/* ======================================================================
   CONSOLE — script.js
   Everything lives in small, independent modules that each read/write
   their own slice of Local Storage. app.showFeature() is the only
   shared piece of state (which panel is currently open).
   ====================================================================== */

const LS = {
  todos: 'console.todos',
  goals: 'console.goals',
  planner: 'console.planner',
  theme: 'console.theme',
};

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================== NAVIGATION ============================== */
const Nav = (() => {
  const featureView = document.getElementById('featureView');
  const backBtn = document.getElementById('backBtn');
  const cards = document.querySelectorAll('.card[data-feature]');
  const panels = document.querySelectorAll('.feature-panel');
  let activeFeature = null;
  let isTransitioning = false;

  function open(name) {
    if (isTransitioning || activeFeature === name) return;
    isTransitioning = true;
    activeFeature = name;
    panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
    featureView.classList.add('is-open');
    featureView.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new CustomEvent('feature:open', { detail: { name } }));
    requestAnimationFrame(() => { isTransitioning = false; });
  }

  function close() {
    if (isTransitioning || !activeFeature) return;
    const prev = activeFeature;
    featureView.classList.remove('is-open');
    featureView.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeFeature = null;
    window.dispatchEvent(new CustomEvent('feature:close', { detail: { name: prev } }));
  }

  cards.forEach(card => {
    card.addEventListener('click', () => open(card.dataset.feature));
  });
  backBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  return { open, close };
})();

/* ============================== DATE & TIME ============================== */
const ClockWidget = (() => {
  const timeEl = document.getElementById('clockTime');
  const dateEl = document.getElementById('clockDate');
  let intervalId = null;

  function pad(n) { return n.toString().padStart(2, '0'); }

  function tick() {
    const now = new Date();
    timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    applyTimeband(now.getHours());
  }

  function applyTimeband(hour) {
    let band = 'day';
    if (hour >= 5 && hour < 11) band = 'morning';
    else if (hour >= 11 && hour < 17) band = 'day';
    else if (hour >= 17 && hour < 21) band = 'evening';
    else band = 'night';
    if (document.body.dataset.timeband !== band) {
      document.body.dataset.timeband = band;
    }
  }

  function init() {
    if (intervalId) return; // guard against double init
    tick();
    intervalId = setInterval(tick, 1000);
  }

  return { init };
})();

/* ============================== THEME SWITCH ============================== */
const Theme = (() => {
  const toggle = document.getElementById('themeToggle');

  function apply(theme) {
    document.body.dataset.theme = theme;
    toggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }

  function init() {
    const saved = localStorage.getItem(LS.theme) || 'dark';
    apply(saved);
    toggle.addEventListener('click', () => {
      const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next);
      localStorage.setItem(LS.theme, next);
    });
  }

  return { init };
})();

/* ============================== TODO LIST ============================== */
const TodoList = (() => {
  const form = document.getElementById('todoForm');
  const input = document.getElementById('todoInput');
  const list = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');
  const cardMeta = document.getElementById('todoCardMeta');
  let todos = safeParse(localStorage.getItem(LS.todos), []);

  function save() {
    localStorage.setItem(LS.todos, JSON.stringify(todos));
    render();
  }

  function render() {
    list.innerHTML = '';
    todos.forEach(t => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.done ? ' is-complete' : '') + (t.important ? ' is-important' : '');
      li.dataset.id = t.id;
      li.innerHTML = `
        <button class="todo-check" data-action="toggle" aria-label="Mark complete"></button>
        <span class="todo-text"></span>
        <button class="todo-star" data-action="star" aria-label="Mark important">★</button>
        <button class="todo-delete" data-action="delete" aria-label="Delete task">✕</button>
      `;
      li.querySelector('.todo-text').textContent = t.text; // textContent avoids injected HTML
      list.appendChild(li);
    });
    empty.classList.toggle('is-visible', todos.length === 0);
    const openCount = todos.filter(t => !t.done).length;
    cardMeta.textContent = `${openCount} open`;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    todos.unshift({ id: uid(), text, done: false, important: false });
    input.value = '';
    save();
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.todo-item').dataset.id;
    const t = todos.find(t => t.id === id);
    if (!t) return;
    if (btn.dataset.action === 'toggle') t.done = !t.done;
    if (btn.dataset.action === 'star') t.important = !t.important;
    if (btn.dataset.action === 'delete') todos = todos.filter(x => x.id !== id);
    save();
  });

  function init() { render(); }
  return { init };
})();

/* ============================== DAILY PLANNER ============================== */
const Planner = (() => {
  const grid = document.getElementById('plannerGrid');
  let entries = safeParse(localStorage.getItem(LS.planner), {}); // { "6": "text", ... }
  let saveTimer = null;

  function hourLabel(h) {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:00 ${period}`;
  }

  function render() {
    grid.innerHTML = '';
    const currentHour = new Date().getHours();
    for (let h = 0; h < 24; h++) {
      const row = document.createElement('div');
      row.className = 'planner-row' + (h === currentHour ? ' is-current' : '');
      row.dataset.hour = h;
      row.innerHTML = `
        <span class="planner-time"></span>
        <input type="text" class="planner-note" placeholder="Nothing planned" maxlength="120">
        <button class="planner-clear" aria-label="Clear entry">✕</button>
      `;
      row.querySelector('.planner-time').textContent = hourLabel(h);
      const noteInput = row.querySelector('.planner-note');
      noteInput.value = entries[h] || '';
      grid.appendChild(row);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => localStorage.setItem(LS.planner, JSON.stringify(entries)), 300);
  }

  grid.addEventListener('input', e => {
    if (!e.target.classList.contains('planner-note')) return;
    const hour = e.target.closest('.planner-row').dataset.hour;
    const val = e.target.value;
    if (val.trim() === '') delete entries[hour];
    else entries[hour] = val;
    scheduleSave();
  });

  grid.addEventListener('click', e => {
    if (!e.target.matches('.planner-clear')) return;
    const row = e.target.closest('.planner-row');
    const hour = row.dataset.hour;
    delete entries[hour];
    row.querySelector('.planner-note').value = '';
    scheduleSave();
  });

  function init() { render(); }
  return { init };
})();

/* ============================== MOTIVATION QUOTE ============================== */
const Motivation = (() => {
  const textEl = document.getElementById('quoteText');
  const authorEl = document.getElementById('quoteAuthor');
  const btn = document.getElementById('newQuoteBtn');

  // Local fallback set — used if the network request fails or is blocked,
  // so the card never breaks or sits blank.
  const fallbackQuotes = [
    { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Console' },
    { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Console' },
    { text: 'Done is better than perfect — ship the next small step.', author: 'Console' },
    { text: 'Focus on being productive instead of busy.', author: 'Console' },
    { text: 'Progress, not perfection.', author: 'Console' },
  ];

  function setLoading() {
    textEl.textContent = 'Fetching a quote…';
    authorEl.textContent = '';
  }

  function display(text, author) {
    textEl.textContent = text;
    authorEl.textContent = author ? `— ${author}` : '';
  }

  async function fetchQuote() {
    setLoading();
    btn.disabled = true;
    try {
      const res = await fetch('https://api.quotable.io/random');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      display(data.content, data.author);
    } catch {
      // Network/CORS failure — fall back so the UI never breaks.
      const q = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
      display(q.text, q.author);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', fetchQuote);

  function init() { fetchQuote(); }
  return { init };
})();

/* ============================== POMODORO TIMER ============================== */
const Pomodoro = (() => {
  const WORK_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;
  const CIRCUMFERENCE = 2 * Math.PI * 88; // matches SVG r=88

  const readout = document.getElementById('timerReadout');
  const gaugeProgress = document.getElementById('gaugeProgress');
  const modeLabel = document.getElementById('pomodoroModeLabel');
  const cardMeta = document.getElementById('pomodoroCardMeta');
  const startBtn = document.getElementById('timerStart');
  const pauseBtn = document.getElementById('timerPause');
  const resetBtn = document.getElementById('timerReset');

  let mode = 'work';
  let totalSeconds = WORK_SECONDS;
  let remaining = WORK_SECONDS;
  let intervalId = null;

  function format(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function render() {
    readout.textContent = format(remaining);
    cardMeta.textContent = format(remaining);
    const fraction = remaining / totalSeconds;
    gaugeProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));
    modeLabel.textContent = mode === 'work' ? 'Work session' : 'Break';
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      notifyDone();
      switchMode();
      return;
    }
    render();
  }

  function notifyDone() {
    // Non-blocking, gentle notification: sound + brief title flash.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 350);
    } catch {
      /* audio not available — silently ignore */
    }
  }

  function switchMode() {
    mode = mode === 'work' ? 'break' : 'work';
    totalSeconds = mode === 'work' ? WORK_SECONDS : BREAK_SECONDS;
    remaining = totalSeconds;
    render();
  }

  function start() {
    if (intervalId) return; // prevent multiple overlapping intervals
    intervalId = setInterval(tick, 1000);
  }
  function pause() {
    clearInterval(intervalId);
    intervalId = null;
  }
  function reset() {
    pause();
    mode = 'work';
    totalSeconds = WORK_SECONDS;
    remaining = WORK_SECONDS;
    render();
  }

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  function init() { render(); }
  return { init };
})();

/* ============================== WEATHER WIDGET ============================== */
const Weather = (() => {
  const chipIcon = document.getElementById('weatherChipIcon');
  const chipTemp = document.getElementById('weatherChipTemp');
  const cardMeta = document.getElementById('weatherCardMeta');
  const locationLabel = document.getElementById('weatherLocationLabel');
  const iconEl = document.getElementById('weatherIcon');
  const tempEl = document.getElementById('weatherTemp');
  const conditionEl = document.getElementById('weatherCondition');
  const humidityEl = document.getElementById('weatherHumidity');
  const windEl = document.getElementById('weatherWind');
  const feelsEl = document.getElementById('weatherFeels');
  const retryBtn = document.getElementById('weatherRetry');

  const DEFAULT_COORDS = { lat: 28.6139, lon: 77.2090, name: 'Delhi, IN' }; // fallback if geolocation is denied

  // Open-Meteo weather codes -> icon glyph + label
  const CODE_MAP = {
    0: ['☀', 'Clear sky'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁', 'Overcast'],
    45: ['🌫', 'Fog'], 48: ['🌫', 'Fog'],
    51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌧', 'Heavy drizzle'],
    61: ['🌧', 'Light rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'],
    71: ['🌨', 'Light snow'], 73: ['🌨', 'Snow'], 75: ['❄', 'Heavy snow'],
    80: ['🌦', 'Rain showers'], 81: ['🌧', 'Rain showers'], 82: ['⛈', 'Violent showers'],
    95: ['⛈', 'Thunderstorm'], 96: ['⛈', 'Thunderstorm w/ hail'], 99: ['⛈', 'Thunderstorm w/ hail'],
  };

  function setLoading() {
    cardMeta.textContent = 'checking…';
    locationLabel.textContent = 'Fetching your location…';
  }

  function setError(msg) {
    cardMeta.textContent = 'unavailable';
    locationLabel.textContent = msg;
    conditionEl.textContent = 'Data unavailable — try again';
  }

  async function fetchWeather(lat, lon, label) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const cur = data.current;
      const [glyph, label_] = CODE_MAP[cur.weather_code] || ['◌', 'Unknown'];

      chipIcon.textContent = glyph;
      chipTemp.textContent = `${Math.round(cur.temperature_2m)}°`;
      cardMeta.textContent = `${Math.round(cur.temperature_2m)}° ${label_}`;
      locationLabel.textContent = label;
      iconEl.textContent = glyph;
      tempEl.textContent = `${Math.round(cur.temperature_2m)}°C`;
      conditionEl.textContent = label_;
      humidityEl.textContent = `${cur.relative_humidity_2m}%`;
      windEl.textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
      feelsEl.textContent = `${Math.round(cur.apparent_temperature)}°`;
    } catch {
      setError('Could not reach the weather service. Check your connection and retry.');
    }
  }

  function locate() {
    setLoading();
    if (!navigator.geolocation) {
      fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, DEFAULT_COORDS.name + ' (default)');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeather(pos.coords.latitude, pos.coords.longitude, 'Your location'),
      () => fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, DEFAULT_COORDS.name + ' (location denied — default)'),
      { timeout: 8000 }
    );
  }

  retryBtn.addEventListener('click', locate);

  function init() { locate(); }
  return { init };
})();

/* ============================== DAILY GOALS ============================== */
const Goals = (() => {
  const form = document.getElementById('goalForm');
  const input = document.getElementById('goalInput');
  const list = document.getElementById('goalList');
  const empty = document.getElementById('goalsEmpty');
  const progressLabel = document.getElementById('goalsProgressLabel');
  const progressFill = document.getElementById('goalsProgressFill');
  const cardMeta = document.getElementById('goalsCardMeta');
  let goals = safeParse(localStorage.getItem(LS.goals), []);

  function save() {
    localStorage.setItem(LS.goals, JSON.stringify(goals));
    render();
  }

  function render() {
    list.innerHTML = '';
    goals.forEach(g => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (g.done ? ' is-complete' : '');
      li.dataset.id = g.id;
      li.innerHTML = `
        <button class="todo-check" data-action="toggle" aria-label="Mark done"></button>
        <span class="todo-text"></span>
        <button class="todo-delete" data-action="delete" aria-label="Delete goal">✕</button>
      `;
      li.querySelector('.todo-text').textContent = g.text;
      list.appendChild(li);
    });
    empty.classList.toggle('is-visible', goals.length === 0);

    const doneCount = goals.filter(g => g.done).length;
    const total = goals.length;
    progressLabel.textContent = `${doneCount} of ${total} completed`;
    cardMeta.textContent = `${doneCount} of ${total}`;
    progressFill.style.width = total ? `${(doneCount / total) * 100}%` : '0%';
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    goals.push({ id: uid(), text, done: false });
    input.value = '';
    save();
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.todo-item').dataset.id;
    if (btn.dataset.action === 'toggle') {
      const g = goals.find(g => g.id === id);
      if (g) g.done = !g.done;
    }
    if (btn.dataset.action === 'delete') {
      goals = goals.filter(g => g.id !== id);
    }
    save();
  });

  function init() { render(); }
  return { init };
})();

/* ============================== BOOT ============================== */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  ClockWidget.init();
  TodoList.init();
  Planner.init();
  Motivation.init();
  Pomodoro.init();
  Weather.init();
  Goals.init();
});
