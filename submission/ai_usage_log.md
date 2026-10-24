# AI Usage Log — SurplusLink AI (Team X-Force)

This document discloses the AI tools used in this project, both inside the product and during development, as required by the hackathon guidelines.

## 1. In-app AI (part of the product)

**Tool:** Google Gemini API (model: gemini-3.8-flash)

Used at runtime, inside the deployed app, for:

- Quick-fill of listing details from messy seller text or a photo
- Reading expiry dates from product photos
- Generating a plain-language explanation of the rule-based price (the AI does not set the price; price is calculated by a fixed days-left formula and the AI only explains it)
- Re-ranking nearby buyer matches after an initial distance-based shortlist
- Summarising buyer-seller chat threads
- Summarising dispute details for the admin (the AI is explicitly instructed not to give a verdict; a human admin makes the final decision)

## 2. AI tools used during development

- **Arena.ai** — comparing and exploring AI model responses during early prototyping decisions.
- **Claude (Anthropic)** — code assistance, debugging (including the Gemini model-deprecation error), Git/GitHub workflow guidance, README drafting, and advice on moving the Gemini API key behind a server-side proxy.
- **Google Gemini** — development assistant during coding, in addition to being the in-app AI engine.
- **Canva AI** — generating images and visual assets for the app and pitch materials.

All AI-assisted code and text was reviewed and edited by the team before inclusion. No AI tool was given access to real user data or the live Firebase project outside the developer's own local environment.
