import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor

GOOGLE_TRANSLATE_URL = "https://translate.google.com/m"
MAX_WORKERS = 8

# Google serves a "Server Error" page (as a normal 200 response) to
# requests without a browser-like User-Agent instead of translating them.
# deep_translator doesn't let us set this, so we call the endpoint directly.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

# Sized to MAX_WORKERS so the concurrent translate workers aren't fighting
# each other for a too-small connection pool (requests defaults to 10).
_session = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
_session.mount("https://", _adapter)


def _translate_chunk(text, target="en"):
    response = _session.get(
        GOOGLE_TRANSLATE_URL,
        params={"sl": "auto", "tl": target, "q": text},
        headers=HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    result = soup.find("div", {"class": "result-container"})
    if result is None:
        raise RuntimeError("Google Translate returned an unexpected response")

    return result.get_text()


def translate_lines(lines):
    """Translate each line independently (in parallel) so line N of the
    result always lines up with line N of the input - needed to keep
    original/translated lyrics in sync for highlighting. A single line
    that fails to translate falls back to its original text; if every
    line fails (e.g. Google Translate itself is down), returns None so
    the caller doesn't cache a batch of un-translated "translations"."""

    def _try(text):
        try:
            return _translate_chunk(text), True
        except Exception:
            return text, False

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        results = list(executor.map(_try, lines))

    if not any(ok for _, ok in results):
        return None

    return [text for text, _ok in results]