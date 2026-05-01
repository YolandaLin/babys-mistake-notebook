# 錯題練習站

這是一個純前端 MVP，可直接用瀏覽器開啟 `index.html`。

## 已包含

- 拍照或上傳錯題照片
- AI 辨識後顯示題目、答案、詳解，可確認或編輯後儲存 JSON
- 本機儲存錯題庫
- 依複習排程重複出題
- 以題目文字開啟網路搜尋詳解
- 可選的瀏覽器端 OCR 載入流程
- AI 整頁切題辨識：回傳多題文字、可信度、重拍/人工確認提示
- 依使用者名稱把錯題 JSON 同步到 Google Sheets 後端

## 後續正式版建議

- 後端：Node.js 或 Python API
- 資料庫：PostgreSQL，圖片放 S3/R2
- OCR：Google Vision、Azure OCR、Tesseract server 或 OpenAI Vision
- 詳解搜尋：Search API + 白名單來源 + 引用保存
- 帳號：家長帳號、孩子個人練習帳號
- 隱私：照片去識別化、刪除權、家長同意流程
