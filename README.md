# SurplusLink AI

**[Pitch video link — add before submission]**

**SDC Hackathon 2026 — Domain 2: Orbyte Smart SME Challenge**
**Team: X-Force**

## Problem & Solution

Small F&B and retail businesses in Malaysia generate surplus food/inventory close to expiry
that often goes to waste, while nearby buyers (other SMEs, food banks, individuals) who would
take it at a discount have no easy way to find it. SurplusLink AI lets a seller list surplus
stock in seconds (AI reads messy text or a photo to pre-fill the listing and expiry date),
automatically prices it based on days remaining, matches it to nearby buyers, and tracks the
deal through chat, approval, handover and impact reporting — reducing waste and recovering
value that would otherwise be lost.

_(Placeholder wording — update once final pitch angle is locked in.)_

## Tech stack

- **Frontend:** React 18 + Vite 5
- **Auth & Database:** Firebase Authentication (email/password) + Cloud Firestore (asia-southeast1 / Singapore)
- **AI:** Google Gemini (quick-fill from text/photo, expiry reading, price explanation, buyer re-ranking, chat summary, dispute summary)
- **Deployment:** Replit

## Live demo

**[Replit live URL — add once deployed]**

## For judges: quick start

1. Open the live demo link above.
2. Register with **any email address** (it does not need to be real) and any password. — this is not verified in the demo.
3. If asked for an SSM/business registration number, **enter any fake value** — this is not verified in the demo.
4. Click **Load demo data** to populate sample listings, buyers, and a sample chat.
5. Follow the demo flow below.

## Privacy & data notes

- Listing text and photos you enter may be sent to Google's Gemini API for AI features (quick-fill, expiry reading, matching, summaries).
- Application data (listings, chats, deals) is stored in Cloud Firestore, hosted in the Singapore region (asia-southeast1).
- This is a hackathon demo: do not enter real personal, business, or financial information.

## Demo flow (core journey, ~3–4 min)

Register → Market → **Load demo data** → chat with a seller → AI chat summary → create a deal offer → approve both sides → mark handover → leave feedback → view Impact dashboard.

(Optional, if time allows): switch roles with the Owner/Staff/Admin switcher, or trigger a dispute via "Issue with goods" and view the Admin moderation view.

## Run the app on another computer

### 1. Get the project files

Copy or download the whole project folder to the other computer. If using Git, clone the repository and open its folder in a terminal or in VS Code. Do not expect `.env.local` to come with the project: it contains local configuration and is intentionally excluded from Git.

### 2. Install Node.js

Install a current Node.js LTS release from [nodejs.org](https://nodejs.org/). Restart the terminal after installation, then check that Node.js and npm are available:

```powershell
node --version
npm --version
```
