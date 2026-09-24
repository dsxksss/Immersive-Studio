/* Spatial collaborative canvas - dependency-free client (TypeScript source). */
(() => {
  type Lang = "zh" | "en";
  type Point = { x: number; y: number };
  type Stroke = { tool: string; points: Point[]; color: string; size: number };
  type EdgePort = "left" | "right" | "top" | "bottom" | `pin:${string}`;
  type CardPin = { id: string; x: number; y: number };
  type Edge = { id: string; fromId: string; toId: string; fromPort?: EdgePort; toPort?: EdgePort; relation?: "related" | "parent" };
  type TodoItem = { id: string; text: string; done: boolean };
  type CanvasObject = {
    id: string;
    kind: "note" | "richText" | "image" | "link" | "folder" | "artboard" | "todo" | "pin";
    x: number;
    y: number;
    width: number;
    height: number;
    folderId?: string;
    pins?: CardPin[];
    zIndex?: number;
    text?: string;
    color?: string;
    title?: string;
    content?: string;
    documentId?: string;
    src?: string;
    caption?: string;
    assetId?: string;
    url?: string;
    description?: string;
    strokes?: Stroke[];
    items?: TodoItem[];
    todoVersion?: number;
    richTextVersion?: number;
    uploading?: boolean;
    uploadProgress?: number;
    uploadError?: string;
    groupId?: string;
  };
  type RemotePeer = {
    id: string;
    name: string;
    color: string;
    cursor?: Point;
    selection?: string | null;
    updatedAt?: number;
  };
  type Me = { id: string; name: string; color: string; cursor?: Point };
  type ViewState = { x: number; y: number; scale: number };
  type DragItem = { object: CanvasObject; el: HTMLElement; ox: number; oy: number };
  type ResizeCorner = "nw" | "ne" | "sw" | "se";
  type DragState = {
    pan?: boolean;
    selection?: boolean;
    group?: boolean;
    card?: CanvasObject;
    resize?: CanvasObject;
    resizeCorner?: ResizeCorner;
    minWidth?: number;
    minHeight?: number;
    el?: HTMLElement;
    sx?: number;
    sy?: number;
    ox?: number;
    oy?: number;
    ow?: number;
    oh?: number;
    items?: DragItem[];
    dropFolderId?: string | null;
    exitFolder?: boolean;
  } | null;
  type UndoSnapshot = { objects: CanvasObject[]; trash: CanvasObject[]; edges: Edge[] };
  let pinDrag: { object: CanvasObject; pin: CardPin; el: HTMLElement; x: number; y: number; before: UndoSnapshot } | null = null;

  const $ = (sel: string, root: ParentNode = document): any => root.querySelector(sel);
  // Shared rounded icon library: 24px grid, 1.8px stroke, round caps and joins.
  // mouseClick and mouseDrag: Lucide static 0.468.0 (ISC); see LUCIDE-LICENSE.txt.
  const iconPaths: Record<string, string> = {
    pen:'<path d="m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z"/>',
    marker:'<path d="m8 15 7-11 6 4-7 11Zm0 0-4 3 5 3 5-2M3 22h9"/>',
    eraser:'<path d="m4 13 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8H8l-4-4a2 2 0 0 1 0-3Zm4-4 9 9M13 20h9"/>',
    line:'<path d="m5 19 14-14"/>', rect:'<rect x="4" y="5" width="16" height="14" rx="3"/>', circle:'<circle cx="12" cy="12" r="8"/>',
    undo:'<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14"/>', redo:'<path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    copy:'<rect x="3" y="7" width="14" height="14" rx="3"/><path d="M8 3h10a3 3 0 0 1 3 3v10"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
    plus:'<path d="M12 4v16M4 12h16"/>', search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    note:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h6"/>',
    pin:'<path d="m16 3 5 5-4 1-3 5v3l-2 2-7-7 2-2h3l5-3 1-4ZM8 16l-5 5"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    link:'<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
    settings:'<path d="M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    bookmark:'<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4Z"/>', layers:'<path d="m12 3-9 5 9 5 9-5-9-5Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>', chevron:'<path d="m6 14 6-6 6 6"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', fit:'<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>', open:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    alignLeft:'<path d="M4 4v16M9 8h10v3H9zm0 5h7v3H9z"/>',
    alignCenterX:'<path d="M12 4v16M7 8h10v3H7zm2 5h6v3H9z"/>',
    alignRight:'<path d="M20 4v16M5 8h10v3H5zm3 5h7v3H8z"/>',
    alignTop:'<path d="M4 4h16M8 9v10h3V9zm5 0v7h3V9z"/>',
    alignCenterY:'<path d="M4 12h16M8 7v10h3V7zm5 2v6h3V9z"/>',
    alignBottom:'<path d="M4 20h16M8 5v10h3V5zm5 3v7h3V8z"/>',
    distributeH:'<path d="M4 4v16M20 4v16M9 9h6v6H9z"/>',
    distributeV:'<path d="M4 4h16M4 20h16M9 9h6v6H9z"/>',
    gridSnap:'<path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/>',
    tidyGrid:'<path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/>',
    reload:'<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
    external:'<path d="M14 4h6v6M10 14 20 4M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    todo:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    connect:'<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 11.5 15.5 7.5M8.5 12.5 15.5 16.5"/>',
    mouseClick:'<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
    mouseDrag:'<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />  <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />  <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />'
  };
  const icon = (name: string): string => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.note}</svg>`;
  const uid = () => Math.random().toString(36).slice(2, 8);
  const palette = ["#5979ee", "#d85d93", "#e6934d", "#3cae91", "#a66be0"];
  const params = new URLSearchParams(location.search);
  const pathRoomMatch = location.pathname.match(/^\/space\/([^/]+)\/?$/);
  let roomId = params.get("room") || (pathRoomMatch ? decodeURIComponent(pathRoomMatch[1]) : "") || "";
  let lang: Lang = params.get("lang") === "en" ? "en" : ((localStorage.getItem("spatial:lang") || "zh") === "en" ? "en" : "zh");
  let roomName = params.get("name") || (lang === "zh" ? "未命名空间" : "Untitled Space");
  const translations = {
      zh: {
      joinEyebrow: "让想法拥有自己的空间", joinTitle: "一起创造\n下一件作品。", joinDescription: "在一张安静、无限的画布上，共同收集、整理和推进想法。", joinFoot: "为小团队与大问题而生", joinHeading: "加入空间", invited: "你受邀协作于", name: "你的昵称", namePlaceholder: "例如：小明", password: "房间密码", optional: "可选", passwordPlaceholder: "输入密码", enter: "进入空间", syncNote: "你的修改会与空间中的每个人实时同步。", canvasHint: "中键拖动画布 · 左键框选 · 滚轮缩放 · 圆点拖拽连接", createHere: "在这里创建", edit: "编辑内容", duplicate: "复制", delete: "删除", sticky: "便签", richText: "富文本", image: "图片", link: "链接", folder: "文件夹", trash: "回收站", restore: "恢复", emptyTrash: "清空回收站", artboard: "画板", items: "项", fit: "适配画布", invite: "复制邀请链接", language: "English", languageAction: "切换到 English", noteAdded: "已添加便签", documentAdded: "已添加文档", imageAdded: "已添加图片", linkAdded: "已添加链接", folderAdded: "已添加文件夹", artboardAdded: "已添加画板", copied: "邀请链接已复制", movedTrash: "已移入回收站", duplicated: "已复制", justNow: "刚刚", people: "人在线", onePerson: "1 人在线", newDocument: "新文档", writeTogether: "一起写点什么…", newVisual: "新视觉参考", newIdea: "一个新想法…", savedLink: "已保存链接", reference: "参考", imageCaptionPrompt: "输入图片说明", linkTitlePrompt: "输入链接标题", linkUrlPrompt: "输入链接地址", folderTitlePrompt: "输入文件夹名称", open: "打开面板", close: "关闭", back: "返回画布", moveIntoFolder: "已移入文件夹", folderEmpty: "文件夹为空", selectedCount: "已选择", selectionHint: "左键拖动可框选多个面板 · Ctrl/Cmd+G 建组/解组", panelInfo: "面板信息", resolution: "分辨率", filename: "文件名", date: "日期", createdOn: "创建于", dropIntoFolder: "拖入文件夹", incorrectPassword: "房间密码不正确", save: "保存", saved: "已保存，下次可从首页进入", savedRooms: "已保存的空间", saveSpace: "保存空间", untitledSpace: "未命名空间", cancel: "取消", apply: "应用", replaceImage: "替换图片", dropReplaceHint: "拖放新图片到此处替换", editImageTitle: "编辑图片", editLinkTitle: "编辑链接", editFolderTitle: "编辑文件夹", imageUpdated: "图片已更新", linkUpdated: "链接已更新", folderUpdated: "文件夹已更新", undone: "已撤回", redone: "已重做", nothingToUndo: "没有可撤回的操作", nothingToRedo: "没有可重做的操作", uploading: "上传中", uploadFailed: "上传失败", uploadRetry: "重试", p2pDirect: "直连", p2pRelay: "中继", captionLabel: "图片说明", linkTitleLabel: "链接标题", linkUrlLabel: "链接地址", folderTitleLabel: "文件夹名称", chooseImage: "选择图片", emptyArtboard: "空白画板", artboardEmptyHint: "打开后开始绘制", richTextDefault: "<h2>新文档</h2><p>一起写点什么…</p>", richTextSeed: "<h2>项目简报</h2><p>在这里共同推进想法，让故事慢慢成形。</p><p><strong>今天：</strong>收集参考、梳理结构，并分享第一版。</p>", switchWorkspace: "切换工作空间", workspaces: "工作空间", currentSpace: "当前空间", newWorkspace: "新建工作空间", openHome: "打开首页", noSavedSpaces: "暂无已保存的工作空间", saveCurrentHint: "可先保存当前空间，或新建一个", imagePasted: "已从剪贴板粘贴图片", noImageInClipboard: "剪贴板中没有图片", grouped: "已建组", ungrouped: "已解组", gridSnap: "网格吸附", gridSnapOn: "网格吸附：开", gridSnapOff: "网格吸附：关", alignLeft: "左对齐", alignCenterX: "水平居中", alignRight: "右对齐", alignTop: "顶对齐", alignCenterY: "垂直居中", alignBottom: "底对齐", distributeH: "水平分布", distributeV: "垂直分布", aligned: "已对齐", distributed: "已分布", tidyGrid: "一键整理", tidied: "已整理对齐", tidyNeedMore: "请先选择至少 2 个面板，或在画布上放置多张图片", openExternal: "新标签打开", reloadPage: "刷新", linkEmbedFailed: "此网站不允许嵌入预览", linkEmbedHint: "因安全策略无法在面板内显示，可在新标签中打开。", linkLoading: "加载网页…", todo: "待办", todoAdded: "已添加待办", todoTitle: "待办事项", todoItemPlaceholder: "添加事项…", todoEmpty: "暂无事项", todoEmptyHint: "在下方输入，按回车快速添加", connectHint: "从圆点拖到另一卡片可连接", edgeDeleted: "已删除连接", connected: "已连接", editLink: "编辑链接", linkDescLabel: "描述", moreActions: "更多操作", openFolder: "打开文件夹", folderPeekTitle: "文件夹内容", folderPeekHint: "双击或点下方按钮进入", folderPeekEmpty: "文件夹为空", mouseMode: "鼠标模式", mouseClick: "点击", mouseDrag: "拖拽", mouseModeClickOn: "鼠标：点击", mouseModeDragOn: "鼠标：拖拽", mouseModeHint: "Alt+拖拽可临时移动卡片"
    },
    en: {
      joinEyebrow: "A shared space for ideas", joinTitle: "Make room for\nwhat’s next.", joinDescription: "Gather, shape and move ideas together — in one calm, infinite canvas.", joinFoot: "Built for small teams with big questions", joinHeading: "Join a space", invited: "You’re invited to collaborate in", name: "Your name", namePlaceholder: "e.g. Sam", password: "Room password", optional: "optional", passwordPlaceholder: "Enter password", enter: "Enter space", syncNote: "Your changes sync live with everyone here.", canvasHint: "Middle-drag to pan · Left-drag to select · Scroll to zoom · Drag ports to connect", createHere: "Create in this space", edit: "Edit content", duplicate: "Duplicate", delete: "Delete", sticky: "Sticky note", richText: "Rich text", image: "Image", link: "Link", folder: "Folder", trash: "Trash", restore: "Restore", emptyTrash: "Empty trash", artboard: "Artboard", items: "items", fit: "Fit canvas", invite: "Copy invite link", language: "中文", languageAction: "Switch to 中文", noteAdded: "Sticky note added", documentAdded: "Document added", imageAdded: "Image added", linkAdded: "Link added", folderAdded: "Folder added", artboardAdded: "Artboard added", copied: "Invite link copied", movedTrash: "Moved to trash", duplicated: "Duplicated", justNow: "just now", people: "people here", onePerson: "1 person here", newDocument: "New document", writeTogether: "Write something together…", newVisual: "New visual reference", newIdea: "A new idea…", savedLink: "Saved link", reference: "Reference", imageCaptionPrompt: "Enter image caption", linkTitlePrompt: "Enter link title", linkUrlPrompt: "Enter link URL", folderTitlePrompt: "Enter folder name", open: "Open panel", close: "Close", back: "Back to canvas", moveIntoFolder: "Moved into folder", folderEmpty: "Folder is empty", selectedCount: "selected", selectionHint: "Left-drag to box-select · Ctrl/Cmd+G to group/ungroup", panelInfo: "Panel info", resolution: "Resolution", filename: "Filename", date: "Date", createdOn: "Created on", dropIntoFolder: "Drop into folder", incorrectPassword: "Incorrect room password", save: "Save", saved: "Saved — reopen from the home screen next time", savedRooms: "Saved spaces", saveSpace: "Save space", untitledSpace: "Untitled Space", cancel: "Cancel", apply: "Apply", replaceImage: "Replace image", dropReplaceHint: "Drop a new image here to replace", editImageTitle: "Edit image", editLinkTitle: "Edit link", editFolderTitle: "Edit folder", imageUpdated: "Image updated", linkUpdated: "Link updated", folderUpdated: "Folder updated", undone: "Undone", redone: "Redone", nothingToUndo: "Nothing to undo", nothingToRedo: "Nothing to redo", uploading: "Uploading", uploadFailed: "Upload failed", uploadRetry: "Retry", p2pDirect: "Direct", p2pRelay: "Relay", captionLabel: "Caption", linkTitleLabel: "Link title", linkUrlLabel: "Link URL", folderTitleLabel: "Folder name", chooseImage: "Choose image", emptyArtboard: "Empty artboard", artboardEmptyHint: "Open to start drawing", richTextDefault: "<h2>New document</h2><p>Write something together…</p>", richTextSeed: "<h2>Project brief</h2><p>Build a calm, curious space where ideas can grow together.</p><p><strong>Today:</strong> gather references, shape the story, and share a first draft.</p>", switchWorkspace: "Switch workspace", workspaces: "Workspaces", currentSpace: "Current space", newWorkspace: "New workspace", openHome: "Open home", noSavedSpaces: "No saved workspaces yet", saveCurrentHint: "Save this space first, or create a new one", imagePasted: "Image pasted from clipboard", noImageInClipboard: "No image in clipboard", grouped: "Grouped", ungrouped: "Ungrouped", gridSnap: "Grid snap", gridSnapOn: "Grid snap: On", gridSnapOff: "Grid snap: Off", alignLeft: "Align left", alignCenterX: "Align center", alignRight: "Align right", alignTop: "Align top", alignCenterY: "Align middle", alignBottom: "Align bottom", distributeH: "Distribute horizontally", distributeV: "Distribute vertically", aligned: "Aligned", distributed: "Distributed", tidyGrid: "Tidy grid", tidied: "Tidied into a grid", tidyNeedMore: "Select at least 2 panels, or place multiple images on the canvas", openExternal: "Open in new tab", reloadPage: "Reload", linkEmbedFailed: "This site cannot be embedded", linkEmbedHint: "The site blocks embedding. Open it in a new tab instead.", linkLoading: "Loading page…", todo: "Todo", todoAdded: "Todo list added", todoTitle: "Todo list", todoItemPlaceholder: "Add a task…", todoEmpty: "No tasks yet", todoEmptyHint: "Type below and press Enter to add", connectHint: "Drag from a port to another card to connect", edgeDeleted: "Connection deleted", connected: "Connected", editLink: "Edit link", linkDescLabel: "Description", moreActions: "More actions", openFolder: "Open folder", folderPeekTitle: "Folder contents", folderPeekHint: "Double-click or use the button below to enter", folderPeekEmpty: "Folder is empty", mouseMode: "Mouse mode", mouseClick: "Click", mouseDrag: "Drag", mouseModeClickOn: "Mouse: Click", mouseModeDragOn: "Mouse: Drag", mouseModeHint: "Hold Alt to drag cards temporarily"
    }
  };
  type TranslationKey = keyof typeof translations.zh;
  const t = (key: TranslationKey | string): string => (translations[lang] as Record<string, string>)[key] ?? (translations.zh as Record<string, string>)[key] ?? key;
  function setLanguage(next: string): void { lang = next === "en" ? "en" : "zh"; localStorage.setItem("spatial:lang", lang); document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; document.title = lang === "zh" ? "Spatial — 共享画布" : "Spatial — Shared canvas"; }
  setLanguage(lang);
  const me: Me = { id: uid(), name: localStorage.getItem("spatial:nickname") || (lang === "zh" ? "访客" : "You"), color: palette[0] };
  let joined = false;
  let objects: CanvasObject[] = [];
  let edges: Edge[] = [];
  let trashItems: CanvasObject[] = [];
  let selectedEdgeId: string | null = null;
  let connDrag: { fromId: string; fromPort: EdgePort; x: number; y: number } | null = null;
  let undoStack: UndoSnapshot[] = [];
  let redoStack: UndoSnapshot[] = [];
  let pendingDragSnapshot: UndoSnapshot | null = null;
  const artboardThumbCache = new Map<string, { sig: string; url: string }>();
  const artboardThumbTimers = new Map<string, number>();
  let selected: string | null = null;
  let selectedIds = new Set<string>();
  // Match immersive theme CSS `.canvas-grid { background-size: 28px }` (line ~12 of styles.css).
  const GRID = 28;
  const GRID_SNAP_KEY = "spatial:grid-snap";
  let gridSnapEnabled = (() => {
    try {
      const raw = localStorage.getItem(GRID_SNAP_KEY);
      if (raw === null) return true; // default on
      return raw !== "0" && raw !== "false";
    } catch { return true; }
  })();
  function setGridSnapEnabled(next: boolean): void {
    gridSnapEnabled = next;
    try { localStorage.setItem(GRID_SNAP_KEY, next ? "1" : "0"); } catch {}
  }
  function snapCoord(n: number): number { return Math.round(n / GRID) * GRID; }
  function snapSize(n: number, min: number): number { return Math.max(min, snapCoord(n)); }
  type MouseMode = "click" | "drag";
  const MOUSE_MODE_KEY = "spatial:mouse-mode";
  let mouseMode: MouseMode = (() => {
    try {
      const raw = localStorage.getItem(MOUSE_MODE_KEY);
      return raw === "drag" ? "drag" : "click";
    } catch { return "click"; }
  })();
  function setMouseMode(next: MouseMode): void {
    hideFolderPeek();
    mouseMode = next === "drag" ? "drag" : "click";
    try { localStorage.setItem(MOUSE_MODE_KEY, mouseMode); } catch {}
    syncMouseModeUi();
  }
  function syncMouseModeUi(): void {
    document.body.classList.toggle("mouse-mode-click", mouseMode === "click");
    document.body.classList.toggle("mouse-mode-drag", mouseMode === "drag");
    const root = document.getElementById("mouse-mode-toggle");
    if (!root) return;
    root.querySelectorAll("[data-mouse-mode]").forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mouseMode;
      btn.classList.toggle("is-active", mode === mouseMode);
      (btn as HTMLButtonElement).setAttribute("aria-pressed", mode === mouseMode ? "true" : "false");
    });
    root.setAttribute("data-mode", mouseMode);
    root.title = mouseMode === "click" ? t("mouseModeClickOn") + " · " + t("mouseModeHint") : t("mouseModeDragOn");
  }
  let lastCardTap: { id: string | null; time: number } = { id: null, time: 0 };
  let panelOpenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Card gestures are resolved once, on canvas pointerup. */
  let pendingCardTap: { id: string; el: HTMLElement; sx: number; sy: number; pointerId: number; slop: number; moved: boolean } | null = null;
  let suppressCardClick = false;
  let lastFolderTap = { id: "", time: 0 };
  let drag: DragState = null;
  let selectionDrag: { sx: number; sy: number } | null = null;
  let openPanelId: string | null = null;
  let openedFolderId: string | null = null;
  let view: ViewState = { x: 0, y: 0, scale: 1 };
  let menuOpen = false;
  let socket: WebSocket | null = null;
  let collaborationReady = false;
  let hasServerSnapshot = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let leavingPage = false;
  let canvasListeners: AbortController | null = null;
  let websocketUrl: string | null = null;
  let sessionToken: string | null = null;
  let lastAwarenessAt = 0;
  let awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  let lastLiveMoveAt = 0;
  let liveMoveTimer: ReturnType<typeof setTimeout> | null = null;
  type PeerLink = {
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
  };
  const peers = new Map<string, PeerLink>();
  let p2pMode: "direct" | "relay" | "solo" = "solo";
  let contextPoint: Point | null = null;
  let remote: RemotePeer[] = [];
  let editingObjectId: string | null = null;
  const textUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const richDrafts = new Map<string, string>();
  const richPending = new Map<string, string>();
  const richTitleDrafts = new Map<string, string>();
  const richTitlePending = new Map<string, string>();
  const TEXT_UPDATE_MS = 400;
  type SavedRoom = { roomId: string; name: string; savedAt: number; url: string };
  const SAVED_ROOMS_KEY = "spatial:saved-rooms";
  function loadSavedRooms(): SavedRoom[] {
    try { return JSON.parse(localStorage.getItem(SAVED_ROOMS_KEY) || "[]") as SavedRoom[]; } catch { return []; }
  }
  function persistSavedRoom(entry: SavedRoom): void {
    const next = [entry, ...loadSavedRooms().filter(r => r.roomId !== entry.roomId)].slice(0, 20);
    try { localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(next)); } catch {}
  }
  function spaceUrl(id: string, name?: string): string {
    const url = new URL(`/space/${encodeURIComponent(id)}`, location.origin);
    if (name) url.searchParams.set("name", name);
    url.searchParams.set("lang", lang);
    return url.href;
  }
  function scheduleTextUpdate(object: CanvasObject): void {
    if (object.kind === "richText") richDrafts.set(object.id, object.content ?? "");
    const prev = textUpdateTimers.get(object.id);
    if (prev) clearTimeout(prev);
    textUpdateTimers.set(object.id, setTimeout(() => {
      textUpdateTimers.delete(object.id);
      if (objectById(object.id) !== object) return;
      saveObjects();
      if (object.kind === "richText") flushRichDraft(object); else sendUpdate([object]);
    }, TEXT_UPDATE_MS));
  }
  function flushTextUpdate(object: CanvasObject): void {
    if (objectById(object.id) !== object) return;
    const prev = textUpdateTimers.get(object.id);
    if (prev) { clearTimeout(prev); textUpdateTimers.delete(object.id); }
    saveObjects();
    if (object.kind === "richText") flushRichDraft(object); else sendUpdate([object]);
  }
  function sendRichOperation(object: CanvasObject, action: "content" | "title", text: string): boolean {
    if (!collaborationReady || socket?.readyState !== WebSocket.OPEN) return false;
    send({ type: "rich-text-operation", objectId: object.id, operation: { action, text } });
    return true;
  }
  function flushRichDraft(object: CanvasObject): void {
    const draft = richDrafts.get(object.id);
    if (draft !== undefined && draft !== richPending.get(object.id) && sendRichOperation(object, "content", draft)) richPending.set(object.id, draft);
    const title = richTitleDrafts.get(object.id);
    if (title !== undefined && title !== richTitlePending.get(object.id) && sendRichOperation(object, "title", title)) richTitlePending.set(object.id, title);
  }
  function setEditingObject(id: string | null): void { editingObjectId = id; }
  function getActiveEditingId(): string | null {
    if (editingObjectId) return editingObjectId;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    if (active.matches("textarea.note-editor, .rich-editor, [contenteditable=true], .todo-item-text, .todo-title, .todo-add-input, .spatial-input")) {
      return active.closest(".canvas-card")?.getAttribute("data-id") || null;
    }
    return null;
  }
  const seed = (): CanvasObject[] => [
    { id: "folder-refs", kind: "folder", x: 180, y: 160, width: 260, height: 180, title: lang === "zh" ? "参考资料" : "References" },
    { id: "image-sun", kind: "image", x: 500, y: 200, width: 310, height: 215, src: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=740&q=80", caption: lang === "zh" ? "灵感图 / 冬日光线" : "Moodboard / winter light" },
    { id: "artboard-seed", kind: "artboard", x: 860, y: 180, width: 320, height: 210, title: t("artboard"), strokes: [] }
  ];

  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  type RememberedSession = { token: string; nickname: string; color: string; roomName: string; expiresAt: number };
  function rememberRoomSession(session: { token?: string; nickname?: string; color?: string }): void {
    if (!session.token) return;
    const saved: RememberedSession = { token: session.token, nickname: session.nickname || me.name, color: session.color || me.color, roomName, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
    try { localStorage.setItem("spatial:session:" + roomId, JSON.stringify(saved)); } catch {}
  }
  function restoreRoomSession(): boolean {
    if (!roomId) return false;
    let saved: RememberedSession;
    try {
      saved = JSON.parse(localStorage.getItem("spatial:session:" + roomId) || "null");
      if (!saved || typeof saved.token !== "string" || !saved.token || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
        localStorage.removeItem("spatial:session:" + roomId);
        return false;
      }
    } catch { return false; }
    sessionToken = saved.token;
    websocketUrl = "/ws?roomId=" + encodeURIComponent(roomId) + "&token=" + encodeURIComponent(saved.token);
    me.name = saved.nickname || me.name;
    me.color = saved.color || me.color;
    roomName = saved.roomName || roomName;
    // Start empty: the authenticated server snapshot is the source of truth.
    objects = []; edges = []; remote = [];
    app.innerHTML = '<main class="join-shell"><p role="status">' + (lang === "zh" ? "正在恢复房间…" : "Restoring your room…") + '</p></main>';
    connect(() => {
      joined = true;
      trashItems = loadTrash();
      renderCanvas();
    }, () => {
      joined = false;
      sessionToken = null; websocketUrl = null;
      renderJoin();
      toast(lang === "zh" ? "暂时无法恢复房间，请重试或重新输入密码" : "Could not restore this room. Retry or enter its password.");
    });
    return true;
  }

  function renderJoin(): void {
    const saved = loadSavedRooms();
    const hasRoom = !!roomId;
    const heading = hasRoom ? t("joinHeading") : (lang === "zh" ? "创建空间" : "Create a space");
    const savedList = saved.length
      ? `<div class="saved-rooms"><div class="saved-rooms-title">${t("savedRooms")}</div>${saved.slice(0, 6).map(r => `<button type="button" class="saved-room-btn" data-room="${escapeHtml(r.roomId)}" data-name="${escapeHtml(r.name)}"><span class="saved-room-name">${escapeHtml(r.name || t("untitledSpace"))}</span><span class="saved-room-meta">${new Date(r.savedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span></button>`).join("")}</div>`
      : "";
    app.innerHTML = `<main class="join-shell"><section class="join-visual"><div class="join-brand"><span class="brand-mark">✣</span><span>spatial</span></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="join-copy"><div class="eyebrow">${t("joinEyebrow")}</div><h1>${escapeHtml(t("joinTitle")).replace("\n", "<br>")}</h1><p>${t("joinDescription")}</p></div><div class="join-foot"><span class="tiny-dot"></span> ${t("joinFoot")}</div></section><section class="join-panel"><div class="join-card"><button class="language-toggle" id="language-toggle" type="button">🌐 ${t("language")}</button><div class="mini-logo">✣</div><h2>${heading}</h2><p class="sub">${hasRoom ? `${t("invited")} <strong>${escapeHtml(roomName)}</strong>${lang === "zh" ? "。" : "."}` : (lang === "zh" ? "进入后会生成独立的空间链接，可随时保存与分享。" : "Entering creates a unique space link you can save and share.")}</p><form id="join-form"><label>${t("name")}<input id="nickname" value="${escapeHtml(me.name === "You" || me.name === "访客" ? "" : me.name)}" placeholder="${t("namePlaceholder")}" autocomplete="off" required></label><label>${lang === "zh" ? "空间名称" : "Space name"}<input id="space-name" value="${escapeHtml(roomName)}" placeholder="${t("untitledSpace")}" autocomplete="off"></label><label>${t("password")} <span class="optional">${t("optional")}</span><input id="password" type="password" placeholder="${t("passwordPlaceholder")}"></label><button class="primary" type="submit">${t("enter")} <span>↗</span></button></form>${savedList}<p class="join-note"><span>⌘</span> ${t("syncNote")}</p></div><div class="join-meta"><span>${lang === "zh" ? "Spatial 协作画布" : "Spatial collaborative canvas"}</span><span>${lang === "zh" ? "v0.1 原型" : "v0.1 prototype"}</span></div></section></main>`;
    $("#language-toggle").addEventListener("click", () => { setLanguage(lang === "zh" ? "en" : "zh"); if (!params.get("name")) roomName = lang === "zh" ? "未命名空间" : "Untitled Space"; renderJoin(); });
    document.querySelectorAll(".saved-room-btn").forEach((btn: any) => btn.addEventListener("click", () => {
      const id = btn.dataset.room;
      const name = btn.dataset.name || (lang === "zh" ? "未命名空间" : "Untitled Space");
      location.href = `/space/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}&lang=${lang}`;
    }));
    $("#join-form")!.addEventListener("submit", async (e: any) => {
      e.preventDefault();
      me.name = ($("#nickname") as HTMLInputElement).value.trim() || (lang === "zh" ? "访客" : "Guest");
      const password = ($("#password") as HTMLInputElement).value;
      const named = (($("#space-name") as HTMLInputElement)?.value || "").trim();
      if (named) roomName = named;
      else if (!roomName) roomName = lang === "zh" ? "未命名空间" : "Untitled Space";
      localStorage.setItem("spatial:nickname", me.name);
      try {
        if (!roomId) {
          const created = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: roomName, password: password || undefined }) });
          if (!created.ok) throw new Error(lang === "zh" ? "无法创建空间" : "Could not create room");
          const room = await created.json();
          roomId = room.roomId;
          history.replaceState({}, "", `/space/${encodeURIComponent(roomId)}?name=${encodeURIComponent(roomName)}&lang=${lang}`);
        }
        const joinedRoom = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, nickname: me.name, color: me.color }) });
        if (!joinedRoom.ok) {
          if (joinedRoom.status === 401) throw new Error(t("incorrectPassword"));
          // 404 without password: WebSocket will create the room with this id.
          if (joinedRoom.status !== 404 || password) throw new Error(t("incorrectPassword"));
        } else {
          const session = await joinedRoom.json(); websocketUrl = session.websocketUrl; sessionToken = session.token || null;
          rememberRoomSession(session);
        }
        remote = [];
        // Do not expose stale localStorage content before the authenticated snapshot.
        joined = false; hasServerSnapshot = false; objects = seed(); edges = [];
        trashItems = loadTrash();
        app.innerHTML = '<main class="join-shell"><p role="status">' + (lang === "zh" ? "正在加入房间…" : "Joining room…") + '</p></main>';
        connect(() => { joined = true; renderCanvas(); }, () => {
          joined = false; renderJoin(); toast(lang === "zh" ? "连接失败，请重试" : "Connection failed. Please retry.");
        });
      } catch (error) { toast((error as Error).message || (lang === "zh" ? "无法加入此空间" : "Could not join this space")); }
    });
  }

  function saveObjects(): void {
    try { localStorage.setItem("spatial:room:" + roomId, JSON.stringify({ objects, edges })); } catch (_) {}
  }
  function loadTrash(): CanvasObject[] { try { return JSON.parse(localStorage.getItem("spatial:trash:" + roomId) || "[]"); } catch (_) { return []; } }
  function saveTrash(): void { try { localStorage.setItem("spatial:trash:" + roomId, JSON.stringify(trashItems)); } catch (_) {} }
  function cloneCanvasState(): UndoSnapshot {
    return { objects: JSON.parse(JSON.stringify(objects)), trash: JSON.parse(JSON.stringify(trashItems)), edges: JSON.parse(JSON.stringify(edges)) };
  }
  function snapshotState(): void {
    undoStack.push(cloneCanvasState());
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
  }
  function syncStateToPeers(before: UndoSnapshot): void {
    const beforeMap = new Map(before.objects.map((o) => [o.id, o]));
    const afterIds = new Set(objects.map((o) => o.id));
    const deleted = [...beforeMap.keys()].filter((id) => !afterIds.has(id));
    const changed = objects.filter((o) => {
      const prev = beforeMap.get(o.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(o);
    });
    const beforeEdges = new Map((before.edges || []).map((e) => [e.id, e]));
    const afterEdgeIds = new Set(edges.map((e) => e.id));
    const deletedEdges = [...beforeEdges.keys()].filter((id) => !afterEdgeIds.has(id));
    const changedEdges = edges.filter((e) => {
      const prev = beforeEdges.get(e.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(e);
    });
    sendUpdate(changed, deleted, changedEdges, deletedEdges);
  }
  function restoreSnapshot(next: UndoSnapshot, toastKey: "undone" | "redone"): void {
    const before = cloneCanvasState();
    objects = next.objects.map(o => {
      const current = objectById(o.id);
      // Canvas undo restores placement; todo content belongs to item operations.
      return o.kind === "todo" && current?.kind === "todo"
        ? { ...o, title: current.title, items: current.items, todoVersion: current.todoVersion }
        : o.kind === "richText" && current?.kind === "richText"
          ? { ...o, title: current.title, content: current.content, richTextVersion: current.richTextVersion } : o;
    });
    trashItems = next.trash;
    edges = next.edges || [];
    selected = null;
    selectedIds = new Set();
    selectedEdgeId = null;
    saveObjects();
    saveTrash();
    closePanel();
    closeSpatialModal();
    renderObjects();
    syncStateToPeers(before);
    toast(t(toastKey));
  }
  function undoLast(): void {
    const previous = undoStack.pop();
    if (!previous) return toast(t("nothingToUndo"));
    redoStack.push(cloneCanvasState());
    if (redoStack.length > 30) redoStack.shift();
    restoreSnapshot(previous, "undone");
  }
  function redoLast(): void {
    const next = redoStack.pop();
    if (!next) return toast(t("nothingToRedo"));
    undoStack.push(cloneCanvasState());
    if (undoStack.length > 30) undoStack.shift();
    restoreSnapshot(next, "redone");
  }
  function escapeHtml(s: unknown): string { return String(s || "").replace(/[&<>'"]/g, (c: string) => (({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"} as Record<string, string>)[c])); }
  function safeRichLink(value: string): string | null {
    try { const url = new URL(value.trim()); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null; } catch { return null; }
  }
  const RICH_FONT_SIZES = [12, 14, 16, 18, 24, 32, 48];
  function sanitizeRichHtml(value: string): string {
    const template = document.createElement("template"); template.innerHTML = value;
    const allowed = new Set(["P", "DIV", "BR", "H1", "H2", "H3", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "A", "HR", "SPAN", "FONT"]);
    const clean = (parent: ParentNode): void => {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) continue;
        if (!(node instanceof HTMLElement)) { node.remove(); continue; }
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "BUTTON"].includes(node.tagName)) { node.remove(); continue; }
        clean(node);
        if (!allowed.has(node.tagName)) { node.replaceWith(...Array.from(node.childNodes)); continue; }
        const href = node.tagName === "A" ? safeRichLink(node.getAttribute("href") || "") : null;
        const legacySize = node.tagName === "FONT" && /^[1-7]$/.test(node.getAttribute("size") || "") ? RICH_FONT_SIZES[Number(node.getAttribute("size")) - 1] : null;
        const cssSize = /^(\d+(?:\.\d+)?)px$/.exec(node.style.fontSize);
        const fontSize = legacySize ?? (cssSize && Number(cssSize[1]) >= 10 && Number(cssSize[1]) <= 72 ? Number(cssSize[1]) : null);
        for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
        if (href) { node.setAttribute("href", href); node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
        if (node.tagName === "FONT") {
          const span = document.createElement("span"); span.append(...Array.from(node.childNodes));
          if (fontSize) { span.style.fontSize = `${fontSize}px`; node.replaceWith(span); }
          else node.replaceWith(...Array.from(span.childNodes));
        } else if (fontSize) node.style.fontSize = `${fontSize}px`;
      }
    };
    clean(template.content); return template.innerHTML;
  }
  function richHtml(object: CanvasObject): string { return sanitizeRichHtml(object.content ?? t("richTextDefault")); }
  function isRootObject(o: CanvasObject): boolean { return !o.folderId; }
  function visibleObjects(): CanvasObject[] {
    // Root canvas: top-level only (folder children stay off the outer world).
    // Inside a folder: only that folder's children in local space — never the folder card itself.
    if (openedFolderId) return objects.filter((o) => o.folderId === openedFolderId);
    return objects.filter(isRootObject);
  }
  function objectById(id: string | null | undefined): CanvasObject | undefined { return objects.find(o => o.id === id); }
  function clearCardSelection(except?: Element | null): void { document.querySelectorAll(".canvas-card.selected,.canvas-card.multi-selected").forEach((node) => { if (node !== except) (node as HTMLElement).classList.remove("selected", "multi-selected"); }); }
  function isCanvasTarget(target: EventTarget | null): boolean { const node = target as Element | null; return target === $("#canvas-wrap") || !!node?.classList?.contains("canvas-grid") || !!node?.classList?.contains("canvas-world") || !!node?.closest?.(".edges-layer"); }
  function folderAtPoint(point: Point, excluded: Set<string> = new Set()): CanvasObject | undefined { return visibleObjects().find(o => o.kind === "folder" && !excluded.has(o.id) && point.x >= o.x && point.x <= o.x + o.width && point.y >= o.y && point.y <= o.y + o.height); }

  function renderCanvas(): void {
    app.innerHTML = `<main class="workspace"><header class="topbar"><div class="brand"><span class="brand-mark">✣</span><span>spatial</span></div><div class="crumb"><span class="crumb-dot"></span><span>${escapeHtml(roomName)}</span><span class="chevron">⌄</span></div><div class="top-actions"><div class="presence-stack" id="presence-stack"></div><button class="icon-btn save-btn" id="save-btn" type="button"><span>☁</span> ${t("save")}</button><button class="icon-btn invite" id="invite-btn"><span>♧</span> ${t("invite")}</button><button class="avatar-btn" title="${lang === "zh" ? "你的个人资料" : "Your profile"}">${escapeHtml(me.name.slice(0,1).toUpperCase())}</button></div></header><div class="canvas-wrap" id="canvas-wrap"><div class="canvas-grid" id="canvas-grid"><div class="canvas-world" id="canvas-world"></div></div><div class="remote-layer" id="remote-layer"></div><div class="selection-box" id="selection-box"></div><div class="snap-guides" id="snap-guides" aria-hidden="true"></div><div class="folder-breadcrumb" id="folder-breadcrumb"></div><div class="canvas-hint">${t("canvasHint")}</div></div><button class="ambient-search" aria-label="${lang === 'zh' ? '查找内容' : 'Find content'}">${icon('search')}</button><button class="reference-save" id="reference-save" type="button" aria-label="${t('saveSpace')}" title="${t('save')}">${icon('bookmark')}<span>${t('save')}</span></button><button class="reference-settings" aria-label="${lang === 'zh' ? '空间设置' : 'Space settings'}">${icon('settings')}</button><div class="mouse-mode-toggle" id="mouse-mode-toggle" role="group" aria-label="${t('mouseMode')}" data-mode="click"><button type="button" data-mouse-mode="click" class="is-active" aria-pressed="true" aria-label="${t('mouseClick')}" title="${t('mouseClick')}">${icon("mouseClick")}<span>${lang === "zh" ? "点击" : "Click"}</span></button><button type="button" data-mouse-mode="drag" aria-pressed="false" aria-label="${t('mouseDrag')}" title="${t('mouseDrag')}">${icon("mouseDrag")}<span>${lang === "zh" ? "拖拽" : "Drag"}</span></button></div><div class="reference-footer"><button class="reference-date" aria-label="${t('fit')}">${Math.round(view.scale * 100)}%</button><button class="reference-actions" type="button" aria-label="${t('switchWorkspace')}" title="${t('switchWorkspace')}">${icon("layers")}${icon("chevron")}</button><button class="reference-plus" aria-label="${lang === 'zh' ? '创建内容' : 'Create content'}">${icon("plus")}</button></div><div class="align-bar" id="align-bar" role="toolbar" aria-label="align" hidden></div><div class="toolbar-wrap" aria-hidden="true"><div class="toolbar"><span class="toolbar-caption">${lang === "zh" ? "右键打开 Spatial 菜单" : "Right-click for Spatial menu"}</span></div></div><div class="context-menu" id="context-menu" role="menu" aria-label="${lang === "zh" ? "Spatial 右键菜单" : "Spatial context menu"}"></div><div class="zoom-controls"><button id="zoom-out" aria-label="${lang === "zh" ? "缩小" : "Zoom out"}">−</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="${lang === "zh" ? "放大" : "Zoom in"}">＋</button><button id="fit-btn" title="${t("fit")}">⌗</button></div><div class="status-pill"><span class="live-dot"></span><span id="online-label">${t("onePerson")}</span><span class="p2p-sep" id="p2p-sep">·</span><span id="p2p-label" class="p2p-label"></span></div><div class="panel-viewer" id="panel-viewer" aria-hidden="true"></div></main>`;
    bindCanvas(); renderObjects(); renderPresence(); renderRemotes(); fitCanvas(); updateConnectionBanner();
  }

  async function saveCurrentSpace(): Promise<void> {
    try {
      if (!roomId) {
        const created = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: roomName }) });
        if (!created.ok) throw new Error(lang === "zh" ? "无法创建空间" : "Could not create room");
        const room = await created.json();
        roomId = room.roomId;
      }
      const path = `/space/${encodeURIComponent(roomId)}?name=${encodeURIComponent(roomName)}&lang=${lang}`;
      history.replaceState({}, "", path);
      const url = spaceUrl(roomId, roomName);
      persistSavedRoom({ roomId, name: roomName, savedAt: Date.now(), url });
      toast(`${t("saved")}`);
    } catch (error) {
      toast((error as Error).message || (lang === "zh" ? "保存失败" : "Save failed"));
    }
  }

  function bindCanvas(): void {
    canvasListeners?.abort();
    canvasListeners = new AbortController();
    const signal = canvasListeners.signal;
    document.addEventListener("pointerdown", () => {
      if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
    }, { capture: true, signal });
    // Keep drafts visible during reconnect without accepting edits that cannot be saved.
    for (const type of ["pointerdown", "click", "dblclick", "contextmenu", "keydown", "beforeinput", "paste", "drop"]) {
      document.addEventListener(type, (e: Event) => {
        if (e instanceof KeyboardEvent && (e.key === "F5" || ((e.ctrlKey || e.metaKey) && ["r", "c", "a"].includes(e.key.toLowerCase())))) return;
        if (joined && !collaborationReady) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, { capture: true, signal });
    }
    const wrap = $("#canvas-wrap");
    (document.querySelector('.reference-plus') as HTMLButtonElement).onclick = (e: any) => {
      e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      contextPoint = worldPoint({clientX: innerWidth / 2, clientY: innerHeight / 2});
      showContextMenu(r.right - 268, r.top, null);
      const menu = $('#context-menu'); (menu as HTMLElement).style.top = `${Math.max(12, r.top - (menu as HTMLElement).offsetHeight - 12)}px`;
    };
    (document.querySelector('.reference-settings') as HTMLButtonElement).onclick = (e: any) => showUtilityMenu(e, 'settings');
    const refSave = document.querySelector('.reference-save') as HTMLButtonElement | null;
    if (refSave) refSave.onclick = (e: any) => { e.stopPropagation(); void saveCurrentSpace(); };
    (document.querySelector('.reference-actions') as HTMLButtonElement).onclick = (e: any) => showWorkspaceSwitcher(e);
    (document.querySelector('.reference-date') as HTMLButtonElement).onclick = (e: any) => { e.stopPropagation(); fitCanvas(); };
    (document.querySelector('.ambient-search') as HTMLButtonElement).onclick = (e: any) => showUtilityMenu(e, 'search');
    const mouseModeRoot = document.getElementById("mouse-mode-toggle");
    if (mouseModeRoot) {
      mouseModeRoot.querySelectorAll("[data-mouse-mode]").forEach((btn) => {
        (btn as HTMLButtonElement).onclick = (e: any) => {
          e.stopPropagation();
          const mode = ((e.currentTarget as HTMLElement).dataset.mouseMode || "click") as MouseMode;
          setMouseMode(mode === "drag" ? "drag" : "click");
          toast(mouseMode === "click" ? t("mouseModeClickOn") : t("mouseModeDragOn"));
        };
      });
      syncMouseModeUi();
    }
    wrap!.addEventListener("contextmenu", (e: any) => { e.preventDefault(); const hit = document.elementFromPoint(e.clientX, e.clientY); const card = (hit && hit.closest(".canvas-card")) || (e.target as Element | null)?.closest?.(".canvas-card"); if (card) selected = (card as HTMLElement).dataset.id; const rect = wrap.getBoundingClientRect(); contextPoint = { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale }; showContextMenu(e.clientX, e.clientY, card ? objects.find(o => o.id === (card as HTMLElement).dataset.id) || null : null); if (card) renderObjects(); });
    wrap!.addEventListener("pointerdown", (e: any) => {
      if (e.button === 1) {
        e.preventDefault();
        drag = { pan: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
        wrap.classList.add("is-panning");
        wrap.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      if (!isCanvasTarget(e.target)) return;
      startSelection(e);
    });
    wrap!.addEventListener("auxclick", (e: any) => { if (e.button === 1) e.preventDefault(); });
    wrap!.addEventListener("mousedown", (e: any) => { if (e.button === 1) e.preventDefault(); });
    wrap!.addEventListener("pointermove", (e: any) => {
      if (pinDrag) {
        const point = worldPoint(e), o = pinDrag.object;
        pinDrag.pin.x = Math.max(0, Math.min(1, (point.x - o.x) / o.width));
        pinDrag.pin.y = Math.max(0, Math.min(1, (point.y - o.y) / o.height));
        pinDrag.el.style.left = `${pinDrag.pin.x * 100}%`; pinDrag.el.style.top = `${pinDrag.pin.y * 100}%`;
        renderEdges(); scheduleLiveMoveBroadcast(); return;
      }
      if (connDrag) {
        const point = worldPoint(e);
        connDrag.x = point.x; connDrag.y = point.y;
        renderEdgePreview();
        return;
      }
      if (pendingCardTap?.pointerId === e.pointerId && !pendingCardTap.moved && Math.hypot(e.clientX - pendingCardTap.sx, e.clientY - pendingCardTap.sy) >= pendingCardTap.slop) {
        pendingCardTap.moved = true;
        lastFolderTap = { id: "", time: 0 };
        hideFolderPeek();
      }
      if (drag?.selection) { updateSelection(e); }
      else if (drag && drag.pan) { view.x = drag.ox + e.clientX - drag.sx; view.y = drag.oy + e.clientY - drag.sy; applyView(); }
      else if (drag?.group) {
        let dx = (e.clientX - drag.sx) / view.scale;
        let dy = (e.clientY - drag.sy) / view.scale;
        if (gridSnapEnabled && drag.items?.length) {
          const lead = drag.items[0];
          dx = snapCoord(lead.ox + dx) - lead.ox;
          dy = snapCoord(lead.oy + dy) - lead.oy;
          showSnapGuides(lead.ox + dx, lead.oy + dy);
        } else clearSnapGuides();
        drag.items.forEach(item => {
          item.object.x = item.ox + dx;
          item.object.y = item.oy + dy;
          item.el.style.left = `${item.object.x}px`;
          item.el.style.top = `${item.object.y}px`;
        });
        updateDropTarget(e, new Set(drag.items.map(item => item.object.id)));
        scheduleLiveMoveBroadcast();
      } else if (drag?.card) {
        let nx = drag.ox + (e.clientX - drag.sx) / view.scale;
        let ny = drag.oy + (e.clientY - drag.sy) / view.scale;
        if (gridSnapEnabled) { nx = snapCoord(nx); ny = snapCoord(ny); showSnapGuides(nx, ny); }
        else clearSnapGuides();
        drag.card.x = nx; drag.card.y = ny;
        drag.el.style.left = `${drag.card.x}px`;
        drag.el.style.top = `${drag.card.y}px`;
        updateDropTarget(e, new Set([drag.card.id]));
        scheduleLiveMoveBroadcast();
      } else if (drag?.resize) {
        const west = drag.resizeCorner.includes("w"), north = drag.resizeCorner.includes("n");
        const right = drag.ox + drag.ow, bottom = drag.oy + drag.oh;
        let movingX = (west ? drag.ox : right) + (e.clientX - drag.sx) / view.scale;
        let movingY = (north ? drag.oy : bottom) + (e.clientY - drag.sy) / view.scale;
        if (gridSnapEnabled) { movingX = snapCoord(movingX); movingY = snapCoord(movingY); }
        // Clamp only the moving edges; the opposite corner stays fixed at every zoom level.
        movingX = west ? Math.min(movingX, right - drag.minWidth) : Math.max(movingX, drag.ox + drag.minWidth);
        movingY = north ? Math.min(movingY, bottom - drag.minHeight) : Math.max(movingY, drag.oy + drag.minHeight);
        drag.resize.x = west ? movingX : drag.ox;
        drag.resize.y = north ? movingY : drag.oy;
        drag.resize.width = west ? right - movingX : movingX - drag.ox;
        drag.resize.height = north ? bottom - movingY : movingY - drag.oy;
        if (gridSnapEnabled) showSnapGuides(movingX, movingY, true); else clearSnapGuides();
        drag.el.style.left = `${drag.resize.x}px`;
        drag.el.style.top = `${drag.resize.y}px`;
        drag.el.style.width = `${drag.resize.width}px`;
        drag.el.style.height = `${drag.resize.height}px`;
        scheduleLiveMoveBroadcast();
      } else clearSnapGuides();
      updateCursor(e);
    });
    wrap!.addEventListener("pointerup", (e: any) => {
      if (pinDrag) { finishPinDrag(); return; }
      wrap.classList.remove("is-panning"); clearSnapGuides();
      if (connDrag) { finishConnDrag(e); pendingCardTap = null; return; }
      if (drag?.selection) { finishSelection(); pendingCardTap = null; return; }
      if (drag?.pan) { drag = null; pendingCardTap = null; return; }
      if (drag?.card || drag?.group) updateDropTarget(e, new Set(drag.group ? drag.items.map(item => item.object.id) : [drag.card.id]));
      // folder-juice-v1: one release handler; anchored preview leaves the folder available for a second tap.
      const tap = pendingCardTap?.pointerId === e.pointerId ? pendingCardTap : null;
      pendingCardTap = null;
      if (tap) {
        suppressCardClick = true;
        const isTap = !tap.moved && Math.hypot(e.clientX - tap.sx, e.clientY - tap.sy) < tap.slop;
        if (drag?.group || drag?.card || drag?.resize) finishDrag();
        else drag = null;
        if (isTap) {
          const folder = objectById(tap.id);
          if (folder?.kind === "folder") {
            const now = Date.now();
            if (peekFolderId === folder.id && lastFolderTap.id === folder.id && now - lastFolderTap.time < 520) {
              lastFolderTap = { id: "", time: 0 };
              openFolder(folder);
            } else {
              lastFolderTap = { id: folder.id, time: now };
              showFolderPeek(folder, tap.el);
            }
          } else if (folder) {
            const now = Date.now();
            if (lastCardTap.id === folder.id && now - lastCardTap.time < 520) {
              lastCardTap = { id: null, time: 0 }; openPanel(folder);
            } else {
              lastCardTap = { id: folder.id, time: now };
              if (mouseMode === "click" && !e.altKey) {
                // Resolve single vs double click before mounting an interactive drawing surface.
                panelOpenTimer = setTimeout(() => {
                  panelOpenTimer = null; lastCardTap = { id: null, time: 0 };
                  const current = objectById(folder.id); if (current) openPanel(current);
                }, 520);
              }
            }
          }
        } else lastCardTap = { id: null, time: 0 };
        return;
      }
      if (drag?.group || drag?.card || drag?.resize) finishDrag();
    });
    wrap!.addEventListener("pointercancel", (e: any) => {
      if (pinDrag) { finishPinDrag(true); return; }
      wrap.classList.remove("is-panning"); clearSnapGuides();
      pendingCardTap = null;
      if (connDrag) { connDrag = null; document.body.classList.remove("connecting"); renderEdges(); return; }
      if (drag?.selection) finishSelection(); else if (drag?.group || drag?.card || drag?.resize) finishDrag(true); else drag = null;
    });
    // Consume only the trailing click of this gesture, including after a drag.
    // A fresh pointerdown starts a new gesture and must never be swallowed.
    wrap!.addEventListener("pointerdown", () => { suppressCardClick = false; }, true);
    wrap!.addEventListener("click", (e: MouseEvent) => {
      if (!suppressCardClick) return;
      suppressCardClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    wrap!.addEventListener("dragenter", (e: any) => {
      if (![...((e.dataTransfer && e.dataTransfer.types) || [])].includes("Files")) return;
      e.preventDefault();
      wrap.classList.add("is-file-drop");
    });
    wrap!.addEventListener("dragover", (e: any) => {
      if (![...((e.dataTransfer && e.dataTransfer.types) || [])].includes("Files")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      wrap.classList.add("is-file-drop");
    });
    wrap!.addEventListener("dragleave", (e: any) => {
      const related = e.relatedTarget as Node | null;
      if (related && wrap.contains(related)) return;
      wrap.classList.remove("is-file-drop");
    });
    wrap!.addEventListener("drop", (e: any) => {
      e.preventDefault();
      wrap.classList.remove("is-file-drop");
      const files = Array.from(e.dataTransfer?.files || []) as File[];
      if (!files.length) return;
      const at = worldPoint(e);
      void addImagesFromFiles(files, at);
    });
    wrap!.addEventListener("wheel", (e: any) => { e.preventDefault(); const factor = e.deltaY > 0 ? .92 : 1.09; const rect = wrap.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top; const old = view.scale; const next = Math.max(.45, Math.min(1.8, old * factor)); view.x = px - (px - view.x) * next / old; view.y = py - (py - view.y) * next / old; view.scale = next; applyView(); }, { passive: false });
    ($("#zoom-in") as HTMLButtonElement).onclick = () => zoomAt(1.12); ($("#zoom-out") as HTMLButtonElement).onclick = () => zoomAt(.89); ($("#fit-btn") as HTMLButtonElement).onclick = fitCanvas;
    syncMouseModeUi();
    ($("#invite-btn") as HTMLButtonElement).onclick = () => { void copyInviteLink(); };
    const saveBtn = $("#save-btn") as HTMLButtonElement | null;
    if (saveBtn) saveBtn.onclick = () => { void saveCurrentSpace(); };
    document.addEventListener("click", (e: any) => {
      const menu = $("#context-menu");
      if (!menu?.classList.contains("open")) return;
      // Detached nodes (after (menu as HTMLElement).innerHTML replace) are outside the tree;
      // ignore them so a just-opened submenu is not instantly closed.
      const clickTarget = e.target as Node | null; if (!clickTarget || !clickTarget.isConnected || menu!.contains(clickTarget) || (clickTarget as Element).closest?.(".context-menu")) return;
      hideContextMenu();
    }, { signal });
    document.addEventListener("keydown", (e: any) => {
      const editing = (e.target as Element | null)?.closest?.("textarea,input,[contenteditable=true],.todo-item-text");
      const mod = e.ctrlKey || e.metaKey;
      const key = String(e.key || "").toLowerCase();
      // Artboard shortcuts must use stroke history, never the workspace snapshot stack.
      // Range/color controls belong to the drawing toolbar; only text editors keep native undo.
      const drawingPanel = document.querySelector<HTMLElement>('#panel-viewer.open.is-artboard');
      const textEditing = (e.target as Element | null)?.closest?.('textarea,[contenteditable=true],input:not([type=range]):not([type=color]):not([type=button]):not([type=checkbox])');
      if (mod && !e.altKey && !e.isComposing && !textEditing && (key === 'z' || key === 'y') && drawingPanel && !document.querySelector('.spatial-modal-root.open')) {
        e.preventDefault();
        const action = key === 'y' || e.shiftKey ? 'redo' : 'undo';
        drawingPanel.querySelector<HTMLButtonElement>(`[data-draw="${action}"]`)?.click();
        return;
      }
      if (e.key === "Escape") {
        if (pinDrag) { e.preventDefault(); finishPinDrag(true); return; }
        if (connDrag) { e.preventDefault(); connDrag = null; document.body.classList.remove("connecting"); renderEdges(); return; }
        if (drag?.card || drag?.group || drag?.resize) { e.preventDefault(); pendingCardTap = null; finishDrag(true); return; }
        if (document.querySelector(".spatial-modal-root.open")) { e.preventDefault(); closeSpatialModal(); return; }
        if (document.querySelector(".folder-peek-root.open")) { e.preventDefault(); hideFolderPeek(); return; }
        hideContextMenu(); closePanel(); hideFolderPeek();
        selectedEdgeId = null; renderEdges();
        return;
      }
      if (mod && !editing && key === "z" && !e.shiftKey) { e.preventDefault(); undoLast(); return; }
      if (mod && !editing && ((key === "z" && e.shiftKey) || key === "y")) { e.preventDefault(); redoLast(); return; }
      if (mod && !editing && key === "g") { e.preventDefault(); toggleGroupSelection(); return; }
      if (!editing && (e.key === "Delete" || e.key === "Backspace")) {
        if (selectedEdgeId) { e.preventDefault(); deleteSelectedEdge(); return; }
        if (selectedIds.size || selected) { e.preventDefault(); deleteSelectedObjects(); return; }
      }
    }, { signal });
    if (!(window as any).__spatialPasteBound) {
      (window as any).__spatialPasteBound = true;
      document.addEventListener("paste", (e: any) => { void handleClipboardPaste(e); });
    }
  }
  async function copyInviteLink(): Promise<void> {
    const link = spaceUrl(roomId, roomName);
    const legacyCopy = () => {
      const field = document.createElement('textarea'); field.value = link;
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(field); field.focus(); field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) {} finally { field.remove(); }
      return copied;
    };
    let copied = false;
    if (!navigator.clipboard?.writeText || !window.isSecureContext) copied = legacyCopy();
    else { try { await navigator.clipboard.writeText(link); copied = true; } catch (_) { copied = legacyCopy(); } }
    if (copied) { toast(t('copied')); return; }
    document.querySelector('.share-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.className = 'share-dialog';
    dialog.innerHTML = `<h2>${lang === 'zh' ? '共享空间' : 'Share space'}</h2><p>${lang === 'zh' ? '浏览器未允许自动复制，请选中链接后按 Ctrl/Cmd + C。' : 'Automatic copy was not allowed. Select the link and press Ctrl/Cmd + C.'}</p><input readonly aria-label="${lang === 'zh' ? '共享链接' : 'Share link'}"><button>${t('close')}</button>`;
    document.body.appendChild(dialog); const input=dialog.querySelector('input'); input.value=link;
    dialog.querySelector('button').onclick=()=>dialog.close(); dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal(); input.focus(); input.select(); input.onclick=()=>input.select();
  }
  function showUtilityMenu(e: MouseEvent, mode: string): void {
    e.stopPropagation(); const menu = $('#context-menu'); const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zh = lang === 'zh';
    const row = (action: string, label: string) => `<button data-utility="${action}">${label}</button>`;
    (menu as HTMLElement).innerHTML = mode === 'settings'
      ? `<div class="context-title">${escapeHtml(roomName)}</div>${row('save', `${icon("bookmark")} ${t('saveSpace')}`)}${row('fit', t('fit'))}${row('invite', t('invite'))}${row('grid-snap', `${icon("gridSnap")} ${gridSnapEnabled ? t('gridSnapOn') : t('gridSnapOff')}`)}${row('tidy', `${icon("tidyGrid")} ${t('tidyGrid')}`)}${row('trash', `${icon("trash")} ${t('trash')} (${trashItems.length})`)}${row('language', t('languageAction'))}`
      : mode === 'navigation'
      ? `${row('back', zh ? '返回完整画布' : 'Back to canvas')}<div class="context-separator"></div>` + objects.filter(o => o.kind === 'folder').map(o => row(o.id, `${icon("folder")} ${escapeHtml(o.title || t('folder'))}`)).join('')
      : `<input class="canvas-search-input" placeholder="${zh ? '搜索内容…' : 'Search content…'}" aria-label="${zh ? '搜索内容' : 'Search content'}"><div class="search-results"></div>`;
    (menu as HTMLElement).classList.add('open'); document.body.classList.add('menu-open');
    (menu as HTMLElement).style.left = `${Math.max(12, Math.min(r.left, innerWidth - (menu as HTMLElement).offsetWidth - 12))}px`;
    (menu as HTMLElement).style.top = `${mode === 'search' ? r.bottom + 12 : Math.max(12, r.top - (menu as HTMLElement).offsetHeight - 12)}px`;
    (menu as HTMLElement).querySelectorAll('[data-utility]').forEach((button: any) => button.onclick = (event: any) => {
      event.stopPropagation();
      const action = button.dataset.utility;
      // Opening trash replaces menu HTML; hide+bubble would see a detached click
      // target and immediately close the newly opened recycle bin.
      if (action === "trash") return showTrashMenu();
      if (action === "grid-snap") {
        setGridSnapEnabled(!gridSnapEnabled);
        hideContextMenu();
        toast(gridSnapEnabled ? t("gridSnapOn") : t("gridSnapOff"));
        syncGridVisual();
        return;
      }
      if (action === "tidy") {
        hideContextMenu();
        tidySelection();
        return;
      }
      hideContextMenu();
      if (action === 'back') return closeFolder();
      if (action === 'save') { hideContextMenu(); void saveCurrentSpace(); return; }
      if (['fit', 'invite', 'language'].includes(action)) return contextAction(action);
      const folder = objectById(action); if (folder) openFolder(folder);
    });
    const input = (menu as HTMLElement).querySelector('input');
    if (input) { input.oninput = () => {
      const query = input.value.trim().toLocaleLowerCase(); const results = (menu as HTMLElement).querySelector('.search-results');
      const matches = query ? objects.filter(o => [o.title, o.text, o.caption, o.url, o.content].join(' ').toLocaleLowerCase().includes(query)).slice(0, 8) : [];
      results.innerHTML = matches.map(o => `<button data-result="${escapeHtml(o.id)}">${escapeHtml(o.title || o.caption || o.text?.slice(0, 24) || kindLabel(o.kind))}</button>`).join('');
      results.querySelectorAll('button').forEach((b: any) => b.onclick = () => { hideContextMenu(); const o = objectById(b.dataset.result); if (o?.kind === 'folder') openFolder(o); else if (o) openPanel(o); });
    }; input.focus(); }
  }

  function ensureCurrentSavedIfKnown(): void {
    if (!roomId) return;
    const known = loadSavedRooms().some(r => r.roomId === roomId);
    if (!known) return;
    persistSavedRoom({ roomId, name: roomName, savedAt: Date.now(), url: spaceUrl(roomId, roomName) });
  }
  function viewportCenterWorld(): Point {
    const wrap = $("#canvas-wrap");
    if (!wrap) return { x: 400, y: 300 };
    const rect = wrap.getBoundingClientRect();
    return worldPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }
  async function createAndOpenWorkspace(): Promise<void> {
    const name = lang === "zh" ? "未命名空间" : "Untitled Space";
    try {
      const created = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (!created.ok) throw new Error(lang === "zh" ? "无法创建空间" : "Could not create room");
      const room = await created.json();
      location.href = `/space/${encodeURIComponent(room.roomId)}?name=${encodeURIComponent(name)}&lang=${lang}`;
    } catch (error) {
      toast((error as Error).message || (lang === "zh" ? "创建失败" : "Create failed"));
      location.href = `/?lang=${lang}`;
    }
  }
  function showWorkspaceSwitcher(e: MouseEvent): void {
    e.stopPropagation();
    ensureCurrentSavedIfKnown();
    const menu = $("#context-menu") as HTMLElement | null;
    if (!menu) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zh = lang === "zh";
    const saved = loadSavedRooms();
    const others = saved.filter(s => s.roomId !== roomId);
    const currentName = escapeHtml(roomName || t("untitledSpace"));
    const currentRow = roomId
      ? `<button type="button" class="workspace-switcher-item is-current" data-ws="current" disabled><span class="context-leading">${icon("layers")}</span><span class="workspace-switcher-copy"><strong>${currentName}</strong><small>${t("currentSpace")}</small></span></button>`
      : "";
    const listRows = others.length
      ? others.map(s => {
          const label = escapeHtml(s.name || t("untitledSpace"));
          const when = new Date(s.savedAt).toLocaleDateString(zh ? "zh-CN" : "en-US");
          return `<button type="button" class="workspace-switcher-item" data-ws-room="${escapeHtml(s.roomId)}" data-ws-name="${escapeHtml(s.name || "")}"><span class="context-leading">${icon("folder")}</span><span class="workspace-switcher-copy"><strong>${label}</strong><small>${when}</small></span></button>`;
        }).join("")
      : (roomId && saved.some(s => s.roomId === roomId)
          ? `<div class="workspace-switcher-empty">${zh ? "还没有其他已保存的工作空间" : "No other saved workspaces"}</div>`
          : `<div class="workspace-switcher-empty"><div>${t("noSavedSpaces")}</div><div class="workspace-switcher-hint">${t("saveCurrentHint")}</div></div>`);
    menu.innerHTML = `<div class="context-title">${icon("layers")} ${t("workspaces")}</div>${currentRow}${listRows}<div class="context-separator"></div><button type="button" data-ws="new"><span class="context-leading">${icon("plus")}</span><span>${t("newWorkspace")}</span></button><button type="button" data-ws="home"><span class="context-leading">${icon("globe")}</span><span>${t("openHome")}</span></button>${roomId && !saved.some(s => s.roomId === roomId) ? `<button type="button" data-ws="save"><span class="context-leading">${icon("bookmark")}</span><span>${t("saveSpace")}</span></button>` : ""}`;
    menu.classList.add("open");
    document.body.classList.add("menu-open");
    menu.style.left = `${Math.max(12, Math.min(r.left, innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${Math.max(12, r.top - menu.offsetHeight - 12)}px`;
    menu.querySelectorAll("[data-ws-room]").forEach((button: any) => button.onclick = (event: any) => {
      event.stopPropagation();
      const id = button.dataset.wsRoom;
      const name = button.dataset.wsName || t("untitledSpace");
      hideContextMenu();
      if (!id || id === roomId) return;
      location.href = `/space/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}&lang=${lang}`;
    });
    menu.querySelectorAll("[data-ws]").forEach((button: any) => button.onclick = (event: any) => {
      event.stopPropagation();
      const action = button.dataset.ws;
      if (action === "current") return;
      hideContextMenu();
      if (action === "new") { void createAndOpenWorkspace(); return; }
      if (action === "home") { location.href = `/?lang=${lang}`; return; }
      if (action === "save") { void saveCurrentSpace(); return; }
    });
  }
  function collectClipboardImageFiles(data: DataTransfer | null): File[] {
    if (!data) return [];
    const out: File[] = [];
    const seen = new Set<string>();
    const push = (file: File | null | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      const key = `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(file);
    };
    if (data.items) {
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) push(item.getAsFile());
      }
    }
    if (data.files) {
      for (let i = 0; i < data.files.length; i++) push(data.files[i]);
    }
    return out;
  }
  async function readClipboardImagesAsync(): Promise<File[]> {
    if (!navigator.clipboard || typeof (navigator.clipboard as any).read !== "function") return [];
    try {
      const items = await (navigator.clipboard as any).read();
      const files: File[] = [];
      for (const item of items) {
        const types: string[] = item.types || [];
        const imageType = types.find((t: string) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const ext = imageType.split("/")[1] || "png";
        files.push(new File([blob], `paste-${Date.now()}.${ext}`, { type: imageType }));
      }
      return files;
    } catch {
      return [];
    }
  }
  async function handleClipboardPaste(e: ClipboardEvent): Promise<void> {
    if (!joined) return;
    const target = e.target as Element | null;
    const editingText = !!target?.closest?.("textarea,input,[contenteditable=true]");
    let files = collectClipboardImageFiles(e.clipboardData);
    if (!files.length && !editingText) files = await readClipboardImagesAsync();
    if (!files.length) {
      if (!editingText && e.clipboardData) {
        // Soft hint only when user is clearly on canvas (not typing).
        const hasAny = !!(e.clipboardData.items?.length || e.clipboardData.files?.length);
        if (hasAny) toast(t("noImageInClipboard"));
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const at = me.cursor || contextPoint || viewportCenterWorld();
    const pasteToast = files.length === 1
      ? t("imagePasted")
      : (lang === "zh" ? `已粘贴 ${files.length} 张图片` : `Pasted ${files.length} images`);
    await addImagesFromFiles(files, at, { toastMessage: pasteToast });
  }

  function showTrashMenu(): void {
    const menu = $("#context-menu");
    if (!menu) return;
    const rows = trashItems.length
      ? trashItems.map(item => `<button type="button" data-restore="${item.id}">${icon("undo")} ${escapeHtml(item.title || item.caption || kindLabel(item.kind))}<span>${t("restore")}</span></button>`).join("")
      : `<div class="trash-empty">${lang === "zh" ? "回收站为空" : "Trash is empty"}</div>`;
    (menu as HTMLElement).innerHTML = `<div class="context-title">${icon("trash")} ${t("trash")}</div>${rows}${trashItems.length ? `<div class="context-separator"></div><button type="button" data-empty-trash>${t("emptyTrash")}</button>` : ""}`;
    (menu as HTMLElement).classList.add("open");
    document.body.classList.add("menu-open");
    (menu as HTMLElement).querySelectorAll("[data-restore]").forEach((b: any) => b.onclick = (event: any) => {
      event.stopPropagation();
      const i = trashItems.findIndex(x => x.id === b.dataset.restore);
      if (i < 0) return;
      snapshotState();
      const restored = trashItems.splice(i, 1)[0];
      objects.push(restored);
      saveTrash();
      saveObjects();
      renderObjects();
      sendUpdate([restored]);
      hideContextMenu();
      toast(t("restore"));
    });
    (menu as HTMLElement).querySelector("[data-empty-trash]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      snapshotState();
      trashItems = [];
      saveTrash();
      hideContextMenu();
    });
  }
  function objectsInGroup(groupId: string | undefined | null): CanvasObject[] {
    if (!groupId) return [];
    return objects.filter((o) => o.groupId === groupId);
  }
  function expandIdsWithGroups(ids: Iterable<string>): Set<string> {
    const next = new Set<string>();
    for (const id of ids) {
      const obj = objectById(id);
      if (obj?.groupId) objectsInGroup(obj.groupId).forEach((member) => next.add(member.id));
      else next.add(id);
    }
    return next;
  }
  function selectionObjects(): CanvasObject[] {
    const ids = selectedIds.size ? [...selectedIds] : (selected ? [selected] : []);
    return ids.map((id) => objectById(id)).filter((o): o is CanvasObject => !!o);
  }
  function toggleGroupSelection(): void {
    const selectedObjs = selectionObjects();
    if (!selectedObjs.length) return;
    const sharedGroupId = selectedObjs[0].groupId;
    const alreadyGrouped = !!sharedGroupId && selectedObjs.every((o) => o.groupId === sharedGroupId);
    if (alreadyGrouped) {
      snapshotState();
      const affected = objectsInGroup(sharedGroupId);
      affected.forEach((o) => { delete o.groupId; });
      selectedIds = new Set(affected.map((o) => o.id));
      selected = affected.length === 1 ? affected[0].id : null;
      saveObjects();
      renderObjects();
      sendUpdate(affected);
      toast(t("ungrouped"));
      return;
    }
    if (selectedObjs.length < 2) return;
    snapshotState();
    const gid = uid();
    selectedObjs.forEach((o) => { o.groupId = gid; });
    selectedIds = new Set(selectedObjs.map((o) => o.id));
    selected = null;
    saveObjects();
    renderObjects();
    sendUpdate(selectedObjs);
    toast(t("grouped"));
  }

  function clearSnapGuides(): void {
    const el = $("#snap-guides") as HTMLElement | null;
    if (el) el.innerHTML = "";
  }
  function showSnapGuides(x: number, y: number, edge = false): void {
    const layer = $("#snap-guides") as HTMLElement | null;
    const wrap = $("#canvas-wrap") as HTMLElement | null;
    if (!layer || !wrap) return;
    const sx = view.x + x * view.scale;
    const sy = view.y + y * view.scale;
    layer.innerHTML = `<div class="snap-guide snap-guide-v" style="left:${sx}px"></div><div class="snap-guide snap-guide-h" style="top:${sy}px"></div>`;
  }
  function syncGridVisual(): void {
    const grid = $("#canvas-grid") as HTMLElement | null;
    if (!grid) return;
    if (gridSnapEnabled) {
      const size = GRID * view.scale;
      grid.style.backgroundImage = "radial-gradient(rgba(170,174,184,.32) .9px, transparent .9px)";
      grid.style.backgroundSize = `${size}px ${size}px`;
      grid.style.backgroundPosition = `${view.x}px ${view.y}px`;
    } else {
      grid.style.backgroundImage = "none";
      grid.style.backgroundSize = "";
      grid.style.backgroundPosition = "";
    }
  }
  type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "distribute-h" | "distribute-v";
  function alignSelection(mode: AlignMode): void {
    const targets = selectionObjects();
    if (targets.length < 2) return;
    snapshotState();
    const left = Math.min(...targets.map((o) => o.x));
    const top = Math.min(...targets.map((o) => o.y));
    const right = Math.max(...targets.map((o) => o.x + o.width));
    const bottom = Math.max(...targets.map((o) => o.y + o.height));
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    if (mode === "left") targets.forEach((o) => { o.x = left; });
    else if (mode === "center-x") targets.forEach((o) => { o.x = cx - o.width / 2; });
    else if (mode === "right") targets.forEach((o) => { o.x = right - o.width; });
    else if (mode === "top") targets.forEach((o) => { o.y = top; });
    else if (mode === "center-y") targets.forEach((o) => { o.y = cy - o.height / 2; });
    else if (mode === "bottom") targets.forEach((o) => { o.y = bottom - o.height; });
    else if (mode === "distribute-h") {
      if (targets.length < 3) { /* still allow even spacing of 2 via centers */ }
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = (last.x + last.width) - first.x;
      const totalW = sorted.reduce((s, o) => s + o.width, 0);
      const gap = (span - totalW) / (sorted.length - 1);
      let cursor = first.x;
      sorted.forEach((o, i) => {
        if (i === 0) { cursor = o.x + o.width + gap; return; }
        if (i === sorted.length - 1) return;
        o.x = cursor;
        cursor = o.x + o.width + gap;
      });
    } else if (mode === "distribute-v") {
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = (last.y + last.height) - first.y;
      const totalH = sorted.reduce((s, o) => s + o.height, 0);
      const gap = (span - totalH) / (sorted.length - 1);
      let cursor = first.y;
      sorted.forEach((o, i) => {
        if (i === 0) { cursor = o.y + o.height + gap; return; }
        if (i === sorted.length - 1) return;
        o.y = cursor;
        cursor = o.y + o.height + gap;
      });
    }
    if (gridSnapEnabled) {
      targets.forEach((o) => { o.x = snapCoord(o.x); o.y = snapCoord(o.y); });
    }
    saveObjects();
    renderObjects();
    sendUpdate(targets);
    toast(mode.startsWith("distribute") ? t("distributed") : t("aligned"));
  }

  function median(nums: number[]): number {
    if (!nums.length) return GRID * 8;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function tidySelection(): void {
    let targets = selectionObjects();
    if (targets.length < 2) {
      targets = visibleObjects().filter((o) => o.kind === "image");
    } else {
      const images = targets.filter((o) => o.kind === "image");
      if (images.length >= 2 && images.length >= Math.ceil(targets.length * 0.5)) targets = images;
    }
    if (targets.length < 2) { toast(t("tidyNeedMore")); return; }
    snapshotState();
    const n = targets.length;
    const cols = n <= 4 ? Math.ceil(Math.sqrt(n)) : n <= 9 ? 3 : Math.max(2, Math.round(Math.sqrt(n)));
    const gap = gridSnapEnabled ? GRID : 16;
    let cellW = Math.round(median(targets.map((o) => o.width)));
    let cellH = Math.round(median(targets.map((o) => o.height)));
    cellW = Math.max(160, Math.min(420, cellW));
    cellH = Math.max(120, Math.min(360, cellH));
    if (gridSnapEnabled) {
      cellW = snapCoord(cellW) || GRID * 8;
      cellH = snapCoord(cellH) || GRID * 6;
    }
    const originX = Math.min(...targets.map((o) => o.x));
    const originY = Math.min(...targets.map((o) => o.y));
    const startX = gridSnapEnabled ? snapCoord(originX) : originX;
    const startY = gridSnapEnabled ? snapCoord(originY) : originY;
    const sorted = [...targets].sort((a, b) => {
      const rowA = Math.round(a.y / Math.max(40, cellH * 0.45));
      const rowB = Math.round(b.y / Math.max(40, cellH * 0.45));
      return rowA === rowB ? a.x - b.x : rowA - rowB;
    });
    sorted.forEach((o, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      let x = startX + col * (cellW + gap);
      let y = startY + row * (cellH + gap);
      if (gridSnapEnabled) { x = snapCoord(x); y = snapCoord(y); }
      o.x = x; o.y = y;
      if (o.kind === "image") { o.width = cellW; o.height = cellH; }
    });
    selectedIds = new Set(sorted.map((o) => o.id));
    selected = sorted.length === 1 ? sorted[0].id : null;
    saveObjects(); renderObjects(); sendUpdate(sorted); toast(t("tidied"));
  }
  function updateAlignBar(): void {
    const bar = $("#align-bar") as HTMLElement | null;
    if (!bar) return;
    const count = selectedIds.size;
    if (count < 2 || openPanelId) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    const btn = (mode: AlignMode, iconName: string, labelKey: string) =>
      `<button type="button" data-align="${mode}" title="${t(labelKey)}" aria-label="${t(labelKey)}">${icon(iconName)}</button>`;
    const sep = `<span class="align-sep" aria-hidden="true"></span>`;
    bar.innerHTML = [
      `<span class="align-count">${count} ${t("selectedCount")}</span>`,
      btn("left", "alignLeft", "alignLeft"),
      btn("center-x", "alignCenterX", "alignCenterX"),
      btn("right", "alignRight", "alignRight"),
      sep,
      btn("top", "alignTop", "alignTop"),
      btn("center-y", "alignCenterY", "alignCenterY"),
      btn("bottom", "alignBottom", "alignBottom"),
      sep,
      btn("distribute-h", "distributeH", "distributeH"),
      btn("distribute-v", "distributeV", "distributeV"),
      sep,
      `<button type="button" class="align-tidy" data-tidy="1" title="${t("tidyGrid")}" aria-label="${t("tidyGrid")}">${icon("tidyGrid")}<span>${t("tidyGrid")}</span></button>`,
    ].join("");
    bar.hidden = false;
    bar.querySelectorAll("[data-align]").forEach((node: any) => {
      node.onclick = (ev: MouseEvent) => {
        ev.stopPropagation();
        alignSelection(node.dataset.align as AlignMode);
      };
    });
    const tidyBtn = bar.querySelector("[data-tidy]") as HTMLButtonElement | null;
    if (tidyBtn) tidyBtn.onclick = (ev) => { ev.stopPropagation(); tidySelection(); };
  }

  function startSelection(e: PointerEvent): void { selectedEdgeId = null; renderEdges(); selectionDrag = { sx: e.clientX, sy: e.clientY }; drag = { selection: true }; const box = $("#selection-box"); if (box) { box.style.left = `${e.clientX}px`; box.style.top = `${e.clientY}px`; box.style.width = "0px"; box.style.height = "0px"; box.classList.add("open"); } $("#canvas-wrap")?.setPointerCapture(e.pointerId); }
  function updateSelection(e: PointerEvent): void { if (!selectionDrag) return; const box = $("#selection-box"); if (!box) return; const left = Math.min(selectionDrag.sx, e.clientX); const top = Math.min(selectionDrag.sy, e.clientY); box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${Math.abs(e.clientX - selectionDrag.sx)}px`; box.style.height = `${Math.abs(e.clientY - selectionDrag.sy)}px`; }
  function finishSelection(): void { const start = selectionDrag; const box = $("#selection-box"); selectionDrag = null; drag = null; if (box) box.classList.remove("open"); if (!start) return; const end = { x: Number.parseFloat(box?.style.left || start.sx), y: Number.parseFloat(box?.style.top || start.sy) }; const rect = $("#canvas-wrap")?.getBoundingClientRect(); if (!rect) return; const x1 = Math.min(start.sx, end.x); const y1 = Math.min(start.sy, end.y); const x2 = Math.max(start.sx, end.x + Number.parseFloat(box?.style.width || "0")); const y2 = Math.max(start.sy, end.y + Number.parseFloat(box?.style.height || "0")); const ids = visibleObjects().filter(o => { const left = rect.left + view.x + o.x * view.scale; const top = rect.top + view.y + o.y * view.scale; const right = left + o.width * view.scale; const bottom = top + o.height * view.scale; return left < x2 && right > x1 && top < y2 && bottom > y1; }).map(o => o.id); selectedIds = new Set(ids); selected = ids.length === 1 ? ids[0] : null; renderObjects(); }
  function hideFolderExit(): void {
    document.getElementById("folder-exit-drop")?.classList.remove("open", "is-target");
  }
  function updateDropTarget(e: PointerEvent, excluded: Set<string>): void {
    if (!drag) return;
    let exit = document.getElementById("folder-exit-drop");
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= 8;
    if (openedFolderId && moved && (drag.card || drag.group)) {
      if (!exit) {
        exit = document.createElement("div"); exit.id = "folder-exit-drop";
        exit.setAttribute("role", "status"); document.body.appendChild(exit);
      }
      const count = drag.group ? drag.items.length : 1;
      exit.innerHTML = `${icon("back")}<div><strong>${lang === "zh" ? "移出文件夹" : "Move out of folder"}</strong><span>${lang === "zh" ? `拖到这里松手，将 ${count} 个面板放到上一级` : `Drop here to move ${count} panel(s) to the parent canvas`}</span></div>`;
      exit.classList.add("open");
      // Hit-test the final layout bounds, independent of the entrance animation.
      const width = exit.offsetWidth, left = (innerWidth - width) / 2;
      drag.exitFolder = e.clientX >= left && e.clientX <= left + width && e.clientY >= 18 && e.clientY <= 18 + exit.offsetHeight;
      exit.classList.toggle("is-target", drag.exitFolder);
    } else { drag.exitFolder = false; hideFolderExit(); }
    const candidate = drag.exitFolder ? null : folderAtPoint(worldPoint(e), excluded);
    document.querySelectorAll(".folder-drop-target").forEach(node => node.classList.remove("folder-drop-target"));
    drag.dropFolderId = candidate?.id || null;
    if (candidate) document.querySelector(`[data-id="${candidate.id}"]`)?.classList.add("folder-drop-target");
  }
  function moveDraggedToParent(active: NonNullable<DragState>): CanvasObject[] {
    const folder = objectById(openedFolderId);
    if (!folder) return [];
    const movers = active.group ? active.items : [{ object: active.card, ox: active.ox, oy: active.oy }];
    const minX = Math.min(...movers.map(item => item.ox));
    const minY = Math.min(...movers.map(item => item.oy));
    const parentId = folder.folderId || undefined;
    const movingIds = new Set(movers.map(item => item.object.id));
    let x = folder.x + folder.width + 48, y = folder.y;
    const width = Math.max(...movers.map(item => item.ox - minX + item.object.width));
    const height = Math.max(...movers.map(item => item.oy - minY + item.object.height));
    const siblings = objects.filter(o => (o.folderId || undefined) === parentId && !movingIds.has(o.id));
    while (siblings.some(o => x < o.x + o.width + 24 && x + width + 24 > o.x && y < o.y + o.height + 24 && y + height + 24 > o.y)) y += height + 40;
    for (const item of movers) {
      item.object.folderId = parentId;
      item.object.x = x + item.ox - minX; item.object.y = y + item.oy - minY;
    }
    openedFolderId = parentId || null;
    selectedIds = movingIds; selected = movers[0].object.id;
    return movers.map(item => item.object);
  }
  function zoomAt(factor: number): void { const wrap = $("#canvas-wrap"); const px = (wrap?.clientWidth || innerWidth) / 2; const py = (wrap?.clientHeight || innerHeight) / 2; const old = view.scale; const next = Math.max(.45, Math.min(1.8, old * factor)); view.x = px - (px - view.x) * next / old; view.y = py - (py - view.y) * next / old; view.scale = next; applyView(); }
  function fitCanvas(): void {
    const wrap = $("#canvas-wrap");
    const scope = visibleObjects();
    if (!wrap || !scope.length) { view = { x: 0, y: 0, scale: .82 }; return applyView(); }
    const minX = Math.min(...scope.map(o => o.x));
    const minY = Math.min(...scope.map(o => o.y));
    const maxX = Math.max(...scope.map(o => o.x + o.width));
    const maxY = Math.max(...scope.map(o => o.y + o.height));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.min(1.05, Math.max(.45, Math.min((wrap.clientWidth - 90) / width, (wrap.clientHeight - 150) / height)));
    view.scale = scale;
    view.x = (wrap.clientWidth - width * scale) / 2 - minX * scale;
    view.y = (wrap.clientHeight - height * scale) / 2 - minY * scale;
    applyView();
  }
  function applyView(): void { const world = $("#canvas-world"); if (world) world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; const zoomButton = document.querySelector('.reference-date'); if (zoomButton) zoomButton.textContent = Math.round(view.scale * 100) + "%"; const label = $("#zoom-label"); if (label) label.textContent = Math.round(view.scale * 100) + "%"; syncGridVisual(); renderRemotes(); }
  function finishDrag(cancelled = false): void {
    const active = drag;
    hideFolderExit();
    if (!active || (!active.card && !active.resize && !active.group)) { drag = null; return; }
    if (cancelled) {
      active.exitFolder = false; active.dropFolderId = null;
      if (active.group) active.items.forEach(item => { item.object.x = item.ox; item.object.y = item.oy; });
      if (active.card) { active.card.x = active.ox; active.card.y = active.oy; }
      if (active.resize) { active.resize.x = active.ox; active.resize.y = active.oy; active.resize.width = active.ow; active.resize.height = active.oh; }
    }
    if (active.exitFolder && openedFolderId) {
      const changed = moveDraggedToParent(active);
      if (pendingDragSnapshot) { undoStack.push(pendingDragSnapshot); if (undoStack.length > 30) undoStack.shift(); redoStack = []; }
      pendingDragSnapshot = null; pendingCardTap = null; drag = null;
      saveObjects(); sendUpdate(changed); renderObjects(); fitCanvas();
      toast(lang === "zh" ? `已移出 ${changed.length} 个面板` : `Moved ${changed.length} panel(s) out`);
      return;
    }
    if (active.group) {
      active.items.forEach(item => { item.el.style.left = `${item.object.x}px`; item.el.style.top = `${item.object.y}px`; item.el.classList.remove("dragging"); });
      if (active.dropFolderId) {
        adoptIntoFolderLocal(active.items.map((item) => item.object), active.dropFolderId);
        selectedIds = new Set(active.items.map(item => item.object.id));
        renderObjects();
        toast(t("moveIntoFolder"));
      } else {
        // Keep membership: repositioning inside a folder must not eject to root.
        active.items.forEach((item) => {
          if (openedFolderId) item.object.folderId = openedFolderId;
        });
      }
    } else if (active.card) {
      active.el.style.left = `${active.card.x}px`;
      active.el.style.top = `${active.card.y}px`;
      active.el.classList.remove("dragging", "folder-drop-target");
      if (active.dropFolderId) {
        adoptIntoFolderLocal([active.card], active.dropFolderId);
        renderObjects();
        toast(t("moveIntoFolder"));
      }
      // Do NOT clear folderId on ordinary drags inside a folder — that ejected
      // children onto the root canvas at local coords and caused outer/inner overlap.
    } else {
      active.el.style.left = `${active.resize.x}px`;
      active.el.style.top = `${active.resize.y}px`;
      active.el.style.width = `${active.resize.width}px`;
      active.el.style.height = `${active.resize.height}px`;
      active.el.classList.remove("dragging", "resizing");
    }
    document.querySelectorAll(".folder-drop-target").forEach(node => node.classList.remove("folder-drop-target"));
    const changed = active.group
      ? active.items.map(item => item.object)
      : active.card
        ? [active.card]
        : active.resize
          ? [active.resize]
          : [];
    let moved = false;
    if (active.group && active.items) {
      moved = active.items.some((item) => item.object.x !== item.ox || item.object.y !== item.oy) || !!active.dropFolderId;
    } else if (active.card) {
      moved = active.card.x !== active.ox || active.card.y !== active.oy || !!active.dropFolderId;
    } else if (active.resize) {
      moved = active.resize.x !== active.ox || active.resize.y !== active.oy || active.resize.width !== active.ow || active.resize.height !== active.oh;
    }
    if (moved && pendingDragSnapshot) {
      undoStack.push(pendingDragSnapshot);
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
    }
    pendingDragSnapshot = null;
    drag = null;
    saveObjects();
    sendUpdate(changed);
    renderEdges();
  }
  function worldPoint(e: { clientX: number; clientY: number }): Point { const rect = $("#canvas-wrap").getBoundingClientRect(); return { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale }; }
  function updateCursor(e: PointerEvent): void {
    const p = worldPoint(e); me.cursor = p;
    const emit = () => { lastAwarenessAt = Date.now(); awarenessTimer = null; const msg = { type: "awareness", roomId, state: { sessionId: me.id, nickname: me.name, color: me.color, cursor: me.cursor, selection: { objectId: selected || undefined }, updatedAt: Date.now() } }; const n = fanoutP2p(msg); if (!n) send(msg); };
    const wait = 40 - (Date.now() - lastAwarenessAt);
    if (wait <= 0) emit(); else if (!awarenessTimer) awarenessTimer = setTimeout(emit, wait);
  }

  type LayerAction = "layer-front" | "layer-back" | "layer-forward" | "layer-backward";
  function orderedLayerObjects(folderId: string | null | undefined): CanvasObject[] {
    const siblings = objects.filter(o => (o.folderId || null) === (folderId || null));
    // Unmodified rooms retain their original array order; explicit ranks travel with each object.
    return siblings.map((object, index) => ({ object, index, rank: Number.isFinite(object.zIndex) ? object.zIndex! : index + 1 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index).map(entry => entry.object);
  }
  function layerSelection(object: CanvasObject): Set<string> {
    return new Set((selectedIds.has(object.id) ? selectionObjects() : [object])
      .filter(o => (o.folderId || null) === (object.folderId || null)).map(o => o.id));
  }
  function reorderedLayers(ordered: CanvasObject[], ids: Set<string>, action: LayerAction): CanvasObject[] {
    const next = [...ordered];
    if (action === "layer-front") return [...next.filter(o => !ids.has(o.id)), ...next.filter(o => ids.has(o.id))];
    if (action === "layer-back") return [...next.filter(o => ids.has(o.id)), ...next.filter(o => !ids.has(o.id))];
    if (action === "layer-forward") {
      for (let i = next.length - 2; i >= 0; i--) {
        if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
    return next;
  }
  function layerActionsHtml(object: CanvasObject): string {
    const ordered = orderedLayerObjects(object.folderId), ids = layerSelection(object);
    const actions: [LayerAction, string, string][] = [
      ["layer-front", "置于顶层", "Bring to front"], ["layer-back", "置于底层", "Send to back"],
      ["layer-forward", "上移一层", "Bring forward"], ["layer-backward", "下移一层", "Send backward"],
    ];
    return `<div class="context-separator"></div><div class="context-title muted">${lang === "zh" ? "面板叠放层级" : "Panel stacking"}${ids.size > 1 ? ` · ${ids.size}` : ""}</div><div class="layer-actions">${actions.map(([action, zh, en]) => {
      const moved = reorderedLayers(ordered, ids, action).some((o, index) => o.id !== ordered[index].id);
      return `<button data-context="${action}"${moved ? "" : " disabled"}><span class="context-leading">${icon("layers")}</span><span>${lang === "zh" ? zh : en}</span></button>`;
    }).join("")}</div><div class="context-separator"></div>`;
  }
  function changeObjectLayer(object: CanvasObject, action: LayerAction): void {
    const ordered = orderedLayerObjects(object.folderId);
    const next = reorderedLayers(ordered, layerSelection(object), action);
    if (!next.some((o, index) => o.id !== ordered[index].id)) return;
    snapshotState();
    const changed: CanvasObject[] = [];
    next.forEach((o, index) => { if (o.zIndex !== index + 1) { o.zIndex = index + 1; changed.push(o); } });
    saveObjects(); renderObjects(); sendUpdate(changed);
    toast(lang === "zh" ? "已调整叠放层级" : "Panel stacking updated");
  }
  function syncObjectLayers(): void {
    const world = $("#canvas-world") as HTMLElement | null;
    if (!world) return;
    const ordered = orderedLayerObjects(openedFolderId);
    const ranks = new Map(ordered.map((o, index) => [o.id, index + 2]));
    world.querySelectorAll<HTMLElement>(":scope > .canvas-card").forEach(el => {
      el.style.zIndex = String(ranks.get(el.dataset.id!) ?? 2);
    });
    // Pins may sit inside panels, so their connecting strings stay visible above card content.
    const connectors = world.querySelector<SVGSVGElement>(":scope > .edges-layer");
    if (connectors) connectors.style.zIndex = String(ordered.length + 3);
  }
  function renderObjects(): void {
    const world = $("#canvas-world"); if (!world) return;
    const visible = visibleObjects();
    world.innerHTML = visible.map(o => cardHtml(o)).join("");
    // Recreate edges layer after wiping world
    ensureEdgesLayer();
    visible.forEach(o => bindObject(o));
    renderEdges();
    syncObjectLayers();
    updateFolderBreadcrumb();
    updateAlignBar();
    applyView();
  }
  function updateFolderBreadcrumb(): void {
    const crumb = $("#folder-breadcrumb");
    if (!crumb) return;
    if (!openedFolderId) { crumb.classList.remove("open"); crumb.innerHTML = ""; return; }
    const folder = objectById(openedFolderId);
    crumb.innerHTML = `<button data-folder-back>${icon("back")} ${t("back")}</button><span>${escapeHtml(folder?.title || t("folder"))}</span>`;
    crumb.classList.add("open");
    crumb.querySelector("[data-folder-back]")?.addEventListener("click", closeFolder);
  }
  function openFolder(folder: CanvasObject): void {
    hideFolderPeek();
    openedFolderId = folder.id;
    selected = null;
    selectedIds = new Set();
    localizeFolderChildrenIfNeeded(folder.id);
    renderObjects();
    fitCanvas();
  }
  function closeFolder(): void {
    openedFolderId = null;
    selected = null;
    selectedIds = new Set();
    hideFolderPeek();
    renderObjects();
    fitCanvas();
  }

  let peekFolderId: string | null = null;
  function folderChildren(folderId: string): CanvasObject[] {
    return objects.filter((o) => o.folderId === folderId);
  }
  /** Shift a set of objects into folder-local space, preserving relative layout. */
  function adoptIntoFolderLocal(movers: CanvasObject[], folderId: string): void {
    const targets = movers.filter((o) => o.kind !== "folder" && o.id !== folderId);
    if (!targets.length) return;
    const minX = Math.min(...targets.map((o) => o.x));
    const minY = Math.min(...targets.map((o) => o.y));
    targets.forEach((o) => {
      o.folderId = folderId;
      o.x = o.x - minX + 80;
      o.y = o.y - minY + 80;
    });
  }
  /**
   * One-shot migration: children that still carry outer-world coords (typical after
   * an older move-into-folder) get recentered into local space when the folder opens.
   */
  function localizeFolderChildrenIfNeeded(folderId: string): void {
    const kids = folderChildren(folderId);
    if (!kids.length) return;
    const minX = Math.min(...kids.map((k) => k.x));
    const minY = Math.min(...kids.map((k) => k.y));
    // Already look local (origin near folder-space top-left) — leave alone.
    if (minX <= 420 && minY <= 420) return;
    kids.forEach((k) => { k.x = k.x - minX + 80; k.y = k.y - minY + 80; });
    saveObjects();
    sendUpdate(kids);
  }
  let peekCloseTimer: number | null = null;
  function hideFolderPeek(): void {
    peekEvents?.abort();
    peekEvents = null;
    document.querySelectorAll('.peek-origin').forEach(el => { el.classList.remove('peek-origin'); el.setAttribute('aria-expanded', 'false'); });
    peekFolderId = null;
    document.body.classList.remove("folder-peek-open");
    const root = document.querySelector(".folder-peek-root") as HTMLElement | null;
    if (!root) return;
    if (peekCloseTimer != null) { window.clearTimeout(peekCloseTimer); peekCloseTimer = null; }
    const finish = () => {
      if (root.isConnected && !root.classList.contains("open")) root.remove();
      peekCloseTimer = null;
    };
    if (!root.classList.contains("open")) { finish(); return; }
    root.classList.remove("open");
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== root || (e.propertyName !== "opacity" && e.propertyName !== "transform")) return;
      root.removeEventListener("transitionend", onEnd);
      finish();
    };
    root.addEventListener("transitionend", onEnd);
    peekCloseTimer = window.setTimeout(() => {
      root.removeEventListener("transitionend", onEnd);
      finish();
    }, 280);
  }
  function folderCardThumb(child: CanvasObject): string {
    const label = escapeHtml(child.title || child.caption || child.text?.slice(0, 40) || kindLabel(child.kind));
    const src = child.kind === 'image' ? child.src : child.kind === 'artboard' ? getArtboardThumbnail(child) : '';
    return src
      ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" draggable="false"><span class="folder-mini-label">${label}</span>`
      : `<div class="folder-mini-document">${icon(child.kind === 'note' ? 'note' : child.kind === 'link' ? 'link' : 'file')}<strong>${label}</strong></div>`;
  }
  function folderPeekThumb(child: CanvasObject): string {
    if (child.kind === "image" && child.src) {
      return `<div class="folder-peek-face is-image"><img src="${escapeHtml(child.src)}" alt="" draggable="false"><span>${escapeHtml(child.caption || t("image"))}</span></div>`;
    }
    if (child.kind === "artboard") {
      const thumb = getArtboardThumbnail(child);
      const face = thumb
        ? `<img src="${thumb}" alt="" draggable="false">`
        : `<div class="folder-peek-art-empty">${icon("pen")}</div>`;
      return `<div class="folder-peek-face is-artboard">${face}<span>${escapeHtml(child.title || t("artboard"))}</span></div>`;
    }
    const label = escapeHtml(child.title || child.caption || child.text?.slice(0, 40) || kindLabel(child.kind));
    const tone = child.kind === "note" ? "is-note" : child.kind === "todo" ? "is-todo" : child.kind === "richText" ? "is-doc" : child.kind === "link" ? "is-link" : "is-other";
    return `<div class="folder-peek-face ${tone}"><strong>${label}</strong><small>${escapeHtml(kindLabel(child.kind))}</small></div>`;
  }
  let peekEvents: AbortController | null = null;
  function showFolderPeek(folder: CanvasObject, anchorEl?: HTMLElement | null): void {
    hideContextMenu();
    const existing = document.querySelector('.folder-peek-root.open');
    if (peekFolderId === folder.id && existing) return;
    hideFolderPeek();
    if (peekCloseTimer != null) { clearTimeout(peekCloseTimer); peekCloseTimer = null; }
    document.querySelector('.folder-peek-root')?.remove();
    peekFolderId = folder.id;
    peekEvents = new AbortController();
    const { signal } = peekEvents;
    const anchor = anchorEl?.isConnected ? anchorEl : document.querySelector<HTMLElement>(`[data-id="${folder.id}"]`);
    anchor?.classList.add('peek-origin');
    anchor?.setAttribute('aria-expanded', 'true');
    const children = folderChildren(folder.id);
    const shown = children.slice(0, 3);
    const root = document.createElement('section');
    root.className = 'folder-peek-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('folderPeekTitle'));
    root.dataset.folderId = folder.id;
    const stack = shown.map((child, index) => {
      const offset = index - (shown.length - 1) / 2;
      const label = escapeHtml(child.title || child.caption || kindLabel(child.kind));
      return `<button type="button" class="folder-peek-card" data-peek-id="${escapeHtml(child.id)}" style="--i:${index};--offset:${offset};--rot:${offset * 9}deg" title="${label} · ${lang === 'zh' ? '双击打开' : 'Double-click to open'}" aria-label="${label}">${folderPeekThumb(child)}</button>`;
    }).join('');
    root.innerHTML = `<div class="folder-peek-panel">
      <div class="folder-peek-head"><div><div class="folder-peek-kicker">${lang === 'zh' ? '快速预览' : 'QUICK PEEK'} · ${children.length} ${t('items')}</div><h3>${escapeHtml(folder.title || t('folder'))}</h3></div><button class="folder-peek-close" type="button" data-peek-dismiss aria-label="${t('close')}">×</button></div>
      <div class="folder-peek-stage">${stack || `<div class="folder-peek-empty">${t('folderPeekEmpty')}</div>`}</div>
      <div class="folder-peek-actions"><span>${lang === 'zh' ? '双击卡片打开 · 最多预览 3 项' : 'Double-click a card · Up to 3 previews'}</span><button type="button" data-peek-enter>${t('openFolder')} ↗</button></div>
    </div>`;
    document.body.appendChild(root);
    const panel = root.querySelector<HTMLElement>('.folder-peek-panel')!;
    const rect = anchor?.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const cx = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    let left = Math.max(12, Math.min(innerWidth - width - 12, cx - width / 2));
    const above = rect ? rect.top - height - 18 : (innerHeight - height) / 2;
    const below = rect ? rect.bottom + 18 : above;
    let top = above >= 12 ? above : below;
    // Clamping an oversized preview below the card used to cover the second click.
    // Prefer an unobstructed side before falling back to the viewport boundary.
    if (rect && above < 12 && below + height > innerHeight - 90) {
      if (rect.left - width - 18 >= 12) left = rect.left - width - 18;
      else if (rect.right + width + 18 <= innerWidth - 12) left = rect.right + 18;
      top = rect.top + (rect.height - height) / 2;
    }
    top = Math.max(12, Math.min(innerHeight - height - 90, top));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.setProperty('--origin-x', `${Math.max(0, Math.min(width, cx - left))}px`);
    panel.style.setProperty('--origin-y', rect && top > rect.top ? '0%' : '100%');
    root.classList.add('open');
    const enter = () => { const current = objectById(folder.id); if (current) openFolder(current); };
    root.querySelector('[data-peek-dismiss]')?.addEventListener('click', () => hideFolderPeek(), { signal });
    root.querySelector('[data-peek-enter]')?.addEventListener('click', enter, { signal });
    root.querySelectorAll<HTMLElement>('[data-peek-id]').forEach(btn => {
      const open = () => {
        const child = objectById(btn.dataset.peekId);
        if (!child) return;
        hideFolderPeek();
        if (child.kind === 'folder') openFolder(child); else openPanel(child);
      };
      btn.addEventListener('click', () => {
        root.querySelectorAll('.is-picked').forEach(el => el.classList.remove('is-picked'));
        btn.classList.add('is-picked');
      }, { signal });
      btn.addEventListener('dblclick', e => { e.stopPropagation(); open(); }, { signal });
      btn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); open(); } }, { signal });
    });
    document.addEventListener('pointerdown', e => {
      const target = e.target as Element;
      if (root.contains(target) || target.closest(`[data-id="${folder.id}"]`)) return;
      hideFolderPeek();
    }, { capture: true, signal });
    window.addEventListener('resize', () => hideFolderPeek(), { signal });
    document.querySelector('#canvas-wrap')?.addEventListener('wheel', () => hideFolderPeek(), { passive: true, signal });
  }

  function normalizeUrl(raw: string | undefined | null): string {
    const s = (raw || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return "https:" + s;
    return "https://" + s;
  }
  function bindLinkEmbed(object: CanvasObject): void {
    const viewer = $("#panel-viewer") as HTMLElement | null;
    if (!viewer) return;
    const frame = viewer.querySelector(".link-embed-frame") as HTMLIFrameElement | null;
    const fallback = viewer.querySelector(".link-embed-fallback") as HTMLElement | null;
    const loading = viewer.querySelector(".link-embed-loading") as HTMLElement | null;
    const urlLabel = viewer.querySelector("[data-link-url-label]") as HTMLElement | null;
    const href = normalizeUrl(object.url);
    if (urlLabel) urlLabel.textContent = href || (object.url || "");
    const openExt = () => { if (href) window.open(href, "_blank", "noopener,noreferrer"); };
    viewer.querySelectorAll("[data-link-external]").forEach((btn: any) => {
      btn.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); openExt(); };
    });
    viewer.querySelectorAll("[data-link-edit]").forEach((btn: any) => {
      btn.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); openLinkEditSheet(object); };
    });
    viewer.querySelector("[data-link-reload]")?.addEventListener("click", (e: any) => {
      e.preventDefault(); e.stopPropagation();
      if (!frame || !href) return;
      if (fallback) fallback.hidden = true;
      if (loading) loading.hidden = false;
      frame.src = href;
    });
    if (!frame || !href) {
      if (loading) loading.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    let settled = false;
    const showFallback = () => {
      if (settled) return;
      settled = true;
      if (loading) loading.hidden = true;
      if (fallback) fallback.hidden = false;
      try { frame.style.opacity = "0"; } catch {}
    };
    const showOk = () => {
      if (settled) return;
      settled = true;
      if (loading) loading.hidden = true;
      if (fallback) fallback.hidden = true;
      frame.style.opacity = "1";
    };
    frame.addEventListener("load", () => {
      // Many blocked embeds still fire load with an empty/opaque document.
      // Heuristic: try reading location; cross-origin throws → likely loaded (or blocked chrome).
      try {
        const doc = frame.contentDocument;
        if (doc && (!doc.body || doc.body.childElementCount === 0) && !(doc.body?.innerText || "").trim()) {
          // blank same-origin → treat as fail after short wait
          setTimeout(() => {
            try {
              const again = frame.contentDocument;
              if (again && (!again.body || (!(again.body.innerText || "").trim() && again.body.childElementCount === 0))) showFallback();
              else showOk();
            } catch { showOk(); }
          }, 400);
          return;
        }
      } catch {
        // cross-origin access denied usually means the frame navigated — treat as success
      }
      showOk();
    });
    // Timeout fallback for sites that hang / block without load event clarity
    setTimeout(() => { if (!settled) showFallback(); }, 8000);
    frame.src = href;
  }

  function panelMarkup(o: CanvasObject): string {
    const title = o.title || o.caption || kindLabel(o.kind);
    if (o.kind === "richText") return `<section class="rich-focus-shell" data-rich-id="${o.id}"><header class="rich-focus-top"><button class="rich-back" data-panel-close aria-label="${t("back")}">${icon("back")}<span>${t("back")}</span></button><div class="rich-save-status" role="status"></div><button class="rich-download" data-panel-action="download" aria-label="${lang === "zh" ? "下载文档" : "Download document"}" title="${lang === "zh" ? "下载文档" : "Download document"}">${icon("download")}</button></header><div class="rich-focus-scroll"><article class="rich-focus-page"><input class="doc-title" aria-label="${lang === "zh" ? "文档标题" : "Document title"}" maxlength="120" value="${escapeHtml(o.title ?? t("newDocument"))}" placeholder="${t("newDocument")}"><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${t("richText")}" data-placeholder="${t("writeTogether")}" spellcheck="true">${richHtml(o)}</div><div class="rich-word-count"></div></article></div><div class="rich-focus-tools">${richToolbar()}</div></section>`;
    const body = o.kind === "artboard" ? `<div class="drawing-stage"><canvas class="drawing-canvas" width="1200" height="760"></canvas><div class="drawing-help">${lang === "zh" ? "在画板中自由绘制" : "Draw freely"}</div></div>` : o.kind === "image" ? `<div class="panel-art lightbox-stage"><div class="lightbox-viewport"><img class="lightbox-img" src="${escapeHtml(o.src)}" alt="${escapeHtml(title)}" draggable="false"></div></div>` : o.kind === "note" ? `<article class="panel-note">${escapeHtml(o.text).replace(/\n/g, "<br>")}</article>` : o.kind === "folder" ? `<div class="panel-folder"><span>▱</span><strong>${escapeHtml(title)}</strong><small>${objects.filter(child => child.folderId === o.id).length} ${t("items")}</small></div>` : `<div class="link-embed-panel"><div class="link-embed-chrome"><div class="link-embed-url" data-link-url-label title="${escapeHtml(normalizeUrl(o.url) || o.url || "")}">${escapeHtml(normalizeUrl(o.url) || o.url || "")}</div><button type="button" data-link-edit title="${t("editLink")}" aria-label="${t("editLink")}">${icon("pen")}<span>${t("edit")}</span></button><button type="button" data-link-reload title="${t("reloadPage")}" aria-label="${t("reloadPage")}">${icon("reload")}</button><button type="button" data-link-external title="${t("openExternal")}" aria-label="${t("openExternal")}">${icon("external")}<span>${t("openExternal")}</span></button></div><div class="link-embed-stage"><div class="link-embed-loading">${escapeHtml(t("linkLoading"))}</div><iframe class="link-embed-frame" title="${escapeHtml(title)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"></iframe><div class="link-embed-fallback" hidden><strong>${escapeHtml(t("linkEmbedFailed"))}</strong><p>${escapeHtml(t("linkEmbedHint"))}</p><button type="button" class="spatial-btn primary" data-link-external>${escapeHtml(t("openExternal"))}</button></div></div></div>`;
    const meta = o.kind === "artboard" ? `<div><b>${t("panelInfo")}</b><span>${t("artboard")} · ${o.strokes?.length || 0}</span></div>` : o.kind === "image" ? `<div><b>${t("resolution")}</b><span>${Math.round(o.width)} × ${Math.round(o.height)}</span></div><div><b>${t("filename")}</b><span>${escapeHtml(o.assetId || o.id)}.png</span></div><div><b>${t("date")}</b><span>${t("createdOn")} ${new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}</span></div>` : `<div><b>${t("panelInfo")}</b><span>${escapeHtml(kindLabel(o.kind))}</span></div><div><b>${t("date")}</b><span>${t("createdOn")} ${new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span></div>`;
    return `<section class="panel-viewer-shell"><button class="panel-back" data-panel-close aria-label="${t("close")}">${icon("back")}</button><div class="panel-content">${body}</div><aside class="panel-meta"><h1>${escapeHtml(title)}</h1>${meta}</aside><div class="panel-toolbar">${o.kind === "link" || o.kind === "image" || o.kind === "folder" ? `<button data-panel-action="edit" aria-label="${t("edit")}" title="${t("edit")}">${icon("pen")}</button>` : ""}<button data-panel-action="duplicate" aria-label="${t("duplicate")}" title="${t("duplicate")}">${icon("copy")}</button><button data-panel-action="download" aria-label="${lang === "zh" ? "下载" : "Download"}" title="${lang === "zh" ? "下载" : "Download"}">${icon("download")}</button><button data-panel-action="delete" aria-label="${t("delete")}" title="${t("delete")}">${icon("trash")}</button></div></section>`;
  }
  function openPanel(object: CanvasObject): void {
    if (object.kind === "pin") return;
    if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
    if (object.kind === "todo") {
      hideFolderPeek();
      if ((object.folderId || null) !== openedFolderId) {
        openedFolderId = object.folderId || null; renderObjects(); fitCanvas();
      }
      (document.querySelector(`[data-id="${object.id}"] [data-todo-add]`) as HTMLInputElement | null)?.focus(); return;
    }
    const viewer = $("#panel-viewer") as HTMLElement | null; if (!viewer) return;
    (viewer as any)._lightboxAbort?.abort();
    viewer.classList.toggle("is-artboard", object.kind === "artboard");
    viewer.classList.toggle("is-image", object.kind === "image");
    viewer.classList.toggle("is-link", object.kind === "link");
    viewer.classList.toggle("is-rich", object.kind === "richText");
    openPanelId = object.id; viewer.innerHTML = panelMarkup(object); viewer.classList.add("open"); viewer.setAttribute("aria-hidden", "false"); document.body.classList.add("panel-open");
    viewer.querySelector("[data-panel-close]")?.addEventListener("click", closePanel);
    viewer.querySelectorAll("[data-panel-action]").forEach((button: any) => button.addEventListener("click", () => panelAction(button.dataset.panelAction, object)));
    if (object.kind === "artboard") bindDrawingPanel(object);
    if (object.kind === "image") bindImageLightbox(object);
    if (object.kind === "link") bindLinkEmbed(object);
    if (object.kind === "richText") { bindRichCard(object, viewer); syncRichEditor(object, viewer); }
  }
  function bindDrawingPanel(object: CanvasObject): void {
    const canvas = document.querySelector('.drawing-canvas') as HTMLCanvasElement | null; if (!canvas) return;
    const ctx = canvas.getContext('2d')!; let active: Stroke | null = null, mode = 'pen', redo: Stroke[] = [];
    const zh = lang === 'zh'; object.strokes ||= [];
    const names = {pen:zh?'画笔':'Pen',marker:zh?'荧光笔':'Marker',eraser:zh?'橡皮擦':'Eraser',line:zh?'直线':'Line',rect:zh?'矩形':'Rectangle',circle:zh?'椭圆':'Ellipse'};
    const tool = (id: string, label: string) => `<button type="button" data-draw="${id}" title="${label}" aria-label="${label}" aria-pressed="${id==='pen'}">${icon(id)}</button>`;
    const stage = canvas.closest('.drawing-stage');
    stage.insertAdjacentHTML('beforebegin', `<div class="drawing-heading"><span>${escapeHtml(object.title || t('artboard'))}</span><small>${zh?'自由创作，随时记录灵感':'A little room for your imagination'}</small></div>`);
    stage.insertAdjacentHTML('afterend', `<div class="drawing-tools"><div class="drawing-tool-row">${Object.entries(names).map(([id,label])=>tool(id,label)).join('')}<i></i>${tool('undo',zh?'撤销':'Undo')}${tool('redo',zh?'重做':'Redo')}</div><div class="drawing-options"><label class="color-control" title="${zh?'自定义颜色':'Custom color'}"><input class="drawing-color" aria-label="${zh?'颜色':'Color'}" type="color" value="#30343b"></label>${['#30343b','#839b87','#7894b5','#d79a8d','#d2b575'].map(c=>`<button class="drawing-swatch" data-color="${c}" style="--swatch:${c}" aria-label="${c}"></button>`).join('')}<i></i><label class="size-control">${zh?'粗细':'Size'}<input class="drawing-size" aria-label="${zh?'笔触粗细':'Stroke width'}" type="range" min="1" max="40" value="5"><output>5</output></label>${tool('trash',zh?'清空画板':'Clear board')}</div></div>`);
    const toolbar = stage.parentElement.querySelector('.drawing-tools');
    const undoButton = toolbar.querySelector<HTMLButtonElement>('[data-draw="undo"]')!;
    const redoButton = toolbar.querySelector<HTMLButtonElement>('[data-draw="redo"]')!;
    undoButton.title = zh ? '撤销 (Ctrl/Cmd+Z)' : 'Undo (Ctrl/Cmd+Z)';
    redoButton.title = zh ? '重做 (Ctrl/Cmd+Shift+Z / Ctrl+Y)' : 'Redo (Ctrl/Cmd+Shift+Z / Ctrl+Y)';
    undoButton.setAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    redoButton.setAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z Control+Y');
    const paint = () => {
      ctx.clearRect(0,0,1200,760);
      for (const stroke of [...(object.strokes || []), ...(active?[active]:[])]) {
        if (!stroke.points?.length) continue; const pts=stroke.points, a=pts[0], b=pts[pts.length-1];
        ctx.save(); ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over'; ctx.globalAlpha=stroke.tool==='marker'?.3:1; ctx.strokeStyle=stroke.color; ctx.fillStyle=stroke.color; ctx.lineWidth=stroke.size; ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
        if (stroke.tool==='rect') ctx.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
        else if (stroke.tool==='circle') ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);
        else if (stroke.tool==='line') {ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
        else {pts.forEach((p: Point, i: number)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); if(pts.length===1){ctx.arc(a.x,a.y,stroke.size/2,0,Math.PI*2);ctx.fill();}}
        ctx.stroke();ctx.restore();
      }
      (toolbar.querySelector('[data-draw="undo"]') as HTMLButtonElement).disabled=!object.strokes.length;
      (toolbar.querySelector('[data-draw="redo"]') as HTMLButtonElement).disabled=!redo.length;
    };
    const commit=()=>{saveObjects();sendUpdate([object]);paint();syncObjectDom(object);};
    const point=(e: any)=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1200,(e.clientX-r.left)*1200/r.width)),y:Math.max(0,Math.min(760,(e.clientY-r.top)*760/r.height))};};
    canvas.onpointerdown=(e: any)=>{if(e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);active={tool:mode,points:[point(e)],color:(toolbar.querySelector('.drawing-color') as HTMLInputElement).value,size:Number((toolbar.querySelector('.drawing-size') as HTMLInputElement).value)*(mode==='marker'?3:mode==='eraser'?4:1)};paint();};
    canvas.onpointermove=(e: any)=>{if(!active)return;active.points.push(point(e));paint();};
    canvas.onpointerup=()=>{if(!active)return;object.strokes.push(active);active=null;redo=[];commit();};
    canvas.onpointercancel=()=>{active=null;paint();};
    toolbar.querySelectorAll('[data-draw]').forEach((button: any)=>button.onclick=()=>{
      const action=button.dataset.draw;
      if(action==='undo'){if(object.strokes.length)redo.push(object.strokes.pop());commit();}
      else if(action==='redo'){if(redo.length)object.strokes.push(redo.pop());commit();}
      else if(action==='trash'){if(confirm(zh?'清空这张画板？':'Clear this artboard?')){object.strokes=[];redo=[];commit();}}
      else {mode=action;toolbar.querySelectorAll('[data-draw]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
    });
    toolbar.querySelectorAll('[data-color]').forEach((b: any)=>b.onclick=()=>{(toolbar.querySelector('.drawing-color') as HTMLInputElement).value=b.dataset.color;});
    (toolbar.querySelector('.drawing-size') as any).oninput=(e: any)=>toolbar.querySelector('output').textContent=e.target.value;
    (canvas as any).repaintDrawing=paint;paint();
  }
  function bindImageLightbox(_object: CanvasObject): void {
    const viewer = $("#panel-viewer") as HTMLElement | null;
    const img = viewer?.querySelector(".lightbox-img") as HTMLImageElement | null;
    const viewport = viewer?.querySelector(".lightbox-viewport") as HTMLElement | null;
    if (!viewer || !img || !viewport) return;
    const ac = new AbortController();
    (viewer as any)._lightboxAbort = ac;
    const { signal } = ac;
    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const zh = lang === "zh";
    const apply = () => {
      img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      viewport.classList.toggle("is-zoomed", scale > 1.01);
      const label = viewer.querySelector("[data-lightbox-zoom-label]");
      if (label) label.textContent = `${Math.round(scale * 100)}%`;
    };
    const setScale = (next: number) => {
      scale = Math.max(1, Math.min(5, next));
      if (scale <= 1.01) { scale = 1; tx = 0; ty = 0; }
      apply();
    };
    const toolbar = viewer.querySelector(".panel-toolbar");
    if (toolbar && !toolbar.querySelector("[data-lightbox-zoom]")) {
      toolbar.insertAdjacentHTML("afterbegin", `<button type="button" data-lightbox-zoom="out" aria-label="${zh ? "缩小" : "Zoom out"}" title="${zh ? "缩小" : "Zoom out"}">−</button><span data-lightbox-zoom-label>100%</span><button type="button" data-lightbox-zoom="in" aria-label="${zh ? "放大" : "Zoom in"}" title="${zh ? "放大" : "Zoom in"}">＋</button><button type="button" data-lightbox-zoom="reset" aria-label="${zh ? "重置缩放" : "Reset zoom"}" title="${zh ? "重置" : "Reset"}">⌂</button><i class="panel-toolbar-sep" aria-hidden="true"></i>`);
      toolbar.querySelectorAll("[data-lightbox-zoom]").forEach((button: any) => button.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        const action = button.dataset.lightboxZoom;
        if (action === "in") setScale(scale * 1.25);
        else if (action === "out") setScale(scale / 1.25);
        else setScale(1);
      }, { signal }));
    }
    viewport.addEventListener("wheel", (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false, signal });
    img.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0 || scale <= 1.01) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true; sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
      img.setPointerCapture(e.pointerId);
    }, { signal });
    img.addEventListener("pointermove", (e: PointerEvent) => {
      if (!dragging) return;
      tx = ox + (e.clientX - sx); ty = oy + (e.clientY - sy); apply();
    }, { signal });
    const endDrag = () => { dragging = false; };
    img.addEventListener("pointerup", endDrag, { signal });
    img.addEventListener("pointercancel", endDrag, { signal });
    img.addEventListener("dblclick", (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      setScale(scale > 1.01 ? 1 : 2.2);
    }, { signal });
    viewer.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest(".lightbox-img, .panel-toolbar, .panel-back, .panel-meta, a, button, [data-lightbox-zoom-label]")) return;
      if (target === viewer || target.classList.contains("panel-viewer-shell") || target.classList.contains("panel-content") || target.classList.contains("lightbox-viewport") || target.classList.contains("panel-art") || target.classList.contains("lightbox-stage")) closePanel();
    }, { signal });
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!viewer.classList.contains("open") || !viewer.classList.contains("is-image")) return;
      const editing = (e.target as Element | null)?.closest?.("textarea,input,[contenteditable=true]");
      if (editing) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setScale(scale * 1.25); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); setScale(scale / 1.25); }
      else if (e.key === "0") { e.preventDefault(); setScale(1); }
    }, { signal });
    apply();
  }
  function closePanel(): void {
    if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
    const viewer = $("#panel-viewer") as HTMLElement | null; if (!viewer) return;
    if (viewer.classList.contains("is-rich")) {
      if (viewer.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
      const object = objectById(openPanelId); if (object) { flushTextUpdate(object); syncObjectDom(object); }
      setEditingObject(null);
    }
    (viewer as any)._lightboxAbort?.abort();
    viewer.classList.remove("open", "is-image", "is-artboard", "is-link", "is-rich");
    viewer.setAttribute("aria-hidden", "true");
    setTimeout(() => { if (!viewer.classList.contains("open")) viewer.innerHTML = ""; }, 340);
    const closedId = openPanelId;
    openPanelId = null; document.body.classList.remove("panel-open");
    if (closedId) {
      const closed = objects.find((o) => o.id === closedId);
      if (closed?.kind === "artboard") scheduleArtboardThumbnail(closed);
    }
  }
  function panelAction(action: string | undefined, object: CanvasObject): void { if (action === "edit") { return contextAction("edit", object); } if (action === "duplicate") { closePanel(); return contextAction("duplicate", object); } if (action === "delete") { closePanel(); return contextAction("delete", object); } if (action === "download") {
      if (object.kind === "artboard") { const canvas=document.querySelector(".drawing-canvas") as HTMLCanvasElement | null; if(canvas){const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="artboard.png";a.click();}return; }
      const a = document.createElement("a");
      const image = object.kind === "image";
      const blobUrl = image ? null : URL.createObjectURL(new Blob([object.content || object.text || object.url || object.title || ""], {type: object.kind === "richText" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8"}));
      a.href = image ? object.src : blobUrl;
      a.download = (object.assetId || object.id) + (image ? "" : object.kind === "richText" ? ".html" : ".txt");
      a.click(); if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } }
  function applyRemoteEdges(incoming: Edge[] | undefined, deletedEdges: string[] = [], opts: { replaceAll?: boolean } = {}): void {
    if (!incoming && !(deletedEdges && deletedEdges.length) && !opts.replaceAll) return;
    const byId = new Map(edges.map((e) => [e.id, e]));
    if (opts.replaceAll && Array.isArray(incoming)) {
      edges = incoming.filter((e) => e && e.id && e.fromId && e.toId);
    } else {
      if (Array.isArray(incoming)) {
        for (const edge of incoming) {
          if (edge && edge.id && edge.fromId && edge.toId) byId.set(edge.id, edge);
        }
      }
      if (deletedEdges?.length) {
        for (const id of deletedEdges) byId.delete(id);
      }
      // Also drop edges whose endpoints vanished
      const objIds = new Set(objects.map((o) => o.id));
      edges = [...byId.values()].filter((e) => objIds.has(e.fromId) && objIds.has(e.toId));
    }
    if (selectedEdgeId && !edges.some((e) => e.id === selectedEdgeId)) selectedEdgeId = null;
    saveObjects();
    renderEdges();
  }
  function applyRemoteObjects(nextObjects: CanvasObject[], deletedObjects: string[] = [], opts: { delta?: boolean } = {}): void {
    const activeId = getActiveEditingId();
    const activeEditor = document.activeElement as HTMLElement | null;
    const dragging = locallyDraggingIds();
    const currentById = new Map(objects.map(o => [o.id, o]));
    const seen = new Set<string>();
    const merged: CanvasObject[] = [];
    const list = nextObjects || [];
    for (let incoming of list) {
      if (!incoming?.id || deletedObjects.includes(incoming.id)) continue;
      if (incoming.kind === "richText" && richPending.get(incoming.id) === incoming.content) {
        richPending.delete(incoming.id);
        if (richDrafts.get(incoming.id) === incoming.content) richDrafts.delete(incoming.id);
      }
      if (incoming.kind === "richText" && richTitlePending.get(incoming.id) === incoming.title) {
        richTitlePending.delete(incoming.id);
        if (richTitleDrafts.get(incoming.id) === incoming.title) richTitleDrafts.delete(incoming.id);
      }
      seen.add(incoming.id);
      const current = currentById.get(incoming.id);
      if (!current) { merged.push({ ...incoming }); continue; }
      if (incoming.kind === "todo" && current.kind === "todo" && (incoming.todoVersion || 0) <= (current.todoVersion || 0)) {
        incoming = { ...incoming, title: current.title, items: current.items, todoVersion: current.todoVersion };
      }
      if (incoming.kind === "richText" && current.kind === "richText" && (incoming.richTextVersion || 0) <= (current.richTextVersion || 0)) {
        incoming = { ...incoming, title: current.title, content: current.content, richTextVersion: current.richTextVersion };
      }
      if (dragging.has(incoming.id)) {
        if (incoming.kind === "todo") Object.assign(current, { title: incoming.title, items: incoming.items, todoVersion: incoming.todoVersion });
        if (incoming.kind === "richText") Object.assign(current, { title: incoming.title, content: incoming.content, richTextVersion: incoming.richTextVersion });
        merged.push(current); continue;
      }
      const localText = activeId === incoming.id && activeEditor?.matches?.("textarea")
        ? (activeEditor as HTMLTextAreaElement).value : null;
      const localHtml = richDrafts.get(incoming.id);
      // An omitted folderId on the wire explicitly means the root canvas.
      current.folderId = incoming.folderId;
      current.pins = incoming.pins || [];
      current.zIndex = incoming.zIndex;
      Object.assign(current, incoming);
      if (localText != null) current.text = localText;
      if (localHtml !== undefined) current.content = localHtml;
      if (richTitleDrafts.has(incoming.id)) current.title = richTitleDrafts.get(incoming.id);
      merged.push(current);
    }
    const deleted = new Set(deletedObjects || []);
    const delta = !!opts.delta || deleted.size > 0;
    for (const [id, current] of currentById) {
      if (seen.has(id)) continue;
      if (deleted.has(id)) {
        continue;
      }
      if (delta) merged.push(current);
    }
    // Delta payloads list changed objects first; do not silently change legacy stacking order.
    const originalOrder = new Map([...currentById.keys()].map((id, index) => [id, index]));
    objects = delta ? merged.sort((a, b) => (originalOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (originalOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)) : merged;
    (document.querySelector(".drawing-canvas") as any)?.repaintDrawing?.();
    saveObjects();
    if (openedFolderId && !objectById(openedFolderId)) openedFolderId = null;
    if (openPanelId && !objectById(openPanelId)) closePanel();
    if (peekFolderId && !objectById(peekFolderId)) hideFolderPeek();
    const visible = visibleObjects();
    const visibleIds = new Set(visible.map(o => o.id));
    const world = $("#canvas-world") as HTMLElement | null;
    world?.querySelectorAll<HTMLElement>(":scope > .canvas-card").forEach(el => {
      if (!visibleIds.has(el.dataset.id!)) {
        const id = el.dataset.id!;
        if (editingObjectId === id) editingObjectId = null;
        const timer = textUpdateTimers.get(id);
        if (timer) clearTimeout(timer);
        textUpdateTimers.delete(id);
        if (deleted.has(id)) { richDrafts.delete(id); richPending.delete(id); richTitleDrafts.delete(id); richTitlePending.delete(id); }
        el.remove();
      }
    });
    for (const o of visible) {
      if (!world?.querySelector(`[data-id="${o.id}"]`)) {
        world?.insertAdjacentHTML("beforeend", cardHtml(o)); bindObject(o);
      } else syncObjectDom(o, dragging);
    }
    // A drawing viewer can remain open while its card is inside a folder.
    if (openPanelId) { const o = objectById(openPanelId); if (o) syncOpenPanel(o); }
    updateFolderBreadcrumb(); renderEdges(); syncObjectLayers();
  }

  function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scaleX = 1, scaleY = 1): void {
    for (const stroke of strokes) {
      if (!stroke.points?.length) continue;
      const pts = stroke.points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
      const a = pts[0], b = pts[pts.length - 1];
      ctx.save();
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = stroke.tool === "marker" ? 0.3 : 1;
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
      ctx.lineWidth = Math.max(1, stroke.size * ((scaleX + scaleY) / 2));
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
      if (stroke.tool === "rect") ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (stroke.tool === "circle") ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else if (stroke.tool === "line") { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      else {
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        if (pts.length === 1) { ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.stroke(); ctx.restore();
    }
  }
  function artboardStrokeSig(strokes?: Stroke[]): string {
    if (!strokes?.length) return "0";
    const last = strokes[strokes.length - 1];
    return `${strokes.length}:${last.points?.length || 0}:${last.color}:${last.size}:${last.tool}`;
  }
  function getArtboardThumbnail(o: CanvasObject): string | null {
    const strokes = o.strokes || [];
    if (!strokes.length) return null;
    const sig = artboardStrokeSig(strokes);
    const hit = artboardThumbCache.get(o.id);
    if (hit && hit.sig === sig) return hit.url;
    const w = 480, h = 304;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    paintStrokes(ctx, strokes, w / 1200, h / 760);
    const url = canvas.toDataURL("image/jpeg", 0.72);
    artboardThumbCache.set(o.id, { sig, url });
    return url;
  }
  function scheduleArtboardThumbnail(o: CanvasObject): void {
    if (o.kind !== "artboard") return;
    const prev = artboardThumbTimers.get(o.id);
    if (prev) window.clearTimeout(prev);
    artboardThumbTimers.set(o.id, window.setTimeout(() => {
      artboardThumbCache.delete(o.id);
      const url = getArtboardThumbnail(o);
      const preview = document.querySelector(`[data-id="${o.id}"] .artboard-preview`) as HTMLElement | null;
      if (!preview) return;
      if (url) preview.innerHTML = `<img class="artboard-thumb" src="${url}" alt="" draggable="false">`;
      else preview.innerHTML = `<div class="artboard-empty"><span class="artboard-empty-icon">${icon("pen")}</span><span>${escapeHtml(t("emptyArtboard"))}</span><small>${escapeHtml(t("artboardEmptyHint"))}</small></div>`;
    }, 160));
  }

  function kindLabel(kind: string): string { return ({ note: t("sticky"), richText: t("richText"), image: t("image"), link: t("link"), folder: t("folder"), artboard: t("artboard"), todo: t("todo"), pin: lang === "zh" ? "图钉" : "Pin" })[kind] || kind; }

  function portPoint(o: CanvasObject, port: EdgePort = "right"): Point {
    if (o.kind === "pin") return { x: o.x + o.width / 2, y: o.y + o.height / 2 };
    if (port.startsWith("pin:")) {
      const pin = o.pins?.find(p => p.id === port.slice(4));
      if (pin) return { x: o.x + pin.x * o.width, y: o.y + pin.y * o.height };
    }
    if (port === "left") return { x: o.x, y: o.y + o.height / 2 };
    if (port === "right") return { x: o.x + o.width, y: o.y + o.height / 2 };
    if (port === "top") return { x: o.x + o.width / 2, y: o.y };
    return { x: o.x + o.width / 2, y: o.y + o.height };
  }
  function inferPorts(from: CanvasObject, to: CanvasObject): { fromPort: EdgePort; toPort: EdgePort } {
    const dx = (to.x + to.width / 2) - (from.x + from.width / 2);
    const dy = (to.y + to.height / 2) - (from.y + from.height / 2);
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? { fromPort: "right", toPort: "left" } : { fromPort: "left", toPort: "right" };
    }
    return dy >= 0 ? { fromPort: "bottom", toPort: "top" } : { fromPort: "top", toPort: "bottom" };
  }
  function bezierPath(a: Point, b: Point, fromPort?: EdgePort, toPort?: EdgePort): string {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
    const dy = Math.max(40, Math.abs(b.y - a.y) * 0.45);
    let c1 = { x: a.x, y: a.y }, c2 = { x: b.x, y: b.y };
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const fp = fromPort?.startsWith("pin:") ? (horizontal ? b.x >= a.x ? "right" : "left" : b.y >= a.y ? "bottom" : "top") : fromPort || "right";
    const tp = toPort?.startsWith("pin:") ? (horizontal ? b.x >= a.x ? "left" : "right" : b.y >= a.y ? "top" : "bottom") : toPort || "left";
    if (fp === "left") c1 = { x: a.x - dx, y: a.y };
    else if (fp === "right") c1 = { x: a.x + dx, y: a.y };
    else if (fp === "top") c1 = { x: a.x, y: a.y - dy };
    else c1 = { x: a.x, y: a.y + dy };
    if (tp === "left") c2 = { x: b.x - dx, y: b.y };
    else if (tp === "right") c2 = { x: b.x + dx, y: b.y };
    else if (tp === "top") c2 = { x: b.x, y: b.y - dy };
    else c2 = { x: b.x, y: b.y + dy };
    return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }
  function ensureEdgesLayer(): SVGSVGElement | null {
    const world = $("#canvas-world") as HTMLElement | null;
    if (!world) return null;
    let svg = world.querySelector(":scope > .edges-layer") as SVGSVGElement | null;
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "edges-layer");
      svg.setAttribute("aria-hidden", "false");
      world.insertBefore(svg, world.firstChild);
    }
    return svg;
  }
  function renderEdges(): void {
    const svg = ensureEdgesLayer();
    if (!svg) return;
    const byId = new Map(objects.map((o) => [o.id, o]));
    const visibleIds = new Set(visibleObjects().map((o) => o.id));
    const parts: string[] = [`<defs><marker id="edge-parent-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 2 L 10 6 L 2 10" fill="none" stroke="#7890ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker><marker id="edge-parent-arrow-selected" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 2 L 10 6 L 2 10" fill="none" stroke="#5c78e7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`];
    for (const edge of edges) {
      const from = byId.get(edge.fromId);
      const to = byId.get(edge.toId);
      if (!from || !to) continue;
      if (!visibleIds.has(from.id) || !visibleIds.has(to.id)) continue;
      const a = portPoint(from, edge.fromPort || "right");
      const b = portPoint(to, edge.toPort || "left");
      const d = bezierPath(a, b, edge.fromPort, edge.toPort);
      const sel = selectedEdgeId === edge.id ? " is-selected" : "";
      const parent = edge.relation === "parent";
      const relationClass = parent ? " is-parent" : "";
      const marker = parent ? ` marker-end="url(#edge-parent-arrow${sel ? "-selected" : ""})"` : "";
      const label = parent ? (lang === "zh" ? "父级 → 子级；右键设置关系" : "Parent → child; right-click to change") : (lang === "zh" ? "关联；右键设置关系" : "Association; right-click to change");
      parts.push(`<path class="edge-hit${sel}${relationClass}" data-edge-id="${edge.id}" d="${d}" fill="none"><title>${escapeHtml(label)}</title></path><path class="edge-line${sel}${relationClass}" data-edge-id="${edge.id}" d="${d}" fill="none"${marker}/>`);
    }
    if (connDrag) {
      const from = byId.get(connDrag.fromId);
      if (from) {
        const a = portPoint(from, connDrag.fromPort);
        const b = { x: connDrag.x, y: connDrag.y };
        const d = bezierPath(a, b, connDrag.fromPort, "left");
        parts.push(`<path class="edge-line is-preview" d="${d}" fill="none"/>`);
      }
    }
    svg.innerHTML = parts.join("");
    svg.querySelectorAll("[data-edge-id]").forEach((node) => {
      if (node.classList.contains("edge-hit")) {
        // The SVG sits above panels, so leave each connection point clickable.
        const length = (node as SVGPathElement).getTotalLength();
        const inset = Math.min(18, length * .25);
        node.setAttribute("stroke-dasharray", `0 ${inset} ${Math.max(0, length - inset * 2)} ${inset}`);
      }
      node.addEventListener("pointerdown", (e: any) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const id = (node as SVGElement).getAttribute("data-edge-id");
        if (!id) return;
        selectedEdgeId = id;
        selected = null;
        selectedIds = new Set();
        clearCardSelection();
        renderEdges();
      });
      node.addEventListener("contextmenu", (e: any) => {
        e.preventDefault(); e.stopPropagation();
        const id = (node as SVGElement).getAttribute("data-edge-id");
        if (!id) return;
        selectedEdgeId = id;
        renderEdges();
        showEdgeContextMenu(e.clientX, e.clientY, id);
      });
    });
  }
  function renderEdgePreview(): void { renderEdges(); }
  function createsParentCycle(fromId: string, toId: string, ignoredEdgeId: string): boolean {
    if (fromId === toId) return true;
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.id === ignoredEdgeId || edge.relation !== "parent") continue;
      const targets = outgoing.get(edge.fromId) || [];
      targets.push(edge.toId); outgoing.set(edge.fromId, targets);
    }
    const remaining = [toId], seen = new Set<string>();
    while (remaining.length) {
      const id = remaining.pop()!;
      if (id === fromId) return true;
      if (seen.has(id)) continue;
      seen.add(id); remaining.push(...(outgoing.get(id) || []));
    }
    return false;
  }
  function setEdgeRelation(edgeId: string, action: "related" | "from-parent" | "to-parent"): void {
    const edge = edges.find(item => item.id === edgeId);
    if (!edge) return;
    const next: Edge = { ...edge, relation: action === "related" ? "related" : "parent" };
    if (action === "to-parent") {
      next.fromId = edge.toId; next.toId = edge.fromId;
      next.fromPort = edge.toPort; next.toPort = edge.fromPort;
    }
    if (next.relation === "parent" && createsParentCycle(next.fromId, next.toId, edgeId)) {
      toast(lang === "zh" ? "这个层级会形成循环，请选择其他关系" : "That hierarchy would create a cycle. Choose another relationship.");
      return;
    }
    if (next.relation === (edge.relation || "related") && next.fromId === edge.fromId && next.toId === edge.toId) return;
    snapshotState(); Object.assign(edge, next);
    selectedEdgeId = edge.id; selected = null; selectedIds.clear(); clearCardSelection();
    saveObjects(); renderEdges(); sendUpdate([], [], [edge], []);
    toast(lang === "zh" ? "连接关系已更新" : "Connection relationship updated");
  }
  function showEdgeContextMenu(x: number, y: number, edgeId: string): void {
    const menu = $("#context-menu") as HTMLElement | null;
    const edge = edges.find(item => item.id === edgeId);
    if (!menu || !edge) return;
    const zh = lang === "zh", parent = edge.relation === "parent";
    const objectName = (id: string) => { const object = objectById(id); return object ? (object.title || object.caption || kindLabel(object.kind)) : id; };
    const names = `${objectName(edge.fromId)} → ${objectName(edge.toId)}`;
    const option = (action: string, label: string, active: boolean) => `<button data-edge-relation="${action}" role="menuitemradio" aria-checked="${active}" class="edge-relation-option${active ? " is-active" : ""}"><span class="context-leading">${icon(action === "related" ? "link" : "back")}</span><span>${label}</span><span class="edge-relation-check" aria-hidden="true">${active ? "✓" : ""}</span></button>`;
    menu.innerHTML = `<div class="context-title muted">${zh ? "连接关系" : "Connection relationship"}</div><div class="edge-relation-names" title="${escapeHtml(names)}">${escapeHtml(names)}</div>${option("related", zh ? "普通关联" : "Association", !parent)}${option("from-parent", zh ? "起点为父级 → 终点为子级" : "Start is parent → end is child", parent)}${option("to-parent", zh ? "终点为父级 → 起点为子级" : "End is parent → start is child", false)}<div class="context-separator"></div><button data-context="delete-edge" data-edge="${edgeId}" class="danger"><span class="context-leading">${icon("trash")}</span><span>${t("delete")}</span></button>`;
    menu.classList.add("open");
    document.body.classList.add("menu-open");
    const pad = 10;
    const w = menu.offsetWidth || 220, h = menu.offsetHeight || 80;
    menu.style.left = `${Math.max(pad, Math.min(x, innerWidth - w - pad))}px`;
    menu.style.top = `${Math.max(pad, Math.min(y, innerHeight - h - pad))}px`;
    menu.querySelectorAll<HTMLButtonElement>("[data-edge-relation]").forEach(button => button.addEventListener("click", () => {
      hideContextMenu(); setEdgeRelation(edgeId, button.dataset.edgeRelation as "related" | "from-parent" | "to-parent");
    }));
    menu.querySelector("[data-context=delete-edge]")?.addEventListener("click", () => {
      hideContextMenu();
      selectedEdgeId = edgeId;
      deleteSelectedEdge();
    });
  }
  function createEdge(fromId: string, toId: string, fromPort?: EdgePort, toPort?: EdgePort): Edge | null {
    if (!fromId || !toId || fromId === toId) return null;
    const from = objectById(fromId), to = objectById(toId);
    if (!from || !to) return null;
    const inferred = inferPorts(from, to);
    const fp = fromPort || inferred.fromPort, tp = toPort || inferred.toPort;
    if (edges.some(e => (e.fromId === fromId && e.toId === toId && e.fromPort === fp && e.toPort === tp) || (e.fromId === toId && e.toId === fromId && e.fromPort === tp && e.toPort === fp))) return null;
    const edge: Edge = {
      id: uid(),
      fromId,
      toId,
      fromPort: fp,
      toPort: tp,
    };
    snapshotState();
    edges.push(edge);
    saveObjects();
    renderEdges();
    sendUpdate([], [], [edge], []);
    toast(t("connected"));
    return edge;
  }
  function deleteSelectedEdge(): void {
    if (!selectedEdgeId) return;
    const id = selectedEdgeId;
    snapshotState();
    edges = edges.filter((e) => e.id !== id);
    selectedEdgeId = null;
    saveObjects();
    renderEdges();
    hideContextMenu();
    sendUpdate([], [], [], [id]);
    toast(t("edgeDeleted"));
  }
  function deleteSelectedObjects(): void {
    const ids = selectedIds.size ? [...selectedIds] : (selected ? [selected] : []);
    if (!ids.length) return;
    snapshotState();
    const idSet = new Set(ids);
    const removedEdges = edges.filter((e) => idSet.has(e.fromId) || idSet.has(e.toId)).map((e) => e.id);
    for (const id of ids) {
      const object = objectById(id);
      if (!object) continue;
      if (object.kind === "folder") objects.forEach((child) => { if (child.folderId === object.id) child.folderId = undefined; });
      trashItems.push({ ...object, folderId: undefined });
    }
    objects = objects.filter((o) => !idSet.has(o.id));
    edges = edges.filter((e) => !idSet.has(e.fromId) && !idSet.has(e.toId));
    saveTrash();
    selected = null; selectedIds = new Set(); selectedEdgeId = null;
    saveObjects(); renderObjects();
    sendUpdate([], ids, [], removedEdges);
    toast(t("movedTrash"));
  }
  function finishConnDrag(e: PointerEvent): void {
    if (!connDrag) return;
    const fromId = connDrag.fromId;
    const fromPort = connDrag.fromPort;
    connDrag = null;
    document.body.classList.remove("connecting");
    const hit = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
    const portEl = hit?.closest?.(".conn-port") as HTMLElement | null;
    const card = hit?.closest?.(".canvas-card") as HTMLElement | null;
    let toId: string | null = null;
    let toPort: EdgePort | undefined;
    if (portEl && card) {
      toId = card.dataset.id || null;
      toPort = (portEl.dataset.port || "left") as EdgePort;
    } else if (card) {
      toId = card.dataset.id || null;
    }
    renderEdges();
    if (toId && toId !== fromId) createEdge(fromId, toId, fromPort, toPort);
  }
  function todoProgressMeta(o: CanvasObject): { done: number; total: number; pct: number } {
    const items = o.items || [];
    const total = items.length;
    const done = items.filter((it) => it.done).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  function todoProgressHtml(o: CanvasObject): string {
    const { done, total, pct } = todoProgressMeta(o);
    if (!total) {
      return `<div class="todo-progress is-empty" data-todo-progress hidden><span class="todo-progress-count">0/0</span><div class="todo-progress-track"><div class="todo-progress-bar" style="width:0%"></div></div></div>`;
    }
    return `<div class="todo-progress" data-todo-progress><span class="todo-progress-count">${done}/${total}</span><div class="todo-progress-track"><div class="todo-progress-bar" style="width:${pct}%"></div></div></div>`;
  }
  function patchTodoProgress(root: HTMLElement, o: CanvasObject): void {
    const slot = root.querySelector("[data-todo-progress]");
    if (!slot) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = todoProgressHtml(o);
    const next = wrap.firstElementChild;
    if (next) slot.replaceWith(next);
  }
  function sendTodoOperation(o: CanvasObject, operation: Record<string, unknown>): boolean {
    if (!collaborationReady || !socket || socket.readyState !== WebSocket.OPEN) {
      toast(lang === "zh" ? "正在重连，恢复后可保存待办；当前输入仍保留。" : "Reconnecting. Save after the connection recovers; your input is still here.");
      return false;
    }
    // Item operations go through the authoritative server, never full-list P2P writes.
    socket.send(JSON.stringify({ type: "todo-operation", objectId: o.id, operation }));
    return true;
  }
  function patchTodoCard(o: CanvasObject, el: HTMLElement): void {
    const title = el.querySelector<HTMLInputElement>("[data-todo-title]");
    if (title && (document.activeElement !== title || title.value === title.dataset.originalValue)) { title.value = o.title || t("todoTitle"); title.dataset.originalValue = title.value; }
    const list = el.querySelector<HTMLElement>(".todo-list");
    if (!list) return;
    const ids = new Set((o.items || []).map(item => item.id));
    list.querySelectorAll<HTMLElement>("[data-todo-id]").forEach(row => {
      if (!ids.has(row.dataset.todoId!)) row.remove();
    });
    if (!ids.size) { list.innerHTML = todoItemsHtml(o); }
    else {
      list.querySelector(".todo-empty")?.remove();
      for (const item of o.items || []) {
        let row = Array.from(list.querySelectorAll<HTMLElement>("[data-todo-id]")).find(r => r.dataset.todoId === item.id);
        if (!row) {
          list.insertAdjacentHTML("beforeend", todoItemsHtml({ ...o, items: [item] }));
          row = list.lastElementChild as HTMLElement;
        }
        row.classList.toggle("is-done", item.done);
        const check = row.querySelector("[data-todo-toggle]")!;
        check.setAttribute("aria-pressed", String(item.done));
        row.querySelector(".todo-check-mark")!.innerHTML = item.done ? '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.2 8.3l3.1 3.1 6.5-6.5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
        const input = row.querySelector<HTMLInputElement>("[data-todo-text]")!;
        if (document.activeElement !== input || input.value === input.dataset.originalValue) { input.value = item.text; input.dataset.originalValue = input.value; }
      }
    }
    patchTodoProgress(el, o);
  }
  function bindTodoCard(o: CanvasObject, el: HTMLElement): void {
    // Delegate events so remote row insertions preserve focus, selection and drafts.
    el.addEventListener("pointerdown", e => {
      const target = e.target as Element;
      if (target.closest(".todo-header,.todo-list,.todo-add-row")) e.stopPropagation();
    });
    el.querySelector(".todo-list")?.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
    el.addEventListener("focusin", e => {
      const field = e.target as HTMLInputElement;
      if (field.matches("input")) { field.dataset.originalValue = field.value; setEditingObject(o.id); }
    });
    el.addEventListener("focusout", e => {
      const field = e.target as HTMLInputElement;
      if (!field.matches("input")) return;
      if (field.value !== field.dataset.originalValue) {
        if (field.matches("[data-todo-title]")) sendTodoOperation(o, { action: "title", text: field.value });
        if (field.matches("[data-todo-text]")) sendTodoOperation(o, { action: "text", itemId: field.closest<HTMLElement>("[data-todo-id]")?.dataset.todoId, text: field.value });
      }
      if (editingObjectId === o.id) setEditingObject(null);
    });
    el.addEventListener("click", e => {
      const button = (e.target as Element).closest("[data-todo-toggle],[data-todo-remove]");
      if (!button) return;
      e.preventDefault(); e.stopPropagation();
      const itemId = button.closest<HTMLElement>("[data-todo-id]")?.dataset.todoId;
      const item = o.items?.find(item => item.id === itemId);
      if (!item) return;
      sendTodoOperation(o, button.matches("[data-todo-remove]") ? { action: "remove", itemId } : { action: "done", itemId, done: !item.done });
    });
    el.addEventListener("keydown", e => {
      const field = e.target as HTMLInputElement;
      if (e.key !== "Enter" || e.isComposing || !field.matches("input")) return;
      e.preventDefault(); e.stopPropagation();
      if (field.matches("[data-todo-add]")) {
        const text = field.value.trim();
        if (text && sendTodoOperation(o, { action: "add", itemId: uid(), text })) field.value = "";
      } else { field.blur(); el.querySelector<HTMLInputElement>("[data-todo-add]")?.focus(); }
    });
  }

  function portsHtml(): string {
    return `<button type="button" class="conn-port" data-port="left" tabindex="-1" aria-label="connect left"></button><button type="button" class="conn-port" data-port="right" tabindex="-1" aria-label="connect right"></button><button type="button" class="conn-port" data-port="top" tabindex="-1" aria-label="connect top"></button><button type="button" class="conn-port" data-port="bottom" tabindex="-1" aria-label="connect bottom"></button>`;
  }
  function cardPinsHtml(o: CanvasObject): string {
    return (o.pins || []).map((pin, index) => `<button type="button" class="conn-port card-pin" data-port="pin:${escapeHtml(pin.id)}" style="left:${Math.max(0, Math.min(1, pin.x)) * 100}%;top:${Math.max(0, Math.min(1, pin.y)) * 100}%" aria-label="${lang === "zh" ? "连接图钉" : "Connect pin"} ${index + 1}" title="${lang === "zh" ? "拖动挂线 · Alt+拖动移位 · 右键移除" : "Drag to connect · Alt+drag to move · Right-click to remove"}"></button>`).join("");
  }
  function syncCardPins(o: CanvasObject, el: HTMLElement): void {
    const signature = JSON.stringify(o.pins || []);
    if (el.dataset.pins === signature) return;
    el.dataset.pins = signature;
    el.querySelectorAll(":scope > .card-pin").forEach(node => node.remove());
    el.insertAdjacentHTML("beforeend", cardPinsHtml(o));
    el.querySelectorAll<HTMLElement>(":scope > .card-pin").forEach(port => bindConnectionPort(o, el, port));
  }
  function addCardPin(o: CanvasObject): void {
    if (o.kind === "pin") return;
    const point = contextPoint || { x: o.x + o.width / 2, y: o.y + o.height / 2 };
    snapshotState();
    o.pins = [...(o.pins || []), { id: uid(), x: Math.max(0, Math.min(1, (point.x - o.x) / o.width)), y: Math.max(0, Math.min(1, (point.y - o.y) / o.height)) }];
    saveObjects(); syncObjectDom(o); sendUpdate([o]);
    toast(lang === "zh" ? "图钉已放置，拖动图钉即可挂线" : "Pin added. Drag it to connect.");
  }
  function showPinMenu(o: CanvasObject, port: EdgePort, e: MouseEvent): void {
    const menu = $("#context-menu") as HTMLElement | null; if (!menu) return;
    menu.innerHTML = `<div class="context-title muted">${lang === "zh" ? "图钉 · Alt+拖动可移位" : "Pin · Alt+drag to move"}</div><button data-remove-pin class="danger"><span class="context-leading">${icon("trash")}</span><span>${lang === "zh" ? "移除图钉及其连线" : "Remove pin and its connections"}</span></button>`;
    menu.classList.add("open"); document.body.classList.add("menu-open");
    menu.style.left = `${Math.max(12, Math.min(e.clientX, innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(e.clientY, innerHeight - menu.offsetHeight - 12))}px`;
    menu.querySelector("[data-remove-pin]")?.addEventListener("click", () => {
      snapshotState();
      const removed = edges.filter(edge => (edge.fromId === o.id && edge.fromPort === port) || (edge.toId === o.id && edge.toPort === port)).map(edge => edge.id);
      edges = edges.filter(edge => !removed.includes(edge.id));
      o.pins = (o.pins || []).filter(pin => `pin:${pin.id}` !== port);
      selectedEdgeId = null; hideContextMenu(); saveObjects(); syncObjectDom(o); renderEdges(); sendUpdate([o], [], [], removed);
    });
  }
  function bindConnectionPort(o: CanvasObject, el: HTMLElement, port: HTMLElement): void {
    port.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); port.focus({ preventScroll: true });
      const name = (port.dataset.port || "right") as EdgePort;
      drag = null; pendingCardTap = null; suppressCardClick = true;
      const pin = name.startsWith("pin:") && o.pins?.find(p => p.id === name.slice(4));
      if (pin && e.altKey) pinDrag = { object: o, pin, el: port, x: pin.x, y: pin.y, before: cloneCanvasState() };
      else {
        document.body.classList.add("connecting");
        const point = worldPoint(e); connDrag = { fromId: o.id, fromPort: name, x: point.x, y: point.y };
      }
      selected = o.id; selectedIds = new Set([o.id]); selectedEdgeId = null;
      el.classList.add("selected"); $("#canvas-wrap")?.setPointerCapture(e.pointerId); renderEdgePreview();
    });
    if (port.classList.contains("card-pin")) port.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); showPinMenu(o, port.dataset.port as EdgePort, e); });
  }
  function finishPinDrag(cancelled = false): void {
    const active = pinDrag; if (!active) return;
    pinDrag = null;
    if (cancelled) { active.pin.x = active.x; active.pin.y = active.y; }
    else if (active.pin.x !== active.x || active.pin.y !== active.y) { undoStack.push(active.before); if (undoStack.length > 30) undoStack.shift(); redoStack = []; }
    active.el.style.left = `${active.pin.x * 100}%`; active.el.style.top = `${active.pin.y * 100}%`;
    saveObjects(); syncObjectDom(active.object); renderEdges(); sendUpdate([active.object]);
  }
  function resizeHandlesHtml(): string {
    const labels = lang === "zh" ? ["左上", "右上", "左下", "右下"] : ["top left", "top right", "bottom left", "bottom right"];
    return (["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner, index) => `<button type="button" class="resize-handle" data-resize-corner="${corner}" tabindex="-1" aria-label="${lang === "zh" ? `从${labels[index]}调整大小` : `Resize from ${labels[index]}`}" title="${lang === "zh" ? "拖动调整大小" : "Drag to resize"}"></button>`).join("");
  }
  function todoItemsHtml(o: CanvasObject): string {
    const items = o.items || [];
    if (!items.length) {
      return `<div class="todo-empty"><span class="todo-empty-glyph" aria-hidden="true"></span><span class="todo-empty-title">${escapeHtml(t("todoEmpty"))}</span><small class="todo-empty-hint">${escapeHtml(t("todoEmptyHint"))}</small></div>`;
    }
    return items.map((item) => {
      const done = item.done ? " is-done" : "";
      const mark = item.done
        ? `<svg class="todo-check-svg" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.2 8.3l3.1 3.1 6.5-6.5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : "";
      return `<div class="todo-item${done}" data-todo-id="${escapeHtml(item.id)}"><button type="button" class="todo-check" data-todo-toggle aria-pressed="${item.done ? "true" : "false"}" aria-label="${lang === 'zh' ? '切换完成状态' : 'Toggle completed'}"><span class="todo-check-mark">${mark}</span></button><input class="todo-item-text" type="text" value="${escapeHtml(item.text)}" data-todo-text aria-label="${lang === 'zh' ? '待办内容' : 'Task text'}" maxlength="200" autocomplete="off" spellcheck="false"><button type="button" class="todo-item-remove" data-todo-remove aria-label="${t("delete")}">×</button></div>`;
    }).join("");
  }
  function cardHtml(o: CanvasObject): string {
    const active = selected === o.id ? " selected" : selectedIds.has(o.id) ? " multi-selected" : "";
    if (o.kind === "pin") return `<article class="canvas-card pin-card${active}" data-id="${o.id}" aria-label="${kindLabel("pin")}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${portsHtml()}<span class="pin-head">${icon("pin")}</span></article>`;
    const ports = portsHtml() + resizeHandlesHtml();
    if (o.kind === "artboard") {
      const thumbUrl = getArtboardThumbnail(o);
      const preview = thumbUrl
        ? `<img class="artboard-thumb" src="${thumbUrl}" alt="" draggable="false">`
        : `<div class="artboard-empty"><span class="artboard-empty-icon">${icon("pen")}</span><span>${escapeHtml(t("emptyArtboard"))}</span><small>${escapeHtml(t("artboardEmptyHint"))}</small></div>`;
      return `<article class="canvas-card artboard-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<div class="artboard-preview">${preview}</div><div class="artboard-name">${escapeHtml(o.title || t("artboard"))}</div><div class="artboard-count">${o.strokes?.length || 0}</div></article>`;
    }
    if (o.kind === "folder") {
      const children = folderChildren(o.id);
      const previews = children.slice(0, 3).map((child, index, list) => `<div class="folder-sleeve" style="--i:${index};--offset:${index - (list.length - 1) / 2}">${folderCardThumb(child)}</div>`).join('');
      return `<article class="canvas-card folder-card${children.length ? ' has-contents' : ' is-empty'}${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<div class="folder-tab"></div><div class="folder-preview" aria-hidden="true">${previews}</div><div class="folder-cover-mark" aria-hidden="true">${icon('folder')}</div><div class="folder-name">${escapeHtml(o.title || t('folder'))}</div><div class="folder-count">${children.length} ${t('items')}</div></article>`;
    }
    if (o.kind === "note") return `<article class="canvas-card note-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;background:${o.color || "#fff2a8"}">${ports}<div class="card-grip">⋮⋮</div><textarea class="note-editor" aria-label="${t("sticky")}">${escapeHtml(o.text)}</textarea><div class="card-foot"><span>⌘ ${escapeHtml(me.name)}</span><span class="edited">${t("justNow")}</span></div></article>`;
    if (o.kind === "todo") return `<article class="canvas-card todo-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<div class="todo-drag-handle" title="${lang === 'zh' ? '拖拽模式下可从这里移动' : 'Drag from here in drag mode'}"><span></span></div><div class="todo-header"><div class="card-top"><span class="doc-icon todo-icon" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 4.2h9M3.5 8h9M3.5 11.8h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11.2 10.2l1.2 1.2 2.2-2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><input class="todo-title" type="text" value="${escapeHtml(o.title || t("todoTitle"))}" data-todo-title maxlength="120" aria-label="${t("todoTitle")}" autocomplete="off" spellcheck="false"></div>${todoProgressHtml(o)}</div><div class="todo-list">${todoItemsHtml(o)}</div><div class="todo-add-row"><span class="todo-add-plus" aria-hidden="true">+</span><input class="todo-add-input" type="text" placeholder="${escapeHtml(t("todoItemPlaceholder"))}" data-todo-add aria-label="${t("todoItemPlaceholder")}" maxlength="200" autocomplete="off" spellcheck="false"></div></article>`;
    if (o.kind === "richText") return `<article class="canvas-card rich-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<div class="rich-preview" aria-hidden="true">${richHtml(o)}</div><div class="image-caption"><span class="image-caption-text">${escapeHtml(o.title || t("newDocument"))}</span></div></article>`;
    if (o.kind === "image") return `<article class="canvas-card image-card${active}${o.uploading ? " is-uploading" : ""}${o.uploadError ? " is-upload-error" : ""}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<img src="${escapeHtml(o.src || "")}" alt="${escapeHtml(o.caption || t("newVisual"))}" draggable="false" class="${o.uploading ? "is-blur" : ""}"><div class="upload-overlay" ${o.uploading || o.uploadError ? "" : "hidden"}><div class="upload-label">${escapeHtml(o.uploadError ? t("uploadFailed") : t("uploading"))}</div><div class="upload-track"><div class="upload-progress-bar" style="width:${Math.max(0, Math.min(100, o.uploadProgress || 0))}%"></div></div>${o.uploadError ? `<button type="button" class="upload-retry" data-upload-retry="${o.id}">${escapeHtml(t("uploadRetry"))}</button>` : ""}</div><div class="image-caption"><span class="image-caption-text">${escapeHtml(o.caption || t("newVisual"))}</span></div></article>`;
    return `<article class="canvas-card link-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px">${ports}<div class="link-preview"><div class="link-favicon">↗</div><div class="link-copy"><b>${escapeHtml(o.title || t("savedLink"))}</b><span>${escapeHtml(o.description || o.url)}</span></div></div><div class="link-url">${escapeHtml(o.url)}</div></article>`;
  }
  function richToolbar(): string {
    const commands = [
      ["bold", "B", "加粗", "Bold"], ["italic", "<i>I</i>", "斜体", "Italic"],
      ["underline", "<u>U</u>", "下划线", "Underline"], ["formatBlock", "H2", "标题", "Heading"],
      ["insertUnorderedList", "≡", "无序列表", "Bullet list"], ["insertOrderedList", "1.", "有序列表", "Numbered list"],
      ["createLink", icon("link"), "链接", "Link"], ["removeFormat", "Tx", "清除格式", "Clear formatting"]
    ];
    const sizeTools = `<div class="font-size-controls" role="group" aria-label="${lang === "zh" ? "字号" : "Font size"}"><button type="button" class="fmt-btn" data-font-step="-1" aria-label="${lang === "zh" ? "缩小字体" : "Decrease font size"}" title="${lang === "zh" ? "缩小字体" : "Decrease font size"}">A−</button><select class="font-size-select" aria-label="${lang === "zh" ? "字号" : "Font size"}"><option value="" hidden>—</option>${RICH_FONT_SIZES.map(size => `<option value="${size}">${size}</option>`).join("")}</select><button type="button" class="fmt-btn" data-font-step="1" aria-label="${lang === "zh" ? "放大字体" : "Increase font size"}" title="${lang === "zh" ? "放大字体" : "Increase font size"}">A+</button></div>`;
    return `<div class="format-bar" data-format-bar role="toolbar" aria-label="${lang === "zh" ? "文本格式" : "Text formatting"}">${sizeTools}<span class="format-divider" aria-hidden="true"></span>${commands.map(([cmd, label, zh, en]) => `<button type="button" class="fmt-btn" data-cmd="${cmd}" title="${lang === "zh" ? zh : en}" aria-label="${lang === "zh" ? zh : en}">${label}</button>`).join("")}</div>`;
  }
  function bindRichCard(o: CanvasObject, el: HTMLElement): void {
    const rich = el.querySelector<HTMLElement>(".rich-editor")!;
    const title = el.querySelector<HTMLInputElement>(".doc-title")!;
    let savedRange: Range | null = null;
    let typingFont: { range: Range; size: number } | null = null;
    let titleTimer: ReturnType<typeof setTimeout> | null = null;
    const sizeSelect = el.querySelector<HTMLSelectElement>(".font-size-select")!;
    const smaller = el.querySelector<HTMLButtonElement>('[data-font-step="-1"]')!;
    const larger = el.querySelector<HTMLButtonElement>('[data-font-step="1"]')!;
    let currentFontSize = parseFloat(getComputedStyle(rich).fontSize) || 18;
    const showFontSize = (size: number): void => {
      currentFontSize = size;
      sizeSelect.value = RICH_FONT_SIZES.includes(size) ? String(size) : "";
      smaller.disabled = size <= RICH_FONT_SIZES[0]; larger.disabled = size >= RICH_FONT_SIZES[RICH_FONT_SIZES.length - 1];
    };
    const rememberSelection = (): void => {
      const selection = window.getSelection();
      if (selection?.rangeCount && rich.contains(selection.anchorNode) && rich.contains(selection.focusNode)) {
        savedRange = selection.getRangeAt(0).cloneRange();
        if (typingFont && savedRange.collapsed && savedRange.startContainer === typingFont.range.startContainer && savedRange.startOffset === typingFont.range.startOffset) {
          showFontSize(typingFont.size); return;
        }
        typingFont = null;
        // Select-all can anchor on the editor rather than the formatted text.
        let node = savedRange.collapsed ? selection.focusNode : savedRange.startContainer;
        if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length) {
          const offset = savedRange.collapsed ? selection.focusOffset : savedRange.startOffset;
          const atEnd = offset >= node.childNodes.length;
          node = node.childNodes[Math.min(offset, node.childNodes.length - 1)];
          while (node.childNodes.length) node = atEnd ? node.lastChild! : node.firstChild!;
        }
        const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
        showFontSize(parseFloat(getComputedStyle(element || rich).fontSize) || 18);
      }
    };
    const restoreSelection = (): void => {
      rich.focus();
      const selection = window.getSelection();
      if (savedRange && rich.contains(savedRange.commonAncestorContainer)) { selection?.removeAllRanges(); selection?.addRange(savedRange); }
    };
    const changed = (): void => {
      const content = sanitizeRichHtml(rich.innerHTML);
      if (content.length > 200000) { rich.innerHTML = richHtml(o); toast(lang === "zh" ? "文档过长，请拆分为多个富文本面板" : "Please split this document into smaller panels"); return; }
      o.content = content; setEditingObject(o.id); scheduleTextUpdate(o); rememberSelection(); syncRichStatus(o, el); syncObjectDom(o);
    };
    rich.addEventListener("pointerdown", e => e.stopPropagation());
    rich.addEventListener("dblclick", e => e.stopPropagation());
    rich.addEventListener("click", e => { if ((e.target as Element).closest("a")) e.preventDefault(); });
    rich.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
    rich.addEventListener("focus", () => setEditingObject(o.id));
    rich.addEventListener("blur", () => {
      if (editingObjectId === o.id) setEditingObject(null);
      flushTextUpdate(o); syncObjectDom(o); syncRichEditor(o, el);
    });
    rich.addEventListener("input", () => { typingFont = null; changed(); });
    rich.addEventListener("keyup", rememberSelection);
    rich.addEventListener("mouseup", rememberSelection);
    rich.addEventListener("paste", e => {
      const data = e.clipboardData; if (!data) return;
      e.preventDefault(); e.stopPropagation();
      const html = data.getData("text/html");
      document.execCommand(html ? "insertHTML" : "insertText", false, html ? sanitizeRichHtml(html) : data.getData("text/plain"));
      changed();
    });
    rich.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); });
    title.addEventListener("pointerdown", e => e.stopPropagation());
    title.addEventListener("focus", () => { title.dataset.originalValue = title.value; });
    title.addEventListener("input", () => {
      o.title = title.value; richTitleDrafts.set(o.id, title.value); syncRichStatus(o, el); syncObjectDom(o);
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = setTimeout(() => { titleTimer = null; flushRichDraft(o); saveObjects(); }, TEXT_UPDATE_MS);
    });
    title.addEventListener("blur", () => {
      if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
      if (title.value !== title.dataset.originalValue) { o.title = title.value; richTitleDrafts.set(o.id, title.value); flushRichDraft(o); saveObjects(); }
      else title.value = o.title ?? t("newDocument");
      syncRichStatus(o, el); syncObjectDom(o);
    });
    title.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); title.blur(); } });
    const applyFontSize = (size: number): void => {
      const index = RICH_FONT_SIZES.indexOf(size); if (index < 0) return;
      restoreSelection();
      // Native formatting retains text selection, future typing and Ctrl/Cmd+Z.
      // Canonicalize only the saved HTML, never replace the live undo-managed DOM.
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand("fontSize", false, String(index + 1));
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
      typingFont = range?.collapsed ? { range: range.cloneRange(), size } : null;
      changed(); showFontSize(size);
    };
    sizeSelect.addEventListener("pointerdown", e => { e.stopPropagation(); rememberSelection(); });
    sizeSelect.addEventListener("change", e => { e.stopPropagation(); applyFontSize(Number(sizeSelect.value)); });
    showFontSize(currentFontSize);
    el.querySelectorAll<HTMLElement>(".fmt-btn").forEach(btn => {
      btn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); rememberSelection(); });
      btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        if (btn.dataset.fontStep) {
          const next = Number(btn.dataset.fontStep) > 0 ? RICH_FONT_SIZES.find(size => size > currentFontSize) : [...RICH_FONT_SIZES].reverse().find(size => size < currentFontSize);
          if (next !== undefined) applyFontSize(next);
          return;
        }
        let cmd = btn.dataset.cmd || "", value: string | undefined;
        if (cmd === "createLink") {
          const input = window.prompt(t("linkUrlPrompt"), "https://");
          if (input === null) return;
          const href = safeRichLink(input);
          if (!href) { toast(lang === "zh" ? "请输入有效的 http、https 或邮件链接" : "Use a valid http, https or email link"); return; }
          value = href;
        }
        restoreSelection();
        if (cmd === "removeFormat") typingFont = null;
        if (cmd === "formatBlock") value = document.queryCommandValue("formatBlock").toLowerCase() === "h2" ? "p" : "h2";
        document.execCommand(cmd, false, value);
        changed();
      });
    });
  }
  function syncRichStatus(o: CanvasObject, root: HTMLElement): void {
    const status = root.querySelector(".rich-save-status");
    if (status) status.textContent = !collaborationReady ? (lang === "zh" ? "正在重连…" : "Reconnecting…") : richDrafts.has(o.id) || richTitleDrafts.has(o.id) ? (lang === "zh" ? "正在保存…" : "Saving…") : (lang === "zh" ? "已保存" : "Saved");
    const count = root.querySelector(".rich-word-count");
    const text = root.querySelector(".rich-editor")?.textContent || "";
    if (count) count.textContent = lang === "zh" ? `${text.replace(/\s/g, "").length} 字` : `${text.trim() ? text.trim().split(/\s+/).length : 0} words`;
  }
  function syncRichEditor(o: CanvasObject, root: HTMLElement): void {
    const title = root.querySelector<HTMLInputElement>(".doc-title");
    if (title && !richTitleDrafts.has(o.id) && (document.activeElement !== title || title.value === title.dataset.originalValue)) { title.value = o.title ?? t("newDocument"); title.dataset.originalValue = title.value; }
    const rich = root.querySelector<HTMLElement>(".rich-editor");
    const content = richHtml(o);
    if (rich && !richDrafts.has(o.id) && sanitizeRichHtml(rich.innerHTML) !== content) rich.innerHTML = content;
    syncRichStatus(o, root);
  }
  function bindObject(o: CanvasObject): void {
    const el = document.querySelector(`[data-id="${o.id}"]`) as HTMLElement | null; if (!el) return;
    el.querySelectorAll("[data-upload-retry]").forEach((btn) => {
      (btn as HTMLElement).onclick = (e) => { e.preventDefault(); e.stopPropagation(); void retryImageUpload(o.id); };
    });
    el.querySelectorAll<HTMLElement>(":scope > .conn-port").forEach(port => bindConnectionPort(o, el, port));
    syncCardPins(o, el);
    el.setAttribute('data-click-hint', o.kind === 'pin' ? (lang === 'zh' ? '拖动移动 · 从圆点挂线' : 'Drag to move · Connect from a dot') : o.kind === 'richText' ? (lang === 'zh' ? '点击沉浸编辑' : 'Click to write') : o.kind === 'todo' ? (lang === 'zh' ? '直接编辑 · 回车保存' : 'Edit here · Enter to save') : o.kind === 'folder' ? (lang === 'zh' ? '单击预览 · 双击进入' : 'Click to peek · Double-click to enter') : (lang === 'zh' ? '点击打开' : 'Click to open'));
    el.setAttribute('data-drag-hint', lang === 'zh' ? '拖动移动' : 'Drag to move');
    if (o.kind === 'folder') {
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
      el.setAttribute('aria-label', (o.title || t('folder')) + ' · ' + (lang === 'zh' ? '单击预览，双击进入' : 'Click to peek, double-click to enter'));
      el.setAttribute('aria-expanded', peekFolderId === o.id ? 'true' : 'false');
      el.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showFolderPeek(o, el as HTMLElement); } });
      el.addEventListener('dblclick', (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); if (openedFolderId !== o.id) openFolder(o); });
    }
    if (o.kind === "todo") bindTodoCard(o, el);
    el.addEventListener("pointerdown", (e: any) => {
      if (e.button !== 0 || e.target.closest("input,button,textarea,.rich-editor,.format-bar,.fmt-btn,.resize-handle,.conn-port,.todo-item,.todo-check,.todo-item-text,.todo-add-input,.todo-add-row,.todo-title,.todo-item-remove,.todo-list,.todo-empty,.todo-header,.todo-progress")) return;
      e.stopPropagation();
      clearCardSelection(el);
      const allowDrag = o.kind === "pin" || mouseMode === "drag" || !!e.altKey;

      if (o.kind === "folder") {
        selectedIds = new Set([o.id]);
        selected = o.id;
        el.classList.add("selected");
        pendingCardTap = { id: o.id, el: el as HTMLElement, sx: e.clientX, sy: e.clientY, pointerId: e.pointerId, slop: allowDrag ? 8 : 32, moved: false };
        if (allowDrag) {
          pendingDragSnapshot = cloneCanvasState();
          drag = { card: o, el: el as HTMLElement, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
          $("#canvas-wrap")?.setPointerCapture(e.pointerId);
          el.classList.add("dragging");
        } else {
          // Capture keeps release delivery reliable; it bubbles to the canvas handler.
          drag = null;
          try { (el as HTMLElement).setPointerCapture(e.pointerId); } catch {}
        }
        return;
      }

      if (!selectedIds.has(o.id)) {
        selectedIds = o.groupId ? new Set(objectsInGroup(o.groupId).map(m => m.id)) : new Set([o.id]);
      } else if (o.groupId) {
        objectsInGroup(o.groupId).forEach(m => selectedIds.add(m.id));
      }
      selectedIds = expandIdsWithGroups(selectedIds);
      selected = o.id;
      pendingCardTap = { id: o.id, el: el as HTMLElement, sx: e.clientX, sy: e.clientY, pointerId: e.pointerId, slop: allowDrag ? 8 : 20, moved: false };
      el.classList.add("selected");

      if (!allowDrag) {
        // Click mode: select / open without starting a card drag (tiny moves stay clicks).
        drag = null;
        return;
      }

      const members = selectedIds.size > 1 ? [...selectedIds].map(id => objectById(id)).filter(item => item && item.kind !== "folder") : [o];
      const items = members.map(object => ({ object, el: document.querySelector(`[data-id="${object.id}"]`) as HTMLElement | null, ox: object.x, oy: object.y })).filter((item): item is DragItem => !!item.el);
      pendingDragSnapshot = cloneCanvasState();
      drag = items.length > 1 ? { group: true, items, sx: e.clientX, sy: e.clientY } : { card: o, el: el as HTMLElement, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
      $("#canvas-wrap")?.setPointerCapture(e.pointerId);
      items.forEach(item => item.el.classList.add("selected", "multi-selected", "dragging"));
    });
    // Opening is handled by pointerup, never repeated by compatibility click/dblclick.
    const editor = el.querySelector("textarea") as HTMLTextAreaElement | null;
    if (editor) {
      editor.addEventListener("focus", () => setEditingObject(o.id));
      editor.addEventListener("blur", () => { if (editingObjectId === o.id) setEditingObject(null); flushTextUpdate(o); });
      editor.addEventListener("input", (e: any) => { o.text = e.target.value; setEditingObject(o.id); scheduleTextUpdate(o); });
    }

    el.querySelectorAll<HTMLButtonElement>("[data-resize-corner]").forEach(handle => {
      handle.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        handle.focus({ preventScroll: true });
        if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
        pendingCardTap = null; suppressCardClick = true;
        lastCardTap = { id: null, time: 0 }; lastFolderTap = { id: "", time: 0 };
        hideFolderPeek(); clearCardSelection(el);
        selected = o.id; selectedIds = new Set([o.id]);
        const style = getComputedStyle(el);
        pendingDragSnapshot = cloneCanvasState();
        drag = {
          resize: o, resizeCorner: handle.dataset.resizeCorner as ResizeCorner, el,
          sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow: o.width, oh: o.height,
          minWidth: Math.max(180, parseFloat(style.minWidth) || 0),
          minHeight: Math.max(120, parseFloat(style.minHeight) || 0)
        };
        $("#canvas-wrap")?.setPointerCapture(e.pointerId);
        el.classList.add("selected", "dragging", "resizing"); updateAlignBar();
      });
      handle.addEventListener("dblclick", e => { e.preventDefault(); e.stopPropagation(); });
    });
  }

  function pickImageFiles(multiple = false): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = multiple;
      input.style.display = "none";
      document.body.appendChild(input);
      let settled = false;
      const finish = (files: File[]) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("focus", onFocus);
        input.remove();
        resolve(files);
      };
      const onFocus = () => {
        window.setTimeout(() => {
          if (!settled && !(input.files && input.files.length)) finish([]);
        }, 500);
      };
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []).filter(
          (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)
        );
        finish(files);
      });
      input.addEventListener("cancel", () => finish([]));
      window.addEventListener("focus", onFocus);
      input.click();
    });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  function measureImage(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
      img.onerror = () => resolve({ width: 300, height: 200 });
      img.src = src;
    });
  }

  function fitImageSize(naturalW: number, naturalH: number, maxW = 360, maxH = 280): { width: number; height: number } {
    const ratio = Math.min(maxW / Math.max(1, naturalW), maxH / Math.max(1, naturalH), 1);
    const width = Math.max(180, Math.round(naturalW * ratio));
    const height = Math.max(140, Math.round(naturalH * ratio) + 35);
    return { width, height };
  }

  const IMAGE_UPLOAD_MAX_EDGE = 2048;
  const IMAGE_UPLOAD_QUALITY = 0.82;

  function compressImageForUpload(file: File): Promise<File> {
    return new Promise((resolve) => {
      const type = (file.type || "").toLowerCase();
      // Keep animated GIF / SVG as-is; skip tiny files.
      if (type === "image/gif" || type === "image/svg+xml" || file.size < 350 * 1024) {
        resolve(file);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth || 0;
          const h0 = img.naturalHeight || 0;
          if (!w0 || !h0) { URL.revokeObjectURL(url); resolve(file); return; }
          const scale = Math.min(1, IMAGE_UPLOAD_MAX_EDGE / Math.max(w0, h0));
          const tw = Math.max(1, Math.round(w0 * scale));
          const th = Math.max(1, Math.round(h0 * scale));
          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); resolve(file); return; }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, tw, th);
          const preferWebp = typeof (canvas as any).toBlob === "function";
          const finish = (blob: Blob | null, mime: string, ext: string) => {
            URL.revokeObjectURL(url);
            if (!blob || blob.size >= file.size * 0.98) { resolve(file); return; }
            const base = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
            resolve(new File([blob], base + ext, { type: mime, lastModified: Date.now() }));
          };
          // Prefer JPEG for photos (much smaller than PNG); WebP when clearly smaller.
          canvas.toBlob((webp) => {
            if (webp && webp.size < file.size * 0.85 && webp.size < tw * th) {
              // Also compare JPEG
              canvas.toBlob((jpg) => {
                if (jpg && jpg.size < webp.size) finish(jpg, "image/jpeg", ".jpg");
                else finish(webp, "image/webp", ".webp");
              }, "image/jpeg", IMAGE_UPLOAD_QUALITY);
            } else {
              canvas.toBlob((jpg) => finish(jpg, "image/jpeg", ".jpg"), "image/jpeg", IMAGE_UPLOAD_QUALITY);
            }
          }, "image/webp", IMAGE_UPLOAD_QUALITY);
        } catch (_) {
          try { URL.revokeObjectURL(url); } catch {}
          resolve(file);
        }
      };
      img.onerror = () => { try { URL.revokeObjectURL(url); } catch {} resolve(file); };
      img.src = url;
    });
  }

  function uploadImageAssetWithProgress(
    file: File,
    onProgress: (pct: number) => void
  ): Promise<{ src: string; assetId?: string } | null> {
    if (!roomId || !sessionToken) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/rooms/${encodeURIComponent(roomId)}/assets`);
        xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
        xhr.setRequestHeader("x-session-token", sessionToken);
        xhr.setRequestHeader("x-filename", file.name || "upload.png");
        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          onProgress(Math.max(1, Math.min(99, Math.round((ev.loaded / ev.total) * 100))));
        };
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) return resolve(null);
          try {
            const data = JSON.parse(xhr.responseText || "{}");
            if (!data?.url) return resolve(null);
            onProgress(100);
            resolve({ src: String(data.url), assetId: data.assetId ? String(data.assetId) : undefined });
          } catch (_) {
            resolve(null);
          }
        };
        xhr.onerror = () => resolve(null);
        xhr.send(file);
      } catch (_) {
        resolve(null);
      }
    });
  }
  async function resolveImageSourceFallback(file: File): Promise<{ src: string; assetId?: string }> {
    if (file.size > 1.5 * 1024 * 1024) return { src: URL.createObjectURL(file) };
    return { src: await readFileAsDataUrl(file) };
  }
  async function addImageFromFile(file: File, at?: Point | null, offsetIndex = 0): Promise<CanvasObject | null> {
    try {
      const caption = (file.name || t("newVisual")).replace(/\.[^.]+$/, "") || t("newVisual");
      const previewUrl = URL.createObjectURL(file);
      let dims = { width: 1200, height: 800 };
      try { dims = await measureImage(previewUrl); } catch (_) {}
      const size = fitImageSize(dims.width, dims.height);
      const n = objects.length + offsetIndex;
      const o: CanvasObject = {
        id: uid(),
        kind: "image",
        x: (at?.x ?? 330 + (n % 3) * 46) + offsetIndex * 28,
        y: (at?.y ?? 240 + (n % 4) * 42) + offsetIndex * 28,
        width: size.width,
        height: size.height,
        src: previewUrl,
        caption,
        folderId: openedFolderId || undefined,
        uploading: true,
        uploadProgress: 4,
      };
      (o as any)._pendingFile = file;
      objects.push(o);
      selected = o.id;
      selectedIds = new Set([o.id]);
      saveObjects();
      renderObjects();
      void finalizeImageUpload(o, file, previewUrl);
      return o;
    } catch (error) {
      toast((error as Error).message || (lang === "zh" ? "图片添加失败" : "Could not add image"));
      return null;
    }
  }
  async function finalizeImageUpload(o: CanvasObject, file: File, previewUrl: string): Promise<void> {
    const paint = () => syncObjectDom(o);
    try {
      o.uploadProgress = Math.max(o.uploadProgress || 0, 6);
      paint();
      const prepared = await compressImageForUpload(file);
      (o as any)._pendingFile = prepared;
      const uploaded = await uploadImageAssetWithProgress(prepared, (pct) => {
        o.uploadProgress = pct;
        o.uploading = true;
        paint();
      });
      if (uploaded) {
        o.src = uploaded.src;
        o.assetId = uploaded.assetId;
      } else {
        const fallback = await resolveImageSourceFallback(file);
        o.src = fallback.src;
        o.assetId = fallback.assetId;
      }
      o.uploading = false;
      o.uploadProgress = 100;
      o.uploadError = undefined;
      paint();
      saveObjects();
      sendUpdate([o]);
      try { if (previewUrl.startsWith("blob:") && o.src !== previewUrl) URL.revokeObjectURL(previewUrl); } catch (_) {}
    } catch (_) {
      o.uploading = false;
      o.uploadError = "failed";
      o.uploadProgress = 0;
      paint();
      toast(t("uploadFailed"));
    }
  }
  async function retryImageUpload(objectId: string): Promise<void> {
    const o = objectById(objectId);
    if (!o || o.kind !== "image") return;
    const file = (o as any)._pendingFile as File | undefined;
    if (!file) { toast(t("uploadFailed")); return; }
    o.uploadError = undefined;
    o.uploading = true;
    o.uploadProgress = 2;
    const preview = o.src && o.src.startsWith("blob:") ? o.src : URL.createObjectURL(file);
    if (!o.src) o.src = preview;
    syncObjectDom(o);
    await finalizeImageUpload(o, file, preview);
  }

  async function addImagesFromFiles(files: File[], at?: Point | null, opts?: { toastMessage?: string }): Promise<void> {
    const images = files.filter(
      (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)
    );
    if (!images.length) {
      toast(opts?.toastMessage || (lang === "zh" ? "请选择图片文件" : "Please choose image files"));
      return;
    }
    hideContextMenu();
    snapshotState();
    const created: CanvasObject[] = [];
    for (let i = 0; i < images.length; i++) {
      const o = await addImageFromFile(images[i], at, i);
      if (o) created.push(o);
    }
    if (!created.length) return;
    selected = created[created.length - 1].id;
    selectedIds = new Set(created.map((o) => o.id));
    saveObjects();
    // Final asset URLs are broadcast from finalizeImageUpload when ready.
    toast(
      opts?.toastMessage
        || (created.length === 1
          ? t("imageAdded")
          : lang === "zh"
            ? `已添加 ${created.length} 张图片`
            : `Added ${created.length} images`)
    );
  }

  async function promptAddImage(at?: Point | null): Promise<void> {
    const files = await pickImageFiles(true);
    if (!files.length) return;
    await addImagesFromFiles(files, at ?? contextPoint);
  }

  function addObject(kind: CanvasObject["kind"], at?: Point | null): void {
    // Legacy note/link kinds remain renderable.
    if (kind !== "image" && kind !== "artboard" && kind !== "folder" && kind !== "todo" && kind !== "richText" && kind !== "pin") return;
    const n = objects.length;
    let x = at?.x ?? 330 + (n % 3) * 46;
    let y = at?.y ?? 240 + (n % 4) * 42;
    const width = kind === "pin" ? 40 : kind === "richText" ? 380 : kind === "todo" ? 320 : kind === "artboard" ? 320 : kind === "image" ? 300 : 260;
    const height = kind === "pin" ? 40 : kind === "richText" ? 330 : kind === "todo" ? 360 : kind === "artboard" ? 210 : kind === "image" ? 205 : 180;
    if (kind === "pin") { x -= width / 2; y -= height / 2; }
    const base = { id: uid(), x, y, width, height, folderId: openedFolderId || undefined };
    const o: CanvasObject = kind === "artboard" ? { ...base, kind, title: t("artboard"), strokes: [] as Stroke[] }
      : kind === "pin" ? { ...base, kind, title: kindLabel("pin") }
      : kind === "richText" ? { ...base, kind, title: t("newDocument"), content: "<p><br></p>", richTextVersion: 0 }
      : kind === "todo" ? { ...base, kind, title: t("todoTitle"), items: [], todoVersion: 0 }
      : kind === "image" ? { ...base, kind, src: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=740&q=80", caption: t("newVisual") }
      : { ...base, kind: "folder" as const, title: t("folder") };
    snapshotState();
    objects.push(o);
    selected = o.id; selectedIds = new Set([o.id]); selectedEdgeId = null;
    saveObjects(); renderObjects();
    sendUpdate([o], [], [], []);
    hideContextMenu();
    if (kind === "richText") { openPanel(o); (document.querySelector("#panel-viewer .rich-editor") as HTMLElement | null)?.focus(); }
    toast(kind === "pin" ? (lang === "zh" ? "已放置图钉" : "Pin added") : kind === "richText" ? t("documentAdded") : kind === "todo" ? t("todoAdded") : kind === "image" ? t("imageAdded") : kind === "folder" ? t("folderAdded") : t("artboardAdded"));
  }
  function showContextMenu(x: number, y: number, object: CanvasObject | null): void {
    const menu = $("#context-menu");
    if (!menu) return;
    const editItem = object && object.kind !== "pin" ? `<button data-context="edit"><span class="context-leading">${icon("pen")}</span><span>${t("edit")}</span></button>` : "";
    const openItem = object && object.kind !== "pin" ? `<button data-context="open"><span class="context-leading">${icon("open")}</span><span>${object.kind === "folder" ? t("open") : t("open")}</span></button>` : "";
    const items = object ? `<div class="context-title"><span class="context-dot" style="background:${object.kind === "note" ? "#e6c45d" : object.kind === "folder" ? "#d8a54b" : "#6f86e8"}"></span>${escapeHtml(kindLabel(object.kind))}</div>${openItem}${editItem}${object.kind !== "pin" ? `<button data-context="add-card-pin"><span class="context-leading">${icon("pin")}</span><span>${lang === "zh" ? "在这里打图钉" : "Pin this point"}</span></button>` : ""}${layerActionsHtml(object)}<button data-context="duplicate"><span class="context-leading">${icon("copy")}</span><span>${t("duplicate")}</span></button><button data-context="delete" class="danger"><span class="context-leading">${icon("trash")}</span><span>${t("delete")}</span></button><div class="context-separator"></div>` : "";
    (menu as HTMLElement).innerHTML = `${items}<div class="context-title muted">${t("createHere")}</div><button data-context="pin"><span class="context-leading context-pin">${icon("pin")}</span><span>${lang === "zh" ? "图钉连接点" : "Connection pin"}</span></button><button data-context="image"><span class="context-leading context-image">${icon("image")}</span><span>${t("image")}</span><kbd>⌘ I</kbd></button><button data-context="artboard"><span class="context-leading context-artboard">${icon("pen")}</span><span>${t("artboard")}</span><kbd>⇧⌘ A</kbd></button><button data-context="richText"><span class="context-leading context-document">${icon("note")}</span><span>${t("richText")}</span></button><button data-context="todo"><span class="context-leading context-todo">${icon("todo")}</span><span>TodoList · ${t("todo")}</span></button><button data-context="folder"><span class="context-leading context-folder">${icon("folder")}</span><span>${t("folder")}</span><kbd>⇧⌘ F</kbd></button><div class="context-separator"></div><button data-context="fit"><span class="context-leading">${icon("fit")}</span><span>${t("fit")}</span></button><button data-context="invite"><span class="context-leading">${icon("link")}</span><span>${t("invite")}</span></button><button data-context="language"><span class="context-leading">${icon("globe")}</span><span>${t("languageAction")}</span></button>`;
    (menu as HTMLElement).classList.add("open");
    document.body.classList.add("menu-open");
    const menuWidth = (menu as HTMLElement).offsetWidth || 344;
    const menuHeight = (menu as HTMLElement).offsetHeight || 360;
    (menu as HTMLElement).style.left = `${Math.max(12, Math.min(x, innerWidth - menuWidth - 12))}px`;
    (menu as HTMLElement).style.top = `${Math.max(12, Math.min(y, innerHeight - menuHeight - 12))}px`;
    (menu as HTMLElement).querySelectorAll("[data-context]").forEach((button: any) => button.addEventListener("click", () => contextAction(button.dataset.context, object)));
  }
  function hideContextMenu(): void { $("#context-menu")?.classList.remove("open"); document.body.classList.remove("menu-open"); }
  function contextAction(action: string | undefined, object?: CanvasObject | null): void {
    hideContextMenu();
    if (object && action?.startsWith("layer-")) return changeObjectLayer(object, action as LayerAction);
    if (action === "image") { void promptAddImage(contextPoint); return; }
    if (action === "folder" || action === "artboard" || action === "todo" || action === "richText" || action === "pin") return addObject(action, contextPoint);
    if (action === "note" || action === "link") return;
    if (action === "fit") return fitCanvas();
    if (action === "invite") { void copyInviteLink(); return; }
    if (action === "language") { setLanguage(lang === "zh" ? "en" : "zh"); return renderCanvas(); }
    if (!object) return;
    if (action === "add-card-pin") return addCardPin(object);
    if (action === "open") return object.kind === "folder" ? openFolder(object) : openPanel(object);
    if (action === "delete") {
      snapshotState();
      if (object.kind === "folder") objects.forEach(child => { if (child.folderId === object.id) child.folderId = undefined; });
      const removedEdges = edges.filter((e) => e.fromId === object.id || e.toId === object.id).map((e) => e.id);
      objects = objects.filter(o => o.id !== object.id);
      edges = edges.filter((e) => e.fromId !== object.id && e.toId !== object.id);
      trashItems.push({...object, folderId: undefined}); saveTrash();
      selected = null; selectedIds = new Set(); selectedEdgeId = null;
      saveObjects(); renderObjects();
      sendUpdate([], [object.id], [], removedEdges);
      return toast(t("movedTrash"));
    }
    if (action === "duplicate") { snapshotState(); const clone = { ...structuredClone(wireObject(object)), id: uid(), x: object.x + 28, y: object.y + 28 }; objects.push(clone); selected = clone.id; saveObjects(); renderObjects(); sendUpdate([clone]); return toast(t("duplicated")); }
    if (action === "edit") {
      selected = object.id;
      if (object.kind === "image") return openImageEditSheet(object);
      if (object.kind === "link") return openLinkEditSheet(object);
      if (object.kind === "folder") return openFolderEditSheet(object);
      if (object.kind === "richText") { openPanel(object); (document.querySelector("#panel-viewer .rich-editor") as HTMLElement | null)?.focus(); return; }
      if (object.kind === "todo") { (document.querySelector(`[data-id="${object.id}"] [data-todo-title]`) as HTMLInputElement | null)?.focus(); return; }
      setTimeout(() => (document.querySelector(`[data-id="${object.id}"] textarea,[data-id="${object.id}"] .rich-editor`) as HTMLElement | null)?.focus(), 0);
    }
  }

  function closeSpatialModal(): void {
    const root = document.querySelector(".spatial-modal-root");
    if (!root) return;
    root.classList.remove("open");
    document.body.classList.remove("spatial-modal-open");
    window.setTimeout(() => { if (!root.classList.contains("open")) root.remove(); }, 200);
  }
  function ensureSpatialModalRoot(): HTMLElement {
    let root = document.querySelector(".spatial-modal-root") as HTMLElement | null;
    if (!root) {
      root = document.createElement("div");
      root.className = "spatial-modal-root";
      root.innerHTML = `<div class="spatial-modal-backdrop" data-modal-dismiss></div><div class="spatial-modal" role="dialog" aria-modal="true"></div>`;
      document.body.appendChild(root);
      root.querySelector("[data-modal-dismiss]")?.addEventListener("click", () => closeSpatialModal());
    }
    return root;
  }
  function openSpatialSheet(panelClass: string, title: string, bodyHtml: string): HTMLElement {
    const root = ensureSpatialModalRoot();
    const panel = root.querySelector(".spatial-modal") as HTMLElement;
    panel.className = `spatial-modal ${panelClass}`;
    panel.innerHTML = `<header class="spatial-modal-header"><h2>${escapeHtml(title)}</h2><button type="button" class="spatial-modal-close" data-modal-dismiss aria-label="${t("close")}">×</button></header>${bodyHtml}`;
    root.classList.add("open");
    document.body.classList.add("spatial-modal-open");
    panel.querySelectorAll("[data-modal-dismiss]").forEach((el) => el.addEventListener("click", () => closeSpatialModal()));
    return panel;
  }
  function openImageEditSheet(object: CanvasObject): void {
    const caption0 = object.caption || t("newVisual");
    const panel = openSpatialSheet("image-edit-sheet", t("editImageTitle"),
      `<div class="image-edit-preview"><img class="image-edit-preview-img" src="${escapeHtml(object.src || "")}" alt="${escapeHtml(caption0)}" draggable="false"><div class="image-edit-caption-live">${escapeHtml(caption0)}</div></div>
      <div class="spatial-dropzone" tabindex="0" role="button" aria-label="${t("replaceImage")}"><strong>${escapeHtml(t("replaceImage"))}</strong><span>${escapeHtml(t("dropReplaceHint"))}</span>
      <button type="button" class="spatial-btn ghost spatial-dropzone-btn" data-replace-image>${icon("image")} ${escapeHtml(t("chooseImage"))}</button>
      <input type="file" accept="image/*" class="spatial-file-input" hidden></div>
      <label class="spatial-field">${escapeHtml(t("captionLabel"))}<input class="spatial-input" type="text" value="${escapeHtml(caption0)}" maxlength="120" autocomplete="off" data-caption-input></label>
      <div class="spatial-actions"><button type="button" class="spatial-btn ghost" data-modal-dismiss>${escapeHtml(t("cancel"))}</button>
      <button type="button" class="spatial-btn primary" data-apply-image>${escapeHtml(t("apply"))}</button></div>`);
    let pendingFile: File | null = null;
    let previewUrl = object.src || "";
    const img = panel.querySelector(".image-edit-preview-img") as HTMLImageElement;
    const live = panel.querySelector(".image-edit-caption-live") as HTMLElement;
    const captionInput = panel.querySelector("[data-caption-input]") as HTMLInputElement;
    const fileInput = panel.querySelector(".spatial-file-input") as HTMLInputElement;
    const dropzone = panel.querySelector(".spatial-dropzone") as HTMLElement;
    const syncLive = () => { live.textContent = captionInput.value.trim() || t("newVisual"); };
    captionInput.addEventListener("input", syncLive);
    window.setTimeout(() => { captionInput.focus(); captionInput.select(); }, 30);
    const adoptFile = (file: File | null) => {
      if (!file) return;
      if (!(file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name))) {
        toast(lang === "zh" ? "请选择图片文件" : "Please choose image files"); return;
      }
      pendingFile = file;
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file); img.src = previewUrl;
      if (!captionInput.value.trim() || captionInput.value === (object.caption || t("newVisual"))) {
        captionInput.value = (file.name || t("newVisual")).replace(/\.[^.]+$/, "") || t("newVisual"); syncLive();
      }
    };
    panel.querySelector("[data-replace-image]")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener("change", () => adoptFile(fileInput.files?.[0] || null));
    const onDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add("is-dragover"); };
    dropzone.addEventListener("dragenter", onDrag); dropzone.addEventListener("dragover", onDrag);
    dropzone.addEventListener("dragleave", (e: DragEvent) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); });
    dropzone.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); dropzone.classList.remove("is-dragover");
      const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name));
      adoptFile(file || null);
    });
    panel.querySelector("[data-apply-image]")?.addEventListener("click", async () => {
      const btn = panel.querySelector("[data-apply-image]") as HTMLButtonElement; btn.disabled = true;
      try {
        snapshotState();
        object.caption = captionInput.value.trim() || t("newVisual");
        if (pendingFile) {
          const previewUrl = URL.createObjectURL(pendingFile);
          try {
            const dims = await measureImage(previewUrl);
            const size = fitImageSize(dims.width, dims.height);
            object.width = size.width; object.height = size.height;
          } catch (_) {}
          object.src = previewUrl;
          (object as any)._pendingFile = pendingFile;
          object.uploading = true;
          object.uploadProgress = 4;
          object.uploadError = undefined;
          saveObjects(); renderObjects();
          closeSpatialModal();
          toast(t("uploading"));
          await finalizeImageUpload(object, pendingFile, previewUrl);
          if (openPanelId === object.id) openPanel(object);
          toast(t("imageUpdated"));
          return;
        }
        saveObjects(); renderObjects(); sendUpdate([object]);
        if (openPanelId === object.id) openPanel(object);
        closeSpatialModal(); toast(t("imageUpdated"));
      } catch (error) {
        toast((error as Error).message || (lang === "zh" ? "更新失败" : "Update failed"));
        btn.disabled = false;
      }
    });
  }
  function openLinkEditSheet(object: CanvasObject): void {
    const panel = openSpatialSheet("link-edit-sheet", t("editLinkTitle"),
      `<label class="spatial-field">${escapeHtml(t("linkTitleLabel"))}<input class="spatial-input" type="text" value="${escapeHtml(object.title || t("savedLink"))}" autocomplete="off" data-edit-link-title></label>
      <label class="spatial-field">${escapeHtml(t("linkUrlLabel"))}<input class="spatial-input" type="text" inputmode="url" value="${escapeHtml(object.url || "")}" placeholder="https://example.com" autocomplete="off" data-edit-link-url></label>
      <label class="spatial-field">${escapeHtml(t("linkDescLabel"))}<input class="spatial-input" type="text" value="${escapeHtml(object.description || "")}" autocomplete="off" data-edit-link-desc></label>
      <div class="spatial-actions"><button type="button" class="spatial-btn ghost" data-modal-dismiss>${escapeHtml(t("cancel"))}</button>
      <button type="button" class="spatial-btn primary" data-apply-link>${escapeHtml(t("apply"))}</button></div>`);
    const titleInput = panel.querySelector("[data-edit-link-title]") as HTMLInputElement;
    const urlInput = panel.querySelector("[data-edit-link-url]") as HTMLInputElement;
    const descInput = panel.querySelector("[data-edit-link-desc]") as HTMLInputElement;
    window.setTimeout(() => { urlInput.focus(); urlInput.select(); }, 30);
    const apply = () => {
      snapshotState();
      object.title = titleInput.value.trim() || t("savedLink");
      object.url = (urlInput.value.trim() || object.url || "https://example.com").replace(/\s+/g, "");
      object.description = descInput.value.trim() || `${object.url} · ${t("reference")}`;
      saveObjects(); renderObjects(); sendUpdate([object]);
      closeSpatialModal();
      if (openPanelId === object.id) openPanel(object);
      toast(t("linkUpdated"));
    };
    panel.querySelector("[data-apply-link]")?.addEventListener("click", apply);
    panel.querySelectorAll("input").forEach((input) => {
      input.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
    });
  }
  function openFolderEditSheet(object: CanvasObject): void {
    const panel = openSpatialSheet("folder-edit-sheet", t("editFolderTitle"),
      `<label class="spatial-field">${escapeHtml(t("folderTitleLabel"))}<input class="spatial-input" type="text" value="${escapeHtml(object.title || t("folder"))}" autocomplete="off" data-folder-title></label>
      <div class="spatial-actions"><button type="button" class="spatial-btn ghost" data-modal-dismiss>${escapeHtml(t("cancel"))}</button>
      <button type="button" class="spatial-btn primary" data-apply-folder>${escapeHtml(t("apply"))}</button></div>`);
    const titleInput = panel.querySelector("[data-folder-title]") as HTMLInputElement;
    window.setTimeout(() => { titleInput.focus(); titleInput.select(); }, 30);
    panel.querySelector("[data-apply-folder]")?.addEventListener("click", () => {
      snapshotState();
      object.title = titleInput.value.trim() || t("folder");
      saveObjects(); renderObjects(); sendUpdate([object]);
      closeSpatialModal(); toast(t("folderUpdated"));
    });
  }


  function renderPresence(): void { const stack = $("#presence-stack"); if (!stack) return; const people = [...remote, { name: me.name, color: me.color }]; stack.innerHTML = people.slice(0, 5).map(p => `<span class="presence-avatar" style="background:${p.color}">${escapeHtml((p.name || "?").slice(0,1).toUpperCase())}</span>`).join(""); const label = $("#online-label"); if (label) label.textContent = people.length === 1 ? t("onePerson") : `${people.length} ${t("people")}`; }
  function renderRemotes(): void {
    const layer = $("#remote-layer");
    if (!layer) return;
    const now = Date.now();
    const visible = remote.filter(r => r.cursor && (!r.updatedAt || now - r.updatedAt < 10000));
    layer.innerHTML = visible.map(r => {
      const p = r.cursor || { x: 0, y: 0 };
      const left = view.x + p.x * view.scale;
      const top = view.y + p.y * view.scale;
      const selectedObject = r.selection && objects.find(o => o.id === r.selection);
      const selection = selectedObject
        ? `<span class="remote-selection" style="left:${view.x + selectedObject.x * view.scale - left}px;top:${view.y + selectedObject.y * view.scale - top}px;width:${selectedObject.width * view.scale}px;height:${selectedObject.height * view.scale}px;border-color:${r.color}"></span>`
        : "";
      const pointer = `<svg class="cursor-pointer" width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M1 1v16.5l4.2-4.1 2.6 6.3 2.3-.9-2.6-6.3H15Z" fill="${r.color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
      return `<div class="remote-cursor" style="left:${left}px;top:${top}px">${pointer}<span class="cursor-label" style="background:${r.color}">${escapeHtml(r.name)}</span>${selection}</div>`;
    }).join("");
  }

  function iceServers(): RTCIceServer[] {
    const stun: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    try {
      const custom = (window as any).__SPATIAL_ICE_SERVERS__;
      if (Array.isArray(custom) && custom.length) return custom as RTCIceServer[];
      const turnUrl = localStorage.getItem("spatial:turn-url");
      const turnUser = localStorage.getItem("spatial:turn-username") || "";
      const turnCred = localStorage.getItem("spatial:turn-credential") || "";
      if (turnUrl) {
        stun.push({ urls: turnUrl, username: turnUser || undefined, credential: turnCred || undefined });
      }
    } catch (_) {}
    return stun;
  }
  function updateP2pStatus(): void {
    const open = [...peers.values()].some((p) => p.dc && p.dc.readyState === "open");
    p2pMode = open ? "direct" : (remote.length ? "relay" : "solo");
    const el = $("#p2p-label");
    const sep = $("#p2p-sep");
    if (!el) return;
    if (p2pMode === "direct") el.textContent = t("p2pDirect");
    else if (p2pMode === "relay") el.textContent = t("p2pRelay");
    else el.textContent = "";
    if (sep) sep.hidden = !el.textContent;
  }
  function teardownPeer(sessionId: string): void {
    const link = peers.get(sessionId);
    if (!link) return;
    try { link.dc?.close(); } catch (_) {}
    try { link.pc.close(); } catch (_) {}
    peers.delete(sessionId);
    updateP2pStatus();
  }
  function teardownAllPeers(): void {
    for (const id of [...peers.keys()]) teardownPeer(id);
  }
  function sendSignal(toSessionId: string, payload: { kind: string; sdp?: string; candidate?: unknown }): void {
    send({ type: "signal", roomId, fromSessionId: me.id, toSessionId, payload });
  }
  function attachDataChannel(sessionId: string, link: PeerLink, dc: RTCDataChannel): void {
    link.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => updateP2pStatus();
    dc.onclose = () => updateP2pStatus();
    dc.onerror = () => updateP2pStatus();
    dc.onmessage = (ev: MessageEvent) => {
      try {
        const m = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (!m || typeof m !== "object") return;
        handleCollabMessage(m, true);
      } catch (_) {}
    };
  }
  function ensurePeer(sessionId: string): PeerLink | null {
    if (!sessionId || sessionId === me.id) return null;
    let link = peers.get(sessionId);
    if (link) return link;
    const polite = me.id > sessionId;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    link = { pc, dc: null, polite, makingOffer: false, ignoreOffer: false };
    peers.set(sessionId, link);
    pc.onicecandidate = (ev) => {
      sendSignal(sessionId, { kind: "ice", candidate: ev.candidate ? ev.candidate.toJSON() : null });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        // keep channel if temporarily disconnected; teardown on closed/failed
        if (pc.connectionState === "failed" || pc.connectionState === "closed") teardownPeer(sessionId);
      }
      updateP2pStatus();
    };
    pc.ondatachannel = (ev) => attachDataChannel(sessionId, link!, ev.channel);
    // Lower sessionId always initiates the offer to avoid glare.
    if (me.id < sessionId) {
      const dc = pc.createDataChannel("collab", { ordered: true });
      attachDataChannel(sessionId, link, dc);
      void (async () => {
        try {
          link!.makingOffer = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(sessionId, { kind: "offer", sdp: pc.localDescription!.sdp });
        } catch (_) {
          teardownPeer(sessionId);
        } finally {
          if (link) link.makingOffer = false;
        }
      })();
    }
    return link;
  }
  async function handleSignal(msg: any): Promise<void> {
    const from = String(msg.fromSessionId || "");
    if (!from || from === me.id) return;
    const payload = msg.payload || {};
    const link = ensurePeer(from);
    if (!link) return;
    const { pc } = link;
    try {
      if (payload.kind === "offer") {
        const offerCollision = link.makingOffer || pc.signalingState !== "stable";
        link.ignoreOffer = !link.polite && offerCollision;
        if (link.ignoreOffer) return;
        await pc.setRemoteDescription({ type: "offer", sdp: String(payload.sdp || "") });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { kind: "answer", sdp: pc.localDescription!.sdp });
      } else if (payload.kind === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: String(payload.sdp || "") });
      } else if (payload.kind === "ice") {
        try {
          await pc.addIceCandidate(payload.candidate || null);
        } catch (_) {
          if (!link.ignoreOffer) { /* ignore */ }
        }
      }
    } catch (_) {
      teardownPeer(from);
    }
  }
  function fanoutP2p(msg: unknown): number {
    let n = 0;
    const raw = JSON.stringify(msg);
    for (const link of peers.values()) {
      if (link.dc && link.dc.readyState === "open") {
        try { link.dc.send(raw); n++; } catch (_) {}
      }
    }
    return n;
  }
  function handleCollabMessage(m: any, fromP2p = false): void {
    if (m.type === "joined") {
      if (m.sessionId) me.id = m.sessionId;
      // Always prefer server snapshot for /space/{uuid}. Never let stale localStorage
      // seed overwrite a shared room (was causing different workspaces per computer).
      const incoming = m.state?.objects || {};
      const serverHasDoc = Object.keys(incoming).length > 0 || (Array.isArray(m.state?.edges) && m.state.edges.length > 0) || Number(m.state?.clock || 0) > 0;
      if (hasServerSnapshot) {
        applyRemoteObjects(Object.values(incoming));
      } else if (serverHasDoc || Object.keys(incoming).length) {
        objects = Object.values(incoming);
      } else if (objects.length) {
        // Server truly empty (new room) — upload local draft once.
        sendUpdate(objects);
      }
      if (Array.isArray(m.state?.edges)) edges = m.state.edges;
      else if (!serverHasDoc && edges.length) sendUpdate([], [], edges, []);
      remote = (m.participants || []).map((p: any) => ({ id: p.sessionId, name: p.nickname, color: p.color, cursor: p.cursor, selection: p.selection?.objectId, updatedAt: Date.now() }));
      const peerIds: string[] = Array.isArray(m.peerSessionIds)
        ? m.peerSessionIds
        : (m.participants || []).map((p: any) => p.sessionId).filter(Boolean);
      for (const id of peerIds) ensurePeer(id);
      if (!hasServerSnapshot) renderObjects();
      hasServerSnapshot = true;
      saveObjects(); renderPresence(); renderRemotes(); updateP2pStatus();
      return;
    }
    if (m.type === "signal") { void handleSignal(m); return; }
    if (m.type === "presence" || m.type === "awareness") {
      if (m.state?.sessionId === me.id) return;
      const ix = remote.findIndex(r => r.id === m.state.sessionId);
      const state = { id: m.state.sessionId, name: m.state.nickname, color: m.state.color, cursor: m.state.cursor, selection: m.state.selection?.objectId, updatedAt: Date.now() };
      if (m.action === "leave") {
        remote = remote.filter(r => r.id !== state.id);
        teardownPeer(state.id);
      } else if (ix >= 0) remote[ix] = { ...remote[ix], ...state };
      else {
        remote.push(state);
        if (m.action === "join") ensurePeer(state.id);
      }
      renderPresence(); renderRemotes(); updateP2pStatus();
      return;
    }
    if (m.type === "y-update") {
      const nestedDeleted = m.update?.deletedObjects;
      const deleted = (m.deletedObjects && m.deletedObjects.length) ? m.deletedObjects
        : (nestedDeleted && nestedDeleted.length) ? nestedDeleted : (m.deletedObjects || nestedDeleted || []);
      const delta = !!fromP2p || !!m.live || !!(deleted && deleted.length);
      if (Array.isArray(m.objects)) applyRemoteObjects(m.objects, deleted, { delta });
      else if (m.update?.objects) {
        const objs = Array.isArray(m.update.objects) ? m.update.objects : Object.values(m.update.objects);
        applyRemoteObjects(objs as CanvasObject[], deleted, { delta: delta || !!(deleted && deleted.length) });
      } else if (deleted?.length) applyRemoteObjects([], deleted, { delta: true });
      applyRemoteEdges(
        Array.isArray(m.edges) ? m.edges : (Array.isArray(m.update?.edges) ? m.update.edges : undefined),
        Array.isArray(m.deletedEdges) ? m.deletedEdges : (Array.isArray(m.update?.deletedEdges) ? m.update.deletedEdges : []),
        { replaceAll: Array.isArray(m.edges) && !fromP2p && !m.live },
      );
    }
  }
  function locallyDraggingIds(): Set<string> {
    const ids = new Set<string>();
    if (pinDrag) ids.add(pinDrag.object.id);
    if (drag?.card) ids.add(drag.card.id);
    if (drag?.resize) ids.add(drag.resize.id);
    if (drag?.group && drag.items) drag.items.forEach(item => ids.add(item.object.id));
    return ids;
  }
  function syncOpenPanel(o: CanvasObject): void {
    if (openPanelId !== o.id) return;
    const viewer = $("#panel-viewer") as HTMLElement | null;
    if (!viewer?.classList.contains("open")) return;
    const title = o.title || o.caption || kindLabel(o.kind);
    const h1 = viewer.querySelector(".panel-meta h1");
    if (h1) h1.textContent = title;
    if (o.kind === "artboard") {
      (viewer.querySelector(".drawing-canvas") as any)?.repaintDrawing?.();
      const meta = viewer.querySelector(".panel-meta span");
      if (meta) meta.textContent = `${t("artboard")} · ${o.strokes?.length || 0}`;
      return;
    }
    if (o.kind === "note") {
      const article = viewer.querySelector(".panel-note");
      if (article) article.innerHTML = escapeHtml(o.text || "").replace(/\n/g, "<br>");
      return;
    }
    if (o.kind === "richText") {
      syncRichEditor(o, viewer);
      return;
    }
    if (o.kind === "image") {
      const img = viewer.querySelector(".lightbox-img") as HTMLImageElement | null;
      if (img && o.src && img.getAttribute("src") !== o.src) {
        img.src = o.src;
        img.alt = o.caption || title;
      }
      return;
    }
    if (o.kind === "link") {
      const href = normalizeUrl(o.url);
      const urlEl = viewer.querySelector("[data-link-url]");
      if (urlEl) urlEl.textContent = href || (o.url || "");
      const frame = viewer.querySelector(".link-embed-frame") as HTMLIFrameElement | null;
      if (frame && href && frame.getAttribute("src") !== href) {
        const fallback = viewer.querySelector(".link-embed-fallback") as HTMLElement | null;
        const loading = viewer.querySelector(".link-embed-loading") as HTMLElement | null;
        if (fallback) fallback.hidden = true;
        if (loading) loading.hidden = false;
        frame.src = href;
      }
      const h1 = viewer.querySelector(".panel-meta h1");
      if (h1) h1.textContent = o.title || t("savedLink");
      return;
    }
    if (o.kind === "folder") {
      const strong = viewer.querySelector(".panel-folder strong");
      if (strong) strong.textContent = o.title || t("folder");
      const small = viewer.querySelector(".panel-folder small");
      if (small) small.textContent = `${objects.filter(child => child.folderId === o.id).length} ${t("items")}`;
    }
  }
  function syncObjectDom(o: CanvasObject, skipIds?: Set<string>): void {
    if (skipIds?.has(o.id)) {
      if (o.kind === "todo") { const card = document.querySelector<HTMLElement>(`[data-id="${o.id}"]`); if (card) patchTodoCard(o, card); }
      return;
    }
    const el = document.querySelector(`[data-id="${o.id}"]`) as HTMLElement | null;
    if (!el) return;
    syncCardPins(o, el);
    el.style.left = `${o.x}px`;
    el.style.top = `${o.y}px`;
    el.style.width = `${o.width}px`;
    el.style.height = `${o.height}px`;
    const editingThis = getActiveEditingId() === o.id;
    if (o.kind === "note") {
      if (o.color) el.style.background = o.color;
      const ta = el.querySelector("textarea.note-editor") as HTMLTextAreaElement | null;
      if (ta && !editingThis && ta.value !== (o.text || "")) ta.value = o.text || "";
    } else if (o.kind === "richText") {
      const docTitle = el.querySelector(".image-caption-text");
      if (docTitle) docTitle.textContent = o.title || t("newDocument");
      const rich = el.querySelector(".rich-preview") as HTMLElement | null;
      const nextHtml = richHtml(o);
      if (rich && rich.innerHTML !== nextHtml) rich.innerHTML = nextHtml;
    } else if (o.kind === "image") {
      const img = el.querySelector(":scope > img") as HTMLImageElement | null;
      if (img && o.src && img.getAttribute("src") !== o.src) img.src = o.src;
      if (img) img.alt = o.caption || t("newVisual");
      const capText = el.querySelector(".image-caption-text");
      if (capText) capText.textContent = o.caption || t("newVisual");
      else {
        const cap = el.querySelector(".image-caption");
        if (cap) cap.innerHTML = `<span class="image-caption-text">${escapeHtml(o.caption || t("newVisual"))}</span>`;
      }
      el.classList.toggle("is-uploading", !!o.uploading);
      el.classList.toggle("is-upload-error", !!o.uploadError);
      const bar = el.querySelector(".upload-progress-bar") as HTMLElement | null;
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, o.uploadProgress || 0))}%`;
      const overlay = el.querySelector(".upload-overlay") as HTMLElement | null;
      if (overlay) overlay.hidden = !o.uploading && !o.uploadError;
      const label = el.querySelector(".upload-label") as HTMLElement | null;
      if (label) label.textContent = o.uploadError ? t("uploadFailed") : t("uploading");
    } else if (o.kind === "link") {
      const b = el.querySelector(".link-copy b");
      const span = el.querySelector(".link-copy span");
      const urlEl = el.querySelector(".link-url");
      if (b) b.textContent = o.title || t("savedLink");
      if (span) span.textContent = o.description || o.url || "";
      if (urlEl) urlEl.textContent = o.url || "";
    } else if (o.kind === "folder") {
      const name = el.querySelector(".folder-name");
      if (name) name.textContent = o.title || t("folder");
      const count = el.querySelector(".folder-count");
      if (count) count.textContent = `${objects.filter(child => child.folderId === o.id).length} ${t("items") || ""}`;
      const preview = el.querySelector(".folder-preview");
      if (preview) {
        const children = objects.filter(child => child.folderId === o.id).slice(0, 3);
        preview.innerHTML = children.map((child, index, list) => `<div class="folder-sleeve" style="--i:${index};--offset:${index - (list.length - 1) / 2}">${folderCardThumb(child)}</div>`).join("");
        el.classList.toggle("has-contents", children.length > 0); el.classList.toggle("is-empty", children.length === 0);
      }
    } else if (o.kind === "artboard") {
      const name = el.querySelector(".artboard-name");
      if (name) name.textContent = o.title || t("artboard");
      const count = el.querySelector(".artboard-count");
      if (count) count.textContent = String(o.strokes?.length || 0);
      scheduleArtboardThumbnail(o);
    } else if (o.kind === "todo") {
      patchTodoCard(o, el);
    }
    syncOpenPanel(o);
  }
  function scheduleLiveMoveBroadcast(): void {
    const emit = () => {
      lastLiveMoveAt = Date.now();
      liveMoveTimer = null;
      const changed = pinDrag ? [pinDrag.object] : drag?.group
        ? (drag.items || []).map(item => item.object)
        : drag?.card
          ? [drag.card]
          : drag?.resize
            ? [drag.resize]
            : [];
      if (!changed.length) return;
      renderEdges();
      sendLiveUpdate(changed);
    };
    const wait = 40 - (Date.now() - lastLiveMoveAt);
    if (wait <= 0) emit();
    else if (!liveMoveTimer) liveMoveTimer = setTimeout(emit, wait);
  }

  function updateConnectionBanner(): void {
    let banner = document.getElementById("connection-banner");
    if (!banner) { banner = document.createElement("div"); banner.id = "connection-banner"; banner.setAttribute("role", "status"); document.body.appendChild(banner); }
    banner.hidden = !joined || collaborationReady;
    banner.textContent = lang === "zh" ? "连接中断，正在自动重连…恢复前暂停编辑，当前草稿保留。" : "Reconnecting… Editing is paused; your draft is preserved.";
  }
  function scheduleReconnect(): void {
    if (leavingPage || !joined || reconnectTimer) return;
    updateConnectionBanner();
    const delay = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt++, 4));
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }
  function connect(onJoined?: () => void, onJoinFailed?: () => void): void {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fail = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      onJoinFailed?.();
    };
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const previous = socket; socket = null; previous?.close();
    collaborationReady = false;
    try {
      teardownAllPeers();
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const endpoint = websocketUrl || proto + "://" + location.host + "/ws?room=" + encodeURIComponent(roomId) + "&nickname=" + encodeURIComponent(me.name) + "&color=" + encodeURIComponent(me.color);
      const connection = new WebSocket(endpoint.startsWith("ws") ? endpoint : proto + "://" + location.host + endpoint);
      socket = connection;
      timer = setTimeout(() => { fail(); connection.close(); }, 10000);
      connection.onmessage = (e: MessageEvent) => {
        if (socket !== connection || (settled && onJoinFailed && !joined)) return;
        try {
          const message = JSON.parse(String(e.data));
          if (message.type === "joined") {
            settled = true;
            if (timer) clearTimeout(timer);
            collaborationReady = true; reconnectAttempt = 0;
            handleCollabMessage(message, false);
            for (const object of objects) if (object.kind === "richText") flushRichDraft(object);
            onJoined?.(); updateConnectionBanner();
          } else handleCollabMessage(message, false);
        } catch (error) { console.error("Collaboration update failed", error); }
      };
      connection.onclose = () => {
        if (socket !== connection) return;
        if (timer) clearTimeout(timer);
        collaborationReady = false;
        richPending.clear(); richTitlePending.clear();
        if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
        drag = null; pendingCardTap = null; connDrag = null; pinDrag = null; hideFolderExit();
        document.body.classList.remove("connecting"); renderEdges();
        teardownAllPeers();
        fail();
        if (joined) scheduleReconnect();
      };
      connection.onerror = () => { connection.close(); };
    } catch (_) { fail(); if (joined) scheduleReconnect(); }
  }
  function send(msg: unknown): void { if (socket?.readyState === 1) socket.send(JSON.stringify(msg)); }
  function wireObject(o: CanvasObject): CanvasObject {
    const copy = { ...o } as any;
    delete copy.uploading;
    delete copy.uploadProgress;
    delete copy.uploadError;
    delete copy._pendingFile;
    return copy as CanvasObject;
  }
  /** Live move/resize: prefer P2P; fall back to WS when no data channel is open. */
  function sendLiveUpdate(changedObjects: CanvasObject[]): void {
    const list = changedObjects.filter(Boolean);
    if (!list.length) return;
    const msg = { type: "y-update", roomId, objects: list.map(wireObject), deletedObjects: [] as string[], live: true };
    const n = fanoutP2p(msg);
    if (!n) send(msg);
  }
  function sendUpdate(changedObjects: CanvasObject[] | CanvasObject = [], deletedObjects: string[] = [], changedEdges: Edge[] = [], deletedEdges: string[] = []): void {
    const list = Array.isArray(changedObjects) ? changedObjects : (changedObjects ? [changedObjects] : []);
    const deleted = Array.isArray(deletedObjects) ? deletedObjects : [];
    const edgeList = Array.isArray(changedEdges) ? changedEdges : [];
    const edgeDeleted = Array.isArray(deletedEdges) ? deletedEdges : [];
    if (!list.length && !deleted.length && !edgeList.length && !edgeDeleted.length) return;
    // Delta-only: never re-broadcast untouched local objects, or concurrent
    // edits to other cards get clobbered by stale copies (last-writer-wins full sync).
    const msg = { type: "y-update", roomId, objects: list.map(wireObject), deletedObjects: deleted, edges: edgeList, deletedEdges: edgeDeleted };
    // Relation changes are canonicalized by the server; late P2P copies must not undo that decision.
    if (list.length || deleted.length) fanoutP2p({ ...msg, edges: [], deletedEdges: [] });
    send(msg);
  }
  function toast(message: string): void { const el = document.createElement("div"); el.className = "toast"; el.textContent = message; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }

  window.addEventListener('keydown', e => { if (e.key === 'Alt') document.body.classList.add('mouse-alt-drag'); });
  window.addEventListener('keyup', e => { if (e.key === 'Alt') document.body.classList.remove('mouse-alt-drag'); });
  window.addEventListener('blur', () => document.body.classList.remove('mouse-alt-drag'));
  window.addEventListener("beforeunload", () => {
    (document.activeElement as HTMLElement | null)?.matches("#panel-viewer.is-rich .doc-title") && (document.activeElement as HTMLElement).blur();
    for (const object of objects) if (object.kind === "richText") flushRichDraft(object);
    leavingPage = true; if (reconnectTimer) clearTimeout(reconnectTimer); try { send({ type: "leave" }); } catch (_) {} teardownAllPeers(); });
  window.addEventListener("online", () => { if (joined && !collaborationReady) connect(); });
  setInterval(renderRemotes, 1000);
  if (!restoreRoomSession()) renderJoin();
})();
