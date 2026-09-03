from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./translations.db"

#opens a connection to a database
engine = create_engine( 
    DATABASE_URL, connect_args={"check_same_thread": False} #Turns off SQLite safety check
)
#To control when writes happen to the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) 

#Creates a Base class that database table defs will inherit from
Base = declarative_base() 