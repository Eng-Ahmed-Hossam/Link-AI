// Both stacks start the web and the teacher app after their API is up; wait for (and compile)
// the pages the specs open first, so the first test does not race the dev servers.
const PAGES = [
  'http://localhost:3000/en/welcome',
  'http://localhost:3000/en/centre',
  'http://localhost:8081/sign-in',
];

export default async function warmup() {
  for (const url of PAGES) {
    const until = Date.now() + 300_000;
    for (;;) {
      try {
        if ((await fetch(url)).ok) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > until) throw new Error(`Timed out waiting for ${url}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
