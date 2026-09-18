import requests
from concurrent.futures import ThreadPoolExecutor

# The /m endpoint (the mobile web page) gets rate-limited hard, returning
# 429 on nearly every request once deployed on a cloud host. This is the
# endpoint the gtx web client itself calls under the hood, and it holds up
# far better - no API key needed, but return format is JSON, not HTML.
GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
MAX_WORKERS = 8

# Call the endpoint directly
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

# Sized to MAX_WORKERS 
_session = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
_session.mount("https://", _adapter)


def _translate_chunk(text, target="en"):
    response = _session.get(
        GOOGLE_TRANSLATE_URL,
        params={"client": "gtx", "sl": "auto", "tl": target, "dt": "t", "q": text},
        headers=HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    data = response.json()
    # data[0] is a list of [translated_segment, original_segment, ...]
    # tuples - Google splits long input into multiple sentence segments.
    segments = data[0] if data and data[0] else None
    if not segments:
        raise RuntimeError("Google Translate returned an unexpected response")

    return "".join(segment[0] for segment in segments)

#translate each line independently so that the result lines up with the input
#Failed lines returns to default lang
def translate_lines(lines, target="en"):

    def _try(text):
        try:
            return _translate_chunk(text, target), True
        except Exception:
            return text, False

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        results = list(executor.map(_try, lines))

    if not any(ok for _, ok in results):
        return None

    return [text for text, _ok in results]