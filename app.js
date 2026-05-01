const STORAGE_KEY = "mistake-practice-items-v1";
const AI_ENDPOINT_KEY = "mistake-practice-ai-endpoint-v1";
const STUDENT_KEY = "mistake-practice-student-v1";
const STUDENT_LIST_KEY = "mistake-practice-students-v1";

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
  loadCloudButton: document.querySelector("#loadCloudButton"),
  studentSelect: document.querySelector("#studentSelect"),
  studentInput: document.querySelector("#studentInput"),
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
  aiSplitButton: document.querySelector("#aiSplitButton"),
  saveRecognizedButton: document.querySelector("#saveRecognizedButton"),
  aiEndpointInput: document.querySelector("#aiEndpointInput"),
  saveEndpointButton: document.querySelector("#saveEndpointButton"),
  splitSummary: document.querySelector("#splitSummary"),
  splitResults: document.querySelector("#splitResults"),
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
let extractedQuestions = [];
let savedStudents = loadStudentList();
els.aiEndpointInput.value = localStorage.getItem(AI_ENDPOINT_KEY) || "";
renderStudentOptions();

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

function loadStudentList() {
  try {
    const students = JSON.parse(localStorage.getItem(STUDENT_LIST_KEY)) || [];
    const current = localStorage.getItem(STUDENT_KEY);
    return [...new Set([current, ...students].filter(Boolean))];
  } catch {
    return [];
  }
}

function renderStudentOptions() {
  const current = localStorage.getItem(STUDENT_KEY) || "";
  els.studentSelect.innerHTML = `<option value="">選擇使用者</option>`;
  savedStudents.forEach((studentName) => {
    const option = document.createElement("option");
    option.value = studentName;
    option.textContent = studentName;
    els.studentSelect.append(option);
  });
  els.studentSelect.value = savedStudents.includes(current) ? current : "";
}

function getStudentName() {
  return els.studentInput.value.trim() || els.studentSelect.value || localStorage.getItem(STUDENT_KEY) || "";
}

function rememberStudent(shouldAddToList = false) {
  const studentName = getStudentName();
  if (studentName) {
    localStorage.setItem(STUDENT_KEY, studentName);
    if (shouldAddToList) {
      savedStudents = [...new Set([studentName, ...savedStudents])];
      localStorage.setItem(STUDENT_LIST_KEY, JSON.stringify(savedStudents));
      renderStudentOptions();
      els.studentSelect.value = studentName;
      els.studentInput.value = "";
    }
  }
  return studentName;
}

function requireCloudContext() {
  const endpoint = getAiEndpoint();
  const studentName = rememberStudent();
  if (!studentName) {
    setStatus("請先輸入使用者名稱。");
    return null;
  }
  if (!endpoint) {
    setStatus("請先在 AI 後端設定貼上 Apps Script Web App endpoint。");
    return null;
  }
  return { endpoint, studentName };
}

function requireStudent() {
  const studentName = rememberStudent();
  if (!studentName) {
    setStatus("請先輸入使用者名稱，再存錯題。");
    return "";
  }
  return studentName;
}

function rememberSavedStudent() {
  return rememberStudent(true);
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
  return normalizeAppsScriptEndpoint(els.aiEndpointInput.value.trim() || localStorage.getItem(AI_ENDPOINT_KEY) || "");
}

function normalizeAppsScriptEndpoint(value) {
  const endpoint = value.trim();
  if (!endpoint) return "";
  if (endpoint.startsWith("AKfy")) {
    return `https://script.google.com/macros/s/${endpoint}/exec`;
  }
  return endpoint;
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

function readReviewedQuestion(index) {
  const card = els.splitResults.querySelector(`[data-index="${index}"]`);
  if (!card) return extractedQuestions[index];

  return {
    ...extractedQuestions[index],
    subject: card.querySelector(".review-subject")?.value.trim() || extractedQuestions[index].subject || "",
    topic: card.querySelector(".review-topic")?.value.trim() || extractedQuestions[index].topic || "",
    question: card.querySelector(".review-question").value.trim(),
    answer: card.querySelector(".review-answer").value.trim(),
    explanation: card.querySelector(".review-explanation").value.trim(),
  };
}

function updateReviewedQuestion(index) {
  extractedQuestions[index] = readReviewedQuestion(index);
}

function removeExtractedQuestion(index) {
  const removed = extractedQuestions[index];
  extractedQuestions.splice(index, 1);
  if (removed?.savedItemId) {
    const localItem = items.find((item) => item.id === removed.savedItemId);
    items = items.filter((item) => item.id !== removed.savedItemId);
    saveItems();
    renderAll();
    renderSplitResults();
    if (localItem) {
      deleteItemFromCloud(localItem)
        .then((deleted) => {
          if (deleted) setStatus(`已從畫面、本機與 Google Sheet 刪除第 ${removed?.questionNumber || index + 1} 題。`);
        })
        .catch((error) => setStatus(`已刪本機，但 Google Sheet 刪除失敗：${error.message}`));
      return;
    }
  }
  renderSplitResults();
  setStatus(`已從畫面移除第 ${removed?.questionNumber || index + 1} 題，不會存入 JSON。`);
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

function createItemFromExtracted(question) {
  const now = new Date().toISOString();
  return {
    id: question.savedItemId || makeId(),
    studentName: getStudentName(),
    subject: question.subject || els.subjectInput.value,
    topic: question.topic || els.topicInput.value.trim() || "未分類",
    difficulty: Number(question.difficulty || 2),
    question: question.question || "",
    answer: question.answer || "",
    sourceUrl: question.sourceUrl || "",
    explanation: question.explanation || "",
    image: "",
    createdAt: now,
    nextReview: now,
    interval: 1,
    attempts: 0,
    correct: 0,
    wrong: 0,
    mastered: false,
  };
}

function toCloudItem(item) {
  return {
    ...item,
    image: "",
    hasLocalImage: false,
  };
}

async function saveItemToCloud(item) {
  const endpoint = getAiEndpoint();
  const studentName = rememberSavedStudent();
  if (!studentName) {
    setStatus("請先輸入使用者名稱，再存錯題。");
    return false;
  }
  if (!endpoint) return false;

  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "saveMistake",
      studentName,
      item: toCloudItem({ ...item, studentName }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Cloud endpoint returned ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "雲端儲存失敗");
  }
  return true;
}

async function deleteItemFromCloud(item) {
  const endpoint = getAiEndpoint();
  const studentName = item.studentName || getStudentName();
  if (!endpoint || !studentName || !item.id) return false;

  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "deleteMistake",
      studentName,
      id: item.id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Cloud endpoint returned ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "雲端刪除失敗");
  }
  return true;
}

async function loadItemsFromCloud() {
  const context = requireCloudContext();
  if (!context) return;

  setStatus("正在讀取雲端錯題。");
  els.loadCloudButton.disabled = true;

  try {
    const response = await fetch(context.endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "listMistakes",
        studentName: context.studentName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cloud endpoint returned ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "雲端讀取失敗");
    }

    items = Array.isArray(result.data?.items) ? result.data.items : [];
    saveItems();
    renderAll();
    renderPractice();
    setStatus(`已讀取 ${items.length} 題雲端錯題。`);
  } catch (error) {
    setStatus(`雲端讀取失敗：${error.message}`);
  } finally {
    els.loadCloudButton.disabled = false;
  }
}

function resetForm() {
  els.form.reset();
  els.subjectInput.value = "數學";
  els.difficultyInput.value = "2";
  currentImage = "";
  extractedQuestions = [];
  renderSplitResults();
  els.imagePreview.innerHTML = `
    <svg viewBox="0 0 240 180" aria-hidden="true">
      <rect width="240" height="180" rx="14" fill="#eef2ff" />
      <path d="M45 52h150v96H45z" fill="#fff" />
      <path d="M66 78h95M66 102h70M66 126h86" stroke="#64748b" stroke-width="8" stroke-linecap="round" />
      <circle cx="184" cy="58" r="18" fill="#f59e0b" />
    </svg>
  `;
}

function renderSplitResults() {
  els.splitResults.innerHTML = "";
  els.splitSummary.textContent = extractedQuestions.length ? `${extractedQuestions.length} 題` : "尚未切題";

  extractedQuestions.forEach((question, index) => {
    const card = document.createElement("article");
    const needsRetake = Boolean(question.needsRetake);
    const needsReview = Boolean(question.needsHumanReview);
    const isCollapsed = Boolean(question.saved && question.collapsed !== false);
    card.className = `split-card ${needsRetake ? "retake" : needsReview ? "review" : ""}`;
    card.dataset.index = String(index);

    const confidence = Math.round(Number(question.confidence || 0) * 100);
    card.innerHTML = `
      <div class="split-meta">
        <span>第 ${escapeHtml(question.questionNumber || index + 1)} 題</span>
        <span>${escapeHtml(question.subject || "未判斷")}</span>
        <span>${escapeHtml(question.topic || "未分類")}</span>
        <span>可信度 ${Number.isFinite(confidence) ? confidence : 0}%</span>
      </div>
      ${
        needsRetake || question.reason
          ? `<p class="split-warning">${escapeHtml(question.reason || "這題需要人工確認")}</p>`
          : ""
      }
      <div class="result-summary" ${isCollapsed ? "" : "hidden"}>
        <div>
          <strong>題目：</strong>
          <span>${escapeHtml(question.question || "未辨識出題目文字")}</span>
        </div>
        <div>
          <strong>答案：</strong>
          <span>${escapeHtml(question.answer || "尚未判斷")}</span>
        </div>
        <div>
          <strong>詳解：</strong>
          <span>${escapeHtml(question.explanation || "尚未產生詳解")}</span>
        </div>
      </div>
      <div class="review-fields" aria-label="編輯辨識結果" ${isCollapsed ? "hidden" : ""}>
        <label>
          題目
          <textarea class="review-question" rows="6">${escapeHtml(question.question || "")}</textarea>
        </label>
        <label>
          答案
          <textarea class="review-answer" rows="3">${escapeHtml(question.answer || "")}</textarea>
        </label>
        <label>
          詳解
          <textarea class="review-explanation" rows="4">${escapeHtml(question.explanation || "")}</textarea>
        </label>
      </div>
      <div class="card-actions">
        ${isCollapsed ? `<button class="secondary-button small expand-split" type="button">展開</button>` : ""}
        <button class="danger-button small remove-split" type="button">刪除</button>
      </div>
    `;

    card.querySelector(".expand-split")?.addEventListener("click", () => {
      extractedQuestions[index] = { ...question, collapsed: false, saved: false };
      renderSplitResults();
      setStatus(`第 ${question.questionNumber || index + 1} 題已展開，可修改後再按儲存JSON。`);
    });
    card.querySelector(".remove-split").addEventListener("click", () => removeExtractedQuestion(index));

    els.splitResults.append(card);
  });
}

function upsertLocalItems(newItems) {
  const byId = new Map(items.map((item) => [item.id, item]));
  newItems.forEach((item) => byId.set(item.id, item));
  const newIds = new Set(newItems.map((item) => item.id));
  items = [...newItems, ...items.filter((item) => !newIds.has(item.id))];
}

async function saveRecognizedQuestions() {
  if (!extractedQuestions.length) {
    setStatus("請先按 AI辨識，確認題目後再儲存。");
    return;
  }
  if (!requireStudent()) return;

  const reviewedQuestions = extractedQuestions
    .map((_, index) => ({ question: readReviewedQuestion(index), index }))
    .filter((entry) => entry.question.question?.trim() && !entry.question.saved);

  if (!reviewedQuestions.length) {
    setStatus("沒有可儲存的題目文字。");
    return;
  }

  const newItems = reviewedQuestions.map((entry) => createItemFromExtracted(entry.question));
  upsertLocalItems(newItems);
  saveItems();
  renderAll();
  reviewedQuestions.forEach((entry, itemIndex) => {
    extractedQuestions[entry.index] = {
      ...entry.question,
      saved: true,
      collapsed: true,
      savedItemId: newItems[itemIndex].id,
    };
  });
  renderSplitResults();

  let cloudCount = 0;
  for (const item of newItems) {
    try {
      if (await saveItemToCloud(item)) cloudCount += 1;
    } catch (error) {
      setStatus(`已存本機，部分雲端同步失敗：${error.message}`);
      return;
    }
  }

  if (cloudCount) {
    setStatus(`已儲存 ${newItems.length} 題 JSON，其中 ${cloudCount} 題已同步雲端。`);
  } else {
    setStatus(`已儲存 ${newItems.length} 題 JSON 到本機；未同步雲端，請確認 endpoint 已儲存。`);
  }
}

async function splitPageWithAi() {
  const endpoint = getAiEndpoint();
  if (!endpoint) {
    setStatus("請先在 AI 後端設定貼上 Apps Script Web App endpoint。");
    return;
  }
  if (!requireStudent()) return;
  if (!currentImage) {
    setStatus("請先拍照或選擇整頁錯題照片。");
    return;
  }

  setStatus("AI 正在切題與重建文字。");
  els.aiSplitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "analyzePage",
        subject: els.subjectInput.value,
        topic: els.topicInput.value.trim(),
        rawText: els.questionInput.value.trim(),
        image: dataUrlToInlineImage(currentImage),
      }),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint returned ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "AI 切題失敗");
    }

    extractedQuestions = Array.isArray(result.data?.questions) ? result.data.questions : [];
    currentImage = "";
    renderSplitResults();
    setStatus(`AI 已切出 ${extractedQuestions.length} 題，照片已清除；確認後請按儲存JSON。`);
  } catch (error) {
    setStatus(`AI 切題失敗：${error.message}`);
  } finally {
    els.aiSplitButton.disabled = false;
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
      deleteItemFromCloud(item)
        .then((deleted) => {
          if (deleted) setStatus("已從本機與 Google Sheet 刪除錯題。");
        })
        .catch((error) => setStatus(`已刪本機，但 Google Sheet 刪除失敗：${error.message}`));
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
  saveItemToCloud(item).catch((error) => setStatus(`練習結果已存本機，但雲端同步失敗：${error.message}`));
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

els.navTabs.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    currentImage = reader.result;
    extractedQuestions = [];
    renderImagePreview(currentImage);
    renderSplitResults();
    setStatus("照片已加入，請按 AI辨識。");
  });
  reader.readAsDataURL(file);
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
});
els.aiSplitButton.addEventListener("click", splitPageWithAi);
els.saveRecognizedButton.addEventListener("click", saveRecognizedQuestions);
els.saveEndpointButton.addEventListener("click", () => {
  const endpoint = normalizeAppsScriptEndpoint(els.aiEndpointInput.value.trim());
  localStorage.setItem(AI_ENDPOINT_KEY, endpoint);
  els.aiEndpointInput.value = endpoint;
  setStatus("AI endpoint 已儲存。");
});
els.studentInput.addEventListener("change", () => {
  rememberStudent();
  setStatus(`目前使用者：${getStudentName() || "未設定"}`);
});
els.studentSelect.addEventListener("change", () => {
  if (els.studentSelect.value) {
    localStorage.setItem(STUDENT_KEY, els.studentSelect.value);
    els.studentInput.value = "";
    setStatus(`目前使用者：${els.studentSelect.value}`);
  }
});
els.loadCloudButton.addEventListener("click", loadItemsFromCloud);
els.librarySearch.addEventListener("input", renderLibrary);
els.subjectFilter.addEventListener("change", renderLibrary);
els.correctButton.addEventListener("click", () => updatePracticeResult(true));
els.wrongButton.addEventListener("click", () => updatePracticeResult(false));
els.revealButton.addEventListener("click", revealExplanation);
els.seedButton.addEventListener("click", seedExamples);

renderAll();
renderSplitResults();
renderPractice();
