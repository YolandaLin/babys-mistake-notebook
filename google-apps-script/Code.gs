const GEMINI_MODEL = 'gemini-2.5-flash';

function doPost(e) {
  try {
    const input = JSON.parse(e.postData.contents || '{}');
    if (input.action !== 'refineMistake') {
      return jsonOutput({ ok: false, error: 'Unknown action' });
    }

    const data = refineMistake(input);
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

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
