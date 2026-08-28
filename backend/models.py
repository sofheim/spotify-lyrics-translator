from sqlalchemy import Column, Integer, String, Text
from database import Base

class Translation(Base):
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True, index=True)
    song_name = Column(String, index=True)
    artist = Column(String, index=True)
    original_lyrics = Column(Text)
    translated_lyrics = Column(Text)