# Set up Link on Windows

This is the clean-machine path for local sample data. Link needs enough disk for Docker and the optional Whisper/Ollama models.

Measured setup time on <machine>: __ min.

## Install once, in this order

1. [Node.js 24](https://nodejs.org/en/download) — install the 24.x LTS Windows build.
2. Enable the pnpm version pinned by this repository:

   ```powershell
   corepack enable
   corepack prepare pnpm@12.8.1 --activate
   ```

   See the [official pnpm installation guide](https://pnpm.io/installation).
3. [Git for Windows](https://git-scm.com/install/windows). Run `git config --global core.autocrlf input`.
4. [WSL 2](https://learn.microsoft.com/windows/wsl/install), then [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/). Enable **Use the WSL 2 based engine**.
5. [Python 3.12](https://www.python.org/downloads/windows/). Enable the Python launcher during installation.
6. [uv](https://docs.astral.sh/uv/getting-started/installation/). Reopen the terminal afterward.
7. [Ollama](https://ollama.com/download/windows) for Follow-up AI. Marketplace-only work can use `pnpm setup --skip-ai`.

Enable Windows long paths in elevated PowerShell, then restart Windows:

```powershell
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWord -Force
```

## Clone and run

```powershell
git clone <Link repository URL>
cd Link_Edu
pnpm run setup
pnpm dev
```

`pnpm run setup --dry-run` checks the machine and prints the ordered commands without starting containers, migrating, or seeding. `pnpm run doctor` is always read-only. The explicit `run` is required because pnpm 12 has built-in commands named `setup` and `doctor`. After `pnpm dev`, open `http://localhost:3000`, the teacher app at `http://localhost:8081`, and sign-in codes at `http://localhost:8093`.

## Ten likely problems

| Problem | Fix |
|---|---|
| A required port is in use | Run `pnpm run doctor`. Stop the named stale process, or change the matching `*_HOST_PORT` in `.env.local` and keep its URL variables consistent. |
| Docker is not running | Start Docker Desktop, wait for the engine, and rerun `pnpm run setup`. |
| Docker is not using WSL 2 | Docker Desktop → Settings → General → **Use the WSL 2 based engine**; install/update WSL from Microsoft above. |
| Git changes files because of CRLF | Run `git config --global core.autocrlf input`, then restore only unintended changes. |
| Paths fail under `node_modules` | Enable `LongPathsEnabled` with the command above and restart Windows. |
| Next.js dev cache is corrupt | Stop dev, delete `apps/web/.next/dev`, then run `pnpm dev` again. |
| `uv` is not found | Use Astral's installer above, reopen PowerShell, and confirm `uv --version`. |
| Ollama models are unavailable | Install Ollama, then use `pnpm ai:models` before Follow-up AI work; use `--skip-ai` for marketplace-only setup. |
| Disk space is low | Free at least 15 GB before downloading models or rebuilding images. |
| Antivirus slows `node_modules` | Add a narrow exclusion for this trusted repo and pnpm store under organisational policy; never disable protection globally. |
