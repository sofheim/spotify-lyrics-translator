import re
import requests
import os
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# Matches a line that is ONLY a section annotation, e.g. "[Verse 1: Artist]"
# or "[Chorus]" - these are Genius's structural markers, not sung lyrics.
_SECTION_TAG = re.compile(r"^\[[^\]]*\]$")

GENIUS_ACCESS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")

_session = requests.Session()

# Genius's crowd-translation teams don't follow one consistent naming
# pattern per language, so this can only cover ones we've confirmed exist.
# Languages not listed here just skip the Romanized+translation pairing
# fallback (find_lyrics still works normally for the common case).
GENIUS_TRANSLATION_TEAMS = {
    "en": "Genius English Translations",
    "tr": "Genius Türkçe Çeviriler",
    "pt": "Genius Brasil Traduções",
    "it": "Genius Traduzioni Italiane",
    "id": "Genius Terjemahan Indonesia",
}


def _search_hits(song_name, artist_name):
    url = "https://api.genius.com/search"
    headers = {"Authorization": f"Bearer {GENIUS_ACCESS_TOKEN}"}
    params = {"q": f"{song_name} {artist_name}"}

    response = _session.get(url, headers=headers, params=params)
    data = response.json()
    return [hit["result"] for hit in data["response"]["hits"]]


def _scrape_lyrics_page(url):
    page = _session.get(url)
    soup = BeautifulSoup(page.content, "html.parser")

    lyrics_divs = soup.find_all("div", {"data-lyrics-container": "true"})
    if not lyrics_divs:
        return None

    lines = []
    for div in lyrics_divs:
        # Genius nests non-lyric chrome (contributor count, translation
        # dropdown, song description blurb) in elements it marks with
        # this attribute, inside the same lyrics container.
        for chrome in div.find_all(attrs={"data-exclude-from-selection": "true"}):
            chrome.decompose()
        for br in div.find_all("br"):
            br.replace_with("\n")
        lines.append(div.get_text())

    lyrics = "\n".join(lines).strip()
    return lyrics or None


def get_lyrics(song_name, artist_name):
    """Simple plain-text lookup, kept for the standalone /lyrics endpoint."""
    result = find_lyrics(song_name, artist_name)
    return result["original"] if result else None


def find_lyrics(song_name, artist_name, target_lang="en"):
    """Look up lyrics on Genius, working around a common quirk: for
    internationally popular non-English songs, Genius's own crowd-sourced
    translation/romanization pages (contributed by accounts like "Genius
    Romanizations" or "Genius English Translations") often outrank the
    real artist's own canonical lyrics page in search results - naively
    taking the #1 hit can land on a Turkish translation page, for example.

    Returns a dict {"original": text, "translated": text_or_None}.
    `translated` is only set when we fall back to a matched "Romanized" +
    same-language Genius translation-team page pair (e.g. a song whose
    only lyrics on Genius are romanized, such as many Japanese songs
    written in the Latin alphabet, which Google Translate can't translate
    at all even when told the source is Japanese - it expects native
    script). That translation comes pre-made from Genius's own community
    rather than our translate step, and since it's a separately-formatted
    page, it won't align line-for-line with the original - the caller
    should not try to zip them into synced per-line pairs.
    """
    hits = _search_hits(song_name, artist_name)
    if not hits:
        return None

    artist_lower = artist_name.lower()
    canonical = next(
        (h for h in hits if artist_lower in h["primary_artist"]["name"].lower()),
        None,
    )
    if canonical:
        lyrics = _scrape_lyrics_page(canonical["url"])
        return {"original": lyrics, "translated": None} if lyrics else None

    team_name = GENIUS_TRANSLATION_TEAMS.get(target_lang)
    if team_name:
        romanized = next((h for h in hits if "(Romanized)" in h["title"]), None)
        translation_hit = next(
            (h for h in hits if h["primary_artist"]["name"] == team_name), None
        )
        if romanized and translation_hit:
            original_text = _scrape_lyrics_page(romanized["url"])
            translated_text = _scrape_lyrics_page(translation_hit["url"])
            if original_text and translated_text:
                return {"original": original_text, "translated": translated_text}

    # Nothing matched the artist and no usable Romanized+translation pair -
    # fall back to whatever ranked first, same as the old behavior.
    lyrics = _scrape_lyrics_page(hits[0]["url"])
    return {"original": lyrics, "translated": None} if lyrics else None


def strip_section_tags(text_lines):
    """Drop lines that are purely a section annotation like "[Chorus]" or
    "[Verse 1: Artist]" - not actual lyrics, just Genius's structure markers."""
    return [line for line in text_lines if not _SECTION_TAG.match(line.strip())]