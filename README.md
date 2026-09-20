# Spatial 风格多人协作画布原型

这是一个不修改 `/Applications/Spatial.app` 的独立协作网页原型。它提供 Spatial 风格无限画布、便签、富文本卡片、图片/链接卡片、缩放/平移、远程光标和房间协作。

## 快速开始

需要 Node.js 24（Node 20 也可运行，持久化会回退到内存存储）：

```bash
npm run dev
# 打开 http://127.0.0.1:8787
```

在两个浏览器窗口中打开地址，使用不同昵称即可验证光标、对象移动和内容同步。通过 **Invite** 复制带房间 ID 的链接。

## 右键沉浸式操作

画布内容操作统一从右键菜单进入：在空白处右键可创建便签、富文本、图片和链接；在卡片上右键可编辑、复制或删除。便签和富文本支持直接点入持续输入，图片可编辑说明，链接可编辑标题和地址；编辑中的卡片不会因协作者更新而丢失焦点。菜单还提供适配画布和复制邀请链接。画布拖动、滚轮缩放和远程光标保留为空间导航，不依赖底部工具栏。

沉浸式模式默认隐藏品牌栏、工具栏和网格，只保留卡片、光标与淡出的在线状态；需要操作时在画布任意位置右键即可。

界面默认中文。可在加入页点击语言按钮，或在画布右键菜单选择 `切换到 English` / `Switch to 中文`；语言选择会保存在当前浏览器中，房间名、昵称和已有内容保持原样。

## API 与协议

- `POST /api/rooms`：创建房间，JSON `{ "name": "Design", "password": "demo1234" }`。
- `POST /api/rooms/:roomId/join`：JSON `{ "password": "...", "nickname": "Ada" }`，返回会话 token 和 WebSocket URL。
- `GET /api/rooms/:roomId/state`：读取画布快照。
- `POST /api/rooms/:roomId/assets` / `GET .../:assetId`：上传和读取图片资源。
- WebSocket `/ws?roomId=<id>&token=<token>`：`joined`、`sync-step1/2`、`y-update`、`awareness`、`presence`、`leave`。

服务器使用 Node 24 `node:sqlite` 时保存 SQLite WAL；不支持 `node:sqlite` 的环境会回退到内存存储。`shared/protocol.ts` 保存共享类型定义。

## 检查与测试

```bash
npm run check
npm test
```

## Docker

```bash
docker build -t spatial-collab .
docker run --rm -p 8787:8787 spatial-collab
```

生产环境请将 `SPATIAL_DATA_DIR` 挂载到持久化卷，并在反向代理上启用 WebSocket Upgrade。
