import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor

GOOGLE_TRANSLATE_URL = "https://translate.google.com/m"
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