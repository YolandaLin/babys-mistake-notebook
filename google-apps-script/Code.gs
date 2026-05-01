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
          subject: '數學/國語/英文/自然/社會',
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
        '你是台灣國小與國中錯題切題與整理助教。請根據整頁照片，先找出每一題的題號與題目區塊，再重建每一題可讀文字。' +
        '這個任務只需要錯題；請優先只回傳有紅筆訂正、圈選、叉號、錯誤答案標記、分數旁註、或其他明顯錯題痕跡的題目。' +
        '如果整頁有很多題但只有部分有錯題痕跡，不要把所有題目都列出。無法判斷是否為錯題時，才把該題列出並設定 needsHumanReview。' +
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
              subject: '數學/國語/英文/自然/社會',
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
  sheet.appendRow([
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
  ]);
  return { id };
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

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
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
    ]);
  }

  return sheet;
}

function normalizeStudentName(value) {
  return String(value || '').trim().slice(0, 40);
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
