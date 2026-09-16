# VYAVASTHA (व्यवस्था)

> **A Private Personal Knowledge & Memory Operating System**
> Built with an *Obsidian Workshop* aesthetic — dark, calm, tactile, restrained, and deeply grounded.

---

## ✦ System Overview

VYAVASTHA is a single-tenant personal operating system designed to ingest, structure, and synthesize personal knowledge without conflating external information with internal identity.

### Foundational Core Layers

1. **Layer A: Saved Knowledge (`knowledge_items`)**
   - Ingests external articles, YouTube transcripts, Instagram posts/reels, documents, and quick notes.
   - Preserves complete provenance, timestamps, media tags, and full text.
2. **Layer B: Personal Memory (`personal_memory_items`)**
   - Stores stable identity facts, behavioral preferences, and verified beliefs.
   - **Critical Memory Rule**: External saved content *never* automatically becomes permanent personal memory. All proposed memories require explicit user confirmation (`confirmedByUser: false` by default).
3. **Layer C: Tasks & Intentions (`task_items`)**
   - Actionable next steps derived from ingested material or manually captured.
   - Requires explicit user completion.
4. **Layer D: Activity History (`activity_logs`)**
   - Full audit trail of ingests, edits, state transitions, and Telegram interactions.

---

## ✦ Architecture & Technology Stack

- **Framework**: Next.js 15 (App Router, Server Components & Route Handlers)
- **UI & Runtime**: React 19, Tailwind CSS (Obsidian Workshop theme), Lucide Icons
- **Language & Runtime**: TypeScript 5.7, Bun
- **Database & ORM**: Turso (libSQL distributed database) with Drizzle ORM
- **Cognitive Engine**: Google Gemini API (`gemini-3.6-flash`) for multimodal understanding, grounded chat synthesis, and weekly reflective reviews
- **Web Extraction**: Firecrawl API with resilient native HTTP/HTML parser fallback
- **Telegram Gateway**: Persistent long-polling bot runner (`src/bot/polling.ts`) managed by PM2, with strict owner authentication (user ID & chat ID validation)

---

## ✦ Environment Variables

Configure these in `.env` (never commit real credentials to version control):

| Variable Name | Description |
| :--- | :--- |
| `DATABASE_PROVIDER` | Database provider (`turso`) |
| `TURSO_DATABASE_URL` | Turso database connection URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Turso database authentication token |
| `GEMINI_API_KEY` | Google Gemini API key for cognitive services |
| `FIRECRAWL_API_KEY` | Firecrawl API key for clean web scraping |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token from @BotFather |
| `ALLOWED_TELEGRAM_USER_ID` | Telegram numeric user ID of the single owner |
| `TELEGRAM_CHAT_ID` | Telegram chat ID of the single owner |
| `APP_MASTER_PASSWORD` | Single-tenant master password for web login |
| `SESSION_SECRET` | Cryptographic secret for signing session cookies |
| `NODE_ENV` | Environment mode (`production` or `development`) |
| `PORT` | Local HTTP port (default `3000`) |

---

## ✦ Local Development

### 1. Prerequisites
- [Bun](https://bun.sh) (v1.2+) or Node.js (v20+)
- A Turso database instance

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/amar175329-web/vyavastha.git
cd vyavastha

# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env
# Fill in your environment variables in .env

# Run database migrations
bun run db:migrate

# Run tests
bun test

# Start Next.js development server
bun run dev
```

The web dashboard is available at `http://localhost:3000`.

---

## ✦ 24/7 Telegram Bot Service (PM2)

The Telegram bot runs as an independent persistent background daemon:

```bash
# Start Telegram bot with PM2
pm2 start "bun run src/bot/polling.ts" --name vyavastha-bot

# View bot status & logs
pm2 status
pm2 logs vyavastha-bot

# Save PM2 state for automatic restart on server reboot
pm2 save
```

---

## ✦ Production Deployment (Vercel)

The Next.js web application deploys to Vercel while the Telegram bot runs persistently on your server/PM2:

```bash
# Deploy to Vercel
vercel --prod
```

Configure the environment variables in your Vercel Project Settings matching your `.env`.

---

## ✦ Security & Privacy Notice

- **Single-Tenant Isolation**: The system is designed for single-user sovereignty. All Telegram commands and messages from unauthorized IDs are rejected with security audit logging.
- **Timing-Attack Resistance**: Master password verification utilizes constant-time string comparison.
- **Strict Provenance**: Chat answers are grounded strictly in your retrieved knowledge with source citations; unrelated queries do not hallucinate answers.
- **Secret Redaction**: Structured loggers automatically redact API keys, bearer tokens, and credentials before writing to console or disk.
