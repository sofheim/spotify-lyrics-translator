import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import './App.css'
import { redirectToSpotifyLogin, exchangeCodeForToken, getValidAccessToken, logout } from './spotifyAuth'
import { useSpotifyPlayer } from './useSpotifyPlayer'

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Scrolls only this container to bring `line` into view, instead of
// Element.scrollIntoView() which also drags the whole page along with it.
function scrollLineIntoView(container, line) {
  if (!container || !line) return
  const target = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2
  container.scrollTo({ top: target, behavior: 'smooth' })
}

const SUGGESTIONS_QUERY = 'year:2025 genre:pop'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
]

function App() {
  const [query, setQuery] = useState('')
  const [targetLang, setTargetLang] = useState('en')
  const [songs, setSongs] = useState([])
  const [showingSearchResults, setShowingSearchResults] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSong, setSelectedSong] = useState(null)
  const [artistInfo, setArtistInfo] = useState(null)
  const [lyricLines, setLyricLines] = useState([])
  const [syncedAccurate, setSyncedAccurate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [seekPreview, setSeekPreview] = useState(null)
  const originalLineRefs = useRef([])
  const translatedLineRefs = useRef([])
  const originalContainerRef = useRef(null)
  const translatedContainerRef = useRef(null)
  const searchRequestId = useRef(0)
  const suggestionsRequestId = useRef(0)
  const skipNextSuggestionFetch = useRef(false)

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
  // Position/duration only mean something once the SDK is actually playing
  // *this* song - otherwise they'd belong to whatever played previously.
  const isPlayingSelectedSong = canUseInAppPlayer && selectedSong && player.activeTrackId === selectedSong.id

  // Only highlight/auto-scroll when we have REAL synced timing. Estimated
  // timing has no way to know about instrumental intros, breaks, etc., so
  // showing a confidently-wrong highlight is worse than showing none.
  const canHighlight = isPlayingSelectedSong && syncedAccurate

  const activeLineIndex = useMemo(() => {
    if (!canHighlight || lyricLines.length === 0) return -1
    let index = -1
    for (let i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].time_ms <= player.position) index = i
      else break
    }
    return index
  }, [canHighlight, lyricLines, player.position])

  useEffect(() => {
    if (activeLineIndex < 0) return
    scrollLineIntoView(originalContainerRef.current, originalLineRefs.current[activeLineIndex])
    scrollLineIntoView(translatedContainerRef.current, translatedLineRefs.current[activeLineIndex])
  }, [activeLineIndex])

  const handleLogout = () => {
    logout()
    setAccessToken(null)
    setSpotifyUser(null)
  }

  // Race-guarded so a slow older request can't overwrite newer results.
  const runSearch = async (q) => {
    const requestId = ++searchRequestId.current
    setLoading(true)
    try {
      const response = await axios.get(`http://localhost:8000/search`, { params: { query: q } })
      if (requestId === searchRequestId.current) {
        setSongs(response.data.tracks.items)
      }
    } catch (error) {
      console.error('Error:', error)
    }
    if (requestId === searchRequestId.current) {
      setLoading(false)
    }
  }

  // Load the homepage's default "suggested songs" grid once on mount.
  useEffect(() => {
    runSearch(SUGGESTIONS_QUERY)
  }, [])

  // Lightweight live results for the Google-style autocomplete dropdown -
  // separate from the results grid, so typing doesn't disturb whatever's
  // currently playing/open until the user actually commits to a search.
  const runSuggestions = async (q) => {
    const requestId = ++suggestionsRequestId.current
    try {
      const response = await axios.get(`http://localhost:8000/search`, { params: { query: q } })
      if (requestId === suggestionsRequestId.current) {
        setSuggestions(response.data.tracks.items)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  useEffect(() => {
    // Selecting a suggestion sets `query` to its name to show what was
    // picked - skip re-triggering a fresh suggestions fetch for that one
    // programmatic change, or the dropdown pops back open a moment later.
    if (skipNextSuggestionFetch.current) {
      skipNextSuggestionFetch.current = false
      return
    }
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timeout = setTimeout(() => {
      runSuggestions(query)
      setShowSuggestions(true)
    }, 400)
    return () => clearTimeout(timeout)
  }, [query])

  // An explicit search (button/Enter) is a hard commitment: stop whatever's
  // currently playing and clear the open song so only the results show.
  const handleSearch = () => {
    if (!query.trim()) return
    setShowSuggestions(false)
    setSuggestions([])
    if (isPlayingSelectedSong) player.pause()
    setSelectedSong(null)
    setArtistInfo(null)
    setLyricLines([])
    setError('')
    setShowingSearchResults(true)
    runSearch(query)
  }

  const handleSelectSuggestion = (song) => {
    skipNextSuggestionFetch.current = true
    setQuery(song.name)
    setShowSuggestions(false)
    setSuggestions([])
    handleSelectSong(song)
  }

  const handleSelectSong = async (song) => {
    setLoading(true)
    setSelectedSong(song)
    setArtistInfo(null)
    setLyricLines([])
    setSeekPreview(null)
    setError('')
    try {
      const [translateResponse, artistResponse] = await Promise.all([
        axios.get(`http://localhost:8000/translate`, {
          params: {
            song_name: song.name,
            artist_name: song.artists[0].name,
            duration_ms: song.duration_ms,
            target_lang: targetLang,
          },
        }),
        axios.get(`http://localhost:8000/artist`, {
          params: { artist_id: song.artists[0].id },
        }),
      ])

      if (translateResponse.data.error) {
        setError(translateResponse.data.error)
      } else {
        setLyricLines(translateResponse.data.lines)
        setSyncedAccurate(translateResponse.data.synced)
      }
      setArtistInfo(artistResponse.data)
    } catch (error) {
      console.error('Error:', error)
      setError('Something went wrong fetching the translation.')
    }
    setLoading(false)
  }

  // Re-fetch the open song's lyrics whenever the target language changes.
  useEffect(() => {
    if (selectedSong) handleSelectSong(selectedSong)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLang])

  const songsGrid = songs.length > 0 && (
    <div style={{ marginBottom: '30px' }}>
      <h2 style={{ fontSize: '16px' }}>{showingSearchResults ? 'Results' : 'Suggested Songs'}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center' }}>
        {songs.map((song) => (
          <div key={song.id} style={{ border: '1px solid #444', padding: '8px', backgroundColor: '#222', borderRadius: '8px', width: '130px' }}>
            <h3 style={{ fontSize: '13px' }}>{song.name}</h3>
            <p style={{ fontSize: '11px' }}>{song.artists[0].name}</p>
            {song.album.images[0] && <img src={song.album.images[0].url} alt={song.name} style={{ width: '100%', borderRadius: '4px' }} />}
            <button onClick={() => handleSelectSong(song)} style={{ padding: '6px 10px', marginTop: '8px', cursor: 'pointer', width: '100%', fontSize: '12px' }}>
              Get Translated Lyrics
            </button>
          </div>
        ))}
      </div>
    </div>
  )

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
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search songs..."
            style={{ padding: '10px', width: '300px', fontSize: '16px' }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '300px',
                backgroundColor: '#222',
                border: '1px solid #444',
                borderRadius: '4px',
                zIndex: 10,
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {suggestions.map((song) => (
                <div
                  key={song.id}
                  onMouseDown={() => handleSelectSuggestion(song)}
                  style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '13px' }}
                >
                  <strong>{song.name}</strong> — {song.artists[0].name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleSearch} style={{ padding: '10px 20px', marginLeft: '10px', cursor: 'pointer' }}>
          Search
        </button>
        <label style={{ marginLeft: '10px', fontSize: '14px' }}>
          Translate to:
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{ padding: '10px', marginLeft: '6px', fontSize: '14px', cursor: 'pointer' }}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedSong && songsGrid}

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
                      isPlayingSelectedSong ? player.togglePlay() : player.playTrack(selectedSong.id)
                    }
                    style={{ padding: '10px 20px', cursor: 'pointer' }}
                  >
                    {isPlayingSelectedSong && player.isPlaying ? '⏸ Pause' : '▶ Play Full Song'}
                  </button>

                  {player.playError && (
                    <p style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>
                      Couldn't start playback: {player.playError}
                    </p>
                  )}

                  {isPlayingSelectedSong && (
                    <div style={{ marginTop: '12px' }}>
                      <input
                        type="range"
                        min={0}
                        max={player.duration || 0}
                        value={seekPreview ?? player.position}
                        onChange={(e) => setSeekPreview(Number(e.target.value))}
                        onMouseUp={(e) => {
                          player.seek(Number(e.target.value))
                          setSeekPreview(null)
                        }}
                        onTouchEnd={(e) => {
                          player.seek(Number(e.target.value))
                          setSeekPreview(null)
                        }}
                        style={{ width: '100%' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{formatTime(seekPreview ?? player.position)}</span>
                        <span>{formatTime(player.duration)}</span>
                      </div>
                    </div>
                  )}
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

        {lyricLines.length > 0 && (
          <div ref={originalContainerRef} style={{ flex: 1, border: '1px solid #444', padding: '10px', maxHeight: '600px', overflowY: 'auto', backgroundColor: '#222', borderRadius: '8px' }}>
            <h3>Original{!syncedAccurate && ' (timing sync unavailable)'}</h3>
            {lyricLines.map((line, i) => (
              <p
                key={i}
                ref={(el) => (originalLineRefs.current[i] = el)}
                onClick={() => canHighlight && player.seek(line.time_ms)}
                style={{
                  margin: '6px 0',
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  cursor: canHighlight ? 'pointer' : 'default',
                  color: i === activeLineIndex ? '#1db954' : '#fff',
                  fontWeight: i === activeLineIndex ? 'bold' : 'normal',
                }}
              >
                {line.original}
              </p>
            ))}
          </div>
        )}

        {lyricLines.length > 0 && (
          <div ref={translatedContainerRef} style={{ flex: 1, border: '1px solid #444', padding: '10px', maxHeight: '600px', overflowY: 'auto', backgroundColor: '#222', borderRadius: '8px' }}>
            <h3>{LANGUAGES.find((l) => l.code === targetLang)?.label || 'Translated'}{!syncedAccurate && ' (timing sync unavailable)'}</h3>
            {lyricLines.map((line, i) => (
              <p
                key={i}
                ref={(el) => (translatedLineRefs.current[i] = el)}
                onClick={() => canHighlight && player.seek(line.time_ms)}
                style={{
                  margin: '6px 0',
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  cursor: canHighlight ? 'pointer' : 'default',
                  color: i === activeLineIndex ? '#1db954' : '#fff',
                  fontWeight: i === activeLineIndex ? 'bold' : 'normal',
                }}
              >
                {line.translated}
              </p>
            ))}
          </div>
        )}
      </div>

      {selectedSong && <div style={{ marginTop: '30px' }}>{songsGrid}</div>}
    </div>
  )
}

export default App