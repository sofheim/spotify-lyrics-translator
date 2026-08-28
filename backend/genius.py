import requests
import os
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

GENIUS_ACCESS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")

def get_lyrics(song_name, artist_name):
    url = "https://api.genius.com/search"
    headers = {"Authorization": f"Bearer {GENIUS_ACCESS_TOKEN}"}
    params = {"q": f"{song_name} {artist_name}"}

    response = requests.get(url, headers=headers, params=params)
    data = response.json()

    if not data["response"]["hits"]:
        return None

    song_url = data["response"]["hits"][0]["result"]["url"]

    # Scrape lyrics from Genius page
    page = requests.get(song_url)
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