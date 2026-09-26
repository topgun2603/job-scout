# Job Scout: Freshers (React)

A personal job scout that collects fresher and entry-level React / frontend openings, drops senior and off-track roles, flags scam-looking offers, scores the rest against your profile, and shows a ranked shortlist in a dashboard. You apply manually. It never logs in and never clicks Apply.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env        # optional: API keys for later phases
```

Edit `config/profile.yaml` (graduation year, cities, skills, weekly goal) and `config/searches.yaml`.

### Firebase

All data lives in Firebase project `wellness-d3ec9`: Firestore holds users, sessions, passes, jobs and MNC roles, and Storage holds the resume PDFs. Every collection is prefixed `jobscout_`, and the server connects through the Admin SDK.

- **Locally:** put the service-account key at `job-scout-service-account.json` in this folder. It is gitignored, so never commit it.
- **On Vercel:** add an environment variable `FIREBASE_SERVICE_ACCOUNT` whose value is the whole contents of that JSON file, then redeploy.

`npm run migrate-to-firebase` copies an old local `data/jobs.db` and its resumes into Firebase. It keeps every id, and it's safe to re-run.

Create your admin login (run it again to reset the password):

```bash
npm run create-admin -- <username> <password>
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run scout` | Fetch from every source → normalize → dedupe → filter → score. Naukri opens a Chromium window for about 1–2 minutes. |
| `npm run scout -- --only=greenhouse,lever` | Run only some sources (names are listed below). |
| `npm run scout -- --rescore` | Re-apply config to stored jobs. No network. |
| `npm run dev` | Dashboard at http://localhost:3000, with a **Scout now** button. |
| `npm run open-top -- 10` | Open the top 10 new, unflagged apply links in your browser. |
| `npm test` | Unit tests for filters and scoring. |
| `npm run discover:naukri` | Re-run the network discovery if Naukri changes its API. |

## Users and access

Sign in at `/login`. The admin works in **/admin**:

- **New applicant:** full name, username, a generated password (shown once, with a copy button), contact details, graduation year, preferred cities and skill stack. You can attach a resume PDF in the same step.
- **Resumes (up to 3):** drag and drop PDFs (up to 5 MB each) with an optional label, then rename, download or remove them. **Detect skills** reads the PDF and offers to add the skills it finds. If you create an applicant with a resume and no skills, the skills are filled in from the resume automatically.
- **Access passes:** 1 hour, 1 day, 7 days, 15 days or 1 month. Granting while a pass is running extends it and never shortens it. **Revoke** ends the pass immediately. Each applicant has a history of grants and revokes.

What an applicant sees:

| Pass | Job feed | Resumes |
| --- | --- | --- |
| none or expired | locked ("your access has ended") | resume #1 only, top half visible, no download |
| 1 hour (preview) | browse and scores only: **no Apply links, no Applied / Skip**; the API does not send apply URLs and refuses status changes | resume #1, half-blurred, no download |
| 1 / 7 / 15 days | full: Apply, Applied, Skip, tracking | resume #1, full view plus download |
| 1 month | full | **all 3 resumes**, full view plus download |

Each applicant can have up to 3 resume versions with labels such as "Frontend" or "MERN". The applicant sees the first N allowed by their pass; the others appear as locked "included with the 1-month pass" cards and are refused by the server.

The blur is applied on the server. MuPDF renders each page to an image and sharp blurs it before it is sent, so a locked applicant never receives the readable pixels or the PDF itself. The download route also checks the pass on every request.

Applied and Skipped marks are kept per user. Only the admin can run Scout now and Rescore. Passwords are hashed with scrypt, sessions are httpOnly cookies that last 7 days (only a hash of the token is stored), and changing a password or disabling an account signs that user out everywhere.

## Dashboard

- **Strong match** (65+), **Maybe** (45–64), **Check carefully** (scam flags), **Long shots** (below 45). Thresholds live in `profile.yaml`.
- Each card shows its score ring with a "Why 72?" breakdown and highlights the skills you matched.
- **Applied** triggers confetti and a toast with Undo. **Skip** swipes the card away. The Applied, Skipped and Filtered out trackers let you move jobs back.
- The weekly goal, apply streak and rank are there to keep you going.
- Switch between cards and a sortable TanStack table. Dark mode is included.
- Keyboard: `j/k` move, `o` open, `a` applied, `s` skip, `u` restore, `/` search, `v` switch view, `?` show help.

## Sources

| Source | Key? | What it covers |
| --- | --- | --- |
| `naukri` | none | Keyword × city searches from `searches.yaml` (browser, no login) |
| `greenhouse`, `lever`, `ashby`, `smartrecruiters` | none | Career boards of the companies in `companies.yaml`: India / remote-India roles with entry-level or frontend titles, each with a direct apply link |
| `adzuna` | free: developer.adzuna.com | India aggregator. Set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in `.env` |
| `jooble` | free: jooble.org/api/about | India aggregator. Set `JOOBLE_API_KEY` in `.env` |

Sources without a key are skipped with a note in the log. The same role found on two sources is stored once (fingerprint on title + company). No public API lets a candidate submit applications, so applying stays manual; the apply links go straight to the company's form.

## How it works

```
src/lib/sources/naukri.ts   Playwright, no login. Reads GET /jobapi/v3/search (jobDetails[]),
                            falls back to parsing .srp-jobtuple-wrapper cards
src/lib/pipeline/           normalize.ts  dedupe.ts  filters.ts  score.ts  run.ts
src/lib/firebase.ts         Admin SDK setup, jobscout_ collections, numeric id counters
src/lib/db.ts               jobs + scout runs (Firestore)
src/lib/users.ts            users, sessions, passes (Firestore) and resumes (Storage)
src/app/                    Next.js dashboard + API routes (jobs, status, rescore, scout)
```

Every run re-evaluates all jobs that are not yet Applied or Skipped, so config changes apply retroactively. Filtered jobs are kept with their reason and appear in the **Filtered out** list.

### Naukri politeness (enforced in `naukri.ts`)

- At most 10 searches per run, a hard cap in code.
- A random 4–10 s delay between searches.
- One browser context and one tab, with no parallel requests.
- Stops the run on HTTP 403/429, a captcha, or an access-denied page.
- No login and no stored credentials.

Headless Chromium gets HTTP 403 from Naukri, so the scout runs a visible browser window (`headless: false` in `searches.yaml`). It deliberately does not fake user agents or try to evade bot detection.

### Privacy

The tool stores job data only. Email addresses and phone numbers in descriptions are redacted before saving. The mail provider is kept (`[email @gmail.com]`) so the scam filter still works.

## Roadmap

- **Phase 3:** Task Scheduler / cron, a Telegram morning digest, and Gmail alert parsing.
