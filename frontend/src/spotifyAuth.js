const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/`
const SCOPES = 'streaming user-read-email user-read-private'
const TOKEN_KEY = 'spotify_auth'
const VERIFIER_KEY = 'spotify_code_verifier'

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

function storeToken(data) {
  const expiresAt = Date.now() + data.expires_in * 1000
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...data, expires_at: expiresAt }))
}

function getStoredToken() {
  const raw = localStorage.getItem(TOKEN_KEY)
  return raw ? JSON.parse(raw) : null
}

async function requestToken(body) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

export async function redirectToSpotifyLogin() {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const data = await requestToken(new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }))
  storeToken(data)
  sessionStorage.removeItem(VERIFIER_KEY)
  return data
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

// Returns a currently-valid access token and refreshing it if
// it's expired 
// Returns null if the user isn't logged in or no refresh token 
export async function getValidAccessToken() {
  const stored = getStoredToken()
  if (!stored) return null
  if (Date.now() < stored.expires_at - 60_000) {
    return stored.access_token
  }
  try {
    const refreshed = await requestToken(new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }))
    // Spotify doesn't always return a new refresh_token on refresh
    storeToken({ ...refreshed, refresh_token: refreshed.refresh_token || stored.refresh_token })
    return refreshed.access_token
  } catch {
    logout()
    return null
  }
}
