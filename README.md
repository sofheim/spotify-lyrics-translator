# spotify-song-translator

# One-Week MVP Sprint 

---

## Day 1: Setup & Architecture (5-6 hours)

- [ ] Set up GitHub repo + project structure (30 min)
- [ ] Create backend project (FastAPI) (30 min)
- [ ] Create frontend project (Create React App) (30 min)
- [ ] Get Spotify API credentials + read docs (1 hour)
- [ ] Get Genius API key + read docs (30 min)
- [ ] Get Google Translate API key (30 min)
- [ ] Set up basic database schema (PostgreSQL or SQLite) (1.5 hours)
- [ ] Draw out the data flow on paper (30 min)

**Goal by end of Day 1:** Everything installed, keys working, you understand the flow.

---

## Day 2: Spotify Search (4-5 hours)

- [ ] Build `/search` endpoint that queries Spotify API (2.5 hours)
- [ ] Handle authentication with Spotify (1.5 hours)
- [ ] Test it locally with curl/Postman (1 hour)

**Goal by end of Day 2:** You can search "Taylor Swift" and get back 5 songs.

---

## Day 3: Lyrics + Translation (5-6 hours)

- [ ] Build `/lyrics` endpoint that calls Genius API (2 hours)
- [ ] Handle "lyrics not found" gracefully (1 hour)
- [ ] Add translation endpoint (call Google Translate) (2 hours)
- [ ] Chain everything together: search → lyrics → translate (1 hour)

**Goal by end of Day 3:** Full API working. Test with 3-4 songs.

---

## Day 4: Frontend UI (5-6 hours)

- [ ] Build search component + input field (1.5 hours)
- [ ] Create results display (original + translated lyrics side-by-side) (2 hours)
- [ ] Connect frontend to your backend API (1.5 hours)
- [ ] Basic CSS (nothing fancy—use Tailwind or Bootstrap) (1 hour)

**Goal by end of Day 4:** You can search for a song in your browser and see translated lyrics.

---

## Day 5: Caching + Polish (4-5 hours)

- [ ] Add database caching so you don't re-translate (2 hours)
- [ ] Error handling (song not found, API rate limits) (1.5 hours)
- [ ] Fix bugs from Days 1-4 (1-2 hours)

**Goal by end of Day 5:** App is stable, doesn't crash, handles edge cases.

---

## Day 6: Deployment (2-3 hours)

- [ ] Deploy backend (Heroku, Railway, or Render) (1.5 hours)
- [ ] Deploy frontend (Vercel) (1 hour)
- [ ] Test everything works in production (30 min)

**Goal by end of Day 6:** Live link you can share. "It works!"

---

## Day 7: README + Breathing Room (1-2 hours)

- [ ] Write a basic README (what it is, how to use it, tech stack) (1 hour)
- [ ] Push final code to GitHub (15 min)
- [ ] Buffer for last-minute bugs (45 min)

**Goal by end of Day 7:** Done

---

## What I'm NOT Doing

- ❌ User accounts / authentication
- ❌ Saving favorite translations
- ❌ Playlist batch translation
- ❌ Tests or test coverage
- ❌ Pretty design (functional is fine)
- ❌ Blog post or documentation beyond README
- ❌ Multiple language support

---

## Critical Success Factors

**1. Pick your tech stack NOW** (don't waste time deciding mid-week)
   - Backend: **FastAPI** (faster to learn than Flask)
   - Frontend: **React + Vite** (faster than Create React App)
   - Database: **SQLite** (easier than PostgreSQL for week 1)
   - Deploy: **Vercel** (frontend) + **Render** (backend)

**2. Eliminate decision-making**
   - Don't spend 2 hours debating UI frameworks—just use Tailwind
   - Don't refactor code halfway through
   - Don't optimize prematurely

**3. Test as you go**
   - Each day, test what you built before moving on
   - Don't debug Day 1 code on Day 5

**4. Have a "cut feature" plan**
   - If you're behind by Day 3, decide NOW what gets dropped
   - Caching? Drop it. Deploy to free tier? Still counts.

---

## Daily Commitment

| Days | Hours/Day | Total | Status |
|------|-----------|-------|--------|
| 1-2 | 5-6 | ~11 | Backend foundation |
| 3 | 5-6 | 5-6 | Core logic |
| 4 | 5-6 | 5-6 | Frontend works |
| 5 | 4-5 | 4-5 | Stable & cached |
| 6 | 2-3 | 2-3 | Live |
| 7 | 1-2 | 1-2 | Docs & cleanup |
| **Total** | **~5/day** | **~33-39** | **Ship it** |

---

## Success Checklist

By end of week:
- ✅ GitHub repo with code pushed
- ✅ Live deployed app (frontend + backend)
- ✅ Search songs → see lyrics → see translation works
- ✅ Professional README
- ✅ App doesn't crash on edge cases

That's it. You win.

