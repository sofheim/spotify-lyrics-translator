import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from models import Translation
from spotify import search_spotify, get_artist
from genius import get_lyrics, find_lyrics, strip_section_tags
from translation import translate_lines
from lyrics_sync import get_synced_lines

Base.metadata.create_all(bind=engine)


def _translation_looks_failed(original_lines, translated_lines):
    """Detect when translate_lines() silently echoed the input back instead
    of actually translating it. This happens for text Google Translate's
    language auto-detection can't handle - most commonly romanized
    non-Latin-script lyrics (e.g. Japanese written in the Latin alphabet),
    which it doesn't recognize as translatable even with the source
    language set explicitly. A handful of naturally-identical short lines
    (interjections, "la la la") is normal, so only flag it when the large
    majority of lines came back completely unchanged."""
    if not original_lines:
        return False
    identical = sum(
        1 for o, t in zip(original_lines, translated_lines) if o.strip() == t.strip()
    )
    return identical / len(original_lines) > 0.8


def _align_translation_lines(original_lines, translated_text):
    """When we only have a translation as a separately-formatted block of
    text (e.g. from a different Genius page than the original lyrics),
    approximate a per-line pairing by proportionally mapping each original
    line to whichever translated line sits at the same relative position.
    This won't line up meaning exactly, but it keeps highlighting/auto-
    scroll following the original's real timing, which matters more than
    the translated side being occasionally imprecise."""
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


def _estimate_timestamps(lines, duration_ms):
    """Guess per-line timestamps when no real synced lyrics are available,
    by giving each line a share of the track duration proportional to its
    character count - a long verse takes longer to sing than a short
    refrain, so this tracks real pacing noticeably better than splitting
    the duration evenly across lines."""
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    # separately per target language, since the translated text differs)
    cached = db.query(Translation).filter(
        Translation.song_name == song_name,
        Translation.artist == artist_name,
        Translation.target_lang == target_lang,
    ).first()

    if cached:
        db.close()
        return {"synced": cached.synced, "lines": json.loads(cached.lines_json)}

    # Try real per-line timing from lrclib first; fall back to Genius's
    # plain lyrics with timestamps estimated by evenly spacing lines across
    # the track's duration.
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
            # Genius could only offer a romanized page (e.g. many Japanese
            # songs written in the Latin alphabet, which Google Translate
            # can't translate at all) paired with its own community
            # translation from a separate page. Keep the original's own
            # per-line timing and approximate-map the translation onto it
            # rather than losing highlighting entirely.
            pregenerated_translation = lyrics_result["translated"]

    # Translate line-by-line (not as one blob) so original/translated lines
    # stay index-aligned and can share the same timestamps for highlighting.
    if pregenerated_translation is not None:
        translated_lines = _align_translation_lines(original_lines, pregenerated_translation)
    else:
        translated_lines = translate_lines(original_lines, target_lang)
        if translated_lines is None:
            db.close()
            return {"error": "Translation failed, please try again"}

        if _translation_looks_failed(original_lines, translated_lines):
            # Google Translate silently failed on this text (e.g. lrclib's
            # synced lyrics for this song turned out to be romanized, same
            # problem as the Genius-only case above, just from a different
            # source) - fall back to Genius's own paired translation page
            # if one exists, keeping the real timestamps we already have.
            fallback = find_lyrics(song_name, artist_name, target_lang)
            if fallback and fallback.get("translated"):
                translated_lines = _align_translation_lines(original_lines, fallback["translated"])

    lines = [
        {"time_ms": t, "original": o, "translated": tr}
        for t, o, tr in zip(timestamps, original_lines, translated_lines)
    ]

    # Save to database (only once translation actually succeeded, so a
    # transient failure doesn't get cached forever as this song's result)
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