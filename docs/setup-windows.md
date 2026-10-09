# Setting up Link on Windows

From a new Windows 10 (22H2) or 11 PC to `pnpm dev`, in this order. Every download is from the tool's official page. Use **PowerShell** (or Windows Terminal) for every command. Sample data only: nothing here needs a paid account.

## Install order

| # | Install | From | Then check |
|---|---|---|---|
| 1 | **WSL 2** (Docker's engine) | Admin PowerShell: `wsl --install`, then restart — [learn.microsoft.com/windows/wsl/install](https://learn.microsoft.com/windows/wsl/install) | `wsl --status` says "Default Version: 2" |
| 2 | **Git for Windows** | [git-scm.com/downloads/win](https://git-scm.com/downloads/win). In the installer choose **"Checkout as-is, commit Unix-style line endings"** | `git --version` |
| 3 | **Long paths** (node_modules goes deep) | Admin PowerShell: `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`, then `git config --global core.longpaths true` | `pnpm run doctor` → "Windows long paths ✓" |
| 4 | **Docker Desktop** | [docs.docker.com/desktop/setup/install/windows-install](https://docs.docker.com/desktop/setup/install/windows-install/). Keep **"Use the WSL 2 based engine"** ticked. Start it and wait for "Engine running" | `docker info` prints a server version |
| 5 | **Node.js 24 LTS** | [nodejs.org/en/download](https://nodejs.org/en/download) (Windows Installer, .msi) | `node --version` → `v24.x` |
| 6 | **pnpm** (through Corepack, included with Node) | `corepack enable` — [pnpm.io/installation](https://pnpm.io/installation). The repo pins the exact version | `pnpm --version` → the version in `package.json` |
| 7 | **uv** (Python 3.12 for voice notes) | [docs.astral.sh/uv/getting-started/installation](https://docs.astral.sh/uv/getting-started/installation/): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"`, then `uv python install 3.12` | `uv --version` |
| 8 | **Ollama** (optional: smarter extraction, Ask Link) | [ollama.com/download/windows](https://ollama.com/download/windows), then `ollama pull qwen3:8b` | `ollama --version` |

Then, in a **short folder outside OneDrive** (for example `C:\dev`):

```powershell
git clone https://github.com/Eng-Ahmed-Hossam/Link-AI.git
cd Link-AI
pnpm run doctor        # read-only: every line ✓ or ⚠ (no ✗)
pnpm run setup         # install, .env.local, services, database, sample data, ai-service packages
pnpm dev               # then open http://localhost:3000/ar/welcome
```

Note: type `pnpm run doctor` and `pnpm run setup`. Plain `pnpm doctor` and `pnpm setup` are pnpm's own commands: the first checks pnpm itself, the second edits your PowerShell profile.

`pnpm run setup` is safe to run again at any time: it only does what is missing. `--skip-ai` leaves voice notes off (no Python needed); `--dry-run` shows the steps without changing anything; `--reset-data` wipes and re-seeds the sample data after you type `reset`. What comes next (sign-in, the click list): [RUNNING.md](RUNNING.md).

## The 10 most likely problems

| # | You see | Fix |
|---|---|---|
| 1 | `pnpm run doctor`: "Docker installed but not running", or `error during connect: … pipe/docker_engine` | Start Docker Desktop from the Start menu and wait for "Engine running" (whale icon steady). After a Windows update, also run `wsl --update`. |
| 2 | "Docker on WSL 2 ✗" | Docker Desktop → Settings → General → tick "Use the WSL 2 based engine" → Apply & restart. |
| 3 | "Ports ✗ … 5432 (Postgres; set POSTGRES_HOST_PORT …)" — often a PostgreSQL you installed earlier | Stop it (Services → postgresql → Stop). Or move Link's: on the **first** setup run `$env:POSTGRES_HOST_PORT=5433; pnpm run setup` (it writes 5433 into `.env.local` with every database URL); later, change `POSTGRES_HOST_PORT` in `.env.local` and the port in the four `DATABASE_URL*` lines. To see who holds a port: `Get-NetTCPConnection -LocalPort 5432 -State Listen \| Select-Object OwningProcess`, then `Get-Process -Id <id>`. |
| 4 | "Ports ⚠ … 3000 / 4000 / 8081 in use" after closing a terminal | A dev server is still running: `Stop-Process -Id <id> -Force` with the id from the command above. Stopping a terminal tab does not always stop what it started. |
| 5 | `pnpm install` fails with `ENAMETOOLONG` or `EPERM … unlink` | Long paths are off (step 3), or the repo is under OneDrive (move it to `C:\dev`). Close VS Code and run again. |
| 6 | A container stays "unhealthy", or `exec /docker-entrypoint.sh: no such file or directory` | Files were checked out with CRLF line endings: `git config --global core.autocrlf input`, delete the folder, clone again, `pnpm run setup`. |
| 7 | Docker or the dev servers are very slow, or crash with "out of memory" | Give WSL more memory: create `%UserProfile%\.wslconfig` with `[wsl2]` and `memory=8GB` (or more), then `wsl --shutdown` and start Docker again. Close other heavy apps. |
| 8 | `pnpm` is not recognised, or "Unsupported pnpm version" | `corepack enable` in an **admin** PowerShell, open a new terminal, `pnpm --version`. |
| 9 | `uv` is not recognised after installing it | Open a new terminal (the installer updates PATH). Or skip voice notes: `pnpm run setup --skip-ai`. |
| 10 | core-api says the data was "written with other keys", or sign-in never finds your account | `.env.local`'s keys changed: `pnpm run setup --reset-data` (sample data only). |

Still stuck: `pnpm run doctor --json` and the last 30 lines of the failing command are what the agent needs to help.
