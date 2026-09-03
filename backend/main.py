import json
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from models import Translation
from spotify import search_spotify, get_artist
from genius import get_lyrics, find_lyrics, strip_section_tags
from translation import translate_lines
from lyrics_sync import get_synced_lines

#Creates missing tables in database
Base.metadata.create_all(bind=engine)

#this func detects when translation fails and original lines are returned 
def _translation_looks_failed(original_lines, translated_lines):
    if not original_lines:
        return False
    identical = sum(
        1 for o, t in zip(original_lines, translated_lines) if o.strip() == t.strip()
    )
    return identical / len(original_lines) > 0.8

#this func aligns translation lines that doesn't have real per-line stamps
def _align_translation_lines(original_lines, translated_text):

    translated_lines_all = strip_section_tags(
        [line for line in translated_text.split("\n") if line.strip()]
    )
    if not translated_lines_all:
        return [""] * len(original_lines)

    if len(original_lines) == 1:
        return ["\n".join(translated_lines_all)]

    last_index = len(translated_lines_all) - 1
    return [
        translated_lines_all[round(i * last_index / (len(original_lines) - 1))]
        for i in range(len(original_lines))
    ]

#This func estimates the time stamps for unavailable synced lyrics
def _estimate_timestamps(lines, duration_ms):

    if not duration_ms:
        return [i * 3000 for i in range(len(lines))]

    weights = [max(len(line), 1) for line in lines]
    total_weight = sum(weights)
    timestamps = []
    cumulative = 0
    for weight in weights:
        timestamps.append(int(cumulative / total_weight * duration_ms))
        cumulative += weight
    return timestamps

app = FastAPI()

# Comma-separated list of allowed frontend origins. Defaults to the local
# Vite dev server; set FRONTEND_URL in production to the deployed frontend's
# URL(s) instead of leaving this open to any site.
ALLOWED_ORIGINS = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "hello"}

@app.get("/search")
def search(query: str):
    return search_spotify(query)

@app.get("/artist")
def artist(artist_id: str):
    return get_artist(artist_id)

@app.get("/lyrics")
def lyrics(song_name: str, artist_name: str):
    lyrics_text = get_lyrics(song_name, artist_name)
    if not lyrics_text:
        return {"error": "Lyrics not found"}
    return {"lyrics": lyrics_text}

@app.get("/translate")
def translate(song_name: str, artist_name: str, duration_ms: int | None = None, target_lang: str = "en"):
    db = SessionLocal()

    # Check if we already have this translation cached (a song is cached
    # separately per language)
    cached = db.query(Translation).filter(
        Translation.song_name == song_name,
        Translation.artist == artist_name,
        Translation.target_lang == target_lang,
    ).first()

    if cached:
        db.close()
        return {"synced": cached.synced, "lines": json.loads(cached.lines_json)}

    # Try real per-line timing from lrclib first otherwise Genius's
    # plain lyrics 
    synced_lines = get_synced_lines(song_name, artist_name, duration_ms)
    synced = synced_lines is not None

    pregenerated_translation = None

    if synced_lines is not None:
        original_lines = [line["text"] for line in synced_lines]
        timestamps = [line["time_ms"] for line in synced_lines]
    else:
        lyrics_result = find_lyrics(song_name, artist_name, target_lang)
        if not lyrics_result or not lyrics_result.get("original"):
            db.close()
            return {"error": "Lyrics not found"}

        original_lines = [line for line in lyrics_result["original"].split("\n") if line.strip()]
        original_lines = strip_section_tags(original_lines)
        if not original_lines:
            db.close()
            return {"error": "Lyrics not found"}

        timestamps = _estimate_timestamps(original_lines, duration_ms)

        if lyrics_result.get("translated"):
            pregenerated_translation = lyrics_result["translated"]

    # Translate line-by-line so original/translated lines
    # share the same timestamps for highlighting
    if pregenerated_translation is not None:
        translated_lines = _align_translation_lines(original_lines, pregenerated_translation)
    else:
        translated_lines = translate_lines(original_lines, target_lang)
        if translated_lines is None:
            db.close()
            return {"error": "Translation failed, please try again"}

        if _translation_looks_failed(original_lines, translated_lines):
            # translation fails -> fall back to Genius's translation page
            # if one exists, keeping real timestamps. translation_only=True
            # so this isn't derailed by a canonical native-script page also
            # existing on Genius for this song - we only want the
            # translated text here, not a fresh "original" to replace ours.
            fallback = find_lyrics(song_name, artist_name, target_lang, translation_only=True)
            if fallback and fallback.get("translated"):
                translated_lines = _align_translation_lines(original_lines, fallback["translated"])

    lines = [
        {"time_ms": t, "original": o, "translated": tr}
        for t, o, tr in zip(timestamps, original_lines, translated_lines)
    ]

    # Save to database
    new_translation = Translation(
        song_name=song_name,
        artist=artist_name,
        target_lang=target_lang,
        synced=synced,
        lines_json=json.dumps(lines),
    )
    db.add(new_translation)
    db.commit()
    db.close()

    return {"synced": synced, "lines": lines}