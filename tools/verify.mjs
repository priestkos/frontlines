// Verifies the sites in headless Chrome over CDP (Node's global WebSocket, no dependencies).
//   node tools/verify.mjs          both local pages: un-hides every tab panel, forces reveals,
//                                  measures chart geometry and canvas paint, rewrites the previews
//   node tools/verify.mjs URL...   any pages as they load (live site included): no forcing, no
//                                  screenshots, console warnings count as problems too
import { spawn } from 'node:child_process';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findChrome() {
  const direct = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of direct) if (existsSync(c)) return c;
  // Browser download caches (puppeteer / playwright), found without hardcoding a home path.
  const roots = [
    process.env.USERPROFILE && join(process.env.USERPROFILE, '.cache', 'puppeteer', 'chrome'),
    process.env.HOME && join(process.env.HOME, '.cache', 'puppeteer', 'chrome'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
  ].filter(Boolean);
  const subs = [
    'chrome-win64/chrome.exe', 'chrome-win32/chrome.exe',
    'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      for (const sub of subs) {
        const p = join(root, entry, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return 'google-chrome';
}
const CHROME = findChrome();
const urls = process.argv.slice(2);
const asIs = urls.length > 0;
const PORT = asIs ? 9333 : 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), asIs ? 'cdp-' : 'cdp2-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  ...(asIs ? ['--no-default-browser-check', '--disable-extensions'] : []),
  '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  ...(asIs ? [] : ['--window-size=1440,900']), 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools endpoint');
}

const PREP = `(() => {
  document.querySelectorAll('[hidden]').forEach(e => e.removeAttribute('hidden'));
  document.querySelectorAll('.rise').forEach(e => e.classList.add('in'));
  return 1; })()`;

const MEASURE = `(() => {
  const de = document.documentElement;
  const charts = [...document.querySelectorAll('svg.chart-svg, svg.cs')].slice(0, 6).map((s) => {
    const r = s.getBoundingClientRect();
    const paths = [...s.querySelectorAll('path')].map(p => Math.round(p.getBoundingClientRect().width));
    return { w: Math.round(r.width), h: Math.round(r.height), paths, widest: Math.max(0, ...paths) };
  });
  const canvasPaint = [...document.querySelectorAll('canvas')].map((c) => {
    let lit = 0;
    try {
      const ctx = c.getContext('2d');
      for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) {
        const x = Math.max(0, Math.floor(c.width * i / 5) - 20), y = Math.max(0, Math.floor(c.height * j / 5) - 20);
        const d = ctx.getImageData(x, y, 40, 40).data;
        for (let k = 3; k < d.length; k += 4) if (d[k] > 0) lit++;
      }
    } catch (e) { return { err: String(e) }; }
    return { w: c.width, h: c.height, litPixels: lit };
  });
  const hiddenLeft = [...document.querySelectorAll('.rise')]
    .filter(e => getComputedStyle(e).opacity === '0').length;
  return JSON.stringify({
    title: document.title,
    overflowX: de.scrollWidth > innerWidth + 1,
    scrollW: de.scrollWidth, innerW: innerWidth, scrollH: de.scrollHeight,
    textChars: (document.body.innerText || '').length,
    headings: document.querySelectorAll('h1,h2,h3,h4').length,
    tables: document.querySelectorAll('table').length,
    tableRows: document.querySelectorAll('table tr').length,
    codeBlocks: document.querySelectorAll('pre').length,
    svg: document.querySelectorAll('svg').length,
    charts, canvasPaint, hiddenLeft
  });
})()`;

const MEASURE_ASIS = `(() => {
  const de = document.documentElement;
  const vis = (el) => { const s = getComputedStyle(el); return s.opacity !== '0' && s.visibility !== 'hidden'; };
  const charts = [...document.querySelectorAll('svg.chart-svg, svg.cs')].map((s) => {
    const r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), paths: s.querySelectorAll('path').length };
  });
  const riseHidden = [...document.querySelectorAll('.rise')].filter((e) => !vis(e)).length;
  const blocks = [...document.querySelectorAll('.panel, .pan, .plate, .sec')];
  return JSON.stringify({
    title: document.title,
    h1: (document.querySelector('h1') || {}).textContent || null,
    overflowX: de.scrollWidth > innerWidth + 1,
    scrollW: de.scrollWidth, innerW: innerWidth, scrollH: de.scrollHeight,
    textChars: (document.body.innerText || '').length,
    headings: document.querySelectorAll('h1,h2,h3,h4').length,
    tables: document.querySelectorAll('table').length,
    svg: document.querySelectorAll('svg').length,
    canvas: document.querySelectorAll('canvas').length,
    canvasPainted: [...document.querySelectorAll('canvas')].map((c) => {
      try { const d = c.getContext('2d').getImageData(0, 0, Math.min(60, c.width), Math.min(60, c.height)).data;
        let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; return lit; } catch (e) { return -1; }
    }),
    charts,
    riseHidden,
    blocksWithHeight: blocks.filter((b) => b.getBoundingClientRect().height > 40).length,
    blocksTotal: blocks.length,
    animatedPath: [...document.querySelectorAll('path[style*="stroke-dashoffset"]')].length
  });
})()`;

let ws, failed = false;
const problems = []; // outside the try: the exit code below reads it
try { // finally: never orphan Chrome or its profile, even when wsUrl() throws
ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let id = 1;
const rpc = (method, params = {}) => new Promise((resolve) => {
  const myId = id++;
  const on = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id === myId) { ws.removeEventListener('message', on); resolve(m); } };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
await rpc('Page.enable'); await rpc('Runtime.enable');
ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(ev.data); } catch { return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params?.exceptionDetails;
    problems.push('EXCEPTION ' + (d?.text || '') + (asIs ? ' ' + (d?.exception?.description || '').split('\n')[0] : ''));
  }
  if (m.method !== 'Runtime.consoleAPICalled') return;
  const args = m.params.args.map((a) => a.value ?? a.description).join(' ');
  if (asIs && ['error', 'warning'].includes(m.params.type)) problems.push(m.params.type.toUpperCase() + ' ' + args);
  if (!asIs && m.params.type === 'error') problems.push('CONSOLE ' + args);
});

if (asIs) {
  for (const url of urls) {
    await rpc('Page.navigate', { url });
    await sleep(3800);
    const r = await rpc('Runtime.evaluate', { expression: MEASURE_ASIS, returnByValue: true, awaitPromise: false });
    let data = null; try { data = JSON.parse(r.result?.result?.value ?? 'null'); } catch {}
    console.log('\n=== ' + url.split('/').slice(-2).join('/'));
    console.log(JSON.stringify(data, null, 1));
    if (!data || data.overflowX || data.riseHidden) failed = true;
  }
  console.log('\n=== JS problems seen: ' + problems.length);
  problems.slice(0, 14).forEach((p) => console.log('  ' + p));
} else {
  const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const targets = ['woodblock-codex', 'plotting-table']
    .map((d) => [pathToFileURL(join(REPO, d, 'index.html')).href, join(REPO, d, 'preview.png')]);
  for (const [url, shot] of targets) {
    await rpc('Page.navigate', { url });
    await sleep(3400);
    await rpc('Runtime.evaluate', { expression: PREP, returnByValue: true });
    await sleep(1400);                       // let counters + chart animations run
    const r = await rpc('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    let data = null; try { data = JSON.parse(r.result?.result?.value ?? 'null'); } catch {}
    console.log('\n=== ' + url.split('/').slice(-2)[0]);
    console.log(JSON.stringify(data, null, 1));
    if (!data || data.overflowX || data.hiddenLeft) failed = true;
    const cap = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (cap.result?.data) { writeFileSync(shot, Buffer.from(cap.result.data, 'base64')); console.log('screenshot -> ' + shot); }
  }
  console.log('\nJS problems: ' + problems.length); problems.slice(0, 10).forEach((p) => console.log('  ' + p));
}
} finally {
  ws?.close(); chrome.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {}
}
process.exit(failed || problems.length ? 1 : 0);
