/**
 * PANENKA — end-user demo walkthrough (Playwright, records video).
 *
 * Drives the REAL end-user journey on the live pages (not the /demo page),
 * pausing at each wallet signature so you approve it manually. Records the whole
 * run to a video file.
 *
 * Run:
 *   cd frontend && node scripts/demo-walkthrough.mjs
 *   (dev server must be running at DEMO_URL, default http://localhost:3000)
 *
 * Env:
 *   DEMO_URL     target base URL (default http://localhost:3000)
 *   DEMO_FULL=1  also attempt the advanced on-chain flows that need prior state
 *                (list for sale, list for rent, commit lineup, enter contest).
 *                These are best-effort: they narrate and skip if preconditions
 *                (11 cards, open matchday, existing contests) aren't met.
 *
 * First run: a headed browser opens logged-out. Connect your wallet when the
 * caption asks; the login persists in ./.playwright-demo for later runs.
 * The connected wallet should hold OKB gas (use the in-app faucet for USDC).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DEMO_URL || "http://localhost:3000").replace(/\/$/, "");
const FULL = process.env.DEMO_FULL === "1";
const USER_DATA_DIR = resolve(__dirname, "../.playwright-demo");
const VIDEO_DIR = resolve(__dirname, "../demo-recording");
// Set CDP_URL to attach to YOUR already-running browser (e.g. Brave with MetaMask)
// instead of launching a fresh one. Launch Brave first with:
//   "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --remote-debugging-port=9222
// In this mode Playwright cannot record video — screen-record the window yourself.
const CDP_URL = process.env.CDP_URL || "";

const SIGN_TIMEOUT = 180_000; // generous: you approve the wallet popup in this window
const W = 1440, H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- captions */
async function caption(page, title, sub = "") {
  await page.evaluate(({ title, sub }) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      el.style.cssText =
        "position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:2147483647;" +
        "background:oklch(0.215 0.024 265);color:oklch(0.962 0.01 85);padding:14px 22px;border-radius:14px;" +
        "font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.45);" +
        "max-width:78vw;text-align:center;pointer-events:none;transition:opacity .3s ease;";
      document.documentElement.appendChild(el);
    }
    el.innerHTML =
      `<div style="font-weight:700;font-size:16px;letter-spacing:.2px">${title}</div>` +
      (sub ? `<div style="opacity:.72;font-size:13px;margin-top:3px">${sub}</div>` : "");
    el.style.opacity = "1";
  }, { title, sub }).catch(() => {});
}

async function scrollTour(page, { steps = 6, dist = 320, delay = 650 } = {}) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dist).catch(() => {});
    await sleep(delay);
  }
  await sleep(500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })).catch(() => {});
  await sleep(900);
}

async function scene(page, path, title, sub, { scroll = true, settle = 1500 } = {}) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(settle);
  await caption(page, title, sub);
  await sleep(1800);
  if (scroll) await scrollTour(page);
}

/* ------------------------------------------------------ wallet + tx helpers */
async function isConnected(page) {
  return (await page.locator('button[aria-label^="Wallet 0x"]').count()) > 0;
}

async function waitForConnect(page) {
  if (await isConnected(page)) return;
  await caption(page, "Connect your wallet", "Click “Connect wallet” (top right) and finish in the popup.");
  await page.locator('button[aria-label^="Wallet 0x"]').first().waitFor({ timeout: 300_000 });
  await caption(page, "Wallet connected", "");
  await sleep(1200);
}

async function getAddress(page) {
  try {
    await page.locator('button[aria-label^="Wallet 0x"]').first().click();
    const addr = await page.locator('[role="menu"] .font-mono').first().innerText({ timeout: 4000 });
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(20, 20).catch(() => {});
    const m = addr && addr.match(/0x[0-9a-fA-F]{40}/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/**
 * Drive one TxButton: click the action, wait for the simulation "Confirm & Send"
 * button, click it, then wait for "Mined" while you approve the signature.
 * `scope` disambiguates pages with several TxButtons (pass a panel locator).
 */
async function runTx(page, action, label, sub = "Approve the signature in your wallet…", scope = null) {
  const root = scope || page;
  await caption(page, label, sub);
  await action.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(600);
  await action.click({ timeout: 15_000 });
  const confirm = root.getByRole("button", { name: "Confirm & Send" }).first();
  await confirm.waitFor({ state: "visible", timeout: 30_000 });
  await sleep(700);
  await confirm.click();
  await caption(page, label, "👉 Approve the transaction in MetaMask…");
  // Advance once the tx is BROADCAST (badge reaches "Waiting for confirmation")
  // or already mined. We don't block on the final receipt — background-tab
  // throttling during the MetaMask popup can stall that poll indefinitely.
  await root
    .getByText(/Waiting for confirmation|Mined: 0x/i)
    .first()
    .waitFor({ state: "visible", timeout: SIGN_TIMEOUT });
  await caption(page, label, "Transaction sent ✓");
  // If it confirms within a few seconds, show it; otherwise move on.
  await root.getByText(/Mined: 0x/i).first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
  await sleep(1500);
}

/** Run a named step; never let one failure break the recording. */
async function step(page, name, fn) {
  try {
    await fn();
  } catch (e) {
    await caption(page, name + " — skipped", String(e?.message || e).slice(0, 90));
    await sleep(2200);
  }
}

/* ------------------------------------------------------------------- flows */
async function flowFaucet(page) {
  await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await caption(page, "Get test USDC", "Settings has a one-click faucet.");
  await sleep(1500);
  const btn = page.getByRole("button", { name: /Claim .* test USDC/i }).first();
  await btn.waitFor({ timeout: 8000 });
  await runTx(page, btn, "Faucet · mint 1,000 USDC");
}

async function flowOnboard(page) {
  await page.goto(BASE + "/onboard", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  if (await page.getByText(/Already claimed/i).count()) {
    await caption(page, "Starter squad", "Already claimed on this wallet — on to the cards.");
    await sleep(2200);
    return;
  }
  const claim = page.getByRole("button", { name: /Claim your free 5-card Starter Squad/i }).first();
  await claim.waitFor({ timeout: 8000 });
  await caption(page, "Claim your free squad", "Sign the message in your wallet (anti-sybil, no gas).");
  await claim.scrollIntoViewIfNeeded().catch(() => {});
  await claim.click();
  await page.getByText(/cards minted|Your Starter Squad/i).first().waitFor({ timeout: SIGN_TIMEOUT });
  await caption(page, "5 cards minted", "Your starter XI is now on-chain.");
  await sleep(2200);
  // claim baseline chips
  const chips = page.getByRole("button", { name: /Claim baseline chips/i }).first();
  if (await chips.count()) {
    await runTx(page, chips, "Claim baseline chips", "Power-ups (Triple Captain, Wildcard…). Approve in wallet.");
  }
}

async function flowBuyPack(page) {
  await page.goto(BASE + "/packs", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await caption(page, "Open a pack", "Rip a Bronze pack — collectible player cards.");
  await sleep(1600);
  const approve = page.getByRole("button", { name: /^Approve .* USDC/i }).first();
  if (await approve.count()) {
    await runTx(page, approve, "Approve USDC for the pack");
  }
  const buy = page.getByRole("button", { name: /Buy Bronze Pack/i }).first();
  await buy.waitFor({ timeout: 8000 });
  await runTx(page, buy, "Buy Bronze pack");
  // wait for the 16-block reveal window
  await caption(page, "Pack sealed", "A short commit delay (anti-snipe) before you can reveal…");
  const reveal = page.getByRole("button", { name: /Reveal Pack/i }).first();
  await reveal.waitFor({ timeout: 20_000 }).catch(() => {});
  // poll until reveal is enabled
  for (let i = 0; i < 60; i++) {
    if ((await reveal.count()) && (await reveal.isEnabled().catch(() => false))) break;
    await sleep(3000);
  }
  await runTx(page, reveal, "Reveal the pack", "Approve in wallet — your new cards are drawn on-chain.");
  const collect = page.getByRole("button", { name: /Collect cards/i }).first();
  if (await collect.count()) {
    await caption(page, "New cards revealed", "Rarity is drawn on-chain — Common to Unique foil.");
    await sleep(2600);
    await collect.click().catch(() => {});
    await sleep(1200);
  }
}

async function flowListForSale(page, address) {
  if (!address) throw new Error("no address");
  const res = await page.request.get(`${BASE}/api/portfolio?wallet=${address}`);
  const data = await res.json().catch(() => ({}));
  const cards = (data.cards || data.owned || data || []);
  const own = (Array.isArray(cards) ? cards : []).find((c) => (c.state ? c.state === "OWN" : true) && c.tokenId);
  if (!own) throw new Error("no owned card to list");
  await page.goto(`${BASE}/market/${own.tokenId}`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await caption(page, "List a card for sale", "Set a price and list it on the open market.");
  await sleep(1500);
  const price = page.getByLabel(/Price \(USDC\)/i).first();
  await price.waitFor({ timeout: 8000 });
  await price.fill("50");
  await sleep(600);
  const approve = page.getByRole("button", { name: /Approve card/i }).first();
  await runTx(page, approve, "Approve the card for the marketplace");
  const list = page.getByRole("button", { name: /List for sale/i }).first();
  await runTx(page, list, "List for 50 USDC");
}

async function flowListForRent(page) {
  await page.goto(BASE + "/rentals", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await caption(page, "List a card for rent", "Earn when others field your star for a matchday.");
  const manage = page.getByRole("button", { name: /^Manage$/ }).first();
  await manage.waitFor({ timeout: 8000 });
  await manage.scrollIntoViewIfNeeded().catch(() => {});
  await manage.click();
  await sleep(1200);
  const list = page.getByRole("button", { name: /List for Rent/i }).first();
  await runTx(page, list, "List for rent (per matchday)");
}

async function flowCommitLineup(page, address) {
  await page.goto(BASE + "/play", { waitUntil: "domcontentloaded" });
  await sleep(1600);
  await caption(page, "Build your XI", "Pick a formation, fill 11 slots, name a captain.");
  await sleep(1600);
  if (await page.getByText(/Not enough cards|need 11/i).count()) {
    throw new Error("need 11 controllable cards (buy more packs)");
  }
  // fill all slot selects with their first real option
  const slots = page.locator('select[aria-label^="Slot "]');
  const n = await slots.count();
  if (n < 11) throw new Error("lineup slots not available");
  for (let i = 0; i < n; i++) {
    await slots.nth(i).selectOption({ index: 1 }).catch(() => {});
    await sleep(150);
  }
  await caption(page, "Captain & chip", "Triple your captain's points, or play a Wildcard.");
  await sleep(1500);
  const commit = page.getByRole("button", { name: /Commit lineup/i }).first();
  await commit.waitFor({ timeout: 8000 });
  await runTx(page, commit, "Commit your lineup on-chain");
}

async function flowEnterContest(page) {
  await page.goto(BASE + "/contests", { waitUntil: "domcontentloaded" });
  await sleep(1600);
  await caption(page, "Enter a contest", "Free and paid brackets, USDC prizes, Merkle payouts.");
  await sleep(1600);
  const free = page.getByRole("button", { name: /Enter free contest/i }).first();
  if (!(await free.count())) throw new Error("no open contest for this matchday");
  await runTx(page, free, "Enter the free contest");
}

/* -------------------------------------------------------------------- main */
async function main() {
  let context, browser, page;
  if (CDP_URL) {
    // Attach to the user's already-running browser (e.g. Brave + MetaMask).
    browser = await chromium.connectOverCDP(CDP_URL);
    context = browser.contexts()[0] || (await browser.newContext());
    page = await context.newPage();
    await page.bringToFront().catch(() => {});
    console.log("Attached over CDP. Start your screen recording now (⌘⇧5), then sign in MetaMask when prompted.");
  } else {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: W, height: H },
      recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
      args: [`--window-size=${W + 20},${H + 120}`],
    });
    page = context.pages()[0] || (await context.newPage());
  }

  try {
    // 1. Land + connect
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await sleep(2000);
    await caption(page, "PANENKA", "Daily fantasy World Cup on X Layer — own your XI.");
    await sleep(2600);
    await waitForConnect(page);

    await scene(page, "/", "Your dashboard", "Balance, next matchday, quick actions.");

    // 2. Core on-chain journey
    await step(page, "Faucet", () => flowFaucet(page));
    await step(page, "Onboard", () => flowOnboard(page));
    await scene(page, "/portfolio", "Your squad", "Every player is an NFT you own. Rarity at a glance.");
    await step(page, "Open a pack", () => flowBuyPack(page));

    // 3. Tour the marketplace economy
    await scene(page, "/market", "The marketplace", "Buy and sell player cards, fixed price, on-chain.");
    await scene(page, "/rentals", "Per-matchday rentals", "Rent a superstar for one match from ~$0.30.");

    // 4. Advanced on-chain flows (best-effort; need prior state)
    if (FULL) {
      const address = await getAddress(page);
      await step(page, "List for sale", () => flowListForSale(page, address));
      await step(page, "List for rent", () => flowListForRent(page));
      await step(page, "Commit lineup", () => flowCommitLineup(page, address));
      await step(page, "Enter contest", () => flowEnterContest(page));
    } else {
      await scene(page, "/play", "Build your lineup", "Formation, captain, chips — commit before kickoff.");
      await scene(page, "/contests", "Contests", "Free and paid brackets, USDC prizes.");
    }

    // 5. The rest of the product
    await scene(page, "/schedule", "Real 2026 World Cup", "The actual draw and group-stage fixtures.");
    await scene(page, "/leaderboard", "Season table", "Standings settle from a verifiable oracle.");
    await scene(page, "/transparency", "Provably fair", "Live oracle roster, deployed contracts, public verifier.");

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await sleep(1200);
    await caption(page, "That's PANENKA", "Own your XI. Rent the legends. Win on-chain.");
    await sleep(3500);
  } finally {
    await sleep(800);
    if (CDP_URL) {
      // Leave the user's browser open; just detach the CDP connection.
      console.log("\nDemo finished. Stop your screen recording. (Your browser stays open.)");
      process.exit(0);
    }
    const vid = page.video();
    await context.close(); // flushes the .webm to disk
    if (vid) {
      const webm = await vid.path().catch(() => null);
      if (webm) {
        console.log("\n✓ WebM saved:", webm);
        // Playwright only records WebM; transcode to MP4 (H.264) for sharing.
        const mp4 = webm.replace(/\.webm$/i, ".mp4");
        const ff = spawnSync(
          "ffmpeg",
          ["-y", "-i", webm, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
          { stdio: "ignore" },
        );
        if (ff.status === 0) console.log("✓ MP4 saved:", mp4);
        else console.log("! MP4 conversion needs ffmpeg on PATH — the .webm above is intact. Convert with: ffmpeg -i <file>.webm <file>.mp4");
      }
    }
    console.log("Done.");
  }
}

main().catch((e) => {
  console.error("demo error:", e);
  process.exit(1);
});
