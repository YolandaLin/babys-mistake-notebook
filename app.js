const STORAGE_KEY = "mistake-practice-items-v1";
const AI_ENDPOINT_KEY = "mistake-practice-ai-endpoint-v1";

const views = {
  capture: document.querySelector("#captureView"),
  library: document.querySelector("#libraryView"),
  practice: document.querySelector("#practiceView"),
  dashboard: document.querySelector("#dashboardView"),
};

const titles = {
  capture: "拍照存題",
  library: "錯題庫",
  practice: "重複練習",
  dashboard: "學習狀態",
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  dueCount: document.querySelector("#dueCount"),
  seedButton: document.querySelector("#seedButton"),
  navTabs: [...document.querySelectorAll(".nav-tab")],
  form: document.querySelector("#mistakeForm"),
  photoInput: document.querySelector("#photoInput"),
  imagePreview: document.querySelector("#imagePreview"),
  subjectInput: document.querySelector("#subjectInput"),
  topicInput: document.querySelector("#topicInput"),
  difficultyInput: document.querySelector("#difficultyInput"),
  questionInput: document.querySelector("#questionInput"),
  answerInput: document.querySelector("#answerInput"),
  sourceInput: document.querySelector("#sourceInput"),
  explanationInput: document.querySelector("#explanationInput"),
  captureStatus: document.querySelector("#captureStatus"),
  ocrButton: document.querySelector("#ocrButton"),
  searchButton: document.querySelector("#searchButton"),
  aiCleanButton: document.querySelector("#aiCleanButton"),
  aiEndpointInput: document.querySelector("#aiEndpointInput"),
  saveEndpointButton: document.querySelector("#saveEndpointButton"),
  librarySearch: document.querySelector("#librarySearch"),
  subjectFilter: document.querySelector("#subjectFilter"),
  mistakeList: document.querySelector("#mistakeList"),
  template: document.querySelector("#mistakeCardTemplate"),
  practiceCard: document.querySelector("#practiceCard"),
  practiceAnswer: document.querySelector("#practiceAnswer"),
  correctButton: document.querySelector("#correctButton"),
  wrongButton: document.querySelector("#wrongButton"),
  revealButton: document.querySelector("#revealButton"),
  practiceExplanation: document.querySelector("#practiceExplanation"),
  totalCount: document.querySelector("#totalCount"),
  masteredCount: document.querySelector("#masteredCount"),
  accuracyRate: document.querySelector("#accuracyRate"),
  subjectBars: document.querySelector("#subjectBars"),
};

let items = loadItems();
let currentImage = "";
let practiceItemId = "";
els.aiEndpointInput.value = localStorage.getItem(AI_ENDPOINT_KEY) || "";

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysFromNow(days) {
  const date = todayStart();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function isDue(item) {
  return new Date(item.nextReview) <= new Date();
}

function setStatus(message) {
  els.captureStatus.textContent = message;
}

function getAiEndpoint() {
  return els.aiEndpointInput.value.trim() || localStorage.getItem(AI_ENDPOINT_KEY) || "";
}

function switchView(viewName) {
  Object.entries(views).forEach(([name, view]) => {
    view.classList.toggle("active", name === viewName);
  });
  els.navTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  els.viewTitle.textContent = titles[viewName];

  if (viewName === "library") renderLibrary();
  if (viewName === "practice") renderPractice();
  if (viewName === "dashboard") renderDashboard();
}

function buildSearchQuery() {
  const parts = [
    els.subjectInput.value,
    els.topicInput.value,
    els.questionInput.value,
    "詳解",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function dataUrlToInlineImage(dataUrl) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function openExplanationSearch(question, subject = "") {
  const query = [subject, question, "詳解"].filter(Boolean).join(" ");
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function createItemFromForm() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    subject: els.subjectInput.value,
    topic: els.topicInput.value.trim(),
    difficulty: Number(els.difficultyInput.value),
    question: els.questionInput.value.trim(),
    answer: els.answerInput.value.trim(),
    sourceUrl: els.sourceInput.value.trim(),
    explanation: els.explanationInput.value.trim(),
    image: currentImage,
    createdAt: now,
    nextReview: now,
    interval: 1,
    attempts: 0,
    correct: 0,
    wrong: 0,
    mastered: false,
  };
}

function resetForm() {
  els.form.reset();
  els.subjectInput.value = "數學";
  els.difficultyInput.value = "2";
  currentImage = "";
  els.imagePreview.innerHTML = `
    <svg viewBox="0 0 240 180" aria-hidden="true">
      <rect width="240" height="180" rx="14" fill="#eef2ff" />
      <path d="M45 52h150v96H45z" fill="#fff" />
      <path d="M66 78h95M66 102h70M66 126h86" stroke="#64748b" stroke-width="8" stroke-linecap="round" />
      <circle cx="184" cy="58" r="18" fill="#f59e0b" />
    </svg>
  `;
}

function applyAiResult(result) {
  if (result.subject) els.subjectInput.value = result.subject;
  if (result.topic) els.topicInput.value = result.topic;
  if (result.question) els.questionInput.value = result.question;
  if (result.answer) els.answerInput.value = result.answer;
  if (result.explanation) els.explanationInput.value = result.explanation;
  if (result.sourceUrl) els.sourceInput.value = result.sourceUrl;
  if (result.difficulty) els.difficultyInput.value = String(result.difficulty);
}

async function refineWithAi() {
  const endpoint = getAiEndpoint();
  if (!endpoint) {
    setStatus("請先在 AI 後端設定貼上 Apps Script Web App endpoint。");
    return;
  }

  const rawText = els.questionInput.value.trim();
  if (!rawText && !currentImage) {
    setStatus("請先拍照，或貼上 OCR 粗文字。");
    return;
  }

  setStatus("AI 正在重建題目與判斷欄位。");
  els.aiCleanButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "refineMistake",
        subject: els.subjectInput.value,
        topic: els.topicInput.value.trim(),
        rawText,
        image: dataUrlToInlineImage(currentImage),
      }),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint returned ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "AI 整理失敗");
    }

    applyAiResult(result.data || {});
    setStatus("AI 已整理完成，請再看一次內容後存入錯題庫。");
  } catch (error) {
    setStatus(`AI 整理失敗：${error.message}`);
  } finally {
    els.aiCleanButton.disabled = false;
  }
}

function renderImagePreview(dataUrl) {
  els.imagePreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "錯題照片預覽";
  els.imagePreview.append(img);
}

function renderLibrary() {
  const keyword = els.librarySearch.value.trim().toLowerCase();
  const subject = els.subjectFilter.value;
  const filtered = items
    .filter((item) => !subject || item.subject === subject)
    .filter((item) => {
      const text = `${item.subject} ${item.topic} ${item.question}`.toLowerCase();
      return !keyword || text.includes(keyword);
    })
    .sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));

  els.mistakeList.innerHTML = "";

  if (!filtered.length) {
    els.mistakeList.innerHTML = `<div class="empty-state">目前沒有符合條件的錯題</div>`;
    return;
  }

  filtered.forEach((item) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const thumb = node.querySelector(".thumb");
    const meta = node.querySelector(".card-meta");
    const title = node.querySelector("h3");
    const body = node.querySelector("p");

    if (item.image) {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = `${item.subject}${item.topic}錯題`;
      thumb.append(img);
    }

    meta.textContent = `${item.subject} · ${item.topic || "未分類"} · ${isDue(item) ? "今天練" : formatDate(item.nextReview)}`;
    title.textContent = item.question || "未填題目文字";
    body.textContent = item.explanation || item.answer || "尚未加入詳解";

    node.querySelector(".explain-button").addEventListener("click", () => {
      openExplanationSearch(item.question, item.subject);
    });
    node.querySelector(".edit-button").addEventListener("click", () => {
      practiceItemId = item.id;
      switchView("practice");
    });
    node.querySelector(".delete-button").addEventListener("click", () => {
      items = items.filter((entry) => entry.id !== item.id);
      saveItems();
      renderAll();
    });

    els.mistakeList.append(node);
  });
}

function getPracticeQueue() {
  const due = items.filter(isDue);
  if (due.length) {
    return due.sort((a, b) => a.correct - b.correct || new Date(a.nextReview) - new Date(b.nextReview));
  }
  return [...items].sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
}

function renderPractice() {
  const queue = getPracticeQueue();
  const item = items.find((entry) => entry.id === practiceItemId) || queue[0];
  practiceItemId = item?.id || "";
  els.practiceExplanation.textContent = "";
  els.practiceAnswer.value = "";

  if (!item) {
    els.practiceCard.className = "practice-card empty";
    els.practiceCard.innerHTML = "<p>錯題庫還沒有題目</p>";
    return;
  }

  els.practiceCard.className = "practice-card";
  els.practiceCard.innerHTML = `
    <div class="practice-meta">
      <span class="pill">${escapeHtml(item.subject)}</span>
      <span class="pill">${escapeHtml(item.topic || "未分類")}</span>
      <span class="pill">${isDue(item) ? "到期" : `下次 ${formatDate(item.nextReview)}`}</span>
    </div>
    <div class="practice-question">${escapeHtml(item.question || "未填題目文字")}</div>
    ${item.image ? `<img class="practice-image" src="${item.image}" alt="錯題照片" />` : ""}
  `;
}

function updatePracticeResult(wasCorrect) {
  if (!practiceItemId) return;
  const item = items.find((entry) => entry.id === practiceItemId);
  if (!item) return;

  item.attempts += 1;
  if (wasCorrect) {
    item.correct += 1;
    item.interval = Math.min(Math.max(1, item.interval * 2), 30);
    item.mastered = item.correct >= 3 && item.correct >= item.wrong + 2;
    item.nextReview = daysFromNow(item.interval);
  } else {
    item.wrong += 1;
    item.interval = 1;
    item.mastered = false;
    item.nextReview = daysFromNow(1);
  }

  practiceItemId = "";
  saveItems();
  renderAll();
  switchView("practice");
}

function revealExplanation() {
  const item = items.find((entry) => entry.id === practiceItemId);
  if (!item) return;
  const lines = [
    item.answer ? `正確答案：${item.answer}` : "正確答案：尚未填寫",
    item.explanation ? `詳解：${item.explanation}` : "詳解：尚未加入筆記",
    item.sourceUrl ? `來源：${item.sourceUrl}` : "",
  ].filter(Boolean);
  els.practiceExplanation.textContent = lines.join("\n\n");
}

function renderDashboard() {
  const total = items.length;
  const mastered = items.filter((item) => item.mastered).length;
  const attempts = items.reduce((sum, item) => sum + item.attempts, 0);
  const correct = items.reduce((sum, item) => sum + item.correct, 0);

  els.totalCount.textContent = total;
  els.masteredCount.textContent = mastered;
  els.accuracyRate.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";

  const bySubject = items.reduce((acc, item) => {
    acc[item.subject] = (acc[item.subject] || 0) + 1;
    return acc;
  }, {});

  els.subjectBars.innerHTML = "";
  const max = Math.max(1, ...Object.values(bySubject));
  Object.entries(bySubject).forEach(([subject, count]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <strong>${escapeHtml(subject)}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <span>${count}</span>
    `;
    els.subjectBars.append(row);
  });

  if (!Object.keys(bySubject).length) {
    els.subjectBars.innerHTML = `<div class="empty-state">還沒有可統計的錯題</div>`;
  }
}

function renderCounters() {
  els.dueCount.textContent = items.filter(isDue).length;
}

function renderAll() {
  renderCounters();
  renderLibrary();
  renderDashboard();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function seedExamples() {
  const examples = [
    {
      id: makeId(),
      subject: "數學",
      topic: "分數加減",
      difficulty: 2,
      question: "小明吃了 1/4 個蛋糕，小美吃了 1/3 個蛋糕，兩人一共吃了多少個蛋糕？",
      answer: "7/12",
      sourceUrl: "",
      explanation: "先通分成 12 分母：1/4 = 3/12，1/3 = 4/12，所以 3/12 + 4/12 = 7/12。",
      image: "",
      createdAt: new Date().toISOString(),
      nextReview: new Date().toISOString(),
      interval: 1,
      attempts: 1,
      correct: 0,
      wrong: 1,
      mastered: false,
    },
    {
      id: makeId(),
      subject: "英文",
      topic: "時態",
      difficulty: 2,
      question: "Choose the correct answer: She ___ to school every day. (go / goes / went)",
      answer: "goes",
      sourceUrl: "",
      explanation: "主詞 She 是第三人稱單數，現在簡單式動詞要加 s。",
      image: "",
      createdAt: new Date().toISOString(),
      nextReview: daysFromNow(1),
      interval: 1,
      attempts: 2,
      correct: 1,
      wrong: 1,
      mastered: false,
    },
  ];
  items = [...examples, ...items];
  saveItems();
  renderAll();
}

async function tryRecognizeText() {
  if (!currentImage) {
    setStatus("請先拍照或選擇圖片。");
    return;
  }

  setStatus("正在載入 OCR，若網路無法連線可直接手動輸入題目。");

  try {
    if (!window.Tesseract) {
      await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    }
    const result = await window.Tesseract.recognize(currentImage, "chi_tra+eng");
    const text = result?.data?.text?.trim();
    if (text) {
      els.questionInput.value = text;
      setStatus("已辨識文字，請確認題目內容。");
    } else {
      setStatus("沒有辨識到清楚文字，請手動輸入題目。");
    }
  } catch {
    setStatus("OCR 載入失敗，請先手動輸入題目；正式版可改接後端 OCR。");
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

els.navTabs.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    currentImage = reader.result;
    renderImagePreview(currentImage);
    setStatus("照片已加入，可辨識文字或直接存題。");
  });
  reader.readAsDataURL(file);
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const item = createItemFromForm();
  if (!item.question) {
    setStatus("請填入題目文字。");
    return;
  }
  items.unshift(item);
  saveItems();
  resetForm();
  setStatus("已存入錯題庫。");
  renderAll();
});

els.searchButton.addEventListener("click", () => {
  const query = buildSearchQuery();
  if (!query) {
    setStatus("請先輸入題目文字。");
    return;
  }
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
});

els.ocrButton.addEventListener("click", tryRecognizeText);
els.aiCleanButton.addEventListener("click", refineWithAi);
els.saveEndpointButton.addEventListener("click", () => {
  localStorage.setItem(AI_ENDPOINT_KEY, els.aiEndpointInput.value.trim());
  setStatus("AI endpoint 已儲存。");
});
els.librarySearch.addEventListener("input", renderLibrary);
els.subjectFilter.addEventListener("change", renderLibrary);
els.correctButton.addEventListener("click", () => updatePracticeResult(true));
els.wrongButton.addEventListener("click", () => updatePracticeResult(false));
els.revealButton.addEventListener("click", revealExplanation);
els.seedButton.addEventListener("click", seedExamples);

renderAll();
renderPractice();
