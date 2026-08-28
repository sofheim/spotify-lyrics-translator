import re
import requests

LRCLIB_URL = "https://lrclib.net/api/get"

_session = requests.Session()

_LRC_LINE = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)")
# Some LRC submissions include section markers like "[Chorus]" as their own
# timestamped line - not actual lyrics, so we drop them like we do for Genius.
_SECTION_TAG = re.compile(r"^\[[^\]]*\]$")


def get_synced_lines(song_name, artist_name, duration_ms=None):
    """Look up real per-line timestamps for a song from lrclib.net, a free
    open lyrics-timing database. Returns None if lrclib has no match."""
    params = {"track_name": song_name, "artist_name": artist_name}
    if duration_ms:
        params["duration"] = round(duration_ms / 1000)

    try:
        response = _session.get(LRCLIB_URL, params=params, timeout=10)
    except requests.RequestException:
        return None

    if response.status_code != 200:
        return None

    lrc_text = response.json().get("syncedLyrics")
    if not lrc_text:
        return None

    return _parse_lrc(lrc_text)


def _parse_lrc(lrc_text):
    lines = []
    for raw_line in lrc_text.splitlines():
        match = _LRC_LINE.match(raw_line)
        if not match:
            continue
        minutes, seconds, text = match.groups()
        text = text.strip()
        if not text or _SECTION_TAG.match(text):
            continue
        time_ms = int((int(minutes) * 60 + float(seconds)) * 1000)
        lines.append({"time_ms": time_ms, "text": text})

    return lines or None
