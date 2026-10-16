"""Configuration and environment variable management for RepoReady.

Ensures D:\\ApexForge\\.env is loaded reliably regardless of working directory
and handles GITHUB_TOKEN securely without ever logging or exposing the token.
"""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Candidate paths for .env
POSSIBLE_ENV_PATHS = [
    Path(r"D:\ApexForge\.env"),
    Path(__file__).resolve().parent.parent / ".env",
    Path(__file__).resolve().parent / ".env",
    Path.cwd() / ".env",
]


def load_project_env() -> Path | None:
    """Explicitly find and load the .env file with override=True."""
    for p in POSSIBLE_ENV_PATHS:
        try:
            if p.is_file():
                load_dotenv(dotenv_path=p, override=True)
                return p
        except Exception:
            continue
    # Fallback to default search
    load_dotenv(override=True)
    return None


# Initial load at module import
_loaded_env_path = load_project_env()


def get_github_token() -> str | None:
    """Return the GitHub token if configured, or None.

    Re-checks the .env file if the token is not currently in os.environ,
    ensuring dynamic updates to .env while the server runs are detected.
    Never logs or exposes the token value.
    """
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        load_project_env()
        token = os.getenv("GITHUB_TOKEN")

    if token:
        token = token.strip().strip("'\"")
        return token if token else None
    return None


def is_token_configured() -> bool:
    """Safe check reporting only whether a GitHub token is present."""
    return get_github_token() is not None


def get_token_diagnostics() -> dict[str, str | bool]:
    """Safe diagnostic dictionary for health and logging.

    Never includes the token value itself.
    """
    configured = is_token_configured()
    env_found = False
    found_path = None
    for p in POSSIBLE_ENV_PATHS:
        try:
            if p.is_file():
                env_found = True
                found_path = str(p)
                break
        except Exception:
            continue

    return {
        "github_token_configured": configured,
        "env_file_detected": env_found,
        "env_file_path": found_path if env_found else None,
        "rate_limit_tier": "authenticated (5,000 req/hr)" if configured else "unauthenticated (60 req/hr)",
    }


def get_github_headers() -> dict[str, str]:
    """Build standardized GitHub API headers.

    Uses Authorization: Bearer <token> and Accept: application/vnd.github+json.
    """
    headers: dict[str, str] = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "RepoReady/0.1.0",
    }
    token = get_github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_ollama_host() -> str:
    """Return configured Ollama host URL, defaulting to local daemon at http://localhost:11434."""
    load_project_env()
    return os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")


def get_ollama_model() -> str:
    """Return target local Ollama model, strictly defaulting to qwen3:4b."""
    load_project_env()
    return os.getenv("OLLAMA_MODEL", "qwen3:4b").strip()

