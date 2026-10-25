const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');

const DEFAULT_WHALE = 210;
const RATIO = 1.62;
const winFor = (w) => Math.round(Math.max(150, Math.min(420, w)) * RATIO);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let cfg = { whale: DEFAULT_WHALE, x: null, y: null, alwaysOnTop: true, autostart: false };
let balCache = { at: 0, data: null };
const cfgFile = () => path.join(app.getPath('userData'), 'pet.json');
function log() {
  try {
    const line = new Date().toISOString() + ' ' + Array.prototype.slice.call(arguments).join(' ') + String.fromCharCode(13, 10);
    fs.appendFileSync(path.join(app.getPath('userData'), 'pet.log'), line);
  } catch (e) {}
}
process.on('uncaughtException', (e) => log('uncaught', (e && e.stack) || e));
process.on('unhandledRejection', (e) => log('unhandledRejection', (e && e.stack) || e));

function loadCfg() {
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgFile(), 'utf8'))); } catch (e) {}
}
function saveCfg() { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch (e) {} }

function claudeKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
    const env = s.env || {};
    const base = String(env.ANTHROPIC_BASE_URL || '');
    if (base && base.indexOf('deepseek') < 0) return '';
    return env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '';
  } catch (e) { return ''; }
}

function httpsGet(host, p, headers, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path: p, method: 'GET', headers: headers, timeout: timeout || 8000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

const bjNow = () => new Date(Date.now() + 8 * 3600e3);
const bjDay = () => bjNow().toISOString().slice(0, 10);
function isPeak() {
  const d = bjNow();
  const dow = d.getUTCDay();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (dow === 0 || dow === 6) return false;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

function acct() {
  const f = path.join(app.getPath('userData'), 'account.json');
  let s = {};
  try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  if (s.day !== bjDay()) { s = { day: bjDay(), spent: 0, recharged: 0, last: s.last }; }
  s._file = f;
  return s;
}

async function balance(force) {
  if (!force && balCache.data && Date.now() - balCache.at < 30000) return balCache.data;
  const key = claudeKey();
  if (!key) return { ok: false, error: '未找到 DeepSeek key' };
  try {
    const d = await httpsGet('api.deepseek.com', '/user/balance', { Authorization: 'Bearer ' + key, Accept: 'application/json' }, 10000);
    const info = (d.balance_infos || [])[0] || {};
    const total = Number(info.total_balance);
    const st = acct();
    if (typeof st.last === 'number' && st.day === bjDay()) {
      const delta = total - st.last;
      if (delta < 0) st.spent = (st.spent || 0) - delta;
      else if (delta > 0) st.recharged = (st.recharged || 0) + delta;
    }
    st.last = total;
    try { fs.writeFileSync(st._file, JSON.stringify(st)); } catch (e) {}
    const out = {
      ok: true,
      total: total,
      currency: info.currency || 'CNY',
      bonus: Number(info.granted_balance || 0),
      used: Number((st.spent || 0).toFixed(4)),
      isPeak: isPeak(),
      at: Date.now()
    };
    balCache = { at: Date.now(), data: out };
    return out;
  } catch (e) {
    log('balance failed:', String((e && e.message) || e));
    if (balCache.data) return Object.assign({}, balCache.data, { stale: true });
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function defaultPos(w) {
  const a = workArea();
  return { x: a.x + a.width - w - 40, y: a.y + a.height - w - 20 };
}

function createWindow() {
  loadCfg();
  const wsize = winFor(cfg.whale || DEFAULT_WHALE);
  let pos = (cfg.x === null || cfg.y === null) ? defaultPos(wsize) : { x: cfg.x, y: cfg.y };
  const a0 = workArea();
  if (pos.x < a0.x - wsize * 0.5 || pos.x > a0.x + a0.width - wsize * 0.5 ||
      pos.y < a0.y - wsize * 0.4 || pos.y > a0.y + a0.height - wsize * 0.3) {
    pos = defaultPos(wsize);
  }
  win = new BrowserWindow({
    width: wsize,
    height: wsize,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: !!cfg.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setAlwaysOnTop(!!cfg.alwaysOnTop, 'screen-saver');
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('cfg', { whale: cfg.whale || DEFAULT_WHALE });
    win.setIgnoreMouseEvents(true, { forward: true });
  });
  win.on('closed', () => { win = null; });
  let moveTimer = null;
  win.on('moved', () => {
    if (!win) return;
    const [x, y] = win.getPosition();
    cfg.x = x; cfg.y = y;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(saveCfg, 250);
  });
  setInterval(async () => {
    if (!win) return;
    win.webContents.send('data', await balance(false));
  }, 60000);
}

let drag = null;
let hitRect = null;
let whaleBox = null;
let lastInside = null;
ipcMain.on('hit', (e, r) => {
  if (!r) return;
  hitRect = { l: r.l, t: r.t, r: r.r, b: r.b };
  if (typeof r.wl === 'number') whaleBox = { l: r.wl, t: r.wt, r: r.wr, b: r.wb };
});

// 鲸鱼可见矩形（相对窗口）；渲染进程还没上报时退化成整个窗口
function visibleBox(w, h) {
  return whaleBox || { l: 0, t: 0, r: w, b: h };
}
const SNAP_PX = 26;    // 距离屏幕边多少像素内自动吸附
const OUT_RATIO = 0;   // 不允许鲸鱼出屏（0 = 贴边为止）

// 把窗口位置夹住并吸附到工作区边缘，返回 {x, y, sx, sy}（sx/sy 表示贴在哪条边）
function snapPos(nx, ny, w, h, a) {
  const b = visibleBox(w, h);
  const bw = b.r - b.l, bh = b.b - b.t;
  const padX = Math.round(bw * OUT_RATIO), padY = Math.round(bh * OUT_RATIO);
  nx = Math.max(a.x - b.l - padX, Math.min(a.x + a.width - b.r + padX, nx));
  ny = Math.max(a.y - b.t - padY, Math.min(a.y + a.height - b.b + padY, ny));
  let sx = 0, sy = 0;
  if (Math.abs(nx + b.l - a.x) <= SNAP_PX) { nx = Math.round(a.x - b.l); sx = -1; }
  else if (Math.abs(nx + b.r - (a.x + a.width)) <= SNAP_PX) { nx = Math.round(a.x + a.width - b.r); sx = 1; }
  if (Math.abs(ny + b.t - a.y) <= SNAP_PX) { ny = Math.round(a.y - b.t); sy = -1; }
  else if (Math.abs(ny + b.b - (a.y + a.height)) <= SNAP_PX) { ny = Math.round(a.y + a.height - b.b); sy = 1; }
  return { x: nx, y: ny, sx: sx, sy: sy };
}

let lastDragEnd = 0;
function syncHitTest() {
  if (!win || drag) return;
  if (Date.now() - lastDragEnd < 400) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  let inside = true;
  if (hitRect) {
    const pad = 6;
    inside = p.x >= b.x + hitRect.l - pad && p.x <= b.x + hitRect.r + pad &&
             p.y >= b.y + hitRect.t - pad && p.y <= b.y + hitRect.b + pad;
  }
  if (inside !== lastInside) {
    lastInside = inside;
    win.setIgnoreMouseEvents(!inside, { forward: true });
  }
}
setInterval(syncHitTest, 50);

let pinned = null;
ipcMain.on('drag:start', () => {
  if (!win) return;
  win.setIgnoreMouseEvents(false);
  const fixed = winFor(cfg.whale || DEFAULT_WHALE);
  pinned = { w: fixed, h: fixed };
  const p = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  drag = { ox: p.x - x, oy: p.y - y, w: w, h: h, sx: 0, sy: 0 };
  log('drag:start at', x + ',' + y, 'size', w + 'x' + h);
});
ipcMain.on('drag:move', () => {
  if (!win || !drag) return;
  const p = screen.getCursorScreenPoint();
  const [w, h] = win.getSize();
  if (drag.w && (Math.abs(w - drag.w) > 2 || Math.abs(h - drag.h) > 2)) {
    drag.n = (drag.n || 0) + 1;
    if (drag.n < 6) log('drag:size-drift', w + 'x' + h, 'expected', drag.w + 'x' + drag.h, 'bounds', JSON.stringify(win.getBounds()));
  }
  const a = screen.getDisplayNearestPoint(p).workArea;
  let nx = Math.round(p.x - drag.ox);
  let ny = Math.round(p.y - drag.oy);
  const sp = snapPos(nx, ny, w, h, a);
  nx = sp.x; ny = sp.y;
  if (sp.sx !== drag.sx || sp.sy !== drag.sy) {
    drag.sx = sp.sx; drag.sy = sp.sy;
    log('snap', sp.sx + ',' + sp.sy);
  }
  // 每次都用 setBounds 显式带尺寸：只调 setPosition 时 Windows 会偶尔把窗口拉长
  win.setBounds({ x: nx, y: ny, width: pinned ? pinned.w : w, height: pinned ? pinned.h : h });
});
ipcMain.on('drag:end', () => {
  const wasDragging = !!drag;
  drag = null;
  if (!win) return;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  if (wasDragging) log('drag:end at', x + ',' + y, 'size', w + 'x' + h);
  lastDragEnd = Date.now();
  lastInside = null;
  const a = workArea();
  const sp = snapPos(x, y, w, h, a);
  const nx = sp.x, ny = sp.y;
  const bw = pinned ? pinned.w : w;
  const bh = pinned ? pinned.h : h;
  win.setBounds({ x: nx, y: ny, width: bw, height: bh });
  pinned = null;
  cfg.x = nx; cfg.y = ny; saveCfg();
});

ipcMain.handle('balance', async () => balance(true));

ipcMain.on('ignore', (e, flag) => {
  if (win) win.setIgnoreMouseEvents(!!flag, { forward: true });
});

function clampBounds(b) {
  const a = screen.getDisplayNearestPoint({ x: b.x + Math.round(b.width / 2), y: b.y + Math.round(b.height / 2) }).workArea;
  b.x = Math.min(Math.max(b.x, a.x), a.x + a.width - b.width);
  b.y = Math.min(Math.max(b.y, a.y), a.y + a.height - b.height);
  return b;
}

function applyWhaleSize(w) {
  if (!win) return null;
  w = Math.max(150, Math.min(420, Math.round(Number(w) || DEFAULT_WHALE)));
  cfg.whale = w;
  const size = winFor(w);
  const c = win.getBounds();
  const b = clampBounds({
    x: c.x + Math.round((c.width - size) / 2),
    y: c.y + (c.height - size),
    width: size,
    height: size
  });
  win.setBounds(b);
  cfg.x = b.x; cfg.y = b.y;
  saveCfg();
  log('resize', w, '->', JSON.stringify(b), 'cfg', cfg.x + ',' + cfg.y);
  return b;
}

ipcMain.on('resize', (e, whalePx) => { applyWhaleSize(whalePx); });

ipcMain.on('autostart', (e, on) => { setAutostart(!!on); });

function startupDir() {
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}
function setAutostart(on) {
  const lnk = path.join(startupDir(), '小鲸鱼桌宠.vbs');
  try {
    if (on) {
      const exe = process.execPath;
      const body = 'Set s = CreateObject("WScript.Shell")\r\ns.Run """' + exe + '"" ""' + __dirname + '""", 0, False\r\n';
      fs.writeFileSync(lnk, body, 'utf8');
    } else if (fs.existsSync(lnk)) fs.unlinkSync(lnk);
    cfg.autostart = on; saveCfg();
  } catch (e) {}
}

ipcMain.on('quit', () => app.quit());

ipcMain.on('menu', () => {
  if (!win) return;
  Menu.buildFromTemplate([
    { label: '刷新余额', click: async () => { win.webContents.send('data', await balance(true)); } },
    { type: 'separator' },
    { label: '总在最前', type: 'checkbox', checked: !!cfg.alwaysOnTop, click: (mi) => {
      cfg.alwaysOnTop = mi.checked; saveCfg(); win.setAlwaysOnTop(mi.checked, 'screen-saver');
    } },
    { label: '开机自启', type: 'checkbox', checked: !!cfg.autostart, click: (mi) => setAutostart(mi.checked) },
    { label: '打开设置', click: () => win.webContents.send('openSettings') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]).popup({ window: win });
});

app.on('second-instance', () => {
  log('second-instance');
  if (win) {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
    win.webContents.send('ping');
  }
});

app.whenReady().then(() => {
  log('app ready, starting window');
  createWindow();
  if (process.env.WHALE_TEST_RESIZE) {
    [150, 300, 420, 210].forEach((v, i) => setTimeout(() => applyWhaleSize(v), 4000 + i * 1500));
  }
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
