<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://github.com/Jy027234/fyjit-infinite-canvas/actions/workflows/ci.yml"><img src="https://github.com/Jy027234/fyjit-infinite-canvas/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Jy027234/fyjit-infinite-canvas"><img src="https://img.shields.io/github/stars/Jy027234/fyjit-infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/Jy027234/fyjit-infinite-canvas/releases"><img src="https://img.shields.io/github/v/release/Jy027234/fyjit-infinite-canvas?style=flat-square&label=release" alt="Release"></a>
  <a href="https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/badge/upstream-basketikun%2Finfinite--canvas-64748b?style=flat-square&logo=github" alt="Upstream repository"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="THEME.md">FYJIT 主题契约</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="CLA.md">贡献者协议</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Canvas Agent</a> · <a href="plugins/infinite-canvas">Codex app 插件</a>
</p>

无限画布是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

> [!IMPORTANT]
> 这是基于 `basketikun/infinite-canvas` 固定上游版本维护的 FYJIT AGPL 派生应用。生产数据以 FYJIT Creative API 为权威；部署和二次开发必须保留 `LICENSE`、`NOTICE`、`UPSTREAM.md`、上游历史与运行版本对应源码入口。

## 赞助商

<table>
  <tr>
    <td width="190" align="center">
      <a href="https://www.atlascloud.ai/zh?utm_source=github&amp;utm_medium=link&amp;utm_campaign=infinite-canvas"><img src="assets/atlascloud.svg" width="163" alt="Atlas Cloud"></a>
    </td>
    <td>
      <a href="https://www.atlascloud.ai/zh?utm_source=github&amp;utm_medium=link&amp;utm_campaign=infinite-canvas">Atlas Cloud</a> is a full-modal AI inference platform that gives developers a single AI API to access video generation, image generation, and LLM APIs. Instead of managing multiple vendor integrations, you connect once and get unified access to 300+ curated models across all modalities. Check out <a href="https://www.atlascloud.ai/console/coding-plan">Atlas Cloud's new coding plan promotion</a> for more budget-friendly API access.
    </td>
  </tr>
</table>

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：通过同域 FYJIT Creative API、持久化任务和 Relay 完成文生图、图生图、参考图编辑、文本问答和视频生成；浏览器不接收上游 API Key。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布；
- Codex App 插件：提供 Codex app 插件，安装后会自动注册 MCP 并尝试拉起本地 Agent。
- 插件系统：支持通过 URL 动态安装 / 启用 / 更新 / 卸载远程节点插件，并提供 TypeScript SDK 自行开发画布节点插件。
- 模型与计费：模型、本站 Token 摘要、能力限制和估价均由 FYJIT 服务端发现并校验。
- 提示词库：用户模板、变量、收藏和不可变版本由 FYJIT 服务端保存；外部来源不再由生产浏览器直接同步。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

## 快速开始

生产运行依赖同域 `/api/creative`。画布、素材、提示词和生成记录以服务端数据为权威，本地存储只用于瞬时缓存；上游 API Key 和 Base URL 不进入浏览器配置。

### 本地开发

```bash
cd web
bun install
bun run dev
```

本地开发需要把 `/api/creative` 代理到已启动的 FYJIT 主服务，并使用主站会话登录；运行期配置见 `.env.example`。

提交前运行合同、类型、单测、构建和响应式视觉回归：

```bash
cd web
bun run contract:check
bun run typecheck
bun test
bun run build
bunx playwright install chromium
bun run test:e2e
```

### Docker 运行

```bash
cp .env.example .env
# 将 FYJIT_CREATIVE_IMAGE 替换为本次发布的不可变镜像引用
docker compose up -d
```

容器只提供 `/creative/` 静态应用和独立健康检查，必须由 FYJIT 同域反向代理提供会话、Creative API、Relay、任务和资产服务。浏览器没有上游 API Key、Base URL 或自定义直连脚本入口。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 赞助支持

本项目长期开放广告赞助合作，欢迎品牌 / 产品投放，你的支持是持续更新的动力！

有广告赞助意向请通过上方联系方式沟通。

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【AI开源交流】：https://qm.qq.com/q/DFnKzZ807u

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。

你可以在遵守 AGPL-3.0 的前提下自由使用、复制、修改和分发本项目。如果你分发修改后的版本，或将其作为网站、SaaS 等网络服务提供给他人使用，需要向对应用户公开基于本项目形成的完整源代码，继续使用 AGPL-3.0 协议，并保留原项目的作者、版权、许可证和来源说明。

本项目禁止未经授权的闭源商用。如果你希望将无限画布用于商业项目，请尊重开源，遵循 AGPL-3.0 协议，继续开源基于本项目修改或开发的对应代码，回馈开源社区；如果无法公开对应代码，请联系作者购买商业授权后闭源使用。
