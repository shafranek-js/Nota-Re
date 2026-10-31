#!/usr/bin/env python3
"""Download one public MAESTRO v3 aligned WAV/MIDI pair for opt-in CI research.

Only benchmark summary JSON is uploaded by the workflow. Audio and MIDI stay
inside its ephemeral runner. Dataset CC BY-NC-SA 4.0 applies.
"""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

DATASET_BASE = (
    "https://huggingface.co/datasets/ddPn08/maestro-v3.0.0/"
    "resolve/main/"
)
MAX_BYTES = 90_000_000  # bounded individual source WAV; smallest short test take
METADATA_BYTES = 1_000_000


def read_remote(path, destination, limit):
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", path) or ".." in path:
        raise ValueError("Unsafe MAESTRO metadata path")
    url = DATASET_BASE + quote(path, safe="/-_.")
    request = Request(url, headers={"User-Agent": "Nota-Re-MAESTRO-R0C/1"})
    total = 0
    digest = hashlib.sha256()
    with urlopen(request, timeout=90) as response:
        stated = response.headers.get("Content-Length")
        if stated and int(stated) > limit:
            raise ValueError(f"Remote source exceeds {limit} bytes")
        with destination.open("wb") as stream:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise ValueError(f"Remote source exceeds {limit} bytes")
                digest.update(chunk)
                stream.write(chunk)
    if not total:
        raise ValueError("Empty remote source")
    return {"url": url, "sha256": digest.hexdigest(), "bytes": total}


def main():
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".microphone-maestro")
    destination.mkdir(parents=True, exist_ok=True)
    metadata_path = destination / "maestro-v3.0.0.csv"
    metadata = read_remote("maestro-v3.0.0.csv", metadata_path, METADATA_BYTES)
    rows = list(csv.DictReader(io.StringIO(metadata_path.read_text("utf-8"))))
    choices = []
    for row in rows:
        try:
            duration = float(row["duration"])
            year = int(row["year"])
        except (ValueError, KeyError):
            continue
        if row.get("split") == "test" and 20 <= duration <= 180:
            choices.append((0 if year == 2018 else 1, duration, row))
    choices.sort(key=lambda x: (x[0], x[1], x[2]["midi_filename"]))
    if not choices:
        raise RuntimeError("No short held-out MAESTRO v3 test performances found")

    errors = []
    for _, duration, row in choices[:6]:
        midi = destination / "source.mid"
        wav = destination / "source.wav"
        try:
            midi_meta = read_remote(row["midi_filename"], midi, 2_000_000)
            wav_meta = read_remote(row["audio_filename"], wav, MAX_BYTES)
            if midi.read_bytes()[:4] != b"MThd" or wav.read_bytes()[:4] != b"RIFF":
                raise ValueError("Source is not a standard MIDI/WAV recording")
            payload = {
                "dataset": "MAESTRO v3.0.0",
                "license": "CC BY-NC-SA 4.0",
                "upstream_metadata": metadata,
                "split": row["split"],
                "composer": row.get("canonical_composer"),
                "title": row.get("canonical_title"),
                "year": row["year"],
                "reported_duration_seconds": duration,
                "midi_filename": row["midi_filename"],
                "audio_filename": row["audio_filename"],
                "source_midi": midi_meta,
                "source_audio": wav_meta,
            }
            (destination / "source.json").write_text(json.dumps(payload, indent=2) + "\n")
            print(json.dumps({"selected": row["audio_filename"], "year": row["year"],
                              "duration_seconds": duration, "wav_bytes": wav_meta["bytes"]}))
            return
        except Exception as exc:
            errors.append(f"{row['audio_filename']}: {exc}")
            for path in (midi, wav):
                path.unlink(missing_ok=True)
    raise RuntimeError("No accessible MAESTRO pair after six attempts: " +
                       "; ".join(errors))


if __name__ == "__main__":
    main()
