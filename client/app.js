/* Spatial collaborative canvas - dependency-free client fallback. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  // Shared rounded icon library: 24px grid, 1.8px stroke, round caps and joins.
  const iconPaths = {
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
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    link:'<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
    settings:'<path d="M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    bookmark:'<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4Z"/>', chevron:'<path d="m6 14 6-6 6 6"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', fit:'<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>', open:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>'
  };
  const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.note}</svg>`;
  const uid = () => Math.random().toString(36).slice(2, 8);
  const palette = ["#5979ee", "#d85d93", "#e6934d", "#3cae91", "#a66be0"];
  const params = new URLSearchParams(location.search);
  let roomId = params.get("room") || "aurora-studio";
  let roomName = params.get("name") || "Aurora Studio";
  let lang = params.get("lang") === "en" ? "en" : (localStorage.getItem("spatial:lang") || "zh");
  const translations = {
      zh: {
      joinEyebrow: "让想法拥有自己的空间", joinTitle: "一起创造\n下一件作品。", joinDescription: "在一张安静、无限的画布上，共同收集、整理和推进想法。", joinFoot: "为小团队与大问题而生", joinHeading: "加入空间", invited: "你受邀协作于", name: "你的昵称", namePlaceholder: "例如：小明", password: "房间密码", optional: "可选", passwordPlaceholder: "输入密码", enter: "进入空间", syncNote: "你的修改会与空间中的每个人实时同步。", canvasHint: "右键画布创建内容 · 滚轮缩放 · 空格拖动画布", createHere: "在这里创建", edit: "编辑内容", duplicate: "复制", delete: "删除", sticky: "便签", richText: "富文本", image: "图片", link: "链接", folder: "文件夹", trash: "回收站", restore: "恢复", emptyTrash: "清空回收站", artboard: "画板", items: "项", fit: "适配画布", invite: "复制邀请链接", language: "English", languageAction: "切换到 English", noteAdded: "已添加便签", documentAdded: "已添加文档", imageAdded: "已添加图片", linkAdded: "已添加链接", folderAdded: "已添加文件夹", artboardAdded: "已添加画板", copied: "邀请链接已复制", movedTrash: "已移入回收站", duplicated: "已复制", justNow: "刚刚", people: "人在线", onePerson: "1 人在线", newDocument: "新文档", writeTogether: "一起写点什么…", newVisual: "新视觉参考", newIdea: "一个新想法…", savedLink: "已保存链接", reference: "参考", imageCaptionPrompt: "输入图片说明", linkTitlePrompt: "输入链接标题", linkUrlPrompt: "输入链接地址", folderTitlePrompt: "输入文件夹名称", open: "打开面板", close: "关闭", back: "返回画布", moveIntoFolder: "已移入文件夹", folderEmpty: "文件夹为空", selectedCount: "已选择", selectionHint: "按住 Shift 拖动可框选多个面板", panelInfo: "面板信息", resolution: "分辨率", filename: "文件名", date: "日期", createdOn: "创建于", dropIntoFolder: "拖入文件夹", incorrectPassword: "房间密码不正确", richTextDefault: "<h2>新文档</h2><p>一起写点什么…</p>", richTextSeed: "<h2>项目简报</h2><p>在这里共同推进想法，让故事慢慢成形。</p><p><strong>今天：</strong>收集参考、梳理结构，并分享第一版。</p>"
    },
    en: {
      joinEyebrow: "A shared space for ideas", joinTitle: "Make room for\nwhat’s next.", joinDescription: "Gather, shape and move ideas together — in one calm, infinite canvas.", joinFoot: "Built for small teams with big questions", joinHeading: "Join a space", invited: "You’re invited to collaborate in", name: "Your name", namePlaceholder: "e.g. Sam", password: "Room password", optional: "optional", passwordPlaceholder: "Enter password", enter: "Enter space", syncNote: "Your changes sync live with everyone here.", canvasHint: "Right-click to create · Scroll to zoom · Space + drag to move", createHere: "Create in this space", edit: "Edit content", duplicate: "Duplicate", delete: "Delete", sticky: "Sticky note", richText: "Rich text", image: "Image", link: "Link", folder: "Folder", trash: "Trash", restore: "Restore", emptyTrash: "Empty trash", artboard: "Artboard", items: "items", fit: "Fit canvas", invite: "Copy invite link", language: "中文", languageAction: "Switch to 中文", noteAdded: "Sticky note added", documentAdded: "Document added", imageAdded: "Image added", linkAdded: "Link added", folderAdded: "Folder added", artboardAdded: "Artboard added", copied: "Invite link copied", movedTrash: "Moved to trash", duplicated: "Duplicated", justNow: "just now", people: "people here", onePerson: "1 person here", newDocument: "New document", writeTogether: "Write something together…", newVisual: "New visual reference", newIdea: "A new idea…", savedLink: "Saved link", reference: "Reference", imageCaptionPrompt: "Enter image caption", linkTitlePrompt: "Enter link title", linkUrlPrompt: "Enter link URL", folderTitlePrompt: "Enter folder name", open: "Open panel", close: "Close", back: "Back to canvas", moveIntoFolder: "Moved into folder", folderEmpty: "Folder is empty", selectedCount: "selected", selectionHint: "Hold Shift and drag to select multiple panels", panelInfo: "Panel info", resolution: "Resolution", filename: "Filename", date: "Date", createdOn: "Created on", dropIntoFolder: "Drop into folder", incorrectPassword: "Incorrect room password", richTextDefault: "<h2>New document</h2><p>Write something together…</p>", richTextSeed: "<h2>Project brief</h2><p>Build a calm, curious space where ideas can grow together.</p><p><strong>Today:</strong> gather references, shape the story, and share a first draft.</p>"
    }
  };
  const t = key => translations[lang]?.[key] ?? translations.zh[key] ?? key;
  function setLanguage(next) { lang = next === "en" ? "en" : "zh"; localStorage.setItem("spatial:lang", lang); document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; document.title = lang === "zh" ? "Spatial — 共享画布" : "Spatial — Shared canvas"; }
  setLanguage(lang);
  const me = { id: uid(), name: localStorage.getItem("spatial:nickname") || (lang === "zh" ? "访客" : "You"), color: palette[0] };
  let joined = false;
  let objects = [];
  let trashItems = [];
  let undoStack = [];
  let selected = null;
  let selectedIds = new Set();
  let lastCardTap = { id: null, time: 0 };
  let drag = null;
  let selectionDrag = null;
  let openPanelId = null;
  let openedFolderId = null;
  let view = { x: 0, y: 0, scale: 1 };
  let menuOpen = false;
  let socket = null;
  let websocketUrl = null;
  let lastAwarenessAt = 0;
  let awarenessTimer = null;
  let contextPoint = null;
  let remote = [
    { id: "alex", name: "Alex", color: "#d85d93", cursor: { x: 875, y: 330 }, selection: null },
    { id: "maya", name: "Maya", color: "#3cae91", cursor: { x: 420, y: 635 }, selection: "note-welcome" }
  ];
  const seed = () => [
    { id: "note-welcome", kind: "note", x: 180, y: 145, width: 258, height: 188, text: lang === "zh" ? "欢迎来到共享空间！\n\n把你的想法放在这里，所有人都能实时看到。" : "Welcome to our shared space!\n\nDrop your ideas here — everyone sees changes live.", color: "#fff2a8" },
    { id: "rich-brief", kind: "richText", x: 505, y: 100, width: 355, height: 270, title: lang === "zh" ? "项目简报" : "Project brief", content: t("richTextSeed") },
    { id: "link-figma", kind: "link", x: 945, y: 176, width: 290, height: 176, title: lang === "zh" ? "探索新的协作方式" : "Exploring new ways to work together", url: "figma.com/community", description: `figma.com  ·  ${t("reference")}` },
    { id: "image-sun", kind: "image", x: 250, y: 460, width: 310, height: 215, src: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=740&q=80", caption: lang === "zh" ? "灵感图 / 冬日光线" : "Moodboard / winter light" }
  ];

  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  function renderJoin() {
    app.innerHTML = `<main class="join-shell"><section class="join-visual"><div class="join-brand"><span class="brand-mark">✣</span><span>spatial</span></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="join-copy"><div class="eyebrow">${t("joinEyebrow")}</div><h1>${escapeHtml(t("joinTitle")).replace("\n", "<br>")}</h1><p>${t("joinDescription")}</p></div><div class="join-foot"><span class="tiny-dot"></span> ${t("joinFoot")}</div></section><section class="join-panel"><div class="join-card"><button class="language-toggle" id="language-toggle" type="button">🌐 ${t("language")}</button><div class="mini-logo">✣</div><h2>${t("joinHeading")}</h2><p class="sub">${t("invited")} <strong>${escapeHtml(roomName)}</strong>${lang === "zh" ? "。" : "."}</p><form id="join-form"><label>${t("name")}<input id="nickname" value="${escapeHtml(me.name === "You" || me.name === "访客" ? "" : me.name)}" placeholder="${t("namePlaceholder")}" autocomplete="off" required></label><label>${t("password")} <span class="optional">${t("optional")}</span><input id="password" type="password" placeholder="${t("passwordPlaceholder")}"></label><button class="primary" type="submit">${t("enter")} <span>↗</span></button></form><p class="join-note"><span>⌘</span> ${t("syncNote")}</p></div><div class="join-meta"><span>${lang === "zh" ? "Spatial 协作画布" : "Spatial collaborative canvas"}</span><span>${lang === "zh" ? "v0.1 原型" : "v0.1 prototype"}</span></div></section></main>`;
    $("#language-toggle").addEventListener("click", () => { setLanguage(lang === "zh" ? "en" : "zh"); renderJoin(); });
    $("#join-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      me.name = $("#nickname").value.trim() || (lang === "zh" ? "访客" : "Guest");
      const password = $("#password").value;
      localStorage.setItem("spatial:nickname", me.name);
      try {
        if (password || params.get("room")) {
          if (!params.get("room") && password) {
            const created = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: roomName, password }) });
            if (!created.ok) throw new Error(lang === "zh" ? "无法创建空间" : "Could not create room");
            const room = await created.json(); roomId = room.roomId;
            history.replaceState({}, "", `?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(roomName)}&lang=${lang}`);
          }
          const joinedRoom = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, nickname: me.name, color: me.color }) });
          if (!joinedRoom.ok) {
            if (joinedRoom.status !== 404 || password) throw new Error(t("incorrectPassword"));
          } else {
            const session = await joinedRoom.json(); websocketUrl = session.websocketUrl;
          }
        }
        joined = true; objects = loadObjects(); trashItems = loadTrash(); connect(); renderCanvas();
      } catch (error) { toast(error.message || (lang === "zh" ? "无法加入此空间" : "Could not join this space")); }
    });
  }

  function loadObjects() { try { const raw = localStorage.getItem("spatial:room:" + roomId); return raw ? JSON.parse(raw) : seed(); } catch (_) { return seed(); } }
  function saveObjects() { try { localStorage.setItem("spatial:room:" + roomId, JSON.stringify(objects)); } catch (_) {} }
  function loadTrash() { try { return JSON.parse(localStorage.getItem("spatial:trash:" + roomId) || "[]"); } catch (_) { return []; } }
  function saveTrash() { try { localStorage.setItem("spatial:trash:" + roomId, JSON.stringify(trashItems)); } catch (_) {} }
  function snapshotState() { undoStack.push({ objects: JSON.parse(JSON.stringify(objects)), trash: JSON.parse(JSON.stringify(trashItems)) }); if (undoStack.length > 30) undoStack.shift(); }
  function undoLast() { const previous = undoStack.pop(); if (!previous) return toast(lang === "zh" ? "没有可撤回的操作" : "Nothing to undo"); objects = previous.objects; trashItems = previous.trash; saveObjects(); saveTrash(); closePanel(); renderObjects(); toast(lang === "zh" ? "已撤回" : "Undone"); }
  function escapeHtml(s) { return String(s || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
  function visibleObjects() { return openedFolderId ? objects.filter(o => o.id === openedFolderId || o.folderId === openedFolderId) : objects.filter(o => !o.folderId); }
  function objectById(id) { return objects.find(o => o.id === id); }
  function clearCardSelection(except) { document.querySelectorAll(".canvas-card.selected,.canvas-card.multi-selected").forEach(node => { if (node !== except) node.classList.remove("selected", "multi-selected"); }); }
  function isCanvasTarget(target) { return target === $("#canvas-wrap") || target?.classList?.contains("canvas-grid") || target?.classList?.contains("canvas-world"); }
  function folderAtPoint(point, excluded = new Set()) { return visibleObjects().find(o => o.kind === "folder" && !excluded.has(o.id) && point.x >= o.x && point.x <= o.x + o.width && point.y >= o.y && point.y <= o.y + o.height); }

  function renderCanvas() {
    app.innerHTML = `<main class="workspace"><header class="topbar"><div class="brand"><span class="brand-mark">✣</span><span>spatial</span></div><div class="crumb"><span class="crumb-dot"></span><span>${escapeHtml(roomName)}</span><span class="chevron">⌄</span></div><div class="top-actions"><div class="presence-stack" id="presence-stack"></div><button class="icon-btn invite" id="invite-btn"><span>♧</span> ${t("invite")}</button><button class="avatar-btn" title="${lang === "zh" ? "你的个人资料" : "Your profile"}">${escapeHtml(me.name.slice(0,1).toUpperCase())}</button></div></header><div class="canvas-wrap" id="canvas-wrap"><div class="canvas-grid" id="canvas-grid"><div class="canvas-world" id="canvas-world"></div></div><div class="remote-layer" id="remote-layer"></div><div class="selection-box" id="selection-box"></div><div class="folder-breadcrumb" id="folder-breadcrumb"></div><div class="canvas-hint">${t("canvasHint")}</div></div><button class="ambient-search" aria-label="${lang === 'zh' ? '查找内容' : 'Find content'}">${icon('search')}</button><button class="reference-settings" aria-label="${lang === 'zh' ? '空间设置' : 'Space settings'}">${icon('settings')}</button><div class="reference-footer"><button class="reference-date" aria-label="${t('fit')}">${Math.round(view.scale * 100)}%</button><button class="reference-actions" aria-label="${lang === 'zh' ? '空间导航' : 'Space navigation'}">${icon("bookmark")}${icon("chevron")}</button><button class="reference-plus" aria-label="${lang === 'zh' ? '创建内容' : 'Create content'}">${icon("plus")}</button></div><div class="toolbar-wrap" aria-hidden="true"><div class="toolbar"><span class="toolbar-caption">${lang === "zh" ? "右键打开 Spatial 菜单" : "Right-click for Spatial menu"}</span></div></div><div class="context-menu" id="context-menu" role="menu" aria-label="${lang === "zh" ? "Spatial 右键菜单" : "Spatial context menu"}"></div><div class="zoom-controls"><button id="zoom-out" aria-label="${lang === "zh" ? "缩小" : "Zoom out"}">−</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="${lang === "zh" ? "放大" : "Zoom in"}">＋</button><button id="fit-btn" title="${t("fit")}">⌗</button></div><div class="status-pill"><span class="live-dot"></span><span id="online-label">${t("onePerson")}</span></div><div class="panel-viewer" id="panel-viewer" aria-hidden="true"></div></main>`;
    bindCanvas(); renderObjects(); renderPresence(); renderRemotes(); fitCanvas();
  }

  function bindCanvas() {
    const wrap = $("#canvas-wrap");
    document.querySelector('.reference-plus').onclick = e => {
      e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect();
      contextPoint = worldPoint({clientX: innerWidth / 2, clientY: innerHeight / 2});
      showContextMenu(r.right - 268, r.top, null);
      const menu = $('#context-menu'); menu.style.top = `${Math.max(12, r.top - menu.offsetHeight - 12)}px`;
    };
    document.querySelector('.reference-settings').onclick = e => showUtilityMenu(e, 'settings');
    document.querySelector('.reference-actions').onclick = e => showUtilityMenu(e, 'navigation');
    document.querySelector('.reference-date').onclick = e => { e.stopPropagation(); fitCanvas(); };
    document.querySelector('.ambient-search').onclick = e => showUtilityMenu(e, 'search');
    wrap.addEventListener("contextmenu", e => { e.preventDefault(); const hit = document.elementFromPoint(e.clientX, e.clientY); const card = (hit && hit.closest(".canvas-card")) || e.target.closest?.(".canvas-card"); if (card) selected = card.dataset.id; const rect = wrap.getBoundingClientRect(); contextPoint = { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale }; showContextMenu(e.clientX, e.clientY, card ? objects.find(o => o.id === card.dataset.id) : null); if (card) renderObjects(); });
    wrap.addEventListener("dblclick", e => { const card = e.target.closest?.(".canvas-card"); if (!card) return; const object = objectById(card.dataset.id); if (!object) return; e.preventDefault(); e.stopPropagation(); if (object.kind === "folder") openFolder(object); else openPanel(object); });
    wrap.addEventListener("pointerdown", e => { if (e.button !== 0) return; if (!isCanvasTarget(e.target)) return; if (e.shiftKey) { startSelection(e); return; } drag = { pan: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener("pointermove", e => { if (drag?.selection) { updateSelection(e); } else if (drag && drag.pan) { view.x = drag.ox + e.clientX - drag.sx; view.y = drag.oy + e.clientY - drag.sy; applyView(); } else if (drag?.group) { const dx = (e.clientX - drag.sx) / view.scale; const dy = (e.clientY - drag.sy) / view.scale; drag.items.forEach(item => { item.object.x = item.ox + dx; item.object.y = item.oy + dy; item.el.style.left = `${item.object.x}px`; item.el.style.top = `${item.object.y}px`; }); updateDropTarget(e, new Set(drag.items.map(item => item.object.id))); } else if (drag?.card) { drag.card.x = drag.ox + (e.clientX - drag.sx) / view.scale; drag.card.y = drag.oy + (e.clientY - drag.sy) / view.scale; drag.el.style.left = `${drag.card.x}px`; drag.el.style.top = `${drag.card.y}px`; updateDropTarget(e, new Set([drag.card.id])); } else if (drag?.resize) { drag.resize.width = Math.max(180, drag.ow + (e.clientX - drag.sx) / view.scale); drag.resize.height = Math.max(120, drag.oh + (e.clientY - drag.sy) / view.scale); drag.el.style.width = `${drag.resize.width}px`; drag.el.style.height = `${drag.resize.height}px`; } updateCursor(e); });
    wrap.addEventListener("pointerup", () => { if (drag?.selection) finishSelection(); else if (drag?.pan) drag = null; else if (drag?.group || drag?.card || drag?.resize) finishDrag(); });
    wrap.addEventListener("pointercancel", () => { if (drag?.selection) finishSelection(); else if (drag?.group || drag?.card || drag?.resize) finishDrag(); else drag = null; });
    wrap.addEventListener("wheel", e => { e.preventDefault(); const factor = e.deltaY > 0 ? .92 : 1.09; const rect = wrap.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top; const old = view.scale; const next = Math.max(.45, Math.min(1.8, old * factor)); view.x = px - (px - view.x) * next / old; view.y = py - (py - view.y) * next / old; view.scale = next; applyView(); }, { passive: false });
    $("#zoom-in").onclick = () => zoomAt(1.12); $("#zoom-out").onclick = () => zoomAt(.89); $("#fit-btn").onclick = fitCanvas;
    $("#invite-btn").onclick = copyInviteLink;
    document.addEventListener("click", e => { if (!e.target.closest(".context-menu")) hideContextMenu(); });
    document.addEventListener("keydown", e => {
      const editing = e.target.closest?.("textarea,input,[contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !editing && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "c")) { e.preventDefault(); undoLast(); return; }
      if (mod && !editing && e.key.toLowerCase() === "y") { e.preventDefault(); undoLast(); return; }
      if (e.key === "Escape") { hideContextMenu(); closePanel(); }
    });
  }
  async function copyInviteLink() {
    const url = new URL(location.pathname, location.origin);
    url.search = new URLSearchParams({room: roomId, name: roomName, lang}).toString();
    const link = url.href;
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
  function showUtilityMenu(e, mode) {
    e.stopPropagation(); const menu = $('#context-menu'); const r = e.currentTarget.getBoundingClientRect();
    const zh = lang === 'zh';
    const row = (action, label) => `<button data-utility="${action}">${label}</button>`;
    menu.innerHTML = mode === 'settings'
      ? `<div class="context-title">${escapeHtml(roomName)}</div>${row('fit', t('fit'))}${row('invite', t('invite'))}${row('trash', `${icon("trash")} ${t('trash')} (${trashItems.length})`)}${row('language', t('languageAction'))}`
      : mode === 'navigation'
      ? `${row('back', zh ? '返回完整画布' : 'Back to canvas')}<div class="context-separator"></div>` + objects.filter(o => o.kind === 'folder').map(o => row(o.id, `${icon("folder")} ${escapeHtml(o.title || t('folder'))}`)).join('')
      : `<input class="canvas-search-input" placeholder="${zh ? '搜索内容…' : 'Search content…'}" aria-label="${zh ? '搜索内容' : 'Search content'}"><div class="search-results"></div>`;
    menu.classList.add('open'); document.body.classList.add('menu-open');
    menu.style.left = `${Math.max(12, Math.min(r.left, innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${mode === 'search' ? r.bottom + 12 : Math.max(12, r.top - menu.offsetHeight - 12)}px`;
    menu.querySelectorAll('[data-utility]').forEach(button => button.onclick = () => {
      const action = button.dataset.utility; hideContextMenu();
      if (action === 'back') return closeFolder();
      if (['fit', 'invite', 'language'].includes(action)) return contextAction(action);
      if (action === "trash") return showTrashMenu();
      const folder = objectById(action); if (folder) openFolder(folder);
    });
    const input = menu.querySelector('input');
    if (input) { input.oninput = () => {
      const query = input.value.trim().toLocaleLowerCase(); const results = menu.querySelector('.search-results');
      const matches = query ? objects.filter(o => [o.title, o.text, o.caption, o.url, o.content].join(' ').toLocaleLowerCase().includes(query)).slice(0, 8) : [];
      results.innerHTML = matches.map(o => `<button data-result="${escapeHtml(o.id)}">${escapeHtml(o.title || o.caption || o.text?.slice(0, 24) || kindLabel(o.kind))}</button>`).join('');
      results.querySelectorAll('button').forEach(b => b.onclick = () => { hideContextMenu(); const o = objectById(b.dataset.result); if (o.kind === 'folder') openFolder(o); else openPanel(o); });
    }; input.focus(); }
  }
  function showTrashMenu() { const menu = $("#context-menu"); const rows = trashItems.length ? trashItems.map(item => `<button data-restore="${item.id}">${icon("undo")} ${escapeHtml(item.title || item.caption || kindLabel(item.kind))}<span>${t("restore")}</span></button>`).join("") : `<div class="trash-empty">${lang === "zh" ? "回收站为空" : "Trash is empty"}</div>`; menu.innerHTML = `<div class="context-title">${icon("trash")} ${t("trash")}</div>${rows}${trashItems.length ? `<div class="context-separator"></div><button data-empty-trash>${t("emptyTrash")}</button>` : ""}`; menu.classList.add("open"); menu.querySelectorAll("[data-restore]").forEach(b => b.onclick = () => { const i = trashItems.findIndex(x => x.id === b.dataset.restore); if (i >= 0) { snapshotState(); objects.push(trashItems.splice(i,1)[0]); saveTrash(); saveObjects(); renderObjects(); hideContextMenu(); toast(t("restore")); } }); menu.querySelector("[data-empty-trash]")?.addEventListener("click", () => { snapshotState(); trashItems = []; saveTrash(); hideContextMenu(); }); }
  function startSelection(e) { selectionDrag = { sx: e.clientX, sy: e.clientY }; drag = { selection: true }; const box = $("#selection-box"); if (box) { box.style.left = `${e.clientX}px`; box.style.top = `${e.clientY}px`; box.style.width = "0px"; box.style.height = "0px"; box.classList.add("open"); } $("#canvas-wrap")?.setPointerCapture(e.pointerId); }
  function updateSelection(e) { if (!selectionDrag) return; const box = $("#selection-box"); if (!box) return; const left = Math.min(selectionDrag.sx, e.clientX); const top = Math.min(selectionDrag.sy, e.clientY); box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${Math.abs(e.clientX - selectionDrag.sx)}px`; box.style.height = `${Math.abs(e.clientY - selectionDrag.sy)}px`; }
  function finishSelection() { const start = selectionDrag; const box = $("#selection-box"); selectionDrag = null; drag = null; if (box) box.classList.remove("open"); if (!start) return; const end = { x: Number.parseFloat(box?.style.left || start.sx), y: Number.parseFloat(box?.style.top || start.sy) }; const rect = $("#canvas-wrap")?.getBoundingClientRect(); if (!rect) return; const x1 = Math.min(start.sx, end.x); const y1 = Math.min(start.sy, end.y); const x2 = Math.max(start.sx, end.x + Number.parseFloat(box?.style.width || "0")); const y2 = Math.max(start.sy, end.y + Number.parseFloat(box?.style.height || "0")); const ids = visibleObjects().filter(o => { const left = rect.left + view.x + o.x * view.scale; const top = rect.top + view.y + o.y * view.scale; const right = left + o.width * view.scale; const bottom = top + o.height * view.scale; return left < x2 && right > x1 && top < y2 && bottom > y1; }).map(o => o.id); selectedIds = new Set(ids); selected = ids.length === 1 ? ids[0] : null; renderObjects(); }
  function updateDropTarget(e, excluded) { const candidate = folderAtPoint(worldPoint(e), excluded); const previous = drag?.dropFolderId ? objectById(drag.dropFolderId) : null; if (previous) document.querySelector(`[data-id="${previous.id}"]`)?.classList.remove("folder-drop-target"); drag.dropFolderId = candidate?.id || null; if (candidate) document.querySelector(`[data-id="${candidate.id}"]`)?.classList.add("folder-drop-target"); }
  function zoomAt(factor) { const wrap = $("#canvas-wrap"); const px = (wrap?.clientWidth || innerWidth) / 2; const py = (wrap?.clientHeight || innerHeight) / 2; const old = view.scale; const next = Math.max(.45, Math.min(1.8, old * factor)); view.x = px - (px - view.x) * next / old; view.y = py - (py - view.y) * next / old; view.scale = next; applyView(); }
  function fitCanvas() { const wrap = $("#canvas-wrap"); if (!wrap || !objects.length) { view = { x: 0, y: 0, scale: .82 }; return applyView(); } const minX = Math.min(...objects.map(o => o.x)); const minY = Math.min(...objects.map(o => o.y)); const maxX = Math.max(...objects.map(o => o.x + o.width)); const maxY = Math.max(...objects.map(o => o.y + o.height)); const width = Math.max(1, maxX - minX); const height = Math.max(1, maxY - minY); const scale = Math.min(1.05, Math.max(.45, Math.min((wrap.clientWidth - 90) / width, (wrap.clientHeight - 150) / height))); view.scale = scale; view.x = (wrap.clientWidth - width * scale) / 2 - minX * scale; view.y = (wrap.clientHeight - height * scale) / 2 - minY * scale; applyView(); }
  function applyView() { const world = $("#canvas-world"); if (world) world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; const zoomButton = document.querySelector('.reference-date'); if (zoomButton) zoomButton.textContent = Math.round(view.scale * 100) + "%"; const label = $("#zoom-label"); if (label) label.textContent = Math.round(view.scale * 100) + "%"; renderRemotes(); }
  function finishDrag() {
    const active = drag;
    if (!active || (!active.card && !active.resize && !active.group)) { drag = null; return; }
    if (active.group) {
      active.items.forEach(item => { item.el.style.left = `${item.object.x}px`; item.el.style.top = `${item.object.y}px`; item.el.classList.remove("dragging"); });
      if (active.dropFolderId) {
        active.items.forEach(item => { if (item.object.kind !== "folder") item.object.folderId = active.dropFolderId; });
        selectedIds = new Set(active.items.map(item => item.object.id));
        renderObjects();
        toast(t("moveIntoFolder"));
      } else active.items.forEach(item => item.object.folderId = openedFolderId || undefined);
    } else if (active.card) {
      active.el.style.left = `${active.card.x}px`;
      active.el.style.top = `${active.card.y}px`;
      active.el.classList.remove("dragging", "folder-drop-target");
      if (active.dropFolderId) { active.card.folderId = active.dropFolderId; renderObjects(); toast(t("moveIntoFolder")); }
      else if (openedFolderId && active.card.folderId === openedFolderId) { active.card.folderId = undefined; renderObjects(); }
    } else {
      active.el.style.width = `${active.resize.width}px`;
      active.el.style.height = `${active.resize.height}px`;
      active.el.classList.remove("dragging");
    }
    document.querySelectorAll(".folder-drop-target").forEach(node => node.classList.remove("folder-drop-target"));
    drag = null;
    saveObjects();
    sendUpdate();
  }
  function worldPoint(e) { const rect = $("#canvas-wrap").getBoundingClientRect(); return { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale }; }
  function updateCursor(e) {
    const p = worldPoint(e); me.cursor = p;
    const emit = () => { lastAwarenessAt = Date.now(); awarenessTimer = null; send({ type: "awareness", roomId, state: { sessionId: me.id, nickname: me.name, color: me.color, cursor: me.cursor, selection: { objectId: selected || undefined }, updatedAt: Date.now() } }); };
    const wait = 40 - (Date.now() - lastAwarenessAt);
    if (wait <= 0) emit(); else if (!awarenessTimer) awarenessTimer = setTimeout(emit, wait);
  }

  function renderObjects() {
    const world = $("#canvas-world"); if (!world) return;
    const visible = visibleObjects();
    world.innerHTML = visible.map(o => cardHtml(o)).join("");
    visible.forEach(o => bindObject(o));
    updateFolderBreadcrumb();
    applyView();
  }
  function updateFolderBreadcrumb() {
    const crumb = $("#folder-breadcrumb");
    if (!crumb) return;
    if (!openedFolderId) { crumb.classList.remove("open"); crumb.innerHTML = ""; return; }
    const folder = objectById(openedFolderId);
    crumb.innerHTML = `<button data-folder-back>${icon("back")} ${t("back")}</button><span>${escapeHtml(folder?.title || t("folder"))}</span>`;
    crumb.classList.add("open");
    crumb.querySelector("[data-folder-back]")?.addEventListener("click", closeFolder);
  }
  function openFolder(folder) { openedFolderId = folder.id; selected = null; selectedIds = new Set(); renderObjects(); }
  function closeFolder() { openedFolderId = null; selected = null; selectedIds = new Set(); renderObjects(); }
  function panelMarkup(o) {
    const title = o.title || o.caption || kindLabel(o.kind);
    const body = o.kind === "artboard" ? `<div class="drawing-stage"><canvas class="drawing-canvas" width="1200" height="760"></canvas><div class="drawing-help">${lang === "zh" ? "在画板中自由绘制" : "Draw freely"}</div></div>` : o.kind === "image" ? `<div class="panel-art"><img src="${escapeHtml(o.src)}" alt="${escapeHtml(title)}"></div>` : o.kind === "richText" ? `<article class="panel-rich">${o.content || t("richTextDefault")}</article>` : o.kind === "note" ? `<article class="panel-note">${escapeHtml(o.text).replace(/\n/g, "<br>")}</article>` : o.kind === "folder" ? `<div class="panel-folder"><span>▱</span><strong>${escapeHtml(title)}</strong><small>${objects.filter(child => child.folderId === o.id).length} ${t("items")}</small></div>` : `<article class="panel-link"><div class="link-favicon">↗</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(o.description || o.url)}</p><a href="${escapeHtml(o.url)}" target="_blank" rel="noreferrer">${escapeHtml(o.url)}</a></article>`;
    const meta = o.kind === "artboard" ? `<div><b>${t("panelInfo")}</b><span>${t("artboard")} · ${o.strokes?.length || 0}</span></div>` : o.kind === "image" ? `<div><b>${t("resolution")}</b><span>${Math.round(o.width)} × ${Math.round(o.height)}</span></div><div><b>${t("filename")}</b><span>${escapeHtml(o.assetId || o.id)}.png</span></div><div><b>${t("date")}</b><span>${t("createdOn")} ${new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}</span></div>` : `<div><b>${t("panelInfo")}</b><span>${escapeHtml(kindLabel(o.kind))}</span></div><div><b>${t("date")}</b><span>${t("createdOn")} ${new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span></div>`;
    return `<section class="panel-viewer-shell"><button class="panel-back" data-panel-close aria-label="${t("close")}">${icon("back")}</button><div class="panel-content">${body}</div><aside class="panel-meta"><h1>${escapeHtml(title)}</h1>${meta}</aside><div class="panel-toolbar"><button data-panel-action="duplicate" aria-label="${t("duplicate")}" title="${t("duplicate")}">${icon("copy")}</button><button data-panel-action="download" aria-label="${lang === "zh" ? "下载" : "Download"}" title="${lang === "zh" ? "下载" : "Download"}">${icon("download")}</button><button data-panel-action="delete" aria-label="${t("delete")}" title="${t("delete")}">${icon("trash")}</button></div></section>`;
  }
  function openPanel(object) {
    const viewer = $("#panel-viewer"); if (!viewer) return;
    viewer.classList.toggle("is-artboard", object.kind === "artboard"); openPanelId = object.id; viewer.innerHTML = panelMarkup(object); viewer.classList.add("open"); viewer.setAttribute("aria-hidden", "false"); document.body.classList.add("panel-open");
    viewer.querySelector("[data-panel-close]")?.addEventListener("click", closePanel);
    viewer.querySelectorAll("[data-panel-action]").forEach(button => button.addEventListener("click", () => panelAction(button.dataset.panelAction, object))); if (object.kind === "artboard") bindDrawingPanel(object);
  }
  function bindDrawingPanel(object) {
    const canvas = document.querySelector('.drawing-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); let active = null, mode = 'pen', redo = [];
    const zh = lang === 'zh'; object.strokes ||= [];
    const names = {pen:zh?'画笔':'Pen',marker:zh?'荧光笔':'Marker',eraser:zh?'橡皮擦':'Eraser',line:zh?'直线':'Line',rect:zh?'矩形':'Rectangle',circle:zh?'椭圆':'Ellipse'};
    const tool = (id,label) => `<button type="button" data-draw="${id}" title="${label}" aria-label="${label}" aria-pressed="${id==='pen'}">${icon(id)}</button>`;
    const stage = canvas.closest('.drawing-stage');
    stage.insertAdjacentHTML('beforebegin', `<div class="drawing-heading"><span>${escapeHtml(object.title || t('artboard'))}</span><small>${zh?'自由创作，随时记录灵感':'A little room for your imagination'}</small></div>`);
    stage.insertAdjacentHTML('afterend', `<div class="drawing-tools"><div class="drawing-tool-row">${Object.entries(names).map(([id,label])=>tool(id,label)).join('')}<i></i>${tool('undo',zh?'撤销':'Undo')}${tool('redo',zh?'重做':'Redo')}</div><div class="drawing-options"><label class="color-control" title="${zh?'自定义颜色':'Custom color'}"><input class="drawing-color" aria-label="${zh?'颜色':'Color'}" type="color" value="#30343b"></label>${['#30343b','#839b87','#7894b5','#d79a8d','#d2b575'].map(c=>`<button class="drawing-swatch" data-color="${c}" style="--swatch:${c}" aria-label="${c}"></button>`).join('')}<i></i><label class="size-control">${zh?'粗细':'Size'}<input class="drawing-size" aria-label="${zh?'笔触粗细':'Stroke width'}" type="range" min="1" max="40" value="5"><output>5</output></label>${tool('trash',zh?'清空画板':'Clear board')}</div></div>`);
    const toolbar = stage.parentElement.querySelector('.drawing-tools');
    const paint = () => {
      ctx.clearRect(0,0,1200,760);
      for (const stroke of [...(object.strokes || []), ...(active?[active]:[])]) {
        if (!stroke.points?.length) continue; const pts=stroke.points, a=pts[0], b=pts[pts.length-1];
        ctx.save(); ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over'; ctx.globalAlpha=stroke.tool==='marker'?.3:1; ctx.strokeStyle=stroke.color; ctx.fillStyle=stroke.color; ctx.lineWidth=stroke.size; ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
        if (stroke.tool==='rect') ctx.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
        else if (stroke.tool==='circle') ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);
        else if (stroke.tool==='line') {ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
        else {pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); if(pts.length===1){ctx.arc(a.x,a.y,stroke.size/2,0,Math.PI*2);ctx.fill();}}
        ctx.stroke();ctx.restore();
      }
      toolbar.querySelector('[data-draw="undo"]').disabled=!object.strokes.length;
      toolbar.querySelector('[data-draw="redo"]').disabled=!redo.length;
    };
    const commit=()=>{saveObjects();sendUpdate();paint();};
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1200,(e.clientX-r.left)*1200/r.width)),y:Math.max(0,Math.min(760,(e.clientY-r.top)*760/r.height))};};
    canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);active={tool:mode,points:[point(e)],color:toolbar.querySelector('.drawing-color').value,size:Number(toolbar.querySelector('.drawing-size').value)*(mode==='marker'?3:mode==='eraser'?4:1)};paint();};
    canvas.onpointermove=e=>{if(!active)return;active.points.push(point(e));paint();};
    canvas.onpointerup=()=>{if(!active)return;object.strokes.push(active);active=null;redo=[];commit();};
    canvas.onpointercancel=()=>{active=null;paint();};
    toolbar.querySelectorAll('[data-draw]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.draw;
      if(action==='undo'){if(object.strokes.length)redo.push(object.strokes.pop());commit();}
      else if(action==='redo'){if(redo.length)object.strokes.push(redo.pop());commit();}
      else if(action==='trash'){if(confirm(zh?'清空这张画板？':'Clear this artboard?')){object.strokes=[];redo=[];commit();}}
      else {mode=action;toolbar.querySelectorAll('[data-draw]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
    });
    toolbar.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{toolbar.querySelector('.drawing-color').value=b.dataset.color;});
    toolbar.querySelector('.drawing-size').oninput=e=>toolbar.querySelector('output').textContent=e.target.value;
    canvas.repaintDrawing=paint;paint();
  }
  function closePanel() { const viewer = $("#panel-viewer"); if (!viewer) return; viewer.classList.remove("open"); viewer.setAttribute("aria-hidden", "true"); setTimeout(() => { if (!viewer.classList.contains("open")) viewer.innerHTML = ""; }, 340); openPanelId = null; document.body.classList.remove("panel-open"); }
  function panelAction(action, object) { if (action === "duplicate") { closePanel(); return contextAction("duplicate", object); } if (action === "delete") { closePanel(); return contextAction("delete", object); } if (action === "download") {
      if (object.kind === "artboard") { const canvas=document.querySelector(".drawing-canvas"); if(canvas){const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="artboard.png";a.click();}return; }
      const a = document.createElement("a");
      const image = object.kind === "image";
      const blobUrl = image ? null : URL.createObjectURL(new Blob([object.content || object.text || object.url || object.title || ""], {type: object.kind === "richText" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8"}));
      a.href = image ? object.src : blobUrl;
      a.download = (object.assetId || object.id) + (image ? "" : object.kind === "richText" ? ".html" : ".txt");
      a.click(); if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } }
  function applyRemoteObjects(nextObjects) {
    const activeEditor = document.activeElement?.closest?.("textarea,.rich-editor");
    const activeCard = activeEditor?.closest?.(".canvas-card");
    const activeId = activeCard?.dataset.id;
    const currentById = new Map(objects.map(o => [o.id, o]));
    const merged = nextObjects.map(incoming => {
      const current = currentById.get(incoming.id);
      if (!current) return incoming;
      Object.assign(current, incoming);
      if (activeId === incoming.id && activeEditor) {
        if (activeEditor.matches("textarea")) current.text = activeEditor.value;
        if (activeEditor.matches(".rich-editor")) current.content = activeEditor.innerHTML;
      }
      return current;
    });
    objects = merged;
    document.querySelector(".drawing-canvas")?.repaintDrawing?.();
    saveObjects();
    if (!drag && (!activeEditor || !activeId || !merged.some(o => o.id === activeId))) renderObjects();
  }
  function kindLabel(kind) { return ({ note: t("sticky"), richText: t("richText"), image: t("image"), link: t("link"), folder: t("folder"), artboard: t("artboard") })[kind] || kind; }
  function cardHtml(o) {
    const active = selected === o.id ? " selected" : selectedIds.has(o.id) ? " multi-selected" : "";
    if (o.kind === "artboard") return `<article class="canvas-card artboard-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px"><div class="artboard-preview">${icon("pen")}</div><div class="artboard-name">${escapeHtml(o.title || t("artboard"))}</div><div class="artboard-count">${o.strokes?.length || 0}</div><i class="resize-handle"></i></article>`;
    if (o.kind === "folder") return `<article class="canvas-card folder-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px"><div class="folder-tab"></div><div class="folder-preview">${objects.filter(child => child.folderId === o.id).slice(0,3).map((child, index) => `<span style="--i:${index};--preview-color:${child.kind === 'note' ? '#d7efdf' : '#e4e7f2'}">${escapeHtml(child.title || child.caption || child.text?.slice(0,30) || kindLabel(child.kind))}</span>`).join('')}</div><div class="folder-name">${escapeHtml(o.title || t("folder"))}</div><div class="folder-count">${objects.filter(child => child.folderId === o.id).length} ${t("items") || ""}</div><i class="resize-handle"></i></article>`;
    if (o.kind === "note") return `<article class="canvas-card note-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;background:${o.color || "#fff2a8"}"><div class="card-grip">⋮⋮</div><textarea class="note-editor" aria-label="${t("sticky")}">${escapeHtml(o.text)}</textarea><div class="card-foot"><span>⌘ ${escapeHtml(me.name)}</span><span class="edited">${t("justNow")}</span></div><i class="resize-handle"></i></article>`;
    if (o.kind === "richText") return `<article class="canvas-card rich-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px"><div class="card-top"><span class="doc-icon">T</span><span class="doc-title">${escapeHtml(o.title || t("newDocument"))}</span><span class="more">•••</span></div><div class="rich-editor" contenteditable="true" spellcheck="true">${o.content || t("richTextDefault")}</div><div class="format-bar"><b>B</b><i>I</i><span>☷</span><span>↗</span></div><i class="resize-handle"></i></article>`;
    if (o.kind === "image") return `<article class="canvas-card image-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px"><img src="${escapeHtml(o.src)}" alt="${escapeHtml(o.caption || t("newVisual"))}" draggable="false"><div class="image-caption"><span>◈</span>${escapeHtml(o.caption || t("newVisual"))}<span class="more">•••</span></div><i class="resize-handle"></i></article>`;
    return `<article class="canvas-card link-card${active}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px"><div class="link-preview"><div class="link-favicon">↗</div><div class="link-copy"><b>${escapeHtml(o.title || t("savedLink"))}</b><span>${escapeHtml(o.description || o.url)}</span></div></div><div class="link-url">${escapeHtml(o.url)}</div><i class="resize-handle"></i></article>`;
  }
  function bindObject(o) {
    const el = document.querySelector(`[data-id="${o.id}"]`); if (!el) return;
    el.addEventListener("pointerdown", e => { if (e.button !== 0 || e.target.closest("textarea,.rich-editor,.resize-handle")) return; e.stopPropagation(); const tapNow = Date.now(); if (lastCardTap.id === o.id && tapNow - lastCardTap.time < 520) { lastCardTap = { id: null, time: 0 }; e.preventDefault(); if (o.kind === "folder") openFolder(o); else openPanel(o); return; } lastCardTap = { id: o.id, time: tapNow }; clearCardSelection(el); if (!selectedIds.has(o.id)) selectedIds = new Set([o.id]); selected = o.id; const members = selectedIds.size > 1 ? [...selectedIds].map(id => objectById(id)).filter(item => item && item.kind !== "folder") : [o]; const items = members.map(object => ({ object, el: document.querySelector(`[data-id="${object.id}"]`), ox: object.x, oy: object.y })).filter(item => item.el); drag = items.length > 1 ? { group: true, items, sx: e.clientX, sy: e.clientY } : { card: o, el, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y }; $("#canvas-wrap")?.setPointerCapture(e.pointerId); items.forEach(item => item.el.classList.add("selected", "multi-selected", "dragging")); });
    el.addEventListener("click", e => { if (e.target.closest("textarea,.rich-editor")) return; e.stopPropagation(); const now = Date.now(); if (lastCardTap.id === o.id && now - lastCardTap.time < 520) { lastCardTap = { id: null, time: 0 }; if (o.kind === "folder") openFolder(o); else openPanel(o); return; } lastCardTap = { id: o.id, time: now }; clearCardSelection(el); selected = o.id; selectedIds = new Set([o.id]); el.classList.add("selected"); });
    el.addEventListener("dblclick", e => { if (e.target.closest("textarea,.rich-editor,.resize-handle")) return; e.stopPropagation(); if (o.kind === "folder") openFolder(o); else openPanel(o); });
    const editor = el.querySelector("textarea"); if (editor) editor.addEventListener("input", e => { o.text = e.target.value; saveObjects(); sendUpdate(); });
    const rich = el.querySelector(".rich-editor"); if (rich) rich.addEventListener("input", e => { o.content = e.target.innerHTML; saveObjects(); sendUpdate(); });
    const handle = el.querySelector(".resize-handle"); if (handle) handle.addEventListener("pointerdown", e => { if (e.button !== 0) return; e.stopPropagation(); document.querySelectorAll(".canvas-card.selected").forEach(node => { if (node !== el) node.classList.remove("selected"); }); selected = o.id; drag = { resize: o, el, sx: e.clientX, sy: e.clientY, ow: o.width, oh: o.height }; $("#canvas-wrap")?.setPointerCapture(e.pointerId); el.classList.add("selected", "dragging"); });
    el.addEventListener("pointerup", e => {
      const moved = drag?.card === o || drag?.resize === o || drag?.group; if (moved) finishDrag();
      if (e.target.closest("textarea,.rich-editor,.resize-handle")) return;
      const now = Date.now();
      if (lastCardTap.id === o.id && now - lastCardTap.time < 480) { lastCardTap = { id: null, time: 0 }; if (o.kind === "folder") openFolder(o); else openPanel(o); }
      else lastCardTap = { id: o.id, time: now };
    });
  }
  function addObject(kind, at) {
    const n = objects.length;
    const base = { id: uid(), x: at?.x ?? 330 + (n % 3) * 46, y: at?.y ?? 240 + (n % 4) * 42, width: kind === "artboard" ? 320 : kind === "image" ? 300 : kind === "link" ? 290 : kind === "richText" ? 350 : kind === "folder" ? 260 : 250, height: kind === "artboard" ? 210 : kind === "image" ? 205 : kind === "link" ? 165 : kind === "richText" ? 255 : kind === "folder" ? 180 : 175 };
    const o = kind === "artboard" ? { ...base, kind, title: t("artboard"), strokes: [] } : kind === "note" ? { ...base, kind, text: t("newIdea"), color: "#fff2a8" } : kind === "richText" ? { ...base, kind, title: t("newDocument"), documentId: uid(), content: t("richTextDefault") } : kind === "image" ? { ...base, kind, src: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=740&q=80", caption: t("newVisual") } : kind === "link" ? { ...base, kind, url: "example.com", title: t("savedLink"), description: `example.com  ·  ${t("reference")}` } : { ...base, kind: "folder", title: t("folder") };
    objects.push(o); selected = o.id; selectedIds = new Set([o.id]); saveObjects(); renderObjects(); sendUpdate(); hideContextMenu(); toast(kind === "note" ? t("noteAdded") : kind === "richText" ? t("documentAdded") : kind === "image" ? t("imageAdded") : kind === "folder" ? t("folderAdded") : kind === "artboard" ? t("artboardAdded") : t("linkAdded"));
  }
  function showContextMenu(x, y, object) {
    const menu = $("#context-menu");
    if (!menu) return;
    const editItem = object ? `<button data-context="edit"><span class="context-leading">${icon("pen")}</span><span>${t("edit")}</span></button>` : "";
    const openItem = object ? `<button data-context="open"><span class="context-leading">${icon("open")}</span><span>${object.kind === "folder" ? t("open") : t("open")}</span></button>` : "";
    const items = object ? `<div class="context-title"><span class="context-dot" style="background:${object.kind === "note" ? "#e6c45d" : object.kind === "folder" ? "#d8a54b" : "#6f86e8"}"></span>${escapeHtml(kindLabel(object.kind))}</div>${openItem}${editItem}<button data-context="duplicate"><span class="context-leading">${icon("copy")}</span><span>${t("duplicate")}</span></button><button data-context="delete" class="danger"><span class="context-leading">${icon("trash")}</span><span>${t("delete")}</span></button><div class="context-separator"></div>` : "";
    menu.innerHTML = `${items}<div class="context-title muted">${t("createHere")}</div><button data-context="note"><span class="context-leading context-note">${icon("pen")}</span><span>${t("sticky")}</span><kbd>⇧⌘ N</kbd></button><button data-context="richText"><span class="context-leading context-doc">${icon("note")}</span><span>${t("richText")}</span><kbd>⌘ N</kbd></button><button data-context="image"><span class="context-leading context-image">${icon("image")}</span><span>${t("image")}</span><kbd>⌘ I</kbd></button><button data-context="link"><span class="context-leading context-link">${icon("open")}</span><span>${t("link")}</span><kbd>⌘ K</kbd></button><button data-context="folder"><span class="context-leading context-folder">${icon("folder")}</span><span>${t("folder")}</span><kbd>⇧⌘ F</kbd></button><button data-context="artboard"><span class="context-leading context-artboard">${icon("pen")}</span><span>${t("artboard")}</span><kbd>⇧⌘ A</kbd></button><div class="context-separator"></div><button data-context="fit"><span class="context-leading">${icon("fit")}</span><span>${t("fit")}</span></button><button data-context="invite"><span class="context-leading">${icon("link")}</span><span>${t("invite")}</span></button><button data-context="language"><span class="context-leading">${icon("globe")}</span><span>${t("languageAction")}</span></button>`;
    menu.classList.add("open");
    document.body.classList.add("menu-open");
    const menuWidth = menu.offsetWidth || 344;
    const menuHeight = menu.offsetHeight || 360;
    menu.style.left = `${Math.max(12, Math.min(x, innerWidth - menuWidth - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(y, innerHeight - menuHeight - 12))}px`;
    menu.querySelectorAll("[data-context]").forEach(button => button.addEventListener("click", () => contextAction(button.dataset.context, object)));
  }
  function hideContextMenu() { $("#context-menu")?.classList.remove("open"); document.body.classList.remove("menu-open"); }
  function contextAction(action, object) {
    hideContextMenu();
    if (["note", "richText", "image", "link", "folder", "artboard"].includes(action)) return addObject(action, contextPoint);
    if (action === "fit") return fitCanvas();
    if (action === "invite") return copyInviteLink();
    if (action === "language") { setLanguage(lang === "zh" ? "en" : "zh"); return renderCanvas(); }
    if (!object) return;
    if (action === "open") return object.kind === "folder" ? openFolder(object) : openPanel(object);
    if (action === "delete") { snapshotState(); if (object.kind === "folder") objects.forEach(child => { if (child.folderId === object.id) child.folderId = undefined; }); objects = objects.filter(o => o.id !== object.id); trashItems.push({...object, folderId: undefined}); saveTrash(); selected = null; selectedIds = new Set(); saveObjects(); renderObjects(); sendUpdate([object.id]); return toast(t("movedTrash")); }
    if (action === "duplicate") { const clone = { ...object, id: uid(), x: object.x + 28, y: object.y + 28 }; objects.push(clone); selected = clone.id; saveObjects(); renderObjects(); sendUpdate(); return toast(t("duplicated")); }
    if (action === "edit") {
      selected = object.id;
      if (object.kind === "image") {
        const caption = window.prompt(t("imageCaptionPrompt"), object.caption || t("newVisual"));
        if (caption === null) return;
        object.caption = caption.trim() || t("newVisual");
      } else if (object.kind === "link") {
        const title = window.prompt(t("linkTitlePrompt"), object.title || t("savedLink"));
        if (title === null) return;
        const url = window.prompt(t("linkUrlPrompt"), object.url || "https://");
        if (url === null) return;
        object.title = title.trim() || t("savedLink");
        object.url = url.trim() || object.url;
        object.description = `${object.url} · ${t("reference")}`;
      } else if (object.kind === "folder") {
        const title = window.prompt(t("folderTitlePrompt"), object.title || t("folder"));
        if (title === null) return;
        object.title = title.trim() || t("folder");
      }
      saveObjects();
      renderObjects();
      sendUpdate();
      setTimeout(() => document.querySelector(`[data-id="${object.id}"] textarea,[data-id="${object.id}"] .rich-editor`)?.focus(), 0);
    }
  }
  function renderPresence() { const stack = $("#presence-stack"); if (!stack) return; const people = [...remote, { name: me.name, color: me.color }]; stack.innerHTML = people.slice(0, 5).map(p => `<span class="presence-avatar" style="background:${p.color}">${escapeHtml((p.name || "?").slice(0,1).toUpperCase())}</span>`).join(""); const label = $("#online-label"); if (label) label.textContent = people.length === 1 ? t("onePerson") : `${people.length} ${t("people")}`; }
  function renderRemotes() {
    const layer = $("#remote-layer");
    if (!layer) return;
    const now = Date.now();
    const visible = remote.filter(r => !r.updatedAt || now - r.updatedAt < 10000);
    layer.innerHTML = visible.map(r => {
      const p = r.cursor || { x: 0, y: 0 };
      const selectedObject = r.selection && objects.find(o => o.id === r.selection);
      const selection = selectedObject ? `<span class="remote-selection" style="left:${(selectedObject.x - p.x) * view.scale}px;top:${(selectedObject.y - p.y) * view.scale}px;width:${selectedObject.width * view.scale}px;height:${selectedObject.height * view.scale}px;border-color:${r.color}"></span>` : "";
      return `<div class="remote-cursor" style="left:${view.x + p.x * view.scale}px;top:${view.y + p.y * view.scale}px"><span class="cursor-arrow" style="color:${r.color}">➤</span><span class="cursor-label" style="background:${r.color}">${escapeHtml(r.name)}</span>${selection}</div>`;
    }).join("");
  }
  function connect() { try { const proto = location.protocol === "https:" ? "wss" : "ws"; const endpoint = websocketUrl || `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}&nickname=${encodeURIComponent(me.name)}&color=${encodeURIComponent(me.color)}`; socket = new WebSocket(endpoint.startsWith("ws") ? endpoint : `${proto}://${location.host}${endpoint}`); socket.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === "joined") { const incoming = m.state?.objects || {}; objects = Object.keys(incoming).length ? Object.values(incoming) : objects; remote = (m.participants || []).map(p => ({ id: p.sessionId, name: p.nickname, color: p.color, cursor: p.cursor, selection: p.selection?.objectId })); saveObjects(); renderObjects(); renderPresence(); renderRemotes(); } if (m.type === "presence" || m.type === "awareness") { if (m.state?.sessionId === me.id) return; const ix = remote.findIndex(r => r.id === m.state.sessionId); const state = { id: m.state.sessionId, name: m.state.nickname, color: m.state.color, cursor: m.state.cursor, selection: m.state.selection?.objectId }; if (m.action === "leave") { remote = remote.filter(r => r.id !== state.id); } else if (ix >= 0) remote[ix] = state; else remote.push(state); renderPresence(); renderRemotes(); } if (m.type === "y-update" && m.objects) applyRemoteObjects(m.objects); } catch (_) {} }; socket.onclose = () => {}; } catch (_) {} }
  function send(msg) { if (socket?.readyState === 1) socket.send(JSON.stringify(msg)); }
  function sendUpdate(deletedObjects = []) { send({ type: "y-update", roomId, objects, deletedObjects }); }
  function toast(message) { const t = document.createElement("div"); t.className = "toast"; t.textContent = message; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  setInterval(renderRemotes, 1000);
  renderJoin();
})();
