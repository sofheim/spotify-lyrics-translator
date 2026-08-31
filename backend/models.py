from sqlalchemy import Column, Integer, String, Text, Boolean
from database import Base

class Translation(Base):
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True, index=True)
    song_name = Column(String, index=True)
    artist = Column(String, index=True)
    target_lang = Column(String, index=True, default="en")  # a song can be cached per target language
    synced = Column(Boolean, default=False)  # real lrclib timing vs. estimated
    lines_json = Column(Text)  # JSON list of {time_ms, original, translated}