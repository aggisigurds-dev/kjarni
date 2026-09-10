/**
 * Real-browser smoke test for 3dwork's cross-computer project sync and the
 * Drive connect button.
 *
 *   node tools/3dwork-sync-smoke.cjs http://localhost:4140
 *
 * "Computer A" imports a part (a generated binary STL) into a fresh project and
 * lets the bench push it to Supabase by itself. "Computer B" is a second,
 * empty browser profile: it must list that project in the Projects switcher,
 * open it with the part in place, and — after A adds a second part — see the
 * new part when its tab comes back into focus. The test project is deleted
 * from Supabase at the end (soft delete + row/object cleanup).
 *
 * Runs with the global Playwright: NODE_PATH=/opt/node22/lib/node_modules.
 * In a Claude Code web/remote session plain Chromium cannot reach Supabase
 * (net::ERR_CONNECTION_RESET — the egress proxy rejects Chromium's ECH GREASE
 * TLS extension), so the browser is launched through the slokkvitaeki repo's
 * TLS-splitting relay when it is present, and plainly otherwise.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const RELAY = '/home/user/slokkvitaeki/tools/bh-browser.cjs';
async function launchBrowser() {
  if (fs.existsSync(RELAY)) {
    const { context, cleanup } = await require(RELAY).launch();
    const browser = context.browser();
    return { browser, contextA: context, cleanup };
  }
  const browser = await chromium.launch();
  return { browser, contextA: await browser.newContext(), cleanup: () => browser.close() };
}

const BASE = process.argv[2] || 'http://localhost:4140';
const TAG = `smoke-${Date.now().toString(36)}`;
const SUPABASE = 'https://osfdzskyvisifcwyjkuk.supabase.co';
const KEY = 'sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Binary STL of an axis-aligned box, size mm. */
function boxStl(size = 20) {
  const s = size / 2;
  const v = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.write('kjarni smoke box', 0, 'ascii');
  buf.writeUInt32LE(faces.length, 80);
  let off = 84;
  for (const f of faces) {
    buf.writeFloatLE(0, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(1, off + 8);
    off += 12;
    for (const i of f) {
      buf.writeFloatLE(v[i][0], off); buf.writeFloatLE(v[i][1], off + 4); buf.writeFloatLE(v[i][2], off + 8);
      off += 12;
    }
    buf.writeUInt16LE(0, off); off += 2;
  }
  return buf;
}

async function sbFetch(path, init = {}) {
  const r = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
}

async function cloudRow(name) {
  const { json } = await sbFetch(`work3d_projects?name=eq.${encodeURIComponent(name)}&select=id,name,part_count,deleted,updated_at`);
  return Array.isArray(json) ? json[0] : null;
}

async function openBench(page) {
  await page.goto(`${BASE}/3dwork`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // Over a slow link (production through the TLS relay) the first click can
  // land before React has hydrated and is simply lost — click until the bench
  // answers.
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.getByRole('button', { name: /^3D bench$/i }).click({ timeout: 30000 }).catch(() => {});
    const opened = await page
      .getByRole('button', { name: /^Projects · \d+$/ })
      .waitFor({ timeout: attempt === 7 ? 60000 : 8000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
    if (await page.getByText('Starting the 3D bench').isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /^Projects · \d+$/ }).waitFor({ timeout: 60000 });
      return;
    }
  }
  throw new Error('3D bench did not open');
}

async function projectsMenu(page) {
  // A menu left open by an earlier step would be toggled shut by the click.
  if (await page.locator('[data-3dwork-menu]').count()) {
    await page.keyboard.press('Escape');
    await page.locator('[data-3dwork-menu]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  }
  await page.getByRole('button', { name: /^Projects · \d+$/ }).click();
  const menu = page.locator('[data-3dwork-menu]');
  await menu.waitFor({ timeout: 5000 });
  return menu;
}

/** New project, then wait until the bench really shows the fresh one before touching it. */
async function newProject(page, name) {
  const menu = await projectsMenu(page);
  await menu.getByText('New project').click();
  const nameInput = page.getByLabel('Project name');
  await waitFor(async () => (await nameInput.inputValue()) === 'New build', 10000, 200);
  await page.waitForTimeout(400);
  await nameInput.fill(name);
  await waitFor(async () => (await nameInput.inputValue()) === name, 5000, 200);
}

async function importBox(page, name, size) {
  const input = page.locator('input[type=file][accept=".stl,.3mf"]').first();
  await input.setInputFiles({ name, mimeType: 'application/octet-stream', buffer: boxStl(size) });
}

async function waitFor(fn, ms, every = 1000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}

(async () => {
  const { browser, contextA: ctxA, cleanup } = await launchBrowser();
  const ctxB = await browser.newContext({ ignoreHTTPSErrors: true });
  const errors = [];
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.setViewportSize({ width: 1400, height: 900 });
  await B.setViewportSize({ width: 1400, height: 900 });
  for (const [label, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', (e) => errors.push(`[${label}] ${String(e).slice(0, 200)}`));
    p.on('dialog', (d) => d.accept());
    // Toasts live ~4 s; keep every one that ever appeared.
    await p.addInitScript(() => {
      window.__toasts = [];
      const start = () => {
        if (!document.documentElement) return setTimeout(start, 20);
        new MutationObserver(() => {
          for (const el of document.querySelectorAll('[data-sonner-toast]')) {
            const text = el.textContent.trim();
            if (text && !window.__toasts.includes(text)) window.__toasts.push(text);
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      };
      start();
    });
  }

  try {
    // ---------- Computer A: new project, one part, auto-push ----------
    await openBench(A);
    await A.waitForTimeout(3000); // let the mount-time Supabase check settle first
    await newProject(A, TAG);
    let menu;
    await importBox(A, 'grip.stl', 20);
    await A.getByText(/grip/).first().waitFor({ timeout: 30000 });
    const rowA = await waitFor(() => cloudRow(TAG), 25000);
    check('A: new project with one part reached Supabase by itself', Boolean(rowA && rowA.part_count === 1 && !rowA.deleted), JSON.stringify(rowA));
    const cloudNoteA = await A.getByRole('button', { name: /^Projects · \d+$/ }).textContent();
    check('A: Projects switcher counts this project', /Projects · [1-9]/.test(cloudNoteA || ''), cloudNoteA || '');

    // ---------- Computer B: fresh profile sees and opens it ----------
    await openBench(B);
    // The switcher fills once Supabase answers — over a slow link that can be
    // a few seconds after the bench is up, so look again until it is there.
    menu = await projectsMenu(B);
    let entryB = menu.getByText(new RegExp(`^${TAG} · 1`));
    let listed = await entryB.count();
    for (let i = 0; i < 10 && !listed; i++) {
      await B.keyboard.press('Escape');
      await B.waitForTimeout(1500);
      menu = await projectsMenu(B);
      entryB = menu.getByText(new RegExp(`^${TAG} · 1`));
      listed = await entryB.count();
    }
    check('B: fresh computer lists the project from Supabase', listed > 0);
    const badge = listed ? await menu.locator('svg[aria-label="On Supabase"]').count() : 0;
    check('B: entry carries the Supabase badge', badge > 0, `${badge} badge(s)`);
    if (listed) await entryB.first().click();
    await B.getByText(/grip/).first().waitFor({ timeout: 30000 });
    const nameB = await B.getByLabel('Project name').inputValue();
    check('B: opened the project with its part', nameB === TAG, `name=${nameB}`);

    // ---------- A adds a second part; B picks it up on focus ----------
    await importBox(A, 'barrel.stl', 12);
    await A.getByText(/barrel/).first().waitFor({ timeout: 30000 });
    const rowA2 = await waitFor(async () => { const r = await cloudRow(TAG); return r && r.part_count === 2 ? r : null; }, 25000);
    check('A: second part pushed', Boolean(rowA2), JSON.stringify(rowA2));

    // B has been idle; simulate coming back to the tab.
    await B.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    const sawBarrel = await waitFor(() => B.getByText(/barrel/).first().isVisible().catch(() => false), 20000);
    check('B: part uploaded on A appears on B when the tab regains focus', Boolean(sawBarrel));
    // The toast follows the local persist step, a moment after the part shows.
    const toastB = (await waitFor(async () => {
      const all = await B.evaluate(() => (window.__toasts || []).join(' | '));
      return /another computer/i.test(all) ? all : null;
    }, 15000)) || (await B.evaluate(() => (window.__toasts || []).join(' | ')));
    check('B: says it was updated from another computer', /another computer/i.test(toastB), toastB.slice(0, 120));

    // ---------- B jumps to another project and back ----------
    await newProject(B, `${TAG}-second`);
    await importBox(B, 'sight.stl', 8);
    await B.getByText(/sight/).first().waitFor({ timeout: 30000 });
    const rowSecond = await waitFor(() => cloudRow(`${TAG}-second`), 25000);
    check('B: second project pushed too', Boolean(rowSecond && rowSecond.part_count === 1), JSON.stringify(rowSecond));
    await B.waitForTimeout(1500);
    menu = await projectsMenu(B);
    const backEntry = menu.getByText(new RegExp(`^${TAG} · 2`));
    check('B: switcher shows both projects with live part counts', (await backEntry.count()) > 0 && (await menu.getByText(new RegExp(`^${TAG}-second · 1`)).count()) > 0);
    await backEntry.first().click();
    await B.getByText(/barrel/).first().waitFor({ timeout: 30000 });
    check('B: jumped back to the first project', (await B.getByLabel('Project name').inputValue()) === TAG);

    // ---------- Delete from B removes it everywhere ----------
    await B.getByRole('button', { name: /^Project$/ }).click();
    await B.locator('[data-3dwork-menu]').getByText('Delete this project').click();
    const gone = await waitFor(async () => { const r = await cloudRow(TAG); return r && r.deleted ? r : null; }, 15000);
    check('B: delete soft-deletes the Supabase row', Boolean(gone));
    await A.evaluate(() => { window.dispatchEvent(new Event('focus')); });
    const movedOff = await waitFor(async () => (await A.getByLabel('Project name').inputValue()) !== TAG, 15000);
    check('A: moved off the project deleted on B', Boolean(movedOff), `now on "${await A.getByLabel('Project name').inputValue()}"`);
    const toastA = await A.evaluate(() => (window.__toasts || []).join(' | '));
    check('A: told why', /deleted on another computer/i.test(toastA), toastA.slice(0, 160));
    menu = await projectsMenu(A);
    check('A: deleted project no longer listed after refresh', (await menu.getByText(new RegExp(`^${TAG} · `)).count()) === 0);
    await A.keyboard.press('Escape');

    // ---------- Drive dialog: no client-id field, popup carries the company client ----------
    await A.getByRole('button', { name: /^Project$/ }).click();
    await A.locator('[data-3dwork-menu]').getByText('Open from Google Drive').click();
    await A.getByText('Google Drive parts').waitFor({ timeout: 10000 });
    check('Drive: no free-text client id field by default', (await A.locator('input[placeholder*="googleusercontent"]').count()) === 0);
    await A.evaluate(() => localStorage.setItem('kjarni_3dwork_google_client', '708215000553-7sc6vb83g2manolct2l17gh45tk442es.apps.googleusercontent.com'));
    const popupP = ctxA.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    await A.getByRole('button', { name: /^Connect Drive$/ }).last().click();
    const popup = await popupP;
    let clientId = null;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      try { clientId = new URL(popup.url()).searchParams.get('client_id'); } catch {}
      await popup.close().catch(() => {});
    }
    check('Drive: Connect opens Google pop-up with the company client (stale typo id ignored)', clientId === '708215000553-7sc6vb83g2manolct21l7gh45tk442es.apps.googleusercontent.com', `client_id=${clientId}`);
    check('Drive: stale client-id key wiped', (await A.evaluate(() => localStorage.getItem('kjarni_3dwork_google_client'))) === null);
    await A.getByText('Advanced…').click();
    check('Drive: advanced override field available on demand', (await A.locator('input[placeholder*="googleusercontent"]').count()) === 1);
  } catch (e) {
    check('script ran to the end', false, String(e).slice(0, 300));
    await A.screenshot({ path: '/tmp/3dwork-sync-A.png' }).catch(() => {});
    await B.screenshot({ path: '/tmp/3dwork-sync-B.png' }).catch(() => {});
  }

  // ---------- Cleanup: remove the smoke rows and their objects ----------
  try {
    const { json } = await sbFetch(`work3d_projects?name=like.${encodeURIComponent(TAG)}*&select=id`);
    for (const row of json || []) {
      await sbFetch(`work3d_projects?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ deleted: true }) });
    }
    console.log(`cleanup: ${(json || []).length} smoke row(s) soft-deleted (ids: ${(json || []).map((r) => r.id).join(', ')})`);
  } catch (e) {
    console.log('cleanup failed:', String(e).slice(0, 200));
  }

  check('no page errors', errors.length === 0, errors.join(' || ').slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
  process.exit(failed ? 1 : 0);
})();
