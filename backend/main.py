from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from models import Translation
from spotify import search_spotify
from genius import get_lyrics
from translation import translate_to_english

Base.metadata.create_all(bind=engine)

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

@app.get("/lyrics")
def lyrics(song_name: str, artist_name: str):
    lyrics_text = get_lyrics(song_name, artist_name)
    if not lyrics_text:
        return {"error": "Lyrics not found"}
    return {"lyrics": lyrics_text}

@app.get("/translate")
def translate(song_name: str, artist_name: str):
    db = SessionLocal()
    
    # Check if we already have this translation cached
    cached = db.query(Translation).filter(
        Translation.song_name == song_name,
        Translation.artist == artist_name
    ).first()
    
    if cached:
        db.close()
        return {"original": cached.original_lyrics, "translated": cached.translated_lyrics}
    
    # Get lyrics
    lyrics_text = get_lyrics(song_name, artist_name)
    if not lyrics_text:
        db.close()
        return {"error": "Lyrics not found"}
    
    # Translate
    translated = translate_to_english(lyrics_text)
    if not translated:
        db.close()
        return {"error": "Translation failed, please try again"}

    # Save to database (only once translation actually succeeded, so a
    # transient failure doesn't get cached forever as this song's result)
    new_translation = Translation(
        song_name=song_name,
        artist=artist_name,
        original_lyrics=lyrics_text,
        translated_lyrics=translated
    )
    db.add(new_translation)
    db.commit()
    db.close()

    return {"original": lyrics_text, "translated": translated}