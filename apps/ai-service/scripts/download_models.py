"""Download the local speech-to-text models (resumable; run before going to the centre).

    uv run python scripts/download_models.py [large-v3-turbo egy-turbo-ft large-v3 ...]

Models land in AI_MODELS_DIR (default apps/ai-service/.models). Re-running skips finished files.
Sizes: large-v3-turbo ~1.6 GB, egy-turbo-ft ~1.6 GB, large-v3 ~3.1 GB.
"""

from __future__ import annotations

import sys
import time

from huggingface_hub import snapshot_download

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from ai_service.config import load_config  # noqa: E402
from ai_service.stt import MODELS  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]  # Windows: cp1252 console
names = sys.argv[1:] or ["large-v3-turbo", "egy-turbo-ft", "large-v3"]
cfg = load_config()
for name in names:
    repo = MODELS[name]["repo"]
    t = time.time()
    print(f"→ {name}: {repo}", flush=True)
    for attempt in range(5):
        try:
            path = snapshot_download(repo, local_dir=str(cfg.models_dir / name), max_workers=4)
            print(f"✔ {name} in {time.time() - t:.0f}s → {path}", flush=True)
            break
        except Exception as e:  # network hiccup: try again, the download resumes
            print(f"  retry {attempt + 1}/5 after: {e}", flush=True)
            time.sleep(10)
    else:
        print(f"✖ {name} failed", flush=True)
        sys.exit(1)
