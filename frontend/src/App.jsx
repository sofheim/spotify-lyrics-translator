import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { redirectToSpotifyLogin, exchangeCodeForToken, getValidAccessToken, logout } from './spotifyAuth'
import { useSpotifyPlayer } from './useSpotifyPlayer'

const BUTTON_CLASS = 'cursor-pointer rounded-[4px] border border-border bg-panel text-white hover:bg-panel-dark'
const PANEL_CLASS = 'border border-border bg-panel rounded-[8px]'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Scrolls only the container to bring line into view
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
  const suggestionsTimeoutId = useRef(null)
  const suppressSuggestions = useRef(false)

  const [accessToken, setAccessToken] = useState(null)
  const [spotifyUser, setSpotifyUser] = useState(null)

  // finish the OAuth redirect or restore existing session
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

  // Once we have a token fetch the profile
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
  // Position/duration only mean something once the SDK is playing
  const isPlayingSelectedSong = canUseInAppPlayer && selectedSong && player.currentTrackId === selectedSong.id

  // Only highlight/auto-scroll when we have REAL synced timing
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

  // Race-guarded
  const runSearch = async (q) => {
    const requestId = ++searchRequestId.current
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/search`, { params: { query: q } })
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

  // Load the homepage suggested songs on launch
  useEffect(() => {
    runSearch(SUGGESTIONS_QUERY)
  }, [])

  // Lightweight live results for the autocomplete dropdown
  const runSuggestions = async (q) => {
    const requestId = ++suggestionsRequestId.current
    try {
      const response = await axios.get(`${API_URL}/search`, { params: { query: q } })
      if (requestId === suggestionsRequestId.current) {
        setSuggestions(response.data.tracks.items)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  useEffect(() => {
    if (suppressSuggestions.current) {
      suppressSuggestions.current = false
      return
    }
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    suggestionsTimeoutId.current = setTimeout(() => {
      runSuggestions(query)
      setShowSuggestions(true)
    }, 400)
    return () => clearTimeout(suggestionsTimeoutId.current)
  }, [query])

  // stop whatever's currently playing and clear the open song so only the results show.
  const handleSearch = () => {
    if (!query.trim()) return
    clearTimeout(suggestionsTimeoutId.current)
    suggestionsRequestId.current++
    setShowSuggestions(false)
    setSuggestions([])
    if (isPlayingSelectedSong) player.pause()
    setSelectedSong(null)
    setArtistInfo(null)
    setLyricLines([])
    setError('')
    runSearch(query)
  }

  const handleSelectSuggestion = (song) => {
    clearTimeout(suggestionsTimeoutId.current)
    suggestionsRequestId.current++
    suppressSuggestions.current = true
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
        axios.get(`${API_URL}/translate`, {
          params: { song_name: song.name, artist_name: song.artists[0].name, duration_ms: song.duration_ms, target_lang: targetLang },
        }),
        axios.get(`${API_URL}/artist`, {
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

  // Re-translate the currently open song when the target language changes,
  // without re-fetching the player/artist info that doesn't depend on it.
  useEffect(() => {
    if (!selectedSong) return
    setLoading(true)
    setError('')
    axios
      .get(`${API_URL}/translate`, {
        params: {
          song_name: selectedSong.name,
          artist_name: selectedSong.artists[0].name,
          duration_ms: selectedSong.duration_ms,
          target_lang: targetLang,
        },
      })
      .then((response) => {
        if (response.data.error) {
          setError(response.data.error)
        } else {
          setLyricLines(response.data.lines)
          setSyncedAccurate(response.data.synced)
        }
      })
      .catch((err) => {
        console.error('Error:', err)
        setError('Something went wrong fetching the translation.')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLang])

  const songsGrid = songs.length > 0 && (
    <div className="mt-[10px] mb-[30px]">
      <h2 className="mb-2 text-20px font-medium tracking-[-0.24px] leading-[118%] text-gray-300">{query.trim() ? 'Results' : 'Suggested Songs'}</h2>
      <div className="mt-[20px] flex flex-wrap justify-center gap-[20px] text-[14px] text-gray-300">
        {songs.map((song) => (
          <div key={song.id} className={`${PANEL_CLASS} w-[150px] p-[10px]`}>
            <h3 className="text-[14px] font-semibold">{song.name}</h3>
            <p className="text-[12px] mb-1">{song.artists[0].name}</p>
            {song.album.images[0] && <img src={song.album.images[0].url} alt={song.name} className="w-full rounded-[4px]" />}
            <button onClick={() => handleSelectSong(song)} className={`${BUTTON_CLASS} mt-[10px] w-full px-4 py-1 bg-gray-700 text-white hover:bg-green-500! hover:text-black! transition-colors duration-200 `}>
              Get Translation
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-app-bg p-5 font-sans text-[18px] leading-[145%] tracking-[0.18px] text-gray-300">
      <div className="flex items-center justify-between">
        <h1 className="my-8 text-[40px] font-medium tracking-[-1.68px]"> Spotify Lyrics Translator</h1>
        {accessToken ? (
          <div className="text-right">
            <p className="m-0">
              Logged in as {spotifyUser?.display_name || '...'}
              {spotifyUser && !isPremium && ' (Free — 30s previews only)'}
            </p>
            <button onClick={handleLogout} className={`${BUTTON_CLASS} mt-[5px] px-3 py-1.5`}>
              Log out
            </button>
          </div>
        ) : (
          <button onClick={redirectToSpotifyLogin} className={`${BUTTON_CLASS} px-5 py-2.5`}>
            Log in with Spotify
          </button>
        )}
      </div>
      <div className="mb-5">
        <div className="relative inline-block">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search songs..."
            className="w-[300px] rounded-[4px] border border-border bg-panel p-2.5 text-[16px] text-white"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 z-10 max-h-[300px] w-[300px] overflow-y-auto rounded-[4px] border border-border bg-panel">
              {suggestions.map((song) => (
                <div
                  key={song.id}
                  onMouseDown={() => handleSelectSuggestion(song)}
                  className="cursor-pointer border-b border-border-soft px-2.5 py-2 text-[13px]"
                >
                  <strong>{song.name}</strong> — {song.artists[0].name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleSearch} className={`${BUTTON_CLASS} ml-2.5 px-5 py-2.5`}>
          Search
        </button>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="ml-2.5 rounded-[4px] border border-border bg-panel px-2.5 py-2.5 text-[16px] text-white"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {!selectedSong && <p className="mb-5 text-center text-gray-300 ">Select a song below to see the player and artist info.</p>}
      {!selectedSong && songsGrid}

      {loading && <p>Loading...</p>}
      {error && <p className="text-error">{error}</p>}

      {selectedSong && (
      <div className="flex gap-5">
        <div className={`${PANEL_CLASS} flex-1 p-2.5`}>
              {canUseInAppPlayer ? (
                <div className="rounded-[8px] bg-panel-dark p-[15px] text-center">
                  <p className="mx-0 mt-0 mb-2.5">{selectedSong.name} — {selectedSong.artists[0].name}</p>
                  <button
                    onClick={() =>
                      isPlayingSelectedSong ? player.togglePlay() : player.playTrack(selectedSong.id)
                    }
                    className={`${BUTTON_CLASS} px-5 py-2.5`}
                  >
                    {isPlayingSelectedSong && player.isPlaying ? '⏸ Pause' : '▶ Play Song'}
                  </button>

                  {isPlayingSelectedSong && (
                    <div className="mt-3">
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
                        className="w-full accent-accent"
                      />
                      <div className="flex justify-between text-[12px]">
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
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  className="rounded-[8px]"
                />
              )}
              {artistInfo && (
                <div className="mt-[15px] text-center">
                  {artistInfo.images?.[0] && (
                    <img src={artistInfo.images[0].url} alt={artistInfo.name} className="w-full rounded-[8px]" />
                  )}
                  <h3 className="mt-2 text-lg font-semibold">{artistInfo.name}</h3>
                </div>
              )}
        </div>

        {lyricLines.length > 0 && (
          <div ref={originalContainerRef} className={`${PANEL_CLASS} max-h-[600px] flex-1 overflow-y-auto p-2.5`}>
            <h3 className="mb-2 text-lg font-semibold">Original{!syncedAccurate && ' (timing sync unavailable)'}</h3>
            {lyricLines.map((line, i) => (
              <p
                key={i}
                ref={(el) => (originalLineRefs.current[i] = el)}
                onClick={() => canHighlight && player.seek(line.time_ms)}
                className={`my-1.5 text-[13px] whitespace-pre-wrap ${canHighlight ? 'cursor-pointer' : 'cursor-default'} ${i === activeLineIndex ? 'font-bold text-accent' : 'font-normal text-white'}`}
              >
                {line.original}
              </p>
            ))}
          </div>
        )}

        {lyricLines.length > 0 && (
          <div ref={translatedContainerRef} className={`${PANEL_CLASS} max-h-[600px] flex-1 overflow-y-auto p-2.5`}>
            <h3 className="mb-2 text-lg font-semibold">{LANGUAGES.find((l) => l.code === targetLang)?.label || targetLang}{!syncedAccurate && ' (timing sync unavailable)'}</h3>
            {lyricLines.map((line, i) => (
              <p
                key={i}
                ref={(el) => (translatedLineRefs.current[i] = el)}
                onClick={() => canHighlight && player.seek(line.time_ms)}
                className={`my-1.5 text-[13px] whitespace-pre-wrap ${canHighlight ? 'cursor-pointer' : 'cursor-default'} ${i === activeLineIndex ? 'font-bold text-accent' : 'font-normal text-white'}`}
              >
                {line.translated}
              </p>
            ))}
          </div>
        )}
      </div>
      )}

      {selectedSong && <div className="mt-[30px]">{songsGrid}</div>}
    </div>
  )
}

export default App
