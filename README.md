# sohoffice-claude

- [簡介](#簡介)
- [內容](#內容)
- [目錄結構](#目錄結構)
- [部署全域 skills](#部署全域-skills)
- [新增項目](#新增項目)

## 簡介

使用 Claude Code 時好用的工具：VS Code 擴充套件、全域的 Claude Code skills 等。每個項目各自獨立，有自己的 README 說明用途與安裝方式。

## 內容

| 項目 | 類型 | 說明 |
|---|---|---|
| [全域 skills](skills/) | Claude Code skills | 所有專案共用的 skills（checkout、commit-pr、harness、pr-review、requirement-design、task-execution、task-planning、testing-document），以 `just deploy-skills` 部署到 `~/.claude/skills/` |
| [Claude Sessions](vscode/claude-sessions/README.md) | VS Code 擴充套件 | 在側邊欄列出目前專案所有 Claude Code session 與狀態（busy、需要回應、idle、未執行），點一下就切到該 session 的終端機 |
| [Markdown Preview Fluent](vscode/markdown-preview-fluent/README.md) | VS Code 擴充套件 | 調整內建 Markdown 預覽的樣式：白底、易讀的字體、左側 H1 到 H3 導覽，以及在預覽編輯器中用 Cmd+Left/Right 上一頁、下一頁 |

## 目錄結構

```text
skills/<skill>/      全域 Claude Code skill，部署到 ~/.claude/skills/<skill>/
scripts/            部署與檢查 skills 的腳本（skills.sh）
vscode/<擴充套件>/   VS Code 擴充套件
```

## 部署全域 skills

全域 skills 一律在 `skills/` 修改並 commit，再執行：

```sh
just deploy-skills
```

- 把 `skills/` 底下的每個 skill 複製到 `~/.claude/skills/`：repo 裡刪除的檔案，部署後也會刪除；以前部署過、但 repo 已經移除的 skill，也會整個刪除。
- 不是這個 repo 部署的 skill 不會動到。`synced/` 是 Claude Code 自己管理的目錄，也不檢查。部署紀錄在 `~/.claude/skills/.sohoffice-claude-deployed`。
- 如果 `~/.claude/skills/` 在上次部署之後被 repo 以外的方式改過，會停下來並顯示差異。這包括部署出去的 skill 被修改或刪除，或多了一個 repo 沒有的 skill 目錄。處理方式：把修改搬回 `skills/` 再部署，或以 `just deploy-skills force` 捨棄那些修改。
- 只檢查、不部署：`just check-skills`。
- 執行中的 session 只在啟動時載入 skills，部署後要請它們重讀改過的 `SKILL.md`。

### 每天檢查

在 Claude 桌面版的 Code 分頁建立一個本機排程任務：每天執行、只在這台電腦上、工作資料夾設為這個 repo。任務的指示是執行 `just check-skills`；有差異時列出改了什麼並發 macOS 通知，但不修改、不部署任何東西。本機排程任務只在 app 開著、電腦醒著時執行；錯過的話，下次啟動或喚醒時會補跑最近一次。

## 新增項目

1. 依類型放進對應的目錄，例如 VS Code 擴充套件放在 `vscode/<名稱>/`；新的類型就新增一個頂層目錄，並補進〈[目錄結構](#目錄結構)〉。
2. 每個項目附一份 README，開頭是目錄，說明用途、安裝與設定。
3. 在〈[內容](#內容)〉的表格加一列。
