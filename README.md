# Grill Me for Codex App

在 Codex 桌面 App 中，用原生选择表单逐题澄清需求。

它受 Anti Gravity 的逐题访谈思路启发，但不复制其私有代码或界面。本项目不是 Google 或 OpenAI 官方项目。

## 它怎么工作

1. Codex 先查看代码、文件和当前上下文。
2. 它按决策依赖关系，每次只问一个重要问题。
3. 问题显示为 Codex App 原生表单，完整答案都在选项中，并标出推荐答案。
4. 每次回答后重新判断下一项问题。
5. 没有重要歧义后，Codex 总结理解并请求最终确认。

访谈状态保留在当前对话中。MCP（模型上下文协议）服务只负责显示当前问题，不保存数据，也不联网。

选择题不会一直显示自由填写框。只有选择“其他答案”后，才会出现填写表单。每张表单最多等待 1 小时。

## 安装

要求：

- Codex 桌面 App
- Node.js 20 或更高版本
- 支持 MCP 原生表单的 Codex App 版本

在终端执行：

```bash
codex plugin marketplace add huang-zirun/grill-me-codex-app
codex plugin add grill-me@grill-me-codex-app
```

然后在 `~/.codex/config.toml` 顶部加入：

```toml
approval_policy = { granular = { sandbox_approval = false, rules = false, skill_approval = false, request_permissions = false, mcp_elicitations = true } }
sandbox_mode = "danger-full-access"
```

重启 Codex App。点击输入框底部的权限菜单，选择：

```text
Custom (config.toml)
```

不要选择 `Full access`。部分版本会在该预设下自动拒绝 MCP 表单。仅看到 `skipped` 还不能断定是权限问题，应先确认实际调用的是 `grill_question`。

## 使用

在 Skill 列表选择 **Grill Me**，或在请求中写：

```text
$grill-me 在开始实现前，逐题帮我澄清这个需求。
```

每次原生表单出现后，选择答案或填写自己的答案。取消表单会结束整场访谈。

Skill 只调用 `grill_me` 服务的 `grill_question` 工具，不使用 Codex 内置的 `request_user_input`。如果日志提示 `request_user_input is unavailable in Default mode`，说明模型选错了工具，不是权限配置错误。

## 卸载

```bash
codex plugin remove grill-me
codex plugin marketplace remove grill-me-codex-app
```

如果不再需要 MCP 原生表单，可自行恢复 `~/.codex/config.toml` 中原来的权限设置。

## 限制

- 只面向 Codex 桌面 App，不支持 Codex 命令行交互界面。
- 表单外观由 Codex App 决定，不能复刻其他产品的像素级样式。
- App 重启后能否恢复一个正在等待回答的表单，由 Codex App 决定。
- 第一版不包含数据库、自定义前端、遥测或跨对话状态。

## 开发

```bash
npm ci
npm test
npm run build
npm run check
```

核心代码在 `src/server.mjs`，只公开一个 MCP 工具：`grill_question`。

## 许可证

[MIT](LICENSE)
