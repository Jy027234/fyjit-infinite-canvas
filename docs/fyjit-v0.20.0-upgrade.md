# FYJIT 创作中心 v0.20.0 升级记录

## 源码基线

- 升级分支：`codex/upgrade-canvas-v0.20.0`。
- 原 FYJIT 版本：`v0.13.0-fyjit.5` / `f6f0b487becfa7caf296e10b06c53261c75bb51e`。
- 官方目标：`v0.20.0` / `3a6b64b602ad062b29fac66902ed18a7ef5fd9dc`。
- 新派生版本标识：`v0.20.0-fyjit.1`；合并保留官方完整历史。

## 保留的集成

- FYJIT 会话、用户隔离、登录回跳、七语言 Shell 偏好、主题 Cookie、头像及退出。
- `/api/creative` 同源 BFF，本站 Token、服务端能力、估价、归一化参数、任务与实际结算。
- 服务端素材、分页筛选、回收站、跨工作台 Intent、提示词来源治理，以及画布乐观锁和版本恢复。
- `/creative/` Router basename、静态资源、独立 Nginx 容器、健康检查和深链接刷新。

## 官方功能与必要修复

合入新版画布原位重新生成、多图/多文本结果、复制引用连接、居中聚焦、缩略图、恒定屏幕尺寸浮层、拖拽渲染优化、Agent 多轮与 Skills 交互、英文/中文内容。

旧批量节点在读取时幂等转换，保持现有服务器 schema 2；保留每个结果的素材 ID、外部连线、分组和提示词/对话引用。视频刷新继续读取原 Creative Job，取消仍调用服务端取消；只有确认任务终态失败后才允许重新创建任务，网络或素材读取失败保留原任务。不可用的显式模型选择不会被静默替换。

独立复核发现并修复恢复视频运行状态、失败后首次重试、分组操作误删无关空组，以及主图删除后的素材 ID 对应问题。翻译资源与画布节点/面板拆包后，原有体积预算保持不变。

## 验证证据

- 冻结依赖安装、TypeScript、合同生成、浏览器边界、43 色主题合同检查通过；Windows 与干净 Linux 依赖环境的第三方许可证清单一致，均为 929 条。
- Bun 单元测试：103 项通过，含官方 focus/thumbnail/model-selection 测试的 FYJIT 适配、旧批量转换、素材归属、视频恢复/失败重试及分组保护。
- Canvas Agent：124 项通过、0 项失败；2 项 POSIX 目录/文件权限检查按原规则在 Windows 跳过。类型检查通过，冻结安装前后的 package 与两份 lockfile 哈希相同，未调用真实模型。
- 生产构建与原有预算通过：初始 JS 1127.1 KiB raw / 373.1 KiB gzip；最大路由 239.5 / 72.4；初始 CSS 140.2 / 23.1。
- 双镜像集成：10 项通过。主站固定为 `7f43c2278`，从独立测试 worktree 构建；覆盖真实隔离会话、语言/主题/头像、草稿、Intent、素材续作和新用户模型发现/估价/Token 消费记账。上游为隔离的 OpenAI 兼容 fixture，并非付费模型实测。
- Windows 独立 Playwright：52 项全部通过，另对原位重生/自动居中开关的刷新持久化、恢复视频取消后首次再次生成完成定向复验。固定 `mcr.microsoft.com/playwright:v1.62.1-noble` 的 Linux 最终回归同样 52 项全部通过；两平台截图基线只接受已检查的版本文字和官方参数面板变化。
- Lint：0 项错误，10 项上游警告。独立代码复核覆盖 FYJIT 接口、模型选择、计费任务恢复、素材关联、旧画布持久化和上游差异，已修复本次升级范围内的具体问题。

复验入口：

```sh
cd web
bun install --frozen-lockfile
bun run typecheck
bun run contract:check
bun run boundary:check
bun run theme:check
bun run licenses:check
bun run test
bun run lint
bun run build
bun run test:e2e
```

主站现有 `scripts/creative-integrated-browser-smoke.ps1` 可验证双镜像。此次使用同一套测试的独立 Windows Playwright runner 和仅绑定 `127.0.0.1` 的临时网关；Docker 默认地址池已用尽，测试网络显式选择未占用的 `/28` 子网。临时容器、网络和卷均由测试脚本清理，不删除其他项目资源，也未调用内置 Browser。

## 许可证与发布边界

官方 v0.20.0 使用 MIT，声明保存在 `LICENSE.upstream-MIT`；已有 FYJIT AGPL 衍生代码继续使用根目录 `LICENSE`，来源和冲突决策见 `NOTICE`、`UPSTREAM.md`、`PATCHES.md`。

本次是源码升级和隔离验证。主站生产清单仍固定已发布的 `.5` 摘要；新的公开 release、源码 commit 链接、多架构镜像、镜像扫描与生产切换须在后续发布流程生成和验证，不能用本地测试镜像替代。未调用生产模型，也未修改生产数据。

升级前已存在的混合视频输入模式校验问题记录在 `docs/content/docs/progress/todo.mdx`，未扩入本次升级范围。
