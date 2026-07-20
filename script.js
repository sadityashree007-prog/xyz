/* ============================================================
   UPSC Engine Core Script Update - script.js
   Supports Dynamic UPSC Layouts, Language Switching, OMR sheets
   ============================================================ */

let CONFIG = null;
let QUESTIONS = [];
let current = 0;
let answers = {};      
let flags = new Set();
let visited = new Set();
let submitted = false;

let elapsedSeconds = 0;
let countdownTimer = null;
let questionStartTs = null;
let currentLangMode = 'both'; 

const HISTORY_KEY = "upsc_quiz_history_v1";

function getQuizFileName() {
  const params = new URLSearchParams(window.location.search);
  const quizParam = params.get('quiz');
  return quizParam || 'SET-A.json';
}

/* ---------------- Language Toggle ---------------- */
function toggleLanguage() {
  const body = document.body;
  const btn = document.getElementById("langToggleBtn");
  
  if (currentLangMode === 'both') {
    currentLangMode = 'hi';
    body.className = "show-hi";
    btn.textContent = "Language: HI";
  } else if (currentLangMode === 'hi') {
    currentLangMode = 'en';
    body.className = "show-en";
    btn.textContent = "Language: EN";
  } else {
    currentLangMode = 'both';
    body.className = "show-both";
    btn.textContent = "Language: Both";
  }
}

/* ---------------- Sidebar Tab Switching (Palette / OMR) ---------------- */
function switchSidebarTab(mode) {
  const tabPalette = document.getElementById("tabPaletteBtn");
  const tabOmr = document.getElementById("tabOmrBtn");
  const paletteWrapper = document.getElementById("paletteWrapper");
  const omrWrapper = document.getElementById("omrWrapper");

  if (mode === 'palette') {
    tabPalette.classList.add("active");
    tabOmr.classList.remove("active");
    paletteWrapper.style.display = "block";
    omrWrapper.style.display = "none";
  } else {
    tabPalette.classList.remove("active");
    tabOmr.classList.add("active");
    paletteWrapper.style.display = "none";
    omrWrapper.style.display = "block";
    renderOmrSheet(); 
  }
}

/* ---------------- Boot Engine ---------------- */
init();

async function init() {
  try {
    const quizFile = getQuizFileName();
    const res = await fetch(quizFile);
    const data = await res.json();
    
    if (Array.isArray(data)) {
      QUESTIONS = data;
      CONFIG = {
        examName: "UPSC Civil Services Test",
        timeLimitMinutes: 120,
        marksPerCorrect: 2,
        negativeMarkPerWrong: 2/3
      };
    } else {
      CONFIG = data.examConfig || {};
      QUESTIONS = data.questions || [];
    }
  } catch (err) {
    document.getElementById("quizView").innerHTML =
      "<p style='padding:30px;text-align:center;color:#c0392b;'>questions.json लोड नहीं हो सका। कृपया इसे लोकल सर्वर (जैसे Live Server) से चलाएं।</p>";
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

/* ---------------- Build Palette grid ---------------- */
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

/* ---------------- Render OMR Sheet Mode ---------------- */
function renderOmrSheet() {
  const container = document.getElementById("omrSheetContainer");
  container.innerHTML = "";
  
  QUESTIONS.forEach((q, idx) => {
    const row = document.createElement("div");
    row.className = "omr-row" + (idx === current ? " current" : "");
    
    const qNum = document.createElement("span");
    qNum.className = "omr-q-num";
    qNum.textContent = `Q${idx + 1}`;
    qNum.style.cursor = "pointer";
    qNum.onclick = () => goToQuestion(idx);
    row.appendChild(qNum);
    
    const bubblesDiv = document.createElement("div");
    bubblesDiv.className = "omr-bubbles";
    
    const optionsList = ['A', 'B', 'C', 'D'];
    optionsList.forEach(optId => {
      const bubble = document.createElement("div");
      const isSelected = answers[q.id] && answers[q.id].selected === optId;
      bubble.className = "omr-bubble" + (isSelected ? " filled" : "");
      bubble.textContent = optId;
      
      bubble.onclick = () => {
        visited.add(q.id);
        selectOption(q.id, optId);
        renderOmrSheet(); 
        if(idx === current) renderQuestion(); 
      };
      bubblesDiv.appendChild(bubble);
    });
    
    row.appendChild(bubblesDiv);
    container.appendChild(row);
  });
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("show");
  if(document.getElementById("omrWrapper").style.display === "block") {
    renderOmrSheet();
  }
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("show");
}

/* ---------------- Render Main Area Question ---------------- */
function renderQuestion() {
  const q = QUESTIONS[current];
  visited.add(q.id);
  questionStartTs = Date.now();

  document.getElementById("qIndexLabel").textContent =
    `प्रश्न ${current + 1} / Q${current + 1} of ${QUESTIONS.length}`;
  document.getElementById("qSubjectTag").textContent = `${q.subject || 'GS'} • ${q.difficulty || 'Medium'}`;

  const passageBlock = document.getElementById("passageBlock");
  if (q.passage) {
    passageBlock.style.display = "block";
    passageBlock.querySelector(".passage-hi").textContent = q.passage.hi || "";
    passageBlock.querySelector(".passage-en").textContent = q.passage.en || "";
  } else {
    passageBlock.style.display = "none";
  }

  const stmtBlock = document.getElementById("statementsBlock");
  if (q.statements && q.statements.length) {
    stmtBlock.style.display = "block";
    stmtBlock.innerHTML = "<ol>" + q.statements.map(s =>
      `<li><span class="lang-hi">${s.hi}</span><span class="lang-en stmt-en">${s.en}</span></li>`
    ).join("") + "</ol>";
  } else {
    stmtBlock.style.display = "none";
  }

  document.getElementById("questionHi").textContent = q.question.hi || "";
  document.getElementById("questionEn").textContent = q.question.en || "";

  const optBlock = document.getElementById("optionsBlock");
  optBlock.innerHTML = "";
  const savedSelection = answers[q.id] ? answers[q.id].selected : null;

  q.options.forEach(opt => {
    const label = document.createElement("label");
    label.className = "option" + (savedSelection === opt.id ? " selected" : "");
    label.innerHTML = `
      <input type="radio" name="opt" value="${opt.id}" ${savedSelection === opt.id ? "checked" : ""}>
      <span>
        <span class="opt-text-hi lang-hi">${opt.id}. ${opt.hi}</span>
        <span class="opt-text-en lang-en">${opt.en}</span>
      </span>`;
    label.querySelector("input").addEventListener("change", () => selectOption(q.id, opt.id));
    optBlock.appendChild(label);
  });

  const flagBtn = document.getElementById("flagBtn");
  flagBtn.classList.toggle("selected", flags.has(q.id));
  flagBtn.textContent = flags.has(q.id) ? "🚩 Unflag" : "🚩 Flag";

  document.getElementById("prevBtn").disabled = current === 0;
  refreshPalette();
}

function selectOption(qId, optId) {
  answers[qId] = answers[qId] || { selected: null, timeSpent: 0 };
  answers[qId].selected = optId;
  
  document.querySelectorAll("#optionsBlock .option").forEach(el => {
    const input = el.querySelector("input");
    if(input) {
      el.classList.toggle("selected", input.value === optId);
    }
  });
  refreshPalette();
}

function goToQuestion(idx) {
  markQuestionTimeSpent();
  current = idx;
  renderQuestion();
}

/* ---------------- Event Binding setups ---------------- */
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
    if (confirm("क्या आप वाकई क्विज़ सबमिट करना चाहते हैं? / Submit Quiz?")) {
      submitQuiz();
    }
  });

  document.getElementById("restartBtn").addEventListener("click", () => location.reload());
}

/* ---------------- End and Dashboard Processing ---------------- */
function submitQuiz() {
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
    console.error(err);
    document.getElementById("dashboardError").textContent = `Error processing dashboards: ${err.message}`;
    document.getElementById("dashboardError").style.display = "block";
  }

  document.getElementById("dashboardView").style.display = "block";
  window.scrollTo(0, 0);
}

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
    return { q, wasAttempted, isCorrect, selected: wasAttempted ? a.selected : null, timeSpent };
  });

  const unattempted = total - attempted;
  const marksPerCorrect = CONFIG.marksPerCorrect || 2;
  const negPerWrong = CONFIG.negativeMarkPerWrong || (2/3);
  
  const finalScore = +(correct * marksPerCorrect - incorrect * negPerWrong).toFixed(2);
  const maxScore = total * marksPerCorrect;
  const percentage = maxScore ? +((finalScore / maxScore) * 100).toFixed(1) : 0;
  const accuracy = attempted ? +((correct / attempted) * 100).toFixed(1) : 0;
  
  const subjects = {};
  perQuestion.forEach(r => {
    const s = r.q.subject || "General Studies";
    subjects[s] = subjects[s] || { total: 0, attempted: 0, correct: 0 };
    subjects[s].total++;
    if (r.wasAttempted) subjects[s].attempted++;
    if (r.isCorrect) subjects[s].correct++;
  });

  const difficulties = { Easy: { correct: 0, incorrect: 0, skipped: 0 }, Medium: { correct: 0, incorrect: 0, skipped: 0 }, Hard: { correct: 0, incorrect: 0, skipped: 0 } };
  perQuestion.forEach(r => {
    const diffKey = r.q.difficulty || "Medium";
    if(!difficulties[diffKey]) difficulties[diffKey] = { correct: 0, incorrect: 0, skipped: 0 };
    if (!r.wasAttempted) difficulties[diffKey].skipped++;
    else if (r.isCorrect) difficulties[diffKey].correct++;
    else difficulties[diffKey].incorrect++;
  });

  const topics = {};
  perQuestion.forEach(r => {
    const t = r.q.topic || "General";
    topics[t] = topics[t] || { total: 0, attempted: 0, correct: 0 };
    topics[t].total++;
    if (r.wasAttempted) topics[t].attempted++;
    if (r.isCorrect) topics[t].correct++;
  });

  return {
    total, attempted, correct, incorrect, unattempted,
    finalScore, maxScore, percentage, accuracy,
    marksWithoutNegative: correct * marksPerCorrect,
    negativeDeducted: +(incorrect * negPerWrong).toFixed(2),
    avgTimePerQ: attempted ? Math.round(totalTimeSpent / attempted) : 0,
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

/* ---------------- Rendering Dashboard elements ---------------- */
function renderDashboard(m) {
  renderScorecard(m);
  renderCharts(m);
  renderTimeQuestionList(m);
  renderHeatmap(m);
  renderInsights(m);
  renderAnswerSheet(m);
}

function renderScorecard(m) {
  const rankInfo = m.history.length < 2 ? "पहला प्रयास" : `${m.history.filter(h => h.score < m.finalScore).length}/${m.history.length - 1} प्रयासों से बेहतर`;

  const tiles = [
    ["कुल प्रश्न / Total", m.total],
    ["हल किए / Attempted", m.attempted],
    ["सही / Correct", m.correct],
    ["गलत / Incorrect", m.incorrect],
    ["छोड़े गए / Unattempted", m.unattempted],
    ["अंतिम अंक / Final Score", `${m.finalScore} / ${m.maxScore}`],
    ["प्रतिशत / Percentage", `${m.percentage}%`],
    ["सटीकता / Accuracy", `${m.accuracy}%`],
    ["ट्रेन्ड / Performance Trend", rankInfo],
    ["कुल समय / Time Taken", fmtTime(m.totalTimeSpent)],
    ["औसत समय/प्रश्न / Avg Time", `${m.avgTimePerQ}s`],
    ["माइनस मार्किंग / Negative", `-${m.negativeDeducted}`],
    ["बिना निगेटिव / W/o Negative", m.marksWithoutNegative]
  ];

  document.getElementById("scorecardGrid").innerHTML = tiles.map(([lbl, val]) => `
    <div class="score-tile"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>
  `).join("");
}

function shortenLabel(label, maxLen = 16) {
  if (!label) return label;
  return label.length > maxLen ? `${label.slice(0, maxLen)}…` : label;
}

function renderTimeQuestionList(m) {
  const box = document.getElementById("timeQuestionList");
  if (!box) return;
  box.innerHTML = `<div class="time-list-title">सभी प्रश्नों का समय</div>` + 
    m.perQuestion.map((r, index) => `
      <div class="time-list-item"><span>Q${index + 1} — ${r.q.topic || 'General'}</span><span>${r.timeSpent}s</span></div>
    `).join("");
}

function renderCharts(m) {
  const subjectLabels = Object.keys(m.subjects);
  const subjectAcc = subjectLabels.map(s => m.subjects[s].attempted ? +((m.subjects[s].correct / m.subjects[s].attempted) * 100).toFixed(1) : 0);

  if (typeof Chart !== "undefined") {
    new Chart(document.getElementById("chartSubject"), {
      type: "bar",
      data: { labels: subjectLabels.map(l => shortenLabel(l, 14)), datasets: [{ data: subjectAcc, backgroundColor: "#0a1f44" }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } }
    });
    new Chart(document.getElementById("chartPie"), {
      type: "pie",
      data: { labels: ["Correct", "Incorrect", "Skipped"], datasets: [{ data: [m.correct, m.incorrect, m.unattempted], backgroundColor: ["#1e8e3e", "#c0392b", "#9aa3b2"] }] }
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
      data: { labels: m.perQuestion.map((r, i) => i + 1), datasets: [{ data: m.perQuestion.map(r => r.timeSpent), borderColor: "#c9a227", backgroundColor: "#c9a22733", fill: true }] },
      options: { plugins: { legend: { display: false } } }
    });
    new Chart(document.getElementById("chartTrend"), {
      type: "line",
      data: { labels: m.history.map((h, i) => `#${i + 1}`), datasets: [{ data: m.history.map(h => h.percentage), borderColor: "#0a1f44", fill: false }] },
      options: { plugins: { legend: { display: false } } }
    });
  }
}

function renderHeatmap(m) {
  const el = document.getElementById("topicHeatmap");
  if(!el) return;
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
  const diffAcc = Object.entries(m.difficulties).map(([d, v]) => {
    const att = v.correct + v.incorrect;
    return [d, att ? Math.round((v.correct / att) * 100) : null];
  }).filter(([, acc]) => acc !== null).sort((a, b) => a[1] - b[1]);
  
  document.getElementById("insightPersonal").textContent = diffAcc.length 
    ? `${diffAcc[0][0]} स्तर के प्रश्नों में आपकी सटीकता ${diffAcc[0][1]}% रही। सुधार की आवश्यकता है।`
    : "और अधिक डेटा एकत्र होने पर अंतर्दृष्टि दिखाई देगी।";

  const topicList = Object.entries(m.topics).filter(([, d]) => d.attempted > 0).map(([t, d]) => [t, Math.round((d.correct / d.attempted) * 100)]).sort((a,b)=>b[1]-a[1]);
  document.getElementById("strongTopics").innerHTML = topicList.slice(0, 3).map(([t, a]) => `<li>${t} — ${a}%</li>`).join("") || "<li>N/A</li>";
  document.getElementById("weakTopics").innerHTML = topicList.slice(-3).reverse().map(([t, a]) => `<li>${t} — ${a}%</li>`).join("") || "<li>N/A</li>";

  document.getElementById("insightRecommendations").innerHTML = `<li>कमज़ोर विषयों का पुनरीक्षण (Revision) मानक पुस्तकों से करें और शॉर्ट नोट्स दोहराएं।</li>`;

  document.getElementById("negativeAnalysisTable").innerHTML = `
    <table class="mini-table">
      <tr><th>Wrong Attempts</th><td>${m.incorrect}</td></tr>
      <tr><th>Marks Lost</th><td>-${m.negativeDeducted}</td></tr>
    </table>`;

  const attTimes = m.perQuestion.filter(r => r.wasAttempted).sort((a,b)=>a.timeSpent - b.timeSpent);
  document.getElementById("timeEfficiencyTable").innerHTML = `
    <table class="mini-table">
      <tr><th>Fastest</th><td>${attTimes.length ? attTimes[0].timeSpent + 's' : 'N/A'}</td></tr>
      <tr><th>Slowest</th><td>${attTimes.length ? attTimes[attTimes.length-1].timeSpent + 's' : 'N/A'}</td></tr>
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
      let tagStr = isCorrectOpt ? " ✅" : "";
      if (isUserOpt) tagStr += " 🔵 (आपका चयन)";
      return `<div class="ans-row"><strong>${o.id}.</strong> ${o.hi} <em>(${o.en})</em>${tagStr}</div>`;
    }).join("");

    return `
      <div class="ans-item">
        <span class="tag">Q${i + 1}</span> <span class="ans-status ${status}">${statusLabel}</span>
        <p class="ans-q-hi">${q.question.hi}</p>
        <p class="ans-q-en">${q.question.en}</p>
        ${optionsHtml}
        <div class="ans-explain"><strong>व्याख्या / Explanation:</strong><br>${q.explanation.hi}<br><em>${q.explanation.en}</em></div>
      </div>`;
  }).join("");
}
