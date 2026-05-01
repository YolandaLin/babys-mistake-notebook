# Google Apps Script AI 後端

GitHub Pages 不能安全保存 Gemini API key，所以 AI 整理要放在後端。這份 Apps Script 是最輕量的 Google 帳號方案。

## 設定步驟

1. 到 Google AI Studio 建立 Gemini API key。
2. 到 https://script.google.com 建立新專案。
3. 把 `Code.gs` 內容貼到 Apps Script。
4. 在 Apps Script 的「專案設定」新增 Script property：
   - key：`GEMINI_API_KEY`
   - value：你的 Gemini API key
5. 部署為 Web app：
   - Execute as：Me
   - Who has access：Anyone
6. 複製 `/exec` 結尾的 Web app URL。
7. 回到網站「AI 後端設定」，貼上 endpoint 並儲存。

## 行為

前端會把照片 base64 與 OCR 粗文字送到 Apps Script。Apps Script 呼叫 Gemini，回傳：

- subject
- topic
- question
- answer
- explanation
- difficulty
- confidence
- needsHumanReview
