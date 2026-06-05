# 统一图标库设计

**日期**: 2026-06-05  
**状态**: 已确认

## 概述

打造一个统一的 emoji 图标库，供打卡任务图标、账本图标、记账分类三处共享使用。用户可增删管理，数据存云数据库，两人自动同步。

## 数据模型

### 新增集合：`emoji_library`

| 字段 | 类型 | 说明 |
|------|------|------|
| `emoji` | string | emoji 字符，如 "🎮" |
| `nickName` | string | 归属用户，过滤用 |
| `createTime` | Date | 添加时间 |

- 每个用户（nickName）各自一份 emoji 库
- 预设 emoji 在首次使用时 seed（从硬编码列表逐条写入）
- 用户新增的 emoji 也存入该集合
- 删除即从集合中 remove
- **数据源唯一**：所有 emoji 选择器都读这个集合，不存在硬编码列表和 DB 两套数据源

### 现有集合变化

| 集合 | 变化 |
|------|------|
| `tasks.emoji` | 不变，选择来源改为 `emoji_library` |
| `ledgers.emoji` | 不变，选择来源改为 `emoji_library` |
| `categories` | 保持现有结构（name / emoji / type / nickName / createTime），建分类时 emoji 从 `emoji_library` 中选取 |
| `transactions` | 不变，仍然存 category + categoryEmoji 字段 |

### 预设 seed 列表（~50 个 emoji）

合并现有三处硬编码列表并去重：
- checkin `EMOJI_LIST`（37 个）
- accounting `LEDGER_EMOJIS`（16 个）
- accounting add 模板中的 emoji 列表（~30 个）

### Seed 逻辑

- 每次进入需要 emoji 列表的页面时，先查 `emoji_library` 中当前用户的数据
- 如果该用户在该集合中无任何数据，触发 seed：将预设列表逐条 `add` 到 `emoji_library`
- Seed 后直接读 DB，代码中不再维护运行时 emoji 列表常量
- 预设列表以一个常量数组保存在 JS 代码中，仅用于 seed

## 页面与交互

### 新增页面：图标管理页 `pages/emoji-manager/emoji-manager`

- 非 tab 页，由各个 emoji 选择器旁的链接进入
- 4 列网格展示当前用户的所有 emoji
- 点击 emoji：无操作（或可做预览）
- 长按 emoji：弹出"删除确认"弹窗，确认后删除
- 底部「+ 添加新图标」按钮：点击弹出输入框，用户通过键盘/系统 emoji 面板输入 emoji 字符，确认后存入 `emoji_library`
- 添加时校验：不允许空字符，不允许已存在的 emoji（同一用户内去重）

### 改造现有 emoji 选择器

三处 emoji 选择器统一改造为同一模式：

| 位置 | 改造内容 |
|------|---------|
| 打卡任务表单（新建/编辑）| emoji 网格从 `emoji_library` 读取；底部「管理图标 →」入口 |
| 账本创建弹窗 | emoji 网格从 `emoji_library` 读取；底部「管理图标 →」入口 |
| 记账分类表单 | 重建，emoji 从 `emoji_library` 读取；「管理图标 →」入口 |

每个选择器的通用交互：
- 网格展示，选中态高亮
- 「管理图标」入口：navigateTo 到图标管理页
- 从管理页返回后自动刷新 emoji 列表

### 记账分类系统重建

把分类管理从 `add.js` 的底部弹窗中独立为 `pages/category-manager/category-manager` 页面：

- 两个 tab：支出分类 / 收入分类
- 每个 tab 下列表展示：预设分类 + 自定义分类
- 预设分类不可删除（标记 `isPreset: true`），自定义分类可左滑或长按删除
- 新增分类：从 emoji 库选图标 + 输入名称 + 选择类型（收入/支出）
- 预设分类的定义保留在代码常量中，首次使用时 seed 到 categories 集合

### 导航结构

```
app.json pages:
  "pages/checkin/checkin"           ← emoji 选择器 → 管理图标
  "pages/accounting/accounting"    ← emoji 选择器 → 管理图标
  "pages/accounting/add/add"       ← emoji 选择器 → 管理图标 / 分类管理
  "pages/emoji-manager/emoji-manager"   ← 新增
  "pages/category-manager/category-manager" ← 新增
```

### 数据流

```
emoji_library (云数据库)
    ↑ 读写
    ├── emoji-manager 页（增删）
    ├── checkin 任务表单（读）
    ├── accounting 账本创建（读）
    └── category-manager（读）

categories (云数据库)
    ↑ 读写
    └── category-manager（增删查）
         └── add.js 记账页（读）
```

## 兼容性

- `tasks.emoji` / `ledgers.emoji` / `transactions.categoryEmoji` 存储的仍然是 emoji 字符串，不受影响
- 即使 emoji 从库中删除，已使用该 emoji 的历史任务/账本/交易不受影响（存的是值，不是引用）
- 首次 seed 仅在新用户第一次进入相关页面时触发，已有用户不受影响

## 边界情况

- **重复 emoji**：添加时检查同一 nickName 下是否已存在，存在则 toast 提示
- **空 emoji**：不允许添加空字符串
- **Seed 失败**：DB 写入失败时，回退显示内置硬编码列表（保留一份 fallback 常量）
- **管理页返回刷新**：使用 `onShow` 重新加载 emoji 列表，确保增删即时生效

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `pages/emoji-manager/emoji-manager.{js,wxml,wxss,json}` |
| 新增 | `pages/category-manager/category-manager.{js,wxml,wxss,json}` |
| 新增 | `utils/emoji.js`（seed 逻辑 + 预设列表常量） |
| 修改 | `app.json`（注册新页面） |
| 修改 | `pages/checkin/checkin.{js,wxml}`（emoji 选择器改造） |
| 修改 | `pages/accounting/accounting.{js,wxml}`（账本创建弹窗改造） |
| 修改 | `pages/accounting/add/add.{js,wxml}`（分类选择改造 + 移除底部弹窗） |
