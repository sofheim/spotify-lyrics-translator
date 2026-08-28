import requests
from bs4 import BeautifulSoup

GOOGLE_TRANSLATE_URL = "https://translate.google.com/m"
CHUNK_SIZE = 4000  # safe limit for a single translate request

# Google serves a "Server Error" page (as a normal 200 response) to
# requests without a browser-like User-Agent instead of translating them.
# deep_translator doesn't let us set this, so we call the endpoint directly.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def _translate_chunk(text, target="en"):
    response = requests.get(
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


def translate_to_english(text):
    if not text:
        return None

    chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]

    try:
        translated_chunks = [_translate_chunk(chunk) for chunk in chunks]
    except Exception:
        return None

    return '\n'.join(translated_chunks)