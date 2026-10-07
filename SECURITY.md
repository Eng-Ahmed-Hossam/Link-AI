# Security policy

## Reporting a problem

If you find a security issue in Link — in the code, the demo, a pilot instance or this repository — **do not open a public issue.** Report it privately:

- on GitHub: this repository → **Security** → **Report a vulnerability** (private vulnerability reporting), or
- directly to the repository owner, [@Eng-Ahmed-Hossam](https://github.com/Eng-Ahmed-Hossam).

Please include what you found, how to reproduce it, and what data or access it could expose. The owner will reply and keep you informed; please give us time to fix it before telling anyone else.

## What matters most here

- **Personal data.** Pilots hold pseudonymised data about children and their families (first names or codes, guardian labels; no phone numbers or national IDs). Anything that could expose a pilot's data, cross from one centre to another, or reach a parent without staff approval is the highest priority.
- **Secrets.** No key, token, password, certificate or pilot data belongs in this repository. `.env.example` lists every setting with empty values; real values live in local `.env*` files and server-side environments only. CI scans every push for secrets (gitleaks).
- **The demo** runs on sample data in the visitor's browser. If you can make it send data anywhere, that is a bug worth reporting.

## Supported versions

Only the current `main` branch and running pilot instances are supported.
