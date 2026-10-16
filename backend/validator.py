"""URL validation for RepoReady."""

from __future__ import annotations

import re
from urllib.parse import urlparse
from fastapi import HTTPException

# Regex for valid GitHub username and repository name
GITHUB_OWNER_RE = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$")
GITHUB_REPO_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,100}$")


def validate_and_parse_github_url(raw_url: str) -> tuple[str, str]:
    """Validate that the URL is a valid public HTTPS GitHub repository URL.

    Returns:
        tuple[str, str]: (owner, repo)

    Raises:
        HTTPException: 400 Bad Request if the URL is invalid or not HTTPS GitHub.
    """
    if not raw_url or not isinstance(raw_url, str):
        raise HTTPException(
            status_code=400,
            detail="Repository URL cannot be empty.",
        )

    trimmed = raw_url.strip()
    try:
        parsed = urlparse(trimmed)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Malformed repository URL.",
        )

    # Validate scheme: only HTTPS accepted
    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=400,
            detail="Only public HTTPS GitHub repository URLs are accepted (scheme must be https).",
        )

    # Validate host: only github.com or www.github.com
    hostname = (parsed.hostname or "").lower()
    if hostname not in ("github.com", "www.github.com"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid repository host '{hostname}'. Only github.com URLs are accepted.",
        )

    # Validate path: must be /<owner>/<repo>
    path = parsed.path.strip("/")
    parts = [p for p in path.split("/") if p]

    if len(parts) != 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid GitHub repository URL path. "
                "Expected format: https://github.com/<owner>/<repo>"
            ),
        )

    owner, repo = parts[0], parts[1]

    # Remove optional .git suffix
    if repo.endswith(".git"):
        repo = repo[:-4]

    if not GITHUB_OWNER_RE.match(owner):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GitHub username or organization name: '{owner}'.",
        )

    if not GITHUB_REPO_RE.match(repo):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GitHub repository name: '{repo}'.",
        )

    return owner, repo
