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
  const [playError, setPlayError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrackId, setCurrentTrackId] = useState(null)
  // The track we actually told Spotify to play, as opposed to `currentTrackId`
  // (what the SDK reports back). Spotify sometimes "relinks" a requested
  // track to a different regional/licensing equivalent and reports THAT id
  // instead - trusting our own request avoids losing sync over an id
  // mismatch for a song that's actually playing correctly.
  const [activeTrackId, setActiveTrackId] = useState(null)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [reconnectToken, setReconnectToken] = useState(0)
  const playerRef = useRef(null)
  const deviceIdRef = useRef(null)

  useEffect(() => {
    if (!accessToken) {
      setDeviceId(null)
      return
    }

    let cancelled = false
    let pollInterval = null

    loadSpotifySdk().then((Spotify) => {
      if (cancelled) return

      const player = new Spotify.Player({
        name: 'Spotify Lyrics Translator',
        getOAuthToken: (callback) => getValidAccessToken().then(callback),
        volume: 0.5,
      })

      player.addListener('ready', ({ device_id }) => {
        deviceIdRef.current = device_id
        setDeviceId(device_id)
      })
      player.addListener('not_ready', () => {
        deviceIdRef.current = null
        setDeviceId(null)
      })
      player.addListener('account_error', () => setIsPremiumError(true))
      player.addListener('player_state_changed', (state) => {
        if (!state) return
        setIsPlaying(!state.paused)
        setCurrentTrackId(state.track_window?.current_track?.id ?? null)
        setDuration(state.duration)
        setPosition(state.position)
      })

      player.connect()
      playerRef.current = player

      // player_state_changed only fires on discrete events (play/pause/seek/
      // track change), not continuously - polling getCurrentState() for the
      // real position avoids the drift we'd get from estimating position via
      // wall-clock time between those events.
      pollInterval = setInterval(async () => {
        const state = await player.getCurrentState()
        if (state) setPosition(state.position)
      }, 250)
    })

    return () => {
      cancelled = true
      if (pollInterval) clearInterval(pollInterval)
      playerRef.current?.disconnect()
      playerRef.current = null
      deviceIdRef.current = null
    }
  }, [accessToken, reconnectToken])

  const _requestPlay = (deviceIdToUse, trackId) =>
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdToUse}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    })

  // Polls deviceIdRef for a value different from `staleId` - used after
  // forcing a reconnect, since that tears down the old device and creates a
  // brand new one asynchronously (we can't just await the 'ready' event
  // directly from here without restructuring the whole connection effect).
  const _waitForFreshDeviceId = (staleId, timeoutMs = 8000) =>
    new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        if (deviceIdRef.current && deviceIdRef.current !== staleId) {
          resolve(deviceIdRef.current)
        } else if (Date.now() - start > timeoutMs) {
          resolve(null)
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })

  const playTrack = async (trackId) => {
    if (!deviceIdRef.current) return
    setPlayError(null)
    try {
      const staleId = deviceIdRef.current
      let response = await _requestPlay(staleId, trackId)

      if (response.status === 404) {
        // "Device not found" can mean the device was just created and
        // hasn't propagated yet, OR that this device has gone stale (e.g.
        // the tab sat idle for a long time and Spotify silently dropped
        // the connection without firing 'not_ready'). Forcing a full
        // reconnect - tearing down and recreating the SDK player, same as
        // what a page reload does - covers both cases with one fix.
        setReconnectToken((t) => t + 1)
        const freshId = await _waitForFreshDeviceId(staleId)
        if (freshId) {
          response = await _requestPlay(freshId, trackId)
        }
      }

      if (!response.ok) {
        let message = `Spotify returned an error (${response.status})`
        try {
          const body = await response.json()
          if (body?.error?.message) message = body.error.message
        } catch {
          // response body wasn't JSON - keep the generic message
        }
        setPlayError(message)
      } else {
        setActiveTrackId(trackId)
      }
    } catch (err) {
      setPlayError(err.message || 'Could not reach Spotify')
    }
  }

  const togglePlay = () => playerRef.current?.togglePlay()
  const pause = () => playerRef.current?.pause()

  const seek = (positionMs) => {
    setPosition(positionMs)
    playerRef.current?.seek(positionMs)
  }

  return { deviceId, isPremiumError, playError, isPlaying, currentTrackId, activeTrackId, duration, position, playTrack, togglePlay, pause, seek }
}
