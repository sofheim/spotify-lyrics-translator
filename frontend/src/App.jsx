import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'
import { redirectToSpotifyLogin, exchangeCodeForToken, getValidAccessToken, logout } from './spotifyAuth'
import { useSpotifyPlayer } from './useSpotifyPlayer'

function App() {
  const [query, setQuery] = useState('')
  const [songs, setSongs] = useState([])
  const [selectedSong, setSelectedSong] = useState(null)
  const [artistInfo, setArtistInfo] = useState(null)
  const [originalLyrics, setOriginalLyrics] = useState('')
  const [translatedLyrics, setTranslatedLyrics] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [accessToken, setAccessToken] = useState(null)
  const [spotifyUser, setSpotifyUser] = useState(null)

  // On mount: finish the OAuth redirect (if we just came back from Spotify
  // with a `?code=`) or restore an existing session from localStorage.
  useEffect(() => {
    const init = async () => {
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        try {
          await exchangeCodeForToken(code)
        } catch (err) {
          console.error('Spotify login failed:', err)
        }
        window.history.replaceState({}, '', window.location.pathname)
      }
      setAccessToken(await getValidAccessToken())
    }
    init()
  }, [])

  // Once we have a token, fetch the profile (need `product` to know if
  // this account is Premium, which is required to actually play audio).
  useEffect(() => {
    if (!accessToken) {
      setSpotifyUser(null)
      return
    }
    axios
      .get('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((response) => setSpotifyUser(response.data))
      .catch((err) => {
        console.error('Error:', err)
        setSpotifyUser(null)
      })
  }, [accessToken])

  const isPremium = spotifyUser?.product === 'premium'
  const player = useSpotifyPlayer(isPremium ? accessToken : null)
  const canUseInAppPlayer = isPremium && player.deviceId && !player.isPremiumError

  const handleLogout = () => {
    logout()
    setAccessToken(null)
    setSpotifyUser(null)
  }

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

  const handleSelectSong = async (song) => {
    setLoading(true)
    setSelectedSong(song)
    setArtistInfo(null)
    setOriginalLyrics('')
    setTranslatedLyrics('')
    setError('')
    try {
      const [translateResponse, artistResponse] = await Promise.all([
        axios.get(`http://localhost:8000/translate`, {
          params: { song_name: song.name, artist_name: song.artists[0].name },
        }),
        axios.get(`http://localhost:8000/artist`, {
          params: { artist_id: song.artists[0].id },
        }),
      ])

      if (translateResponse.data.error) {
        setError(translateResponse.data.error)
      } else {
        setOriginalLyrics(translateResponse.data.original)
        setTranslatedLyrics(translateResponse.data.translated)
      }
      setArtistInfo(artistResponse.data)
    } catch (error) {
      console.error('Error:', error)
      setError('Something went wrong fetching the translation.')
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', backgroundColor: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1> Spotify Lyrics Translator</h1>
        {accessToken ? (
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0 }}>
              Logged in as {spotifyUser?.display_name || '...'}
              {spotifyUser && !isPremium && ' (Free — 30s previews only)'}
            </p>
            <button onClick={handleLogout} style={{ padding: '6px 12px', marginTop: '5px', cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        ) : (
          <button onClick={redirectToSpotifyLogin} style={{ padding: '10px 20px', cursor: 'pointer' }}>
            Log in with Spotify
          </button>
        )}
      </div>
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search songs..."
          style={{ padding: '10px', width: '300px', fontSize: '16px' }}
        />
        <button onClick={handleSearch} style={{ padding: '10px 20px', marginLeft: '10px', cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid #444', padding: '10px', backgroundColor: '#222', borderRadius: '8px' }}>
          {selectedSong ? (
            <>
              {canUseInAppPlayer ? (
                <div style={{ padding: '15px', backgroundColor: '#111', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 10px' }}>{selectedSong.name} — {selectedSong.artists[0].name}</p>
                  <button
                    onClick={() =>
                      player.currentTrackId === selectedSong.id ? player.togglePlay() : player.playTrack(selectedSong.id)
                    }
                    style={{ padding: '10px 20px', cursor: 'pointer' }}
                  >
                    {player.currentTrackId === selectedSong.id && player.isPlaying ? '⏸ Pause' : '▶ Play Full Song'}
                  </button>
                </div>
              ) : (
                <iframe
                  title="Spotify player"
                  src={`https://open.spotify.com/embed/track/${selectedSong.id}`}
                  width="100%"
                  height="152"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  style={{ borderRadius: '8px' }}
                />
              )}
              {artistInfo && (
                <div style={{ marginTop: '15px', textAlign: 'center' }}>
                  {artistInfo.images?.[0] && (
                    <img src={artistInfo.images[0].url} alt={artistInfo.name} style={{ width: '100%', borderRadius: '8px' }} />
                  )}
                  <h3>{artistInfo.name}</h3>
                </div>
              )}
            </>
          ) : (
            <p>Select a song below to see the player and artist info.</p>
          )}
        </div>

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

      {songs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '30px' }}>
          {songs.map((song) => (
            <div key={song.id} style={{ border: '1px solid #444', padding: '10px', backgroundColor: '#222', borderRadius: '8px', width: '150px' }}>
              <h3 style={{ fontSize: '14px' }}>{song.name}</h3>
              <p style={{ fontSize: '12px' }}>{song.artists[0].name}</p>
              {song.album.images[0] && <img src={song.album.images[0].url} alt={song.name} style={{ width: '100%', borderRadius: '4px' }} />}
              <button onClick={() => handleSelectSong(song)} style={{ padding: '8px 16px', marginTop: '10px', cursor: 'pointer', width: '100%' }}>
                Get Translated Lyrics
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App