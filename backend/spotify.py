import requests
import base64
import os
import time
from dotenv import load_dotenv

load_dotenv()

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

# A shared, reused connection avoids paying a fresh TLS handshake on every
# call - meaningfully faster for search-as-you-type hitting this repeatedly.
_session = requests.Session()

_token_cache = {"access_token": None, "expires_at": 0}

def get_spotify_token():
    # Client-credentials tokens are valid for ~1 hour; fetching a brand new
    # one on every request (as this used to) added a full extra round trip
    # to accounts.spotify.com before every single search/artist lookup.
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    auth_str = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
    auth_bytes = auth_str.encode("utf-8")
    auth_base64 = str(base64.b64encode(auth_bytes), "utf-8")

    url = "https://accounts.spotify.com/api/token"
    headers = {
        "Authorization": f"Basic {auth_base64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}

    response = _session.post(url, headers=headers, data=data)
    json_result = response.json()

    _token_cache["access_token"] = json_result["access_token"]
    _token_cache["expires_at"] = time.time() + json_result.get("expires_in", 3600)

    return _token_cache["access_token"]

def search_spotify(query):
    token = get_spotify_token()
    url = "https://api.spotify.com/v1/search"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"q": query, "type": "track", "limit": 6}

    response = _session.get(url, headers=headers, params=params)
    return response.json()

def get_artist(artist_id):
    token = get_spotify_token()
    url = f"https://api.spotify.com/v1/artists/{artist_id}"
    headers = {"Authorization": f"Bearer {token}"}

    response = _session.get(url, headers=headers)
    return response.json()