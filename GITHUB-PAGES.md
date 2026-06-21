# GitHub Pages 上載清單

## 每次更新 app 要上載

- `index.html`
- `app.js`
- `styles.css`
- `assets/beyond-fitness-logo.png`
- `assets/badminton-court.png`

## 不需要放到公開網站

- `apps-script/`
- `qa-*.png`

## 手機見到 logo 破圖時

請在 GitHub repository 確認有以下檔案，而且大小階完全一樣：

- `assets/beyond-fitness-logo.png`

GitHub Pages 的檔名大小階是敏感的，`Beyond-Fitness-Logo.png` 和 `beyond-fitness-logo.png` 會被視為不同檔案。

## Google Sheet 連線失敗時

請檢查：

1. App 內貼上的 Apps Script URL 必須是 `/exec` 結尾。
2. Apps Script 修改 code 後，要到 `Deploy` -> `Manage deployments` -> 編輯 -> `New version` -> `Deploy`。
3. Web App access 設為 `Anyone`，實際權限由 Google Sheet `Users` tab 的帳戶、密碼及 role 控制。

## 修改登入帳戶及權限

正式使用時只需要在 Google Sheet 的 `Users` tab 修改以下欄位，不需要每次改 Apps Script 或 GitHub Pages：

- `username`：登入帳戶，例如 `kit`、`coach1`、`frontdesk`
- `role`：`founder`、`coach`、`frontdesk`
- `active`：`TRUE` 才可登入
- `allowed_groups`：`all` 或指定小組名稱，用逗號分隔
- `password`：登入密碼

可以有多個 `founder` 帳戶；每個人一行即可。

教練帳戶只可使用小組點名；如要限制教練只點指定班，在 `allowed_groups` 填班名，例如 `U12 小組A,成人初階B`。班名需要與 `Sessions` tab 的 `groupName` 相同。

## 自訂網址

GitHub Pages 可以用自己的網址，例如 `app.beyondfitnesshk.com`。

1. 在 repository 新增 `CNAME` 檔案，內容只放你的網址，例如 `app.beyondfitnesshk.com`。
2. 到 GitHub repository `Settings` -> `Pages` -> `Custom domain` 填同一個網址。
3. 到你的 domain DNS 加一條 `CNAME` record：
   - Name / Host：`app`
   - Value / Target：`kitchan1002-star.github.io`
4. DNS 生效後，GitHub Pages 會自動用新網址開 app。
