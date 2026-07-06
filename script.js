/* ============================================================
   UPSC Dynamic Quiz Platform - script.js
   Loads questions.json, runs the quiz, then renders the
   full analytics dashboard after submission.
   ============================================================ */

let CONFIG = null;
let QUESTIONS = [];
let current = 0;
let answers = {};      // { qId: { selected, timeSpent } }
let flags = new Set();
let visited = new Set();
let submitted = false;

let elapsedSeconds = 0;
let countdownTimer = null;
let questionStartTs = null;

const HISTORY_KEY = "upsc_quiz_history_v1";

function getQuizFileName() {
  const params = new URLSearchParams(window.location.search);
  const quizParam = params.get('quiz');
  return quizParam || 'SET-A.json';
}

/* ---------------- Boot ---------------- */
init();

async function init() {
  try {
    const quizFile = getQuizFileName();
    const res = await fetch(quizFile);
    const data = await res.json();
    // Support two formats for questions.json:
    // 1) { examConfig: {...}, questions: [...] }
    // 2) [ {...}, {...} ]  (array of question objects)
    if (Array.isArray(data)) {
      QUESTIONS = data;
      CONFIG = {
        examName: "UPSC प्रारंभिक परीक्षा",
        timeLimitMinutes: 60,
        marksPerCorrect: 2,
        negativeMarkPerWrong: 2/3
      };
    } else {
      CONFIG = data.examConfig || {};
      QUESTIONS = data.questions || [];
    }
  } catch (err) {
    document.getElementById("quizView").innerHTML =
      "<p style='padding:30px;text-align:center;color:#c0392b;'>questions.json लोड नहीं हो सका। नोट: फ़ाइल को सीधे डबल-क्लिक से खोलने पर ब्राउज़र fetch() को ब्लॉक कर सकता है (CORS) — कृपया इसे किसी लोकल सर्वर (जैसे VS Code 'Live Server') से खोलें।<br><br>Could not load questions.json. If you opened this file directly, your browser may block fetch() due to CORS — please serve it via a local server (e.g. VS Code 'Live Server' or `python -m http.server`).</p>";
    console.error(err);
    return;
  }

  const quizTitle = getQuizFileName().replace(/\.json$/i, '');
  document.getElementById("examName").textContent = CONFIG.examName || quizTitle;
  elapsedSeconds = 0;

  buildPalette();
  renderQuestion();
  startTimer();
  bindEvents();
}

/* ---------------- Timer ---------------- */
function startTimer() {
  updateTimerDisplay();
  countdownTimer = setInterval(() => {
    elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay() {
  const h = Math.floor(elapsedSeconds / 3600);
  const m = Math.floor((elapsedSeconds % 3600) / 60);
  const s = elapsedSeconds % 60;
  document.getElementById("timerDisplay").textContent =
    [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

function markQuestionTimeSpent() {
  if (questionStartTs === null) return;
  const q = QUESTIONS[current];
  const elapsed = (Date.now() - questionStartTs) / 1000;
  const entry = answers[q.id] || { selected: null, timeSpent: 0 };
  entry.timeSpent = (entry.timeSpent || 0) + elapsed;
  answers[q.id] = entry;
}

/* ---------------- Sidebar / palette ---------------- */
function buildPalette() {
  const grid = document.getElementById("paletteGrid");
  grid.innerHTML = "";
  QUESTIONS.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.className = "palette-cell";
    btn.textContent = idx + 1;
    btn.dataset.idx = idx;
    btn.addEventListener("click", () => {
      goToQuestion(idx);
      closeSidebar();
    });
    grid.appendChild(btn);
  });
  refreshPalette();
}

function refreshPalette() {
  const cells = document.querySelectorAll(".palette-cell");
  cells.forEach((cell, idx) => {
    const q = QUESTIONS[idx];
    const isAnswered = answers[q.id] && answers[q.id].selected;
    const isFlagged = flags.has(q.id);
    const isVisited = visited.has(q.id);

    cell.className = "palette-cell";
    if (idx === current) cell.classList.add("current");

    if (isFlagged && isAnswered) cell.classList.add("flagged-answered");
    else if (isFlagged) cell.classList.add("flagged");
    else if (isAnswered) cell.classList.add("answered");
    else if (isVisited) cell.classList.add("not-answered");
  });
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("show");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("show");
}

/* ---------------- Rendering a question ---------------- */
function renderQuestion() {
  const q = QUESTIONS[current];
  visited.add(q.id);
  questionStartTs = Date.now();

  document.getElementById("qIndexLabel").textContent =
    `प्रश्न ${current + 1} / Q${current + 1} of ${QUESTIONS.length}`;
  document.getElementById("qSubjectTag").textContent = `${q.subject} • ${q.difficulty}`;

  // Passage
  const passageBlock = document.getElementById("passageBlock");
  if (q.passage) {
    passageBlock.style.display = "block";
    passageBlock.querySelector(".passage-hi").textContent = q.passage.hi;
    passageBlock.querySelector(".passage-en").textContent = q.passage.en;
  } else {
    passageBlock.style.display = "none";
  }

  // Statements
  const stmtBlock = document.getElementById("statementsBlock");
  if (q.statements && q.statements.length) {
    stmtBlock.style.display = "block";
    stmtBlock.innerHTML = "<ol>" + q.statements.map(s =>
      `<li>${s.hi}<span class="stmt-en">${s.en}</span></li>`
    ).join("") + "</ol>";
  } else {
    stmtBlock.style.display = "none";
  }

  document.getElementById("questionHi").textContent = q.question.hi;
  document.getElementById("questionEn").textContent = q.question.en;

  const optBlock = document.getElementById("optionsBlock");
  optBlock.innerHTML = "";
  const savedSelection = answers[q.id] ? answers[q.id].selected : null;

  q.options.forEach(opt => {
    const label = document.createElement("label");
    label.className = "option" + (savedSelection === opt.id ? " selected" : "");
    label.innerHTML = `
      <input type="radio" name="opt" value="${opt.id}" ${savedSelection === opt.id ? "checked" : ""}>
      <span>
        <span class="opt-text-hi">${opt.id}. ${opt.hi}</span>
        <span class="opt-text-en">${opt.en}</span>
      </span>`;
    label.querySelector("input").addEventListener("change", () => selectOption(q.id, opt.id));
    optBlock.appendChild(label);
  });

  // Flag button state
  const flagBtn = document.getElementById("flagBtn");
  flagBtn.classList.toggle("selected", flags.has(q.id));
  flagBtn.textContent = flags.has(q.id) ? "🚩 अनफ्लैग करें / Unflag" : "🚩 Flag / फ्लैग करें";

  // Prev button disabled on first question
  document.getElementById("prevBtn").disabled = current === 0;

  refreshPalette();
}

function selectOption(qId, optId) {
  answers[qId] = answers[qId] || { selected: null, timeSpent: 0 };
  answers[qId].selected = optId;
  // update UI without full re-render (keep options changeable freely)
  document.querySelectorAll("#optionsBlock .option").forEach(el => {
    const input = el.querySelector("input");
    el.classList.toggle("selected", input.value === optId);
  });
  refreshPalette();
}

function goToQuestion(idx) {
  markQuestionTimeSpent();
  current = idx;
  renderQuestion();
}

/* ---------------- Nav events ---------------- */
function bindEvents() {
  document.getElementById("hamburgerBtn").addEventListener("click", openSidebar);
  document.getElementById("closeSidebarBtn").addEventListener("click", closeSidebar);
  document.getElementById("sidebarOverlay").addEventListener("click", closeSidebar);

  document.getElementById("flagBtn").addEventListener("click", () => {
    const q = QUESTIONS[current];
    markQuestionTimeSpent();
    if (flags.has(q.id)) flags.delete(q.id); else flags.add(q.id);
    renderQuestion();
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    const q = QUESTIONS[current];
    markQuestionTimeSpent();
    if (answers[q.id]) answers[q.id].selected = null;
    renderQuestion();
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (current > 0) goToQuestion(current - 1);
  });

  document.getElementById("saveNextBtn").addEventListener("click", () => {
    if (current < QUESTIONS.length - 1) {
      goToQuestion(current + 1);
    } else {
      markQuestionTimeSpent();
      refreshPalette();
    }
  });

  document.getElementById("endTestBtn").addEventListener("click", () => {
    if (confirm("क्या आप वाकई क्विज़ सबमिट करना चाहते हैं? / Are you sure you want to submit the quiz?")) {
      submitQuiz(false);
    }
  });

  document.getElementById("restartBtn").addEventListener("click", () => location.reload());
}

/* ---------------- Submission ---------------- */
function submitQuiz(auto) {
  if (submitted) return;
  submitted = true;
  markQuestionTimeSpent();
  clearInterval(countdownTimer);
  closeSidebar();

  document.getElementById("quizView").style.display = "none";
  document.querySelector(".topbar").style.display = "none";

  const metrics = computeMetrics();
  saveHistory(metrics);
  try {
    renderDashboard(metrics);
    document.getElementById("dashboardError").style.display = "none";
  } catch (err) {
    console.error("Error rendering dashboard:", err);
    const el = document.getElementById("dashboardError");
    el.textContent = `Error rendering dashboard: ${err && err.message ? err.message : err}`;
    el.style.display = "block";
  }

  document.getElementById("dashboardView").style.display = "block";
  window.scrollTo(0, 0);
}

/* ---------------- Analytics ---------------- */
function computeMetrics() {
  const total = QUESTIONS.length;
  let correct = 0, incorrect = 0, attempted = 0;
  let totalTimeSpent = 0;

  const perQuestion = QUESTIONS.map(q => {
    const a = answers[q.id];
    const wasAttempted = !!(a && a.selected);
    const isCorrect = wasAttempted && a.selected === q.correctAnswer;
    if (wasAttempted) attempted++;
    if (isCorrect) correct++;
    else if (wasAttempted) incorrect++;
    const timeSpent = a ? Math.round(a.timeSpent || 0) : 0;
    totalTimeSpent += timeSpent;
    return {
      q, wasAttempted, isCorrect,
      selected: wasAttempted ? a.selected : null,
      timeSpent
    };
  });

  const unattempted = total - attempted;
  const marksPerCorrect = CONFIG.marksPerCorrect;
  const negPerWrong = CONFIG.negativeMarkPerWrong;
  const finalScore = +(correct * marksPerCorrect - incorrect * negPerWrong).toFixed(2);
  const maxScore = total * marksPerCorrect;
  const percentage = +((finalScore / maxScore) * 100).toFixed(1);
  const accuracy = attempted ? +((correct / attempted) * 100).toFixed(1) : 0;
  const marksWithoutNegative = correct * marksPerCorrect;
  const negativeDeducted = +(incorrect * negPerWrong).toFixed(2);
  const avgTimePerQ = attempted ? Math.round(totalTimeSpent / attempted) : 0;

  // subject-wise
  const subjects = {};
  perQuestion.forEach(r => {
    const s = r.q.subject;
    subjects[s] = subjects[s] || { total: 0, attempted: 0, correct: 0 };
    subjects[s].total++;
    if (r.wasAttempted) subjects[s].attempted++;
    if (r.isCorrect) subjects[s].correct++;
  });

  // difficulty-wise
  const difficulties = { Easy: { correct: 0, incorrect: 0, skipped: 0 }, Medium: { correct: 0, incorrect: 0, skipped: 0 }, Hard: { correct: 0, incorrect: 0, skipped: 0 } };
  perQuestion.forEach(r => {
    const d = difficulties[r.q.difficulty] || (difficulties[r.q.difficulty] = { correct: 0, incorrect: 0, skipped: 0 });
    if (!r.wasAttempted) d.skipped++;
    else if (r.isCorrect) d.correct++;
    else d.incorrect++;
  });

  // topic-wise
  const topics = {};
  perQuestion.forEach(r => {
    const t = r.q.topic;
    topics[t] = topics[t] || { total: 0, attempted: 0, correct: 0 };
    topics[t].total++;
    if (r.wasAttempted) topics[t].attempted++;
    if (r.isCorrect) topics[t].correct++;
  });

  return {
    total, attempted, correct, incorrect, unattempted,
    finalScore, maxScore, percentage, accuracy,
    marksWithoutNegative, negativeDeducted, avgTimePerQ,
    totalTimeSpent, perQuestion, subjects, difficulties, topics
  };
}

function saveHistory(metrics) {
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { hist = []; }
  hist.push({ date: new Date().toISOString(), score: metrics.finalScore, percentage: metrics.percentage });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-20)));
  metrics.history = hist;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}m ${s}s`;
}

/* ---------------- Dashboard rendering ---------------- */
function renderDashboard(m) {
  renderScorecard(m);
  renderCharts(m);
  renderTimeQuestionList(m);
  renderHeatmap(m);
  renderInsights(m);
  renderAnswerSheet(m);
}

function renderScorecard(m) {
  const rankInfo = (() => {
    if (m.history.length < 2) return "पहला प्रयास / First attempt";
    const past = m.history.slice(0, -1);
    const better = past.filter(h => h.score < m.finalScore).length;
    return `${better}/${past.length} पिछले प्रयासों से बेहतर`;
  })();

  const tiles = [
    ["कुल प्रश्न / Total", m.total],
    ["हल किए / Attempted", m.attempted],
    ["सही / Correct", m.correct],
    ["गलत / Incorrect", m.incorrect],
    ["छोड़े गए / Unattempted", m.unattempted],
    ["अंतिम अंक / Final Score", `${m.finalScore} / ${m.maxScore}`],
    ["प्रतिशत / Percentage", `${m.percentage}%`],
    ["सटीकता / Accuracy", `${m.accuracy}%`],
    ["तुलना / Rank Trend", rankInfo],
    ["कुल समय / Time Taken", fmtTime(m.totalTimeSpent)],
    ["औसत समय/प्रश्न / Avg Time", `${m.avgTimePerQ}s`],
    ["माइनस मार्किंग / Negative", `-${m.negativeDeducted}`],
    ["बिना निगेटिव / W/o Negative", m.marksWithoutNegative]
  ];

  document.getElementById("scorecardGrid").innerHTML = tiles.map(([lbl, val]) => `
    <div class="score-tile"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>
  `).join("");
}

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  if (parent) parent.appendChild(el);
  return el;
}

function shortenLabel(label, maxLen = 16) {
  if (!label) return label;
  return label.length > maxLen ? `${label.slice(0, maxLen)}…` : label;
}

function createSvgChart(containerId, width = 320, height = 240) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height: "100%", class: "chart-svg" }, container);
  return svg;
}

function renderFallbackBarChart(containerId, labels, values, colors = [], horizontal = false) {
  const displayLabels = labels.map(label => shortenLabel(label, 12));
  const svgHeight = Math.max(240, displayLabels.length * 24 + 70);
  const svg = createSvgChart(containerId, 320, svgHeight);
  if (!svg) return;
  const maxValue = Math.max(...values, 1);
  const chartW = 260;
  const chartH = Math.max(160, svgHeight - 72);
  const left = 34;
  const top = 24;
  const bottom = top + chartH;
  svgEl("rect", { x: 18, y: 12, width: 286, height: svgHeight - 24, rx: 8, fill: "#fff", stroke: "#e2ddca", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: bottom, x2: left + chartW, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);

  const getTextColor = (color) => (color === "#0a1f44" || color === "#1e8e3e" ? "#fff" : "#233");

  if (horizontal) {
    const barHeight = 12;
    const gap = 8;
    displayLabels.forEach((label, index) => {
      const barW = (values[index] / maxValue) * (chartW - 10);
      const y = top + 12 + index * (barHeight + gap);
      const fill = colors[index] || "#0a1f44";
      svgEl("rect", { x: left + 2, y, width: barW, height: barHeight, rx: 4, fill }, svg);
      svgEl("text", { x: left + 2, y: y + 9, "font-size": 8, fill: getTextColor(fill), "text-anchor": "start" }, svg).textContent = label;
      svgEl("text", { x: left + barW + 8, y: y + 9, "font-size": 8, fill: "#233" }, svg).textContent = `${values[index]}%`;
      svgEl("line", { x1: left + 2, y1: y - 2, x2: left + 2, y2: y + barHeight + 2, stroke: "#d9d2bc", "stroke-width": 0.6 }, svg);
    });
  } else {
    const groupW = chartW / displayLabels.length;
    const barW = Math.max(18, groupW * 0.45);
    displayLabels.forEach((label, index) => {
      const x = left + index * groupW + (groupW - barW) / 2;
      const barH = (values[index] / maxValue) * (chartH - 20);
      const y = bottom - barH;
      const fill = colors[index] || "#0a1f44";
      svgEl("rect", { x, y, width: barW, height: barH, rx: 4, fill }, svg);
      svgEl("text", { x: x + barW / 2, y: bottom + 16, "font-size": 8, fill: "#233", "text-anchor": "middle" }, svg).textContent = label;
      svgEl("text", { x: x + barW / 2, y: y - 6, "font-size": 9, fill: "#233", "text-anchor": "middle" }, svg).textContent = values[index];
    });
  }
}

function renderFallbackStackedBarChart(containerId, labels, datasets) {
  const svg = createSvgChart(containerId);
  if (!svg) return;
  const chartW = 260;
  const chartH = 170;
  const left = 34;
  const top = 24;
  const bottom = top + chartH;
  const totals = labels.map((_, idx) => datasets.reduce((sum, ds) => sum + (ds.data[idx] || 0), 0));
  const maxTotal = Math.max(...totals, 1);
  svgEl("rect", { x: 18, y: 12, width: 286, height: 206, rx: 8, fill: "#fff", stroke: "#e2ddca", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: bottom, x2: left + chartW, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  const groupW = chartW / labels.length;
  const barW = Math.max(18, groupW * 0.5);
  labels.forEach((label, index) => {
    const x = left + index * groupW + (groupW - barW) / 2;
    const total = totals[index];
    const h = (total / maxTotal) * (chartH - 20);
    const y = bottom - h;
    let cursorY = y;
    datasets.forEach((ds) => {
      const value = ds.data[index] || 0;
      const segH = total ? (value / total) * h : 0;
      svgEl("rect", { x, y: cursorY, width: barW, height: segH, rx: 4, fill: ds.color || "#0a1f44" }, svg);
      cursorY += segH;
    });
    svgEl("text", { x: x + barW / 2, y: bottom + 16, "font-size": 9, fill: "#233", "text-anchor": "middle" }, svg).textContent = label.length > 10 ? `${label.slice(0, 10)}...` : label;
  });
}

function renderFallbackLineChart(containerId, labels, values, color, showAverage = false) {
  const svg = createSvgChart(containerId);
  if (!svg) return;
  const chartW = 260;
  const chartH = 170;
  const left = 34;
  const top = 24;
  const bottom = top + chartH;
  const maxValue = Math.max(...values, 1);
  const avgValue = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  svgEl("rect", { x: 18, y: 12, width: 286, height: 206, rx: 8, fill: "#fff", stroke: "#e2ddca", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: bottom, x2: left + chartW, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  if (showAverage) {
    const avgY = bottom - (avgValue / maxValue) * (chartH - 20);
    svgEl("line", { x1: left, y1: avgY, x2: left + chartW, y2: avgY, stroke: "#c0392b", "stroke-width": 1, "stroke-dasharray": "4 4" }, svg);
    svgEl("text", { x: left + chartW - 4, y: avgY - 6, "font-size": 9, fill: "#c0392b", "text-anchor": "end" }, svg).textContent = `Avg ${Math.round(avgValue)}s`;
  }
  const points = values.map((value, index) => {
    const x = left + (index / Math.max(values.length - 1, 1)) * chartW;
    const y = bottom - (value / maxValue) * (chartH - 20);
    return { x, y, value, label: labels[index] };
  });
  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");
  svgEl("polyline", { points: polylinePoints, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  points.forEach((p, index) => {
    const isSlowest = p.value === Math.max(...values);
    svgEl("circle", { cx: p.x, cy: p.y, r: isSlowest ? 4.5 : 3.2, fill: isSlowest ? "#c0392b" : color }, svg);
    if (index % 6 === 0 || index === points.length - 1 || isSlowest) {
      svgEl("text", { x: p.x, y: bottom + 16, "font-size": 7.5, fill: "#233", "text-anchor": "middle" }, svg).textContent = p.label;
    }
    if (isSlowest) {
      svgEl("text", { x: p.x + 8, y: p.y - 8, "font-size": 8, fill: "#c0392b" }, svg).textContent = `Slowest ${p.value}s`;
    }
  });
}

function renderFallbackScatterChart(containerId, points) {
  const svg = createSvgChart(containerId);
  if (!svg) return;
  const chartW = 260;
  const chartH = 170;
  const left = 34;
  const top = 24;
  const bottom = top + chartH;
  svgEl("rect", { x: 18, y: 12, width: 286, height: 206, rx: 8, fill: "#fff", stroke: "#e2ddca", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: bottom, x2: left + chartW, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  svgEl("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "#334", "stroke-width": 1 }, svg);
  const idealLineY = bottom - (100 / 100) * (chartH - 20);
  svgEl("line", { x1: left, y1: bottom, x2: left + chartW, y2: top + 8, stroke: "#c9a227", "stroke-width": 1, "stroke-dasharray": "4 4" }, svg);
  svgEl("text", { x: left + chartW - 4, y: top + 12, "font-size": 8, fill: "#c9a227", "text-anchor": "end" }, svg).textContent = "Ideal line";
  points.forEach((p) => {
    const x = left + (p.x / 100) * chartW;
    const y = bottom - (p.y / 100) * (chartH - 20);
    const fill = p.y >= 70 ? "#1e8e3e" : p.y >= 45 ? "#c9a227" : "#c0392b";
    svgEl("circle", { cx: x, cy: y, r: 5, fill }, svg);
    svgEl("text", { x, y: y - 8, "font-size": 8, fill: "#233", "text-anchor": "middle" }, svg).textContent = p.label.length > 8 ? `${p.label.slice(0, 8)}...` : p.label;
  });
}

function renderFallbackPieChart(containerId, labels, values, colors) {
  const svg = createSvgChart(containerId);
  if (!svg) return;
  const cx = 130;
  const cy = 125;
  const r = 70;
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  let startAngle = -90;
  values.forEach((value, index) => {
    const angle = (value / total) * 360;
    const endAngle = startAngle + angle;
    const start = {
      x: cx + r * Math.cos((startAngle * Math.PI) / 180),
      y: cy + r * Math.sin((startAngle * Math.PI) / 180)
    };
    const end = {
      x: cx + r * Math.cos((endAngle * Math.PI) / 180),
      y: cy + r * Math.sin((endAngle * Math.PI) / 180)
    };
    const largeArc = angle > 180 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
    svgEl("path", { d: path, fill: colors[index] || "#0a1f44" }, svg);
    const midAngle = (startAngle + endAngle) / 2;
    const labelX = cx + (r * 0.68) * Math.cos((midAngle * Math.PI) / 180);
    const labelY = cy + (r * 0.68) * Math.sin((midAngle * Math.PI) / 180);
    const pct = total ? Math.round((value / total) * 100) : 0;
    svgEl("text", { x: labelX, y: labelY, "font-size": 8, fill: "#fff", "text-anchor": "middle" }, svg).textContent = `${pct}%`;
    startAngle = endAngle;
  });
  svgEl("circle", { cx, cy, r: 28, fill: "#fff", stroke: "#e2ddca", "stroke-width": 1 }, svg);
  svgEl("text", { x: cx, y: cy - 4, "font-size": 11, fill: "#233", "text-anchor": "middle" }, svg).textContent = "Total";
  svgEl("text", { x: cx, y: cy + 12, "font-size": 10, fill: "#233", "text-anchor": "middle" }, svg).textContent = total;
  const legendY = 34;
  labels.forEach((label, index) => {
    const y = legendY + index * 16;
    svgEl("rect", { x: 220, y, width: 10, height: 10, fill: colors[index] || "#0a1f44" }, svg);
    svgEl("text", { x: 236, y: y + 9, "font-size": 9, fill: "#233" }, svg).textContent = label.length > 12 ? `${label.slice(0, 12)}...` : label;
  });
}

function renderTimeQuestionList(m) {
  const box = document.getElementById("timeQuestionList");
  const detailList = document.getElementById("timeDetailList");
  if (!box && !detailList) return;
  const rows = m.perQuestion.map((r, index) => {
    const q = r.q;
    return `<div class="time-list-item"><span>Q${index + 1} — ${q.topic}</span><span>${r.timeSpent}s</span></div>`;
  }).join("");
  if (box) box.innerHTML = `<div class="time-list-title">सभी प्रश्नों का समय / All Questions Time</div>${rows}`;
  if (detailList) detailList.innerHTML = `<div class="time-list-title">सभी प्रश्नों का समय / All Questions Time</div>${rows}`;
}

function renderCharts(m) {
  const goldPalette = ["#0a1f44", "#c9a227", "#1e8e3e", "#c0392b", "#6c3483", "#2e86c1", "#e67e22", "#16a085", "#8e44ad", "#27ae60"];
  const subjectLabels = Object.keys(m.subjects);
  const subjectAcc = subjectLabels.map(s => {
    const d = m.subjects[s];
    return d.attempted ? +((d.correct / d.attempted) * 100).toFixed(1) : 0;
  });

  if (typeof Chart !== "undefined") {
    const subjectChartContainer = document.getElementById("chartSubject");
    if (subjectChartContainer) {
      subjectChartContainer.style.height = `${Math.max(320, subjectLabels.length * 34 + 80)}px`;
    }
    new Chart(subjectChartContainer, {
      type: "bar",
      data: { labels: subjectLabels.map(label => shortenLabel(label, 16)), datasets: [{ label: "Accuracy %", data: subjectAcc, backgroundColor: "#0a1f44" }] },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        responsive: true,
        plugins: { legend: { display: false } },
        layout: { padding: { left: 8, right: 12, top: 4, bottom: 4 } },
        scales: {
          x: { max: 100, ticks: { color: "#233", font: { size: 10 } }, grid: { color: "#eee", drawBorder: false } },
          y: { ticks: { color: "#233", font: { size: 10 }, autoSkip: false, maxRotation: 0, minRotation: 0 }, grid: { display: false } }
        }
      }
    });
    new Chart(document.getElementById("chartPie"), {
      type: "pie",
      data: {
        labels: ["Correct", "Incorrect", "Skipped"],
        datasets: [{ data: [m.correct, m.incorrect, m.unattempted], backgroundColor: ["#1e8e3e", "#c0392b", "#9aa3b2"] }]
      }
    });
    const diffLabels = Object.keys(m.difficulties);
    new Chart(document.getElementById("chartDifficulty"), {
      type: "bar",
      data: {
        labels: diffLabels,
        datasets: [
          { label: "Correct", data: diffLabels.map(d => m.difficulties[d].correct), backgroundColor: "#1e8e3e" },
          { label: "Incorrect", data: diffLabels.map(d => m.difficulties[d].incorrect), backgroundColor: "#c0392b" },
          { label: "Skipped", data: diffLabels.map(d => m.difficulties[d].skipped), backgroundColor: "#9aa3b2" }
        ]
      },
      options: { scales: { x: { stacked: true }, y: { stacked: true } } }
    });
    new Chart(document.getElementById("chartTime"), {
      type: "line",
      data: {
        labels: m.perQuestion.map((r, i) => i + 1),
        datasets: [{ label: "Seconds", data: m.perQuestion.map(r => r.timeSpent), borderColor: "#c9a227", backgroundColor: "#c9a22733", fill: true, tension: 0.25 }]
      },
      options: { plugins: { legend: { display: false } } }
    });
    new Chart(document.getElementById("chartTrend"), {
      type: "line",
      data: {
        labels: m.history.map((h, i) => `#${i + 1}`),
        datasets: [{ label: "Percentage", data: m.history.map(h => h.percentage), borderColor: "#0a1f44", backgroundColor: "#0a1f4433", fill: true, tension: 0.2 }]
      },
      options: { plugins: { legend: { display: false } } }
    });
    const scatterData = subjectLabels.map(s => {
      const d = m.subjects[s];
      return {
        x: +((d.attempted / d.total) * 100).toFixed(1),
        y: d.attempted ? +((d.correct / d.attempted) * 100).toFixed(1) : 0,
        label: s
      };
    });
    new Chart(document.getElementById("chartScatter"), {
      type: "scatter",
      data: { datasets: [{ label: "Subjects", data: scatterData, backgroundColor: "#6c3483", pointRadius: 7 }] },
      options: {
        scales: { x: { title: { display: true, text: "Attempt %" }, max: 100 }, y: { title: { display: true, text: "Accuracy %" }, max: 100 } },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label}: attempt ${ctx.raw.x}%, acc ${ctx.raw.y}%` } }, legend: { display: false } }
      }
    });
    const buckets = { "नकारात्मक / Negative": 0, "शून्य / Zero": 0, "पूर्ण अंक / Full Marks": 0 };
    m.perQuestion.forEach(r => {
      if (!r.wasAttempted) buckets["शून्य / Zero"]++;
      else if (r.isCorrect) buckets["पूर्ण अंक / Full Marks"]++;
      else buckets["नकारात्मक / Negative"]++;
    });
    new Chart(document.getElementById("chartHistogram"), {
      type: "bar",
      data: { labels: Object.keys(buckets), datasets: [{ data: Object.values(buckets), backgroundColor: ["#c0392b", "#9aa3b2", "#1e8e3e"] }] },
      options: { plugins: { legend: { display: false } } }
    });
    new Chart(document.getElementById("chartSubjectPie"), {
      type: "pie",
      data: { labels: subjectLabels, datasets: [{ data: subjectLabels.map(s => m.subjects[s].total), backgroundColor: goldPalette }] }
    });
    return;
  }

  const subjectColors = subjectAcc.map(acc => acc >= 70 ? "#1e8e3e" : acc >= 40 ? "#c9a227" : "#c0392b");
  renderFallbackBarChart("chartSubject", subjectLabels, subjectAcc, subjectColors, true);

  const pieLabels = ["Correct", "Incorrect", "Skipped"];
  renderFallbackPieChart("chartPie", pieLabels, [m.correct, m.incorrect, m.unattempted], ["#1e8e3e", "#c0392b", "#9aa3b2"]);

  const diffLabels = Object.keys(m.difficulties);
  renderFallbackStackedBarChart("chartDifficulty", diffLabels, [
    { data: diffLabels.map(d => m.difficulties[d].correct), color: "#1e8e3e" },
    { data: diffLabels.map(d => m.difficulties[d].incorrect), color: "#c0392b" },
    { data: diffLabels.map(d => m.difficulties[d].skipped), color: "#9aa3b2" }
  ]);

  renderFallbackLineChart("chartTime", m.perQuestion.map((r, i) => `Q${i + 1}`), m.perQuestion.map(r => r.timeSpent), "#c9a227", true);
  renderFallbackLineChart("chartTrend", m.history.map((h, i) => `#${i + 1}`), m.history.map(h => h.percentage), "#0a1f44");

  const scatterData = subjectLabels.map(s => {
    const d = m.subjects[s];
    return { x: +((d.attempted / d.total) * 100).toFixed(1), y: d.attempted ? +((d.correct / d.attempted) * 100).toFixed(1) : 0, label: s };
  });
  renderFallbackScatterChart("chartScatter", scatterData);

  const buckets = { "नकारात्मक / Negative": 0, "शून्य / Zero": 0, "पूर्ण अंक / Full Marks": 0 };
  m.perQuestion.forEach(r => {
    if (!r.wasAttempted) buckets["शून्य / Zero"]++;
    else if (r.isCorrect) buckets["पूर्ण अंक / Full Marks"]++;
    else buckets["नकारात्मक / Negative"]++;
  });
  renderFallbackBarChart("chartHistogram", Object.keys(buckets), Object.values(buckets), ["#c0392b", "#9aa3b2", "#1e8e3e"]);
  renderFallbackPieChart("chartSubjectPie", subjectLabels, subjectLabels.map(s => m.subjects[s].total), goldPalette.slice(0, subjectLabels.length));

  const timeCard = document.getElementById("chartTimeCard");
  const closeTimeDetailBtn = document.getElementById("closeTimeDetailBtn");
  const detailView = document.getElementById("timeDetailView");
  const detailChart = document.getElementById("timeDetailChart");

  if (timeCard) {
    timeCard.onclick = () => {
      if (detailView) {
        detailView.style.display = "flex";
      }
      if (detailChart) {
        renderFallbackLineChart("timeDetailChart", m.perQuestion.map((r, i) => `Q${i + 1}`), m.perQuestion.map(r => r.timeSpent), "#0a1f44", true);
      }
    };
  }

  if (closeTimeDetailBtn && detailView) {
    closeTimeDetailBtn.onclick = () => {
      detailView.style.display = "none";
    };
  }
}

function renderHeatmap(m) {
  const el = document.getElementById("topicHeatmap");
  el.innerHTML = Object.entries(m.topics).map(([topic, d]) => {
    const acc = d.attempted ? Math.round((d.correct / d.attempted) * 100) : 0;
    const color = acc >= 70 ? "#1e8e3e" : acc >= 40 ? "#c9a227" : d.attempted ? "#c0392b" : "#9aa3b2";
    return `<div class="heat-cell" style="background:${color}">
      <span class="h-topic">${topic}</span>
      ${d.attempted ? acc + "% accuracy" : "not attempted"} (${d.total} Q)
    </div>`;
  }).join("");
}

function renderInsights(m) {
  // Personal insight: weakest difficulty
  const diffAcc = Object.entries(m.difficulties).map(([d, v]) => {
    const attempted = v.correct + v.incorrect;
    return [d, attempted ? Math.round((v.correct / attempted) * 100) : null];
  }).filter(([, acc]) => acc !== null);
  diffAcc.sort((a, b) => a[1] - b[1]);
  const weakestDiff = diffAcc[0];
  document.getElementById("insightPersonal").textContent = weakestDiff
    ? `${weakestDiff[0]} स्तर के प्रश्नों में आपकी सटीकता केवल ${weakestDiff[1]}% है। कुल सटीकता ${m.accuracy}% रही। / Your accuracy on ${weakestDiff[0]} questions is only ${weakestDiff[1]}%. Overall accuracy was ${m.accuracy}%.`
    : "और डेटा चाहिए / Need more attempts to generate insight.";

  // Weakest / strongest topics
  const topicList = Object.entries(m.topics).filter(([, d]) => d.attempted > 0).map(([t, d]) => [t, Math.round((d.correct / d.attempted) * 100)]);
  topicList.sort((a, b) => b[1] - a[1]);
  document.getElementById("strongTopics").innerHTML = topicList.slice(0, 5).map(([t, a]) => `<li>${t} — ${a}%</li>`).join("") || "<li>N/A</li>";
  document.getElementById("weakTopics").innerHTML = topicList.slice(-5).reverse().map(([t, a]) => `<li>${t} — ${a}%</li>`).join("") || "<li>N/A</li>";

  // Smart recommendations
  const weakSubjects = Object.entries(m.subjects)
    .map(([s, d]) => [s, d.attempted ? (d.correct / d.attempted) * 100 : 0])
    .sort((a, b) => a[1] - b[1]).slice(0, 3);
  document.getElementById("insightRecommendations").innerHTML = weakSubjects.map(([s, acc]) =>
    `<li>${s} में सटीकता ${Math.round(acc)}% है — NCERT/स्रोत सामग्री दोबारा पढ़ें। / ${s} accuracy is ${Math.round(acc)}% — revise NCERT/source material.</li>`
  ).join("");

  // Negative mark analysis
  document.getElementById("negativeAnalysisTable").innerHTML = `
    <table class="mini-table">
      <tr><th>Guessed / Wrong Attempts</th><td>${m.incorrect}</td></tr>
      <tr><th>Marks Deducted</th><td>-${m.negativeDeducted}</td></tr>
      <tr><th>% of Attempts Wrong</th><td>${m.attempted ? Math.round((m.incorrect / m.attempted) * 100) : 0}%</td></tr>
    </table>`;

  // Time efficiency
  const attemptedTimes = m.perQuestion.filter(r => r.wasAttempted);
  const fastest = [...attemptedTimes].sort((a, b) => a.timeSpent - b.timeSpent)[0];
  const slowest = [...attemptedTimes].sort((a, b) => b.timeSpent - a.timeSpent)[0];
  document.getElementById("timeEfficiencyTable").innerHTML = `
    <table class="mini-table">
      <tr><th>सबसे तेज़ / Fastest</th><td>${fastest ? `Q${QUESTIONS.findIndex(q=>q.id===fastest.q.id)+1} — ${fastest.timeSpent}s` : "N/A"}</td></tr>
      <tr><th>सबसे धीमा / Slowest</th><td>${slowest ? `Q${QUESTIONS.findIndex(q=>q.id===slowest.q.id)+1} — ${slowest.timeSpent}s` : "N/A"}</td></tr>
      <tr><th>औसत / Average</th><td>${m.avgTimePerQ}s</td></tr>
    </table>`;
}

function renderAnswerSheet(m) {
  document.getElementById("answerSheetList").innerHTML = m.perQuestion.map((r, i) => {
    const status = !r.wasAttempted ? "skipped" : r.isCorrect ? "correct" : "incorrect";
    const statusLabel = { correct: "सही / Correct", incorrect: "गलत / Incorrect", skipped: "छोड़ा गया / Skipped" }[status];
    const q = r.q;
    const optionsHtml = q.options.map(o => {
      const isCorrectOpt = o.id === q.correctAnswer;
      const isUserOpt = o.id === r.selected;
      let tagStr = "";
      if (isCorrectOpt) tagStr = " ✅";
      if (isUserOpt && !isCorrectOpt) tagStr = " ❌ (आपका उत्तर / Your answer)";
      else if (isUserOpt && isCorrectOpt) tagStr = " ✅ (आपका उत्तर / Your answer)";
      return `<div class="ans-row"><strong>${o.id}.</strong> ${o.hi} <em>(${o.en})</em>${tagStr}</div>`;
    }).join("");

    return `
      <div class="ans-item">
        <span class="tag">Q${i + 1}</span>
        <span class="ans-status ${status}">${statusLabel}</span>
        <p class="ans-q-hi">${q.question.hi}</p>
        <p class="ans-q-en">${q.question.en}</p>
        ${optionsHtml}
        <div class="ans-explain"><strong>व्याख्या / Explanation:</strong><br>${q.explanation.hi}<br><em>${q.explanation.en}</em></div>
      </div>`;
  }).join("");
}
