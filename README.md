# YouTube 雙語字幕助手 (youtube-dual-subtitles)

適用於 Google Chrome 的輕量化擴充功能（Manifest V3），在 YouTube 播放影片時自動將原生字幕翻譯成指定的第二語言，雙語同步顯示，並可下載雙語 SRT / TXT 字幕檔。

---

## 主要功能

- **雙語對照**：在 YouTube 原生字幕下方，同步渲染翻譯後的第二字幕
- **多語言支援**：繁體中文、簡體中文、英文、日文、韓文、西班牙文、法語、德語、越南語、泰語等
- **即時設定面板**：可調整啟用/停用、目標語言、字體大小（14px–36px）、背景透明度（0–100%）
- **下載雙語字幕**：下載 SRT（影片剪輯用）或 TXT（逐字稿用）雙語字幕檔
- **免 API 金鑰**：使用免費 Google 翻譯服務，安裝即用

---

## 專案檔案結構

```
youtube-dual-subtitles/
├── manifest.json       # 擴充功能設定（權限、腳本入口）
├── interceptor.js      # MAIN world 腳本，攔截播放器字幕請求並快取
├── content.js          # 頁面字幕偵測與翻譯疊加
├── background.js       # Service Worker（Google 翻譯 API 轉發）
├── popup.html          # 設定面板 HTML
├── popup.css           # 設定面板樣式
├── popup.js            # 設定面板邏輯與下載功能
└── style.css           # 字幕樣式
```

---

## 安裝步驟（新電腦懶人包）

### 1. 取得專案資料夾

將整個專案資料夾（含上列所有檔案）複製到新電腦，例如放在 `D:\extensions\youtube-dual-subtitles`。

> 若使用 Git：
> ```
> git clone <你的 repo URL> D:\extensions\youtube-dual-subtitles
> ```

### 2. 開啟 Chrome 擴充功能頁面

在網址列輸入：
```
chrome://extensions/
```

### 3. 開啟開發人員模式

頁面**右上角**找到「**開發人員模式**」開關 → 切換為**開啟**。

### 4. 載入擴充功能

點擊左上角「**載入未封裝項目**」→ 選擇專案資料夾 → 確認。

載入後會看到「**youtube-dual-subtitles**」卡片出現在列表中。

### 5. 釘選到工具列（方便操作）

點擊瀏覽器右上角拼圖圖示 → 找到「youtube-dual-subtitles」→ 點擊圖釘固定。

---

## 使用方式

### 雙語字幕顯示

1. 開啟 YouTube 影片
2. 點擊播放器右下角 **CC** 圖示，開啟 YouTube 原生字幕
3. 點擊工具列的擴充功能圖示，開啟設定面板
4. 確認「**啟用雙語字幕**」為開啟，選擇「**目標翻譯語言**」
5. 字幕會自動在原文下方顯示翻譯

### 下載雙語字幕（SRT / TXT）

> **重要前提**：下載前必須先完成以下步驟，否則會出現「字幕尚未被快取」錯誤。

1. 開啟 YouTube 影片頁面（**重新整理**頁面以注入攔截腳本）
2. 開啟 CC 字幕
3. **播放影片幾秒鐘**，讓播放器自動載入字幕資料
4. 開啟擴充功能面板
5. 在「下載雙語字幕」區塊選擇來源語言
6. 點擊「**下載 SRT（雙語字幕）**」或「**下載 TXT（逐字稿）**」

**SRT 格式**：含時間碼，適合影片剪輯軟體（Premiere、DaVinci、CapCut 等）匯入
**TXT 格式**：純文字逐字稿，每行含時間戳，適合閱讀或整理

---

## 常見問題

### 第二字幕沒有出現
- 確認 YouTube 原生 CC 字幕已開啟
- 前往 `chrome://extensions/` 點擊「重新載入」，再重新整理 YouTube 頁面

### 切換目標語言後仍顯示舊語言
- 切換語言後需等目前這句字幕結束、下一句字幕出現才會更新
- 若長時間無反應，點「重新載入」並重新整理頁面

### 下載時出現「字幕尚未被快取」
- 確認已**重新整理**影片頁面（讓攔截腳本注入）
- 確認 CC 字幕已開啟且**已播放幾秒鐘**
- 若影片字幕是手動上傳的（非 ASR 自動生成），可能需要播放更久

### 下載內容只有原文，沒有翻譯
- 播放器第一次載入字幕只抓原文，翻譯版字幕（tlang）通常在開啟字幕後才被觸發
- 確認設定面板中「目標翻譯語言」已選擇，且字幕翻譯已在畫面上顯示

---

## 技術架構說明

| 元件 | 執行環境 | 說明 |
|------|----------|------|
| `interceptor.js` | MAIN world / document_start | 攔截播放器的 `fetch` 和 `XMLHttpRequest`，將 timedtext 回應快取至 `window.__dualSubCache` |
| `content.js` | ISOLATED world / document_idle | MutationObserver 監聽 `.ytp-caption-segment`，送翻譯請求，插入 `.ytp-dual-subtitle-container` |
| `background.js` | Service Worker | 轉發 Google Translate API 請求（繞過 CORS） |
| `popup.js` | Extension popup | 讀取設定、執行下載（從快取取資料 → json3 格式解析 → 輸出 SRT/TXT） |

### 為何下載需要先播放？

YouTube 自 2024 年起對所有直接 timedtext API 請求（即使帶有 session token）從非播放器來源均回傳 HTTP 200 + 空 body。唯一能取得字幕資料的方式是攔截播放器本身的請求。`interceptor.js` 在頁面最早期（`document_start`）注入，掛鉤 `window.fetch` 和 `XMLHttpRequest`，捕獲播放器的字幕請求並快取，下載時直接從快取讀取。
