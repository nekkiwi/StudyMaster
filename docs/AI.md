# AI in StudyMaster

> Status: planned. Nothing here is built yet. Facts about plans and prices
> were checked in November 2026 – re-check before building.

## Goals
- The app works **fully without AI**.
- AI makes setup and changes faster: "add chapters 1–9 from this table of
  contents", "I'm sick tomorrow, fix my plan", "I finished Ch 3 and made 42
  cards".
- **Free for users and no AI account needed** for the normal path.
- AI follows the same approval rules as the UI: it can never silently use the
  buffer or book extra sessions.

## Three layers

| Layer | Who | Setup for the user | Cost |
|---|---|---|---|
| 1. **Built-in assistant** ("Ask StudyMaster") | everyone | none | paid by us: cents per month at low traffic, or €0 on a free tier |
| 2. **MCP connector** | people who use Claude | paste a URL in Claude once, log in | free for them (Claude Free allows one custom connector) |
| 3. **Copy-paste prompts** | anyone with any chatbot | none | free |

### 1. Built-in assistant (the default)
- A chat box in the app. The web app calls **our backend**; the backend calls
  an LLM API with a **server-side key**. Users never see a provider.
- Provider is swappable. Options considered:
  - **Claude Haiku 5.5** via the Claude API – best at tool use for the money.
    About $0.10 / $0.50 per million input / output tokens (Nov 2026); a typical
    command (~3k tokens in, ~300 out) ≈ €0.0005, so 1,000 messages ≈ €0.50.
    No free tier. (Larger Claude models are smarter but much more expensive.)
  - **Google Gemini API free tier** – €0, but free-tier data may be used by
    Google; matters for GDPR.
  - **Cloudflare Workers AI** – free daily allowance on the same platform;
    open models are weaker at tool calling.
  - Groq / OpenRouter free models – fine for testing.
- Guardrails: login required for the assistant, per-user daily limit (e.g. 30
  messages), monthly spend cap in the provider console. When the cap is hit
  the assistant pauses; the rest of the app keeps working.
- With the Claude API, the assistant can use our MCP server directly through
  the API's MCP connector, so there's only one tool implementation.

### 2. MCP server (Claude connector)
- Hosted on the same Worker at `/mcp`, with OAuth login.
- Claude's **Free plan supports one custom connector** (remote MCP). The server
  must be reachable on the public internet (Claude connects from Anthropic's
  cloud).
- ChatGPT's free plan can't add custom MCP servers (Developer Mode is for
  paid plans), so ChatGPT users use layer 3.
- A "Connect to Claude" page: copy URL → Claude → Settings → Connectors → Add
  custom connector → log in. Later: submit to Claude's connector directory
  for one-click setup.

### Built: "Let AI read the contents" (import)
When a table of contents is messy (scanned books), the import review offers
**Let AI read the contents**. Only the text of the contents pages is sent –
never the book – and only when the user presses the button.
- `apps/web/src/lib/aiImport.ts` → `POST /api/toc` with the user's Firebase
  ID token → `apps/api` (the same Cloudflare Worker that serves the app)
  verifies the token (Google's public keys), limits 20 reads per user and
  hour, and calls **Claude Haiku 5.5** with a structured-output schema
  (`chapters[{title, startPage, include}], lastPage`), effort `low`.
- Cost: about $0.001 per import (≈ 3k tokens in, 1k out). Set a monthly spend
  limit in the Anthropic Console as the hard cap.
- The key is the Worker secret `ANTHROPIC_API_KEY` (Cloudflare dashboard →
  Workers → app → Settings → Variables and Secrets); never in the repo or app.

### 3. Copy-paste prompts
- **Import with AI:** the app shows a ready prompt; the user pastes it into any
  chatbot together with a syllabus or a photo of a table of contents, then
  pastes the returned JSON back. Same JSON schema as the tools.
- **Export for AI:** copy the plan as text to ask any chatbot about it.

## Tools (shared by assistant and MCP server)

| Tool | What it does |
|---|---|
| `get_overview` | progress, exam countdowns, on track / at risk, Anki load |
| `get_today`, `get_schedule(from, to)` | planned sessions |
| `add_subject`, `set_exam` | subjects and exam dates |
| `add_chunks` | many chunks at once (title, pages, slides) |
| `add_blocked_days` | vacation, sick, break |
| `update_settings` | rhythm, pace, buffer, … |
| `log_progress(chunk, steps, cards)` | like the evening check-in |
| `replan` | rebuild and return the changes |
| `what_if(changes)` | preview only, nothing saved |

Writes that need approval return a **proposal**, not an applied change.
Define the tools once (schemas + handlers) in a shared package so the
assistant and the MCP server can't drift apart.

## Rejected
- **One shared free Claude account for all users** – against Claude's terms
  (accounts are personal, no automated use of the chat website), there's no
  API behind it, everyone's data would end up in one chat history, and the
  free usage limits would run out quickly.
- **Creating Claude accounts for users** – not possible; people sign up
  themselves. We can only link to Claude and guide them.
- **Asking users for their own API key** – too much friction for "free and simple".
