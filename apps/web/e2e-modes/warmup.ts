// Both stacks start the web and the teacher app after their API is up. Open the entry pages in a
// real browser once, so Next compiles them and Metro builds the teacher bundle before any test
// starts (a cold CI machine takes a minute or more for each).
import { chromium } from '@playwright/test';

const PAGES: [string, string][] = [
  ['http://localhost:3000/ar/welcome', 'input[type=tel]'],
  ['http://localhost:3000/ar/centre', 'input[type=tel]'],
  ['http://localhost:8081/sign-in', '[data-testid="t14-phone"]'],
];

async function reachable(url: string, until: number) {
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`Timed out waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export default async function warmup() {
  // Each page gets its own budget: a cold Next page can take minutes on a slow machine.
  for (const [url] of PAGES) await reachable(url, Date.now() + 600_000);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [url, selector] of PAGES) {
      await page.goto(url, { timeout: 300_000 });
      await page.locator(selector).first().waitFor({ timeout: 300_000 });
    }
  } finally {
    await browser.close();
  }
}
