import { useEffect, useRef, useState } from 'react'
import { getValidAccessToken } from './spotifyAuth'

let sdkLoadPromise = null
function loadSpotifySdk() {
  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise((resolve) => {
      if (window.Spotify) {
        resolve(window.Spotify)
        return
      }
      window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify)
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    })
  }
  return sdkLoadPromise
}

// Manages a Spotify Connect device inside this browser tab via the Web
// Playback SDK. Pass `accessToken` only once we know the account is
// Premium (the SDK can't create a device for Free accounts at all).
export function useSpotifyPlayer(accessToken) {
  const [deviceId, setDeviceId] = useState(null)
  const [isPremiumError, setIsPremiumError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!accessToken) {
      setDeviceId(null)
      return
    }

    let cancelled = false

    loadSpotifySdk().then((Spotify) => {
      if (cancelled) return

      const player = new Spotify.Player({
        name: 'Spotify Lyrics Translator',
        getOAuthToken: (callback) => getValidAccessToken().then(callback),
        volume: 0.5,
      })

      player.addListener('ready', ({ device_id }) => setDeviceId(device_id))
      player.addListener('not_ready', () => setDeviceId(null))
      player.addListener('account_error', () => setIsPremiumError(true))
      player.addListener('player_state_changed', (state) => {
        if (!state) return
        setIsPlaying(!state.paused)
        setCurrentTrackId(state.track_window?.current_track?.id ?? null)
      })

      player.connect()
      playerRef.current = player
    })

    return () => {
      cancelled = true
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [accessToken])

  const playTrack = async (trackId) => {
    if (!deviceId) return
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    })
  }

  const togglePlay = () => playerRef.current?.togglePlay()

  return { deviceId, isPremiumError, isPlaying, currentTrackId, playTrack, togglePlay }
}
