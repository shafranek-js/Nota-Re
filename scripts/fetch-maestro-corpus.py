#!/usr/bin/env python3
"""Download three distinct MAESTRO v3 validation performances for offline research.

Only JSON audits and scored summaries may leave the ephemeral CI runner.
MAESTRO v3.0.0 is CC BY-NC-SA 4.0. Never commit or upload audio/MIDI.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "https://huggingface.co/datasets/ddPn08/maestro-v3.0.0/resolve/main/"
MAX_WAV_BYTES = 90_000_000
MAX_MIDI_BYTES = 2_000_000
COUNT = 3


def read_remote(name, target, limit):
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", name) or ".." in name.split("/"):
        raise ValueError("Unsafe MAESTRO source path")
    url = BASE + quote(name, safe="/-_.")
    digest = hashlib.sha256()
    size = 0
    with urlopen(Request(url, headers={"User-Agent": "Nota-Re-MAESTRO-R0C/1"}), timeout=90) as remote:
        declared = remote.headers.get("Content-Length")
        if declared and int(declared) > limit:
            raise ValueError("File exceeds bounded download")
        with target.open("wb") as local:
            while chunk := remote.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ValueError("File exceeds bounded download")
                digest.update(chunk)
                local.write(chunk)
    if not size:
        raise ValueError("Empty source")
    return {"url": url, "sha256": digest.hexdigest(), "bytes": size}


def candidates(rows):
    """Stable metadata-only order; never select using model results or test split."""
    result = []
    for row in rows:
        try:
            duration = float(row["duration"])
            year = int(row["year"])
            composer = row["canonical_composer"].strip()
            title = row["canonical_title"].strip()
            if (row["split"] == "validation" and 20 <= duration <= 400
                    and composer and title and row["audio_filename"] and row["midi_filename"]):
                result.append((duration, row["audio_filename"], year, composer, title, row))
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(result, key=lambda item: (item[0], item[1]))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) == 2 else Path(".microphone-maestro-corpus")
    root.mkdir(parents=True, exist_ok=True)
    metadata_file = root / "maestro-v3.0.0.csv"
    metadata = read_remote("maestro-v3.0.0.csv", metadata_file, 1_000_000)
    rows = list(csv.DictReader(io.StringIO(metadata_file.read_text(encoding="utf-8"))))
    used_composers, used_compositions = set(), set()
    selected = []
    failures = []
    # Try the shortest entries first; demand independent recordings and composers.
    for duration, audio_name, year, composer, title, row in candidates(rows)[:60]:
        if len(selected) == COUNT:
            break
        composition = (composer, title)
        if composer in used_composers or composition in used_compositions:
            continue
        case_id = f"maestro-validation-{len(selected) + 1:02d}"
        folder = root / "takes" / case_id
        folder.mkdir(parents=True, exist_ok=True)
        midi_path, wav_path = folder / "source.mid", folder / "source.wav"
        try:
            midi = read_remote(row["midi_filename"], midi_path, MAX_MIDI_BYTES)
            audio = read_remote(audio_name, wav_path, MAX_WAV_BYTES)
            if midi_path.read_bytes()[:4] != b"MThd" or wav_path.read_bytes()[:4] != b"RIFF":
                raise ValueError("Expected MIDI and RIFF WAV")
            entry = {
                "id": case_id, "dataset": "MAESTRO v3.0.0",
                "license": "CC BY-NC-SA 4.0", "split": "validation",
                "year": year, "composer": composer, "title": title,
                "reported_duration_seconds": duration,
                "midi_filename": row["midi_filename"], "audio_filename": audio_name,
                "source_midi": midi, "source_audio": audio,
                "upstream_metadata": metadata,
            }
            (folder / "source.json").write_text(json.dumps(entry, indent=2) + "\n", encoding="utf-8")
            selected.append(entry)
            used_composers.add(composer)
            used_compositions.add(composition)
            print(json.dumps({"case": case_id, "year": year, "composer": composer,
                              "title": title, "wav_bytes": audio["bytes"]}))
        except Exception as exc:
            failures.append(f"{audio_name}: {exc}")
            midi_path.unlink(missing_ok=True)
            wav_path.unlink(missing_ok=True)
    if len(selected) != COUNT:
        raise RuntimeError(f"Required {COUNT} distinct validation composers, obtained {len(selected)}; "
                           + "; ".join(failures[-8:]))
    (root / "download-audit.json").write_text(json.dumps({
        "dataset": "MAESTRO v3.0.0", "license": "CC BY-NC-SA 4.0",
        "split": "validation", "selection": "three shortest accessible distinct-composer recordings "
            "among first 60 duration-sorted validation rows; no test split",
        "upstream_metadata": metadata, "cases": selected,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
