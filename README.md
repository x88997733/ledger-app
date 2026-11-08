# 我的記帳本
1. Supabase → SQL Editor → 貼上 schema.sql 執行
2. Authentication → Providers 開啟 Google（或只用 Email 連結登入）；URL Configuration 的 Site URL 與 Redirect URLs 加入你的 Vercel 網址
3. Project Settings → API 取得 Project URL 與 anon public key，填進 config.js
4. 上傳到 GitHub 新 repo，在 Vercel Import 該 repo（Framework: Other，無需 build）
