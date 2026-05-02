const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_SPREADSHEET_ID = '1IxPZlSmAPbFL5rBICMh_lZrc36ujztsShZWUny3ZcQA';

function doGet() {
  return jsonOutput({
    ok: true,
    service: 'babys-mistake-notebook',
    time: new Date().toISOString(),
  });
}

function testSaveMistake() {
  return saveMistake({
    studentName: '測試使用者',
    loginUser: 'test@example.com',
    item: {
      id: Utilities.getUuid(),
      studentName: '測試使用者',
      subject: '測試',
      topic: '連線測試',
      difficulty: 1,
      question: '這是一筆 Google Sheets 寫入測試題目。',
      answer: '測試答案',
      explanation: '如果你在 mistakes 工作表看到這列，代表 Sheets 寫入正常。',
      sourceUrl: '',
      createdAt: new Date().toISOString(),
      nextReview: new Date().toISOString(),
      interval: 1,
      attempts: 0,
      correct: 0,
      wrong: 0,
      mastered: false,
    },
  });
}

function doPost(e) {
  try {
    const input = JSON.parse(e.postData.contents || '{}');
    let data;

    if (input.action === 'refineMistake') {
      data = refineMistake(input);
    } else if (input.action === 'analyzePage') {
      data = analyzePage(input);
    } else if (input.action === 'saveMistake') {
      data = saveMistake(input);
    } else if (input.action === 'listMistakes') {
      data = listMistakes(input);
    } else if (input.action === 'deleteMistake') {
      data = deleteMistake(input);
    } else {
      throw new Error('Unknown action');
    }

    return jsonOutput({ ok: true, data });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error.message || error) });
  }
}

function refineMistake(input) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY in Script Properties');

  const parts = [
    {
      text:
        '你是台灣國小與國中錯題整理助教。請根據照片與 OCR 粗文字，重建可讀題目，判斷科目、單元、難度、答案與詳解。' +
        '不要幻想看不到的資訊；如果答案無法確定，answer 留空，explanation 寫出解題方法與需要補充的條件。' +
        '輸出必須是 JSON，不要 Markdown。',
    },
    {
      text: JSON.stringify({
        subjectHint: input.subject || '',
        topicHint: input.topic || '',
        rawOcrText: input.rawText || '',
        outputShape: {
          subject: '自然/社會/國文',
          topic: '單元名稱',
          question: '整理後的完整題目',
          answer: '可判斷才填',
          explanation: '給孩子看的短詳解',
          difficulty: '1, 2, or 3',
          confidence: '0-1',
          needsHumanReview: true,
        },
      }),
    },
  ];

  if (input.image && input.image.data && input.image.mimeType) {
    parts.push({
      inline_data: {
        mime_type: input.image.mimeType,
        data: input.image.data,
      },
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          subject: { type: 'STRING' },
          topic: { type: 'STRING' },
          question: { type: 'STRING' },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' },
          difficulty: { type: 'INTEGER' },
          confidence: { type: 'NUMBER' },
          needsHumanReview: { type: 'BOOLEAN' },
        },
        required: ['subject', 'topic', 'question', 'answer', 'explanation', 'difficulty', 'confidence', 'needsHumanReview'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Gemini API ${status}: ${body}`);
  }

  const parsed = JSON.parse(body);
  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');

  const result = JSON.parse(text);
  result.difficulty = Math.min(3, Math.max(1, Number(result.difficulty || 2)));
  return result;
}

function analyzePage(input) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY in Script Properties');

  if (!input.image || !input.image.data || !input.image.mimeType) {
    throw new Error('Missing image');
  }

  const parts = [
    {
      text:
        '你是台灣國小與國中錯題切題與整理助教。你的任務不是 OCR 全頁，而是只擷取錯題。' +
        '只回傳有明確錯題痕跡的題目：紅筆訂正、圈選、叉號、錯誤答案標記、分數旁註、老師批改、學生更正文字。' +
        '沒有上述錯題痕跡的題目，即使文字清楚，也一律不要輸出。' +
        '如果整頁有很多題但只有部分有錯題痕跡，只輸出那些錯題。若完全沒有明確錯題痕跡，questions 回傳空陣列。' +
        '請特別檢查遮擋、陰影、歪斜、題目不完整、選項不完整、圖表需要保留等問題。' +
        '如果看不清楚，不要猜；請設定 needsRetake 或 needsHumanReview，並在 reason 說明。' +
        '選擇題請盡量保留 A-D 選項。需要看圖表才能作答的題目，explanation 寫「此題需保留原圖作答」。' +
        '輸出必須是 JSON，不要 Markdown。',
    },
    {
      text: JSON.stringify({
        subjectHint: input.subject || '',
        topicHint: input.topic || '',
        rawOcrText: input.rawText || '',
        outputShape: {
          questions: [
            {
              questionNumber: '題號，例如 24',
              subject: '自然/社會/國文',
              topic: '單元名稱',
              question: '整理後完整題目，含選項',
              answer: '可判斷才填，否則空字串',
              explanation: '給孩子看的短說明，或標記需保留圖表',
              difficulty: '1, 2, or 3',
              confidence: '0-1',
              needsHumanReview: true,
              needsRetake: false,
              reason: '不完整或需要確認的原因',
            },
          ],
        },
      }),
    },
    {
      inline_data: {
        mime_type: input.image.mimeType,
        data: input.image.data,
      },
    },
  ];

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                questionNumber: { type: 'STRING' },
                subject: { type: 'STRING' },
                topic: { type: 'STRING' },
                question: { type: 'STRING' },
                answer: { type: 'STRING' },
                explanation: { type: 'STRING' },
                difficulty: { type: 'INTEGER' },
                confidence: { type: 'NUMBER' },
                needsHumanReview: { type: 'BOOLEAN' },
                needsRetake: { type: 'BOOLEAN' },
                reason: { type: 'STRING' },
              },
              required: [
                'questionNumber',
                'subject',
                'topic',
                'question',
                'answer',
                'explanation',
                'difficulty',
                'confidence',
                'needsHumanReview',
                'needsRetake',
                'reason',
              ],
            },
          },
        },
        required: ['questions'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Gemini API ${status}: ${body}`);
  }

  const parsed = JSON.parse(body);
  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');

  const result = JSON.parse(text);
  result.questions = Array.isArray(result.questions) ? result.questions : [];
  result.questions = result.questions.map((question) => ({
    questionNumber: String(question.questionNumber || ''),
    subject: String(question.subject || input.subject || ''),
    topic: String(question.topic || input.topic || ''),
    question: String(question.question || ''),
    answer: String(question.answer || ''),
    explanation: String(question.explanation || ''),
    difficulty: Math.min(3, Math.max(1, Number(question.difficulty || 2))),
    confidence: Math.min(1, Math.max(0, Number(question.confidence || 0))),
    needsHumanReview: Boolean(question.needsHumanReview),
    needsRetake: Boolean(question.needsRetake),
    reason: String(question.reason || ''),
  }));
  return result;
}

function saveMistake(input) {
  const studentName = normalizeStudentName(input.studentName);
  const item = input.item || {};
  if (!studentName) throw new Error('Missing studentName');
  if (!item.question) throw new Error('Missing question');

  const sheet = getMistakeSheet();
  const now = new Date().toISOString();
  const id = item.id || Utilities.getUuid();
  const loginUser = getLoginUser(input, studentName);
  item.studentName = studentName;
  item.loginUser = loginUser;
  const rowValues = [
    studentName,
    id,
    item.subject || '',
    item.topic || '',
    item.difficulty || 2,
    item.question || '',
    item.answer || '',
    item.explanation || '',
    item.sourceUrl || '',
    item.createdAt || now,
    item.nextReview || now,
    item.interval || 1,
    item.attempts || 0,
    item.correct || 0,
    item.wrong || 0,
    item.mastered ? 'TRUE' : 'FALSE',
    JSON.stringify(item),
    now,
    loginUser,
  ];
  const rowIndex = findMistakeRow(sheet, studentName, id);
  if (rowIndex) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    return { id, mode: 'updated' };
  }

  sheet.appendRow(rowValues);
  return { id, mode: 'created' };
}

function deleteMistake(input) {
  const studentName = normalizeStudentName(input.studentName);
  const id = String(input.id || '').trim();
  if (!studentName) throw new Error('Missing studentName');
  if (!id) throw new Error('Missing id');

  const sheet = getMistakeSheet();
  const values = sheet.getDataRange().getValues();
  let deleted = 0;
  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][0]) === studentName && String(values[index][1]) === id) {
      sheet.deleteRow(index + 1);
      deleted += 1;
    }
  }
  return { id, deleted };
}

function listMistakes(input) {
  const studentName = normalizeStudentName(input.studentName);
  if (!studentName) throw new Error('Missing studentName');

  const sheet = getMistakeSheet();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  const byId = {};

  rows.forEach((row) => {
    if (String(row[0]) !== studentName) return;
    const id = String(row[1] || '');
    if (!id) return;
    let item;
    try {
      item = JSON.parse(row[16] || '{}');
    } catch {
      item = {};
    }
    byId[id] = {
      id,
      studentName,
      loginUser: item.loginUser || row[18] || '',
      subject: item.subject || row[2] || '',
      topic: item.topic || row[3] || '',
      difficulty: Number(item.difficulty || row[4] || 2),
      question: item.question || row[5] || '',
      answer: item.answer || row[6] || '',
      explanation: item.explanation || row[7] || '',
      sourceUrl: item.sourceUrl || row[8] || '',
      image: '',
      createdAt: item.createdAt || row[9] || new Date().toISOString(),
      nextReview: item.nextReview || row[10] || new Date().toISOString(),
      interval: Number(item.interval || row[11] || 1),
      attempts: Number(item.attempts || row[12] || 0),
      correct: Number(item.correct || row[13] || 0),
      wrong: Number(item.wrong || row[14] || 0),
      mastered: String(item.mastered || row[15]).toUpperCase() === 'TRUE',
    };
  });

  return { items: Object.values(byId) };
}

function getMistakeSheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('MISTAKE_SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  const spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Missing spreadsheet. Bind this script to a Google Sheet or set MISTAKE_SPREADSHEET_ID.');
  }

  const sheetName = 'mistakes';
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  ensureMistakeSheetHeaders(sheet);

  return sheet;
}

function ensureMistakeSheetHeaders(sheet) {
  const headers = [
    'studentName',
    'id',
    'subject',
    'topic',
    'difficulty',
    'question',
    'answer',
    'explanation',
    'sourceUrl',
    'createdAt',
    'nextReview',
    'interval',
    'attempts',
    'correct',
    'wrong',
    'mastered',
    'json',
    'savedAt',
    'loginUser',
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach((header, index) => {
    if (existingHeaders[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
}

function findMistakeRow(sheet, studentName, id) {
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === studentName && String(values[index][1]) === id) {
      return index + 1;
    }
  }
  return 0;
}

function normalizeStudentName(value) {
  return String(value || '').trim().slice(0, 40);
}

function getLoginUser(input, fallback) {
  const activeEmail = Session.getActiveUser().getEmail();
  if (activeEmail) return activeEmail.slice(0, 120);

  const item = input.item || {};
  const explicitUser = String(input.loginUser || item.loginUser || '').trim();
  if (explicitUser) return explicitUser.slice(0, 120);

  const effectiveEmail = Session.getEffectiveUser().getEmail();
  if (effectiveEmail) return effectiveEmail.slice(0, 120);

  return String(fallback || '').trim().slice(0, 120);
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
