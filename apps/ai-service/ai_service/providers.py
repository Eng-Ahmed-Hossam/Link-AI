"""Providers and the data-safety guard (B2, OD-51, docs/09 §8).

Every audio file and transcript carries a data class: `synthetic` (scripted, role-played, generated)
or `consented_real` (a real teacher note covered by the E15-01 consent). There is no other class.
Every provider declares what it does with data. The guard refuses to send `consented_real` data to
any provider that is not on this device, does not allow real data, or trains on its inputs — with no
silent fallback: the call fails and the note falls back to "Type the note instead".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DataClass = Literal["synthetic", "consented_real"]
DATA_CLASSES: frozenset[str] = frozenset({"synthetic", "consented_real"})
THIS_DEVICE = "this-device"


@dataclass(frozen=True)
class ProviderInfo:
    name: str
    kind: Literal["stt", "llm"]
    allows_real_data: bool
    trains_on_inputs: bool
    processing_region: str  # "this-device", or where a vendor processes data (e.g. "US")

    @property
    def local(self) -> bool:
        return self.processing_region == THIS_DEVICE


PROVIDERS: dict[str, ProviderInfo] = {
    # Local: nothing leaves the machine.
    "local-whisper": ProviderInfo("local-whisper", "stt", True, False, THIS_DEVICE),
    "ollama": ProviderInfo("ollama", "llm", True, False, THIS_DEVICE),
    # Test doubles (local by construction).
    "fake-stt": ProviderInfo("fake-stt", "stt", True, False, THIS_DEVICE),
    "fake-llm": ProviderInfo("fake-llm", "llm", True, False, THIS_DEVICE),
    # Declared, NOT wired (no key given): a possible cloud comparison for SYNTHETIC audio only.
    # These values are conservative placeholders until its free-tier terms are checked and recorded
    # in ADR-0007; whatever they say, it is outside Egypt (OD-26), so never for consented_real data.
    "groq-whisper": ProviderInfo("groq-whisper", "stt", False, True, "US"),
}


class DataSafetyError(Exception):
    """Raised instead of sending data where it may not go. Never caught to try another provider."""

    code = "data_safety_refused"


def guard(provider: ProviderInfo, data_class: str) -> None:
    if data_class not in DATA_CLASSES:
        raise DataSafetyError(
            f"Unknown data class {data_class!r}: only 'synthetic' or 'consented_real' exist."
        )
    if data_class == "consented_real" and not (
        provider.local and provider.allows_real_data and not provider.trains_on_inputs
    ):
        raise DataSafetyError(
            f"Refused: consented_real data may only go to a local provider; "
            f"{provider.name} processes data in {provider.processing_region}"
            f"{' and trains on inputs' if provider.trains_on_inputs else ''}."
        )
