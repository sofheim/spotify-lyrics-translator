import { useState } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [query, setQuery] = useState('')
  const [songs, setSongs] = useState([])
  const [originalLyrics, setOriginalLyrics] = useState('')
  const [translatedLyrics, setTranslatedLyrics] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async () => {
    if (!query) return
    setLoading(true)
    setOriginalLyrics('')
    setTranslatedLyrics('')
    setError('')
    try {
      const response = await axios.get(`http://localhost:8000/search`, { params: { query } })
      setSongs(response.data.tracks.items)
    } catch (error) {
      console.error('Error:', error)
    }
    setLoading(false)
  }

  const handleGetLyrics = async (songName, artistName) => {
    setLoading(true)
    setOriginalLyrics('')
    setTranslatedLyrics('')
    setError('')
    try {
      const response = await axios.get(`http://localhost:8000/translate`, {
        params: { song_name: songName, artist_name: artistName },
      })
      if (response.data.error) {
        setError(response.data.error)
      } else {
        setOriginalLyrics(response.data.original)
        setTranslatedLyrics(response.data.translated)
      }
    } catch (error) {
      console.error('Error:', error)
      setError('Something went wrong fetching the translation.')
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', backgroundColor: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <h1>🎵 Spotify Lyrics Translator</h1>
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs..."
          style={{ padding: '10px', width: '300px', fontSize: '16px' }}
        />
        <button onClick={handleSearch} style={{ padding: '10px 20px', marginLeft: '10px', cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {loading && <p>Loading...</p>}
      
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          {songs.map((song) => (
            <div key={song.id} style={{ border: '1px solid #444', padding: '10px', margin: '10px 0', backgroundColor: '#222', borderRadius: '8px' }}>
              <h3>{song.name}</h3>
              <p>{song.artists[0].name}</p>
              {song.album.images[0] && <img src={song.album.images[0].url} alt={song.name} style={{ width: '100px', borderRadius: '4px' }} />}
              <button onClick={() => handleGetLyrics(song.name, song.artists[0].name)} style={{ padding: '8px 16px', marginTop: '10px', cursor: 'pointer' }}>
                Get Translated Lyrics
              </button>
            </div>
          ))}
        </div>

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        {originalLyrics && (
          <div style={{ flex: 1, border: '1px solid #444', padding: '10px', maxHeight: '600px', overflowY: 'auto', backgroundColor: '#222', borderRadius: '8px' }}>
            <h3>Original</h3>
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '12px' }}>{originalLyrics}</pre>
          </div>
        )}

        {translatedLyrics && (
          <div style={{ flex: 1, border: '1px solid #444', padding: '10px', maxHeight: '600px', overflowY: 'auto', backgroundColor: '#222', borderRadius: '8px' }}>
            <h3>English</h3>
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '12px' }}>{translatedLyrics}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App