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

    Accepts:
        - https://github.com/owner/repo
        - https://github.com/owner/repo.git
        - https://www.github.com/owner/repo

    Rejects:
        - Non-HTTPS schemes (http, git, ssh, ftp)
        - Credentials in URLs (e.g. https://user:pass@github.com/owner/repo)
        - Custom ports (e.g. https://github.com:8443/owner/repo)
        - Localhost and private-network destinations (127.0.0.1, 192.168.*, 10.*, etc.)
        - Non-GitHub hosts (gitlab.com, bitbucket.org, etc.)
        - Deep paths (/owner/repo/issues, /owner/repo/tree/main)
        - Malformed input

    Returns:
        tuple[str, str]: (owner, repo)

    Raises:
        HTTPException: 400 Bad Request if the URL is invalid.
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

    # Reject credentials / userinfo in URL (user:pass@)
    if parsed.username or parsed.password or "@" in (parsed.netloc or ""):
        raise HTTPException(
            status_code=400,
            detail="Credentials or userinfo in repository URLs are not permitted.",
        )

    # Validate scheme: only HTTPS accepted
    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=400,
            detail="Only public HTTPS GitHub repository URLs are accepted (scheme must be https).",
        )

    # Validate custom port: only default HTTPS port (443 or None) accepted
    if parsed.port is not None and parsed.port != 443:
        raise HTTPException(
            status_code=400,
            detail=f"Custom ports ('{parsed.port}') are not permitted in GitHub repository URLs.",
        )

    # Validate host: only github.com or www.github.com accepted
    # Automatically rejects localhost, 127.0.0.1, private networks, and third-party hosts
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise HTTPException(
            status_code=400,
            detail="Repository URL must contain a valid hostname.",
        )

    if hostname not in ("github.com", "www.github.com"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid repository host '{hostname}'. Only public github.com URLs are accepted.",
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

    if not repo:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository name.",
        )

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
