# Spotify Lyrics Translator

A full-stack app that searches Spotify, pulls up a song's lyrics, and translates them into your language of choice — with real-time synced highlighting that follows along as the song plays.

**Live demo:** https://spotify-song-translator-lqlc.vercel.app/

## Features

- **Spotify search** with a live autocomplete dropdown
- **Spotify OAuth login** (PKCE flow) — Premium users get full in-app playback via the Spotify Web Playback SDK (play/pause, seek bar); non-Premium users get an embedded Spotify player
- **Synced lyric highlighting**: when real per-line timing is available (via [lrclib](https://lrclib.net)), the current line highlights and auto-scrolls in time with playback; otherwise timing is estimated proportionally from each line's length
- **Translation into 16 languages**, with results cached so repeat lookups are instant
- **Romanized-lyrics handling**: for songs where only Latin-alphabet transliterated lyrics exist (e.g. many Japanese songs), automatically falls back to Genius's own community-translated lyrics page instead of feeding unrecognizable text to Google Translate

## Tech Stack

**Backend:** FastAPI (Python), SQLAlchemy + SQLite, Genius API, lrclib

**Frontend:** React + Vite, Tailwind CSS v4, the S

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt

Create backend/.env:
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
GENIUS_ACCESS_TOKEN=your_genius_access_token

uvicorn main:app --reload

Frontend

cd frontend
npm install

Create frontend/.env:
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/
VITE_API_URL=http://localhost:8000

npm run dev

You'll need your own Spotify Developer (https://developer.spotify.com/dashboard) app (with http://127.0.0.1:5173/ registered as a
Redirect URI) and a Genius API (https://genius.com

Known Limitations

- Translation alignment for romanized-lyrics fallbonal line-position mapping), not exactmeaning-matched, since Genius's translation pages aren't formatted per-line
- Free-tier hosting means the backend may take ~30request after a period of inactivity
- Genius doesn't have every song, so lyrics lookup occasionally comes back empty
