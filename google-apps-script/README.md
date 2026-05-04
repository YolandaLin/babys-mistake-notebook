# Google Apps Script AI 後端

GitHub Pages 不能安全保存 Gemini API key，所以 AI 整理要放在後端。這份 Apps Script 是最輕量的 Google 帳號方案。

## 設定步驟

1. 到 Google AI Studio 建立 Gemini API key。
2. 到 https://script.google.com 建立新專案。
3. 把 `Code.gs` 內容貼到 Apps Script。
4. 在 Apps Script 的「專案設定」新增 Script property：
   - key：`GEMINI_API_KEY`
   - value：你的 Gemini API key
5. 預設資料會寫入這份 Google Sheets：
   - `1IxPZlSmAPbFL5rBICMh_lZrc36ujztsShZWUny3ZcQA`
   若要改成另一份 Google Sheets，可在 Script property 加上：
   - key：`MISTAKE_SPREADSHEET_ID`
   - value：Google Sheets 的試算表 ID
6. 部署為 Web app：
   - Execute as：Me
   - Who has access：Anyone
7. 複製 `/exec` 結尾的 Web app URL。
8. 回到網站「AI 後端設定」，貼上 endpoint 並儲存。

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

切題後也可把多題錯題 JSON 送到 Apps Script，產生考卷級錯題分析報告，包含錯題診斷表、補強重點、解題流程、考前小抄與類題練習。

## 支援動作

- `refineMistake`：整理單一題
- `analyzePage`：分析整頁照片，回傳多題切分結果
- `analyzeExamReport`：依多題錯題產生考卷級分析報告
- `saveMistake`：依使用者名稱把錯題 JSON 存到 Google Sheets
- `listMistakes`：依使用者名稱讀取雲端錯題
