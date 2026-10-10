# Grill Me for Codex App：完整实施计划

> 状态：等待确认，尚未实施  
> 日期：2026-10-11  
> 目标仓库：`https://github.com/huang-zirun/grill-me-codex-app`  
> 本地目录：`/Users/bytedance/Documents/grill-me-codex-app`

## 1. 结论

做一个只服务 **Codex 桌面 App** 的公开插件，包含两部分：

1. `grill-me` Skill：让 Codex 按决策树逐层访谈。
2. 本地 MCP 服务：用标准 `elicitation/create` 请求 Codex App 显示原生表单。

目标是复刻 Anti Gravity 的**行为和交互思路**，不复刻它的私有界面代码。代码保持最小：

- 只有一个 MCP 工具：`ask_question`
- 一次只问一题
- 不建数据库
- 不建自定义前端
- 不做终端界面
- 不支持 Codex CLI、SSH 或其他 MCP 客户端

## 2. 用户最终会怎样使用

安装插件并重启 Codex App 后：

1. 用户从 Skill 列表选择 `grill-me`，或在请求中显式调用 `$grill-me`。
2. Codex 先读取代码、文件和已有上下文，自己能查到的事实不问用户。
3. Codex 只选择当前最上游的一项决策。
4. 当前聊天内出现 Codex App 原生表单，显示选项和推荐答案。
5. 用户点击、填写、跳过或取消后，Codex 自动继续下一题。
6. 所有重要分支确定后，Codex给出完整理解，请用户最终确认。

全程不需要运行 `auq`，也不需要切换到外部终端回答问题。

## 3. 与 Anti Gravity 的对应关系

| Anti Gravity 能力 | Codex App 实现 | 还原程度 |
|---|---|---|
| `/grill-me` 模式入口 | `grill-me` Skill、Skill 选择器、`$grill-me` | 行为等价，入口样式不同 |
| 模型可见的模式提示 | `SKILL.md` | 等价 |
| 沿决策树逐层访谈 | Skill 规则，由 Codex 在上下文中维护 | 等价于原版的提示驱动方式 |
| 一次只问一题 | Skill 强制每次只调用一次工具 | 等价 |
| 能查代码就不问用户 | Skill 规则 | 等价于原版的软约束 |
| 每题提供推荐答案 | 独立推荐字段，并设置为表单默认值 | 比原版文本标记更清楚 |
| 单选 | MCP 表单枚举 | 等价 |
| 多选 | MCP 表单数组枚举 | 等价 |
| 自由填写 | MCP 表单文本字段 | 等价 |
| 跳过当前题 | MCP `decline` 映射为 `skipped` | 需用真实 App 验证 |
| 取消整场访谈 | MCP `cancel` 映射为 `cancelled` | 需用真实 App 验证 |
| 阻塞模型并等待回答 | MCP `elicitation/create` | 等价 |
| 对话内保留答案 | Codex App 对话记录 | 基本等价 |
| App 重启后恢复正在等待的表单 | 依赖 Codex App | 不承诺 |
| 卡片样式、图标和排版 | 由 Codex App 决定 | 无法精确复刻 |

这里的“完整”指完整还原可观察的访谈流程，不承诺像素级界面一致，也不承诺复制 Anti Gravity 私有运行时的断点恢复。

## 4. 最小架构

```text
用户调用 $grill-me
        │
        ▼
skills/grill-me/SKILL.md
决定：查什么、问什么、先问哪一题、推荐什么
        │
        ▼
MCP 工具 ask_question
把当前一题转换为 elicitation/create
        │
        ▼
Codex App 原生表单
        │
        ▼
结构化答案返回 Codex
        │
        └── 重新计算下一项上游决策
```

### 状态归属

访谈状态只保存在 Codex 对话中：

- Codex 负责记住已经确定的决策。
- MCP 只负责当前这一题的显示和回答。
- 不在 MCP 中保存会话、题目或答案。

这样不会出现“Codex 有一份状态、MCP 数据库又有一份状态”的冲突。

## 5. MCP 工具设计

只公开一个工具：

```text
ask_question
```

### 输入

```json
{
  "question": "这次实现应优先保证什么？",
  "options": [
    {
      "id": "simplicity",
      "label": "实现简单",
      "description": "减少代码、依赖和后续维护成本"
    },
    {
      "id": "compatibility",
      "label": "兼容更多客户端",
      "description": "同时支持 App、命令行和远程环境"
    }
  ],
  "is_multi_select": false,
  "recommended_option_ids": ["simplicity"],
  "allow_write_in": true
}
```

字段规则：

| 字段 | 含义 |
|---|---|
| `question` | 当前唯一问题，可以包含必要背景 |
| `options` | 可选；为空时显示开放文本题 |
| `is_multi_select` | 是否允许多选 |
| `recommended_option_ids` | Codex 推荐的答案 |
| `allow_write_in` | 是否显示自由填写字段 |

选项数量只在 Skill 中建议控制为 2～5 个，不在代码里增加复杂限制。

### 输出

用户正常提交：

```json
{
  "status": "answered",
  "selected_option_ids": ["simplicity"],
  "write_in_response": ""
}
```

用户自由填写：

```json
{
  "status": "answered",
  "selected_option_ids": [],
  "write_in_response": "我希望先做最小版本，再决定是否扩展。"
}
```

用户跳过或取消：

```json
{ "status": "skipped", "selected_option_ids": [], "write_in_response": "" }
```

```json
{ "status": "cancelled", "selected_option_ids": [], "write_in_response": "" }
```

### 表单转换

MCP 服务只做四件事：

1. 把问题、选项说明和推荐理由组成表单说明。
2. 把单选、多选或文本题转换成受限 JSON Schema。
3. 调用 `server.elicitInput()` 并等待 Codex App。
4. 把 `accept`、`decline`、`cancel` 转成统一输出。

不重试、不轮询、不落盘，也不在客户端不支持时偷偷退回 Markdown 提问。失败应直接暴露，方便发现兼容性变化。

## 6. Skill 行为设计

Skill 不直接复制逆向得到的 Google 原文，而是重新表达同一套行为：

1. 把任务整理成依赖明确的决策树。
2. 先调查事实；代码、文件或工具能回答的内容不得问用户。
3. 每次只问一个依赖已经满足的最上游问题。
4. 每题给出明确推荐，并让接受推荐成为最低成本操作。
5. 每次回答后重算剩余分支；没有重要未决项时才结束。

其他规则：

- 必须使用 `ask_question`，不把问题作为普通 Markdown 发出。
- 用户跳过时记录“未决定”，只有确实阻塞下游时才重新询问。
- 用户取消时立即结束访谈，不继续追问，也不开始实施。
- 不为了显得全面而询问低价值问题。
- 完成时列出目标、范围、关键决策、未决风险，再用原生表单请求最终确认。
- 用户确认后，只有原始请求包含实施工作时才开始实施；否则只交付访谈结果。

## 7. 公开仓库结构

计划中的最终结构：

```text
grill-me-codex-app/
├── .agents/plugins/marketplace.json
├── .codex-plugin/plugin.json
├── .github/workflows/test.yml
├── skills/grill-me/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── src/server.mjs
├── tests/server.test.mjs
├── dist/server.mjs
├── .mcp.json
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
└── PLAN.md
```

### 文件职责

| 文件 | 职责 |
|---|---|
| `SKILL.md` | 访谈策略和停止条件 |
| `src/server.mjs` | 唯一业务代码，目标约 100～150 行 |
| `dist/server.mjs` | 打包后的零安装运行文件 |
| `.mcp.json` | 让插件启动本地 MCP 服务 |
| `plugin.json` | 声明 Skill 和 MCP |
| `marketplace.json` | 允许通过 GitHub 仓库安装 |
| `server.test.mjs` | 表单转换和结果映射测试 |

使用 JavaScript，不引入 TypeScript、数据库、Web 框架或配置系统。开发时使用官方 MCP TypeScript SDK，发布时用 `esbuild` 打成单文件；使用者不需要执行 `npm install`。

## 8. 明确不做的内容

第一版不做：

- AUQ 的本地 JSON 会话、UUID、轮询和终端界面
- 自己实现决策树引擎或工作流状态机
- HTTP 服务、云部署、账号、鉴权和遥测
- Codex CLI、Claude Code、Cursor、SSH 或多客户端兼容
- 自定义 Codex App 卡片样式、图标和前端

也不增加“也许以后有用”的抽象层。只有出现真实需求后才扩展。

## 9. 实施阶段

### 阶段 0：原生表单兼容性试验，约 1～2 小时

1. 建立最小 MCP 服务，只实现一个固定单选题。
2. 通过临时配置接入当前 Codex App。
3. 验证卡片出现、点击后返回、模型继续执行。
4. 再验证多选、自由填写、跳过和取消。
5. 若核心链路失败，停止开发并记录失败点，不用自定义前端绕过。

硬门槛：必须在当前 App `26.928.20755` 中完成一次真实点击闭环。

### 阶段 1：实现最小 MCP，约 2～3 小时

1. 定义一个 `ask_question` 工具。
2. 实现单选、多选和开放文本三种表单转换。
3. 实现 `answered`、`skipped`、`cancelled` 三种结果。
4. 打包为 `dist/server.mjs`。
5. 完成基础单元测试。

### 阶段 2：实现 Skill 和插件，约 2～3 小时

1. 将原版访谈原则改写为简洁的 `SKILL.md`。
2. 添加 Skill 的 App 展示信息。
3. 添加插件、MCP 和市场清单。
4. 验证安装后能同时发现 Skill 和工具。
5. 删除或停用本机旧的两层 `grill-me`/`grilling`，避免重名。

旧 Skill 的处理属于正式环境变更，实施时会先备份，且只在新插件通过测试后执行。

### 阶段 3：真实访谈验收，约 2～3 小时

使用三类任务测试：

| 场景 | 重点 |
|---|---|
| 模糊产品想法 | 是否先问目标和边界 |
| 已有代码改造 | 是否先读代码，不问可查事实 |
| 多约束技术方案 | 是否按依赖顺序逐题推进 |

每个场景只根据实际失败调整 Skill，不为假设中的边界情况增加代码。

### 阶段 4：公开发布，约 1 小时

1. 写清安装、使用、卸载和限制。
2. 使用 MIT 许可证和“非 Google/OpenAI 官方项目”声明。
3. 检查仓库中没有密钥、内部地址、公司路径或逆向文件。
4. 创建公开仓库并推送 `main`。
5. 从 GitHub 远程地址重新安装一次，确认公开用户路径可用。

总计约 8～12 小时。兼容性试验是第一道门槛，不通过就不会消耗后续时间。

## 10. 测试与验收

### 自动测试

只保留高价值测试：

1. 单选题生成 `oneOf`，推荐项成为默认值。
2. 多选题生成数组枚举，并返回多个选项编号。
3. 无选项时生成文本输入。
4. 自由填写能原样返回。
5. `accept`、`decline`、`cancel` 映射正确。

GitHub Actions 只运行测试和构建，并确认提交的 `dist/server.mjs` 没有过期。

### App 手工验收

发布前必须全部通过：

| 编号 | 验收项 |
|---|---|
| A1 | Skill 能在 Codex App 中被发现和调用 |
| A2 | 问题在当前聊天内显示为原生表单 |
| A3 | 单选、多选、文本填写都能返回 |
| A4 | 推荐答案清楚可见，且可以直接接受 |
| A5 | 回答后 Codex 自动继续下一题 |
| A6 | 连续问题始终一次一题 |
| A7 | 用户跳过时不会被当成取消 |
| A8 | 用户取消后访谈立即停止 |
| A9 | 代码中可查的事实不会转问用户 |
| A10 | 访谈结束前不会擅自实施 |
| A11 | 最终确认后行为符合原始请求 |
| A12 | 全程无需外部终端回答问题 |

## 11. 安装方案

目标安装方式：

```bash
codex plugin marketplace add huang-zirun/grill-me-codex-app
codex plugin add grill-me@grill-me-codex-app
```

随后重启 Codex App，并开启一个新聊天测试。

如果远程市场安装在当前 App 中实测不可用，才提供备用方案：克隆仓库后把本地路径注册为市场。不会直接修改用户的 `config.toml` 作为首选安装方式。

运行要求：

- ChatGPT/Codex 桌面 App
- Node.js 20 或更高版本
- 支持 MCP `elicitation/create` 的 App 版本

## 12. GitHub 和隐私处理

已确认：

- `gh` 已登录账号 `huang-zirun`
- 账号有创建公开仓库的权限
- `huang-zirun/grill-me-codex-app` 当前不存在

当前全局 Git 邮箱是公司邮箱。创建公开仓库时只在该仓库设置：

```text
user.name = HUANG ZIRUN
user.email = 66504072+huang-zirun@users.noreply.github.com
```

不会修改全局 Git 身份。

公开内容遵守以下边界：

- 不提交附件中的逆向偏移、二进制内容或 Google 私有实现。
- 不逐字复制 Anti Gravity 的提示文本。
- 不使用 Google、Anti Gravity 或 OpenAI 的商标图标。
- README 可以说明“受 Anti Gravity 的逐题访谈思路启发”，并明确非官方关系。
- 构建依赖固定从公共 npm 源获取，不写入当前公司的内部 npm 地址。

## 13. 完成标准

只有同时满足以下条件才算完成：

1. 从公开 GitHub 仓库可以安装。
2. Codex App 内能完成单题和连续多题访谈。
3. Skill 遵守“一次一题、能查不问、每题推荐、依赖优先”。
4. 跳过与取消语义不同。
5. README 中的能力和限制与真实测试一致。

## 14. 确认后执行顺序

收到“按此计划实施”后，将按以下顺序执行：

1. 在当前目录建立本地 Git 仓库，但先不创建远程仓库。
2. 完成阶段 0 的 Codex App 原生表单试验。
3. 试验通过后实现、测试并安装本地插件。
4. 你验收实际交互后，再创建公开 GitHub 仓库并推送。
5. 从远程仓库重新安装，完成最终验收。

这样可以避免先公开一个尚未证明能在 Codex App 中工作的仓库。
