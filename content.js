(() => {
  // 防止重复注入
  if (window.__dshTranslateLoaded) return;
  window.__dshTranslateLoaded = true;

  // 块级元素：只翻译“叶子块”（不含其他块级子元素），避免重复和破坏结构
  const BLOCK_TAGS = [
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD',
    'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
  ];
  const BLOCK_SELECTOR = BLOCK_TAGS.join(',');
  const SKIP_SELECTOR =
    'script,style,noscript,code,pre,textarea,input,select,svg,math,canvas,iframe,' +
    '[contenteditable=""],[contenteditable="true"],.notranslate,.dsh-tr,.dsh-ui';
  // 这些标签内部追加译文，其余标签在其后插入
  const APPEND_INSIDE = new Set(['LI', 'TD', 'TH', 'DD', 'DT', 'SUMMARY', 'CAPTION', 'FIGCAPTION']);

  const MAX_CONCURRENCY = 3;
  const MAX_ITEMS = 12;
  const MAX_CHARS = 3000;

  // ---------- 站点配色 ----------
  const THEME_STYLE_ID = 'dsh-tr-theme';
  const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  let themeSettings = { siteColors: {}, defaultColor: '', autoColor: true };

  // ---------- 根据页面背景自动配色 ----------
  function parseRgba(s) {
    const m = String(s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
  }

  // 从元素向上查找第一个不透明的背景色；找不到时视为白色页面
  function effectiveBackground(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseRgba(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  // 译文颜色 = 正文颜色向背景色靠近 28%：浅色页为深灰，深色页为浅灰，始终略淡于正文
  function autoTranslationColor(el) {
    const text = parseRgba(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
    const bg = effectiveBackground(el);
    const k = 0.28;
    const mix = (t, b) => Math.round(t + (b - t) * k);
    return 'rgb(' + mix(text.r, bg.r) + ',' + mix(text.g, bg.g) + ',' + mix(text.b, bg.b) + ')';
  }

  function normalizePattern(p) {
    return String(p || '')
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^\/\//, '')
      .replace(/^www\./, '')
      .replace(/[/?#].*$/, '')
      .trim();
  }

  function hostOf(url) {
    return String(url).toLowerCase().replace(/^www\./, '');
  }

  // 域名相同或以“.域名”结尾即视为匹配（github.com 也作用于 gist.github.com）
  function hostMatches(pattern, host) {
    return !!pattern && (host === pattern || host.endsWith('.' + pattern));
  }

  // 站点规则优先于默认颜色；多条命中时取最长（最具体）的域名
  function resolveThemeColor() {
    const host = hostOf(location.hostname);
    const map = themeSettings.siteColors || {};
    let best = '';
    let bestLen = -1;
    for (const key of Object.keys(map)) {
      const pattern = normalizePattern(key);
      if (!hostMatches(pattern, host)) continue;
      const color = String(map[key] || '').trim();
      if (!COLOR_RE.test(color)) continue;
      if (pattern.length > bestLen) {
        best = color;
        bestLen = pattern.length;
      }
    }
    if (best) return best;
    const fallback = String(themeSettings.defaultColor || '').trim();
    return COLOR_RE.test(fallback) ? fallback : '';
  }

  function applyTheme() {
    const color = resolveThemeColor();
    let style = document.getElementById(THEME_STYLE_ID);
    if (!color) {
      if (style) style.remove();
    } else {
      if (!style) {
        style = document.createElement('style');
        style.id = THEME_STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      // 手动指定颜色时不再使用默认的浅灰透明度，保证颜色与设置一致
      style.textContent =
        '.dsh-tr{color:' + color + ' !important;opacity:1 !important;}' +
        '.dsh-tr.dsh-loading{opacity:.45 !important;}';
    }
    refreshAutoColors();
  }

  // 未手动指定颜色时，按每段原文所在的背景自动计算译文颜色；手动颜色优先
  // nodes 为空时刷新全部译文（设置变化时使用），否则只刷新指定的译文（新译文返回时使用）
  function refreshAutoColors(nodes) {
    const manual = !!resolveThemeColor();
    const auto = themeSettings.autoColor && !manual;
    const list = nodes || document.querySelectorAll('.dsh-tr');
    list.forEach((node) => {
      if (node.classList.contains('dsh-loading') || node.classList.contains('dsh-error')) return;
      const src = node._dshSrc;
      if (auto && src && src.isConnected) {
        node.style.color = autoTranslationColor(src);
        node.style.opacity = '1';
      } else {
        node.style.color = '';
        node.style.opacity = '';
      }
    });
  }

  chrome.storage.local.get({ siteColors: {}, defaultColor: '', autoColor: true }, (data) => {
    themeSettings = {
      siteColors: data.siteColors || {},
      defaultColor: data.defaultColor || '',
      autoColor: data.autoColor !== false
    };
    applyTheme();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.siteColors) themeSettings.siteColors = changes.siteColors.newValue || {};
    if (changes.defaultColor) themeSettings.defaultColor = changes.defaultColor.newValue || '';
    if (changes.autoColor) themeSettings.autoColor = changes.autoColor.newValue !== false;
    applyTheme();
  });

  let enabled = false;
  let epoch = 0;             // 每次关闭翻译都会递增，用于丢弃过期响应
  let seen = new WeakSet();  // 已观察/已处理的元素
  let queue = [];
  let active = 0;
  let io = null;
  let mo = null;
  let rescanTimer = null;

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  // 只翻译以拉丁字母为主的英文文本，中文/日文/韩文内容不处理
  function isTranslatable(text) {
    if (text.length < 2) return false;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    if (latin < 3) return false;
    const cjk = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    return cjk < latin * 0.3;
  }

  function collectCandidates() {
    const out = [];
    document.body.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
      if (seen.has(el)) return;
      if (el.closest(SKIP_SELECTOR)) return;
      if (el.querySelector(BLOCK_SELECTOR)) return;
      if (!el.getClientRects().length) return; // 隐藏元素
      if (!isTranslatable(normalize(el.innerText))) return;
      out.push(el);
    });
    return out;
  }

  function scan() {
    if (!enabled) return;
    const found = collectCandidates();
    for (const el of found) {
      seen.add(el);
      io.observe(el);
    }
    // 便于排查“某块内容没被翻译”：控制台会显示每个 frame 新发现的段落数
    if (found.length) {
      console.info(
        '[AI网页翻译] ' + (window.top === window ? '主文档' : 'iframe') +
        ' 新发现 ' + found.length + ' 个待翻译段落'
      );
    }
  }

  function placeNode(el, node) {
    if (APPEND_INSIDE.has(el.tagName)) el.appendChild(node);
    else el.insertAdjacentElement('afterend', node);
  }

  // 行内元素（如页面顶部的日期时间）或多个并列项（flex/grid 子项）：
  // 译文接在同一行，避免破坏原有排版
  function useInline(el) {
    if (APPEND_INSIDE.has(el.tagName)) return false;
    const own = getComputedStyle(el).display;
    if (/^inline/.test(own)) return true;
    const parent = el.parentElement;
    if (!parent) return false;
    return /flex|grid/.test(getComputedStyle(parent).display);
  }

  function trClass(inline, extra) {
    return 'dsh-tr' + (inline ? ' dsh-tr-inline' : '') + (extra ? ' ' + extra : '');
  }

  function enqueue(els) {
    for (const el of els) {
      if (!el.isConnected) continue;
      const text = normalize(el.innerText);
      if (!isTranslatable(text)) continue;
      const inline = useInline(el);
      const ph = document.createElement('span');
      ph._dshSrc = el;
      ph.className = trClass(inline, 'dsh-loading');
      ph.textContent = inline ? '…' : '翻译中…';
      if (inline) el.insertAdjacentElement('afterend', ph);
      else placeNode(el, ph);
      queue.push({ el, ph, text, inline });
    }
    pump();
  }

  function retry(item) {
    item.ph.className = trClass(item.inline, 'dsh-loading');
    item.ph.textContent = item.inline ? '…' : '翻译中…';
    item.ph.onclick = null;
    item.ph.title = '';
    queue.push(item);
    pump();
  }

  function applyResults(batch, res) {
    batch.forEach((item, i) => {
      const { ph } = item;
      if (!ph.isConnected) return;
      if (res && res.ok && res.result && res.result[i] !== undefined) {
        ph.className = trClass(item.inline);
        ph.textContent = res.result[i];
        refreshAutoColors([ph]);
      } else {
        ph.className = trClass(item.inline, 'dsh-error');
        ph.textContent = '翻译失败，点击重试：' + ((res && res.error) || '未知错误');
        ph.title = '点击重试';
        ph.onclick = () => retry(item);
      }
    });
  }

  function pump() {
    while (active < MAX_CONCURRENCY && queue.length) {
      const batch = [];
      let chars = 0;
      while (queue.length && batch.length < MAX_ITEMS) {
        const next = queue[0];
        if (batch.length && chars + next.text.length > MAX_CHARS) break;
        batch.push(queue.shift());
        chars += next.text.length;
      }
      active++;
      const ep = epoch;
      try {
        chrome.runtime.sendMessage(
          { type: 'translate', texts: batch.map((b) => b.text) },
          (res) => {
            void chrome.runtime.lastError;
            active--;
            if (ep === epoch) applyResults(batch, res);
            pump();
          }
        );
      } catch (err) {
        active--;
        applyResults(batch, { ok: false, error: '扩展已重新加载，请刷新页面' });
      }
    }
  }

  function enable() {
    if (!document.body) return; // 极早期加载的 about:blank frame 还没有 body
    enabled = true;
    showFloatingBar();
    seen = new WeakSet();
    io = new IntersectionObserver(
      (entries) => {
        const ready = [];
        for (const e of entries) {
          if (e.isIntersecting) {
            io.unobserve(e.target);
            ready.push(e.target);
          }
        }
        if (ready.length) enqueue(ready);
      },
      { rootMargin: '600px 0px' }
    );
    // 动态加载的内容：防抖后重新扫描
    mo = new MutationObserver(() => {
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(scan, 700);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
  }

  function disable() {
    enabled = false;
    epoch++;
    queue = [];
    clearTimeout(rescanTimer);
    if (io) io.disconnect();
    if (mo) mo.disconnect();
    io = null;
    mo = null;
    seen = new WeakSet();
    document.querySelectorAll('.dsh-tr').forEach((n) => n.remove());
    removeFloatingBar();
  }

  // ---------- 划词翻译 ----------
  let selIcon = null;
  let bubble = null;
  let floatingBar = null;

  function removeFloatingBar() {
    if (floatingBar) floatingBar.remove();
    floatingBar = null;
  }

  function showFloatingBar() {
    if (window.top !== window) return;
    removeFloatingBar();
    const bar = document.createElement('div');
    bar.className = 'dsh-ui dsh-floating-bar';
    const label = document.createElement('span');
    label.className = 'dsh-floating-label';
    label.textContent = '正在翻译网页…';
    const close = document.createElement('button');
    close.className = 'dsh-floating-action';
    close.textContent = '关闭翻译';
    close.addEventListener('click', () => {
      disable();
      reportPageState(false);
    });
    const settings = document.createElement('button');
    settings.className = 'dsh-floating-action';
    settings.textContent = '设置';
    settings.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-options' }));
    bar.append(label, close, settings);
    (document.body || document.documentElement).appendChild(bar);
    floatingBar = bar;
  }

  function removeIcon() {
    if (selIcon) selIcon.remove();
    selIcon = null;
  }

  function removeBubble() {
    if (bubble) bubble.remove();
    bubble = null;
  }

  function isEditableSelection(sel) {
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest('input,textarea,[contenteditable=""],[contenteditable="true"]'));
  }

  // 取选区起点/终点所在字符的矩形：整行的外接矩形会把图标顶到行尾
  function edgeCharRect(range, which) {
    const node = which === 'start' ? range.startContainer : range.endContainer;
    const offset = which === 'start' ? range.startOffset : range.endOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const len = node.length;
    if (!len) return null;
    let from;
    let to;
    if (which === 'start') {
      from = Math.min(offset, len - 1);
      to = Math.min(len, from + 1);
    } else {
      to = Math.max(1, Math.min(offset, len));
      from = to - 1;
    }
    if (to <= from) return null;
    const r = document.createRange();
    try {
      r.setStart(node, from);
      r.setEnd(node, to);
    } catch (e) {
      return null;
    }
    const rect = r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return rect;
  }

  // 图标贴着文字末尾：默认放在选区终点，若鼠标松开处更靠近起点则放在起点
  function selectionAnchorRect(range, x, y) {
    const startRect = edgeCharRect(range, 'start');
    const endRect = edgeCharRect(range, 'end');
    if (startRect && endRect && Number.isFinite(x) && Number.isFinite(y)) {
      const dStart = Math.hypot(startRect.right - x, startRect.bottom - y);
      const dEnd = Math.hypot(endRect.right - x, endRect.bottom - y);
      return dStart < dEnd ? startRect : endRect;
    }
    return endRect || startRect || range.getBoundingClientRect();
  }

  function showIcon(rect, text) {
    removeIcon();
    const btn = document.createElement('button');
    btn.className = 'dsh-ui dsh-sel-icon';
    btn.textContent = '译';
    btn.title = '翻译选中内容';
    // 贴着选中文字末尾，垂直居中于最后一行；空间不足时翻到文字上方
    const size = 28;
    const gap = 8;
    let left = rect.right + gap;
    let top = rect.top + rect.height / 2 - size / 2;
    if (top + size > window.innerHeight - 4) top = rect.top - size - gap;
    left = Math.max(4, Math.min(left, window.innerWidth - size - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - size - 4));
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    // 阻止 mousedown 清除选区
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeIcon();
      showBubble(rect, text);
    });
    document.body.appendChild(btn);
    selIcon = btn;
  }

  function showBubble(rect, text) {
    removeBubble();
    const box = document.createElement('div');
    box.className = 'dsh-ui dsh-bubble';

    const header = document.createElement('div');
    header.className = 'dsh-bubble-header';
    const title = document.createElement('span');
    title.textContent = '译文';
    const close = document.createElement('button');
    close.className = 'dsh-bubble-close';
    close.textContent = '×';
    close.title = '关闭';
    close.addEventListener('click', removeBubble);
    header.append(title, close);

    const body = document.createElement('div');
    body.className = 'dsh-bubble-body dsh-loading';
    body.textContent = '翻译中…';

    box.append(header, body);
    document.body.appendChild(box);

    const width = 340;
    box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    box.style.top = (rect.bottom + 10 > window.innerHeight - 120 ? Math.max(8, rect.top - 130) : rect.bottom + 10) + 'px';
    bubble = box;

    try {
      chrome.runtime.sendMessage({ type: 'translate', texts: [text] }, (res) => {
        void chrome.runtime.lastError;
        if (bubble !== box) return; // 气泡已关闭或被替换
        if (res && res.ok) {
          body.className = 'dsh-bubble-body';
          body.textContent = res.result[0];
        } else {
          body.className = 'dsh-bubble-body dsh-error';
          body.textContent = (res && res.error) || '翻译失败，请检查扩展设置';
        }
      });
    } catch (err) {
      body.className = 'dsh-bubble-body dsh-error';
      body.textContent = '扩展已重新加载，请刷新页面';
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target && e.target.closest && e.target.closest('.dsh-ui')) return;
    setTimeout(() => {
      removeIcon();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const text = sel.toString().trim();
      if (!text || text.length > 2000) return;
      if (isEditableSelection(sel)) return;
      const rect = selectionAnchorRect(sel.getRangeAt(0), e.clientX, e.clientY);
      showIcon(rect, text);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (bubble && !bubble.contains(e.target)) removeBubble();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeBubble();
      removeIcon();
    }
  });

  window.addEventListener('scroll', removeIcon, { passive: true });

  // ---------- 消息 ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'toggle-page') {
      if (enabled) disable();
      else enable();
      // 记录状态，供之后加载的 iframe 同步
      reportPageState(enabled);
      sendResponse({ enabled });
    } else if (msg?.type === 'set-page') {
      if (msg.enabled && !enabled) enable();
      else if (!msg.enabled && enabled) disable();
      sendResponse({ enabled });
    } else if (msg?.type === 'status') {
      sendResponse({ enabled });
    } else if (msg?.type === 'translate-selection') {
      const text = String(msg.text || '').trim();
      if (text) {
        const sel = window.getSelection();
        const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
        showBubble(rect && (rect.width || rect.height) ? rect : {
          left: Math.max(8, window.innerWidth / 2 - 170),
          top: Math.max(8, window.innerHeight / 2 - 80),
          right: Math.max(8, window.innerWidth / 2 + 170),
          bottom: Math.max(8, window.innerHeight / 2 - 40)
        }, text);
      }
      sendResponse({ ok: true });
    }
    return false;
  });

  function reportPageState(state) {
    try {
      chrome.runtime.sendMessage({ type: 'page-state', enabled: !!state }, () => void chrome.runtime.lastError);
    } catch (e) {
      // 扩展重新加载时会抛错，忽略
    }
  }

  // 新加载的 frame（如邮件正文 iframe）询问当前标签页是否已开启翻译
  try {
    chrome.runtime.sendMessage({ type: 'get-page-state' }, (res) => {
      void chrome.runtime.lastError;
      if (res && res.enabled && !enabled) enable();
    });
  } catch (e) {
    // 忽略
  }

  // 便于在控制台排查：__dshTranslate.count() 查看已插入的译文数量
  window.__dshTranslate = {
    enabled: () => enabled,
    count: () => document.querySelectorAll('.dsh-tr').length
  };
})();
