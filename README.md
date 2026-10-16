# RepoReady

**Evidence-based onboarding guide generator for public GitHub repositories.**

RepoReady analyzes any public GitHub repository using real GitHub REST API data and generates a structured, verified onboarding guide for contributors: setup steps, architectural entry points, tech stack detection, and curated beginner issues.

---

## Features

- **Evidence-Based Overview** — Real metadata: stars, forks, primary languages, license, topics, open issues
- **Onboarding Guide** — Setup commands extracted from README and language ecosystems
- **Key Files & Entry Points** — Highlights architecture configuration and source files
- **Beginner-Friendly Issues** — Issues labeled `good first issue`, `help wanted`, `beginner`
- **File Tree Navigator** — Top-level directory structure linked directly to GitHub
- **Contribution Checklist** — Interactive progress tracking for new contributors
- **Sources & Warnings** — Transparent evidence provenance and rate-limit / license warnings
- **Optional Local AI Enhancement** — Connects to local Ollama (if available) for summaries

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Python 3.11 + FastAPI + Uvicorn |
| Data | GitHub REST API v3 via httpx (async) |
| Testing | pytest |
| AI (optional) | Ollama (local LLM inference) |

---

## Setup & Quick Start

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Git

### 2. Virtual Environment & Backend Installation

```powershell
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Install backend dependencies with python -m pip
python -m pip install -r requirements.txt
```

### 3. Verify Installation & Run Tests

```powershell
# Verify package imports and versions
.\.venv\Scripts\python.exe -c "import fastapi, uvicorn, httpx, pytest, pydantic, dotenv; print('FastAPI:', fastapi.__version__); print('Uvicorn:', uvicorn.__version__); print('HTTPX:', httpx.__version__); print('pytest:', pytest.__version__)"

# Run pytest test suite
.\.venv\Scripts\python.exe -m pytest backend/test_main.py -v
```

### 4. (Optional) GitHub Token Configuration

Create a [Personal Access Token](https://github.com/settings/tokens) and place it in `.env` in the root workspace:

```env
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

*Note: Without a token, GitHub rate limits unauthenticated requests to 60 requests/hour.*

### 5. Running the Application

In Terminal 1 (Backend):
```powershell
cd d:\ApexForge\backend
..\.venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

In Terminal 2 (Frontend):
```powershell
cd d:\ApexForge\frontend
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## API Specification

### `GET /health`
Health check endpoint reporting server status and token configuration.

**Response (200 OK):**
```json
{
  "status": "ok",
  "app": "RepoReady",
  "version": "0.1.0",
  "github_token_set": false,
  "ollama_available": false
}
```

### `POST /api/analyze`
Analyzes a public GitHub repository and returns an evidence-based onboarding guide.

**Request Body:**
```json
{
  "repository_url": "https://github.com/fastapi/fastapi"
}
```

*Validation Rules:*
- Scheme must be `https://`
- Hostname must be `github.com` or `www.github.com`
- Path must match `/<owner>/<repo>`
- Only public GitHub repositories are accepted

**Response Schema:**
```json
{
  "repository": {
    "owner": "fastapi",
    "name": "fastapi",
    "full_name": "fastapi/fastapi",
    "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
    "html_url": "https://github.com/fastapi/fastapi",
    "stars": 78000,
    "forks": 6500,
    "open_issues": 400,
    "default_branch": "master",
    "language": "Python",
    "topics": ["fastapi", "framework", "pydantic", "python"],
    "license": "MIT",
    "has_wiki": false
  },
  "overview": "fastapi/fastapi summary and evidence overview...",
  "tech_stack": ["Python", "Docker", "pyproject.toml"],
  "setup_steps": [
    "Fork the repository on GitHub",
    "Clone your fork locally: git clone <your-fork-url>",
    "Install dependencies: pip install -r requirements.txt"
  ],
  "key_files": ["README.md", "CONTRIBUTING.md", "pyproject.toml"],
  "contribution_tips": [
    "Read the README thoroughly before starting",
    "This repo has a CONTRIBUTING.md — read it carefully"
  ],
  "recommended_issues": [
    {
      "number": 1234,
      "title": "Improve documentation for middleware",
      "html_url": "https://github.com/fastapi/fastapi/issues/1234",
      "labels": ["good first issue"],
      "created_at": "2024-01-01T00:00:00Z",
      "comments": 2,
      "body_preview": "..."
    }
  ],
  "sources": [
    "GitHub REST API: https://api.github.com/repos/fastapi/fastapi",
    "GitHub Languages API: https://api.github.com/repos/fastapi/fastapi/languages",
    "GitHub Git Trees API: https://api.github.com/repos/fastapi/fastapi/git/trees/master",
    "GitHub Issues API: https://api.github.com/repos/fastapi/fastapi/issues",
    "Repository README: https://github.com/fastapi/fastapi#readme"
  ],
  "warnings": [
    "GitHub token not configured. Unauthenticated requests are limited to 60 requests/hour."
  ],
  "generated_at": "2026-10-16T03:45:00.000000+00:00"
}
```

---

## License

MIT
