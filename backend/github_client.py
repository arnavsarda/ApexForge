"""GitHub REST API client for RepoReady.

Fetches real repository metadata, languages, issues (excluding PRs), contributors,
recursive file trees, README, CONTRIBUTING.md, and configuration manifests asynchronously.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import HTTPException
import httpx

from config import get_github_headers, get_github_token
from models import (
    RepoMeta,
    LanguageBreakdown,
    Issue,
    Contributor,
    FileTreeEntry,
)

BASE_URL = "https://api.github.com"
TIMEOUT = 15.0
MAX_TREE_ENTRIES = 500
MAX_CONFIG_FILE_SIZE = 25000


def _client() -> httpx.AsyncClient:
    """Create an async httpx client with standardized RepoReady GitHub headers."""
    return httpx.AsyncClient(
        base_url=BASE_URL,
        headers=get_github_headers(),
        timeout=TIMEOUT,
        follow_redirects=True,
    )


async def fetch_repo(owner: str, repo: str) -> tuple[RepoMeta, dict]:
    """Fetch core repo metadata. Returns (RepoMeta, raw_json).

    Raises appropriate HTTPExceptions for 401, 403, 404, 429, 5xx, or network errors.
    """
    try:
        async with _client() as c:
            r = await c.get(f"/repos/{owner}/{repo}")
            if r.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="GitHub authentication failed (401 Bad Credentials). Please verify the GITHUB_TOKEN in your .env file.",
                )
            if r.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"Repository {owner}/{repo} not found or is private. Only public GitHub repositories are supported.",
                )
            if r.status_code in (403, 429):
                remaining = r.headers.get("x-ratelimit-remaining", "0")
                raise HTTPException(
                    status_code=429,
                    detail=f"GitHub API rate limit exceeded ({remaining} remaining). Please configure a GITHUB_TOKEN in .env for higher limits.",
                )
            if r.status_code >= 500:
                raise HTTPException(
                    status_code=502,
                    detail=f"GitHub API encountered an upstream error (HTTP {r.status_code}). Please try again later.",
                )
            r.raise_for_status()
            d = r.json()

            lic = d.get("license")
            license_name = None
            if isinstance(lic, dict):
                license_name = lic.get("spdx_id") or lic.get("name")
                if license_name == "NOASSERTION":
                    license_name = lic.get("name") or "Custom"

            size_val = int(d.get("size", 0))

            meta = RepoMeta(
                owner=d.get("owner", {}).get("login", owner),
                name=d.get("name", repo),
                full_name=d.get("full_name", f"{owner}/{repo}"),
                description=d.get("description"),
                html_url=d.get("html_url", f"https://github.com/{owner}/{repo}"),
                stars=int(d.get("stargazers_count", 0)),
                forks=int(d.get("forks_count", d.get("forks", 0))),
                open_issues=int(d.get("open_issues_count", d.get("open_issues", 0))),
                default_branch=d.get("default_branch") or "main",
                language=d.get("language"),
                topics=d.get("topics", []) if isinstance(d.get("topics"), list) else [],
                created_at=d.get("created_at", ""),
                updated_at=d.get("updated_at", ""),
                pushed_at=d.get("pushed_at"),
                license=license_name,
                has_wiki=bool(d.get("has_wiki", False)),
                is_empty=(size_val == 0),
                size_kb=size_val,
            )
            return meta, d
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Request to GitHub API timed out after {TIMEOUT} seconds. GitHub may be experiencing high latency.",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to GitHub API: {str(e)}. Please check your internet connection.",
        )


async def fetch_languages(owner: str, repo: str) -> LanguageBreakdown:
    """Fetch repository language breakdown."""
    async with _client() as c:
        try:
            r = await c.get(f"/repos/{owner}/{repo}/languages")
            if r.status_code != 200:
                return LanguageBreakdown(languages={}, percentages={})
            langs: dict[str, int] = r.json()
            if not isinstance(langs, dict):
                return LanguageBreakdown(languages={}, percentages={})
            total = sum(langs.values()) or 0
            if total > 0:
                pcts = {k: round(v / total * 100, 1) for k, v in langs.items()}
            else:
                pcts = {}
            return LanguageBreakdown(languages=langs, percentages=pcts)
        except Exception:
            return LanguageBreakdown(languages={}, percentages={})


async def fetch_issues(
    owner: str, repo: str, limit: int = 15
) -> list[Issue]:
    """Fetch real open GitHub issues, strictly excluding pull requests.

    Filters out PRs by verifying the 'pull_request' field is absent or None.
    Prioritizes issues with beginner labels ('good first issue', 'help wanted'),
    then fills remaining slots with standard open issues.
    """
    beginner_labels = [
        "good first issue",
        "good-first-issue",
        "beginner",
        "help wanted",
        "easy",
    ]
    all_issues: list[Issue] = []
    seen_numbers: set[int] = set()

    async with _client() as c:
        # 1. Try beginner labeled issues first
        for label in beginner_labels:
            if len(all_issues) >= limit:
                break
            try:
                r = await c.get(
                    f"/repos/{owner}/{repo}/issues",
                    params={
                        "labels": label,
                        "state": "open",
                        "per_page": min(limit, 10),
                        "sort": "created",
                        "direction": "desc",
                    },
                )
                if r.status_code != 200:
                    continue
                items = r.json()
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    # Strict check: GitHub issues endpoint includes pull requests unless filtered!
                    if item.get("pull_request") is not None:
                        continue
                    num = item.get("number")
                    if not num or num in seen_numbers:
                        continue
                    seen_numbers.add(num)
                    body_raw = item.get("body")
                    preview = (body_raw[:200] + "...") if body_raw and len(body_raw) > 200 else body_raw
                    all_issues.append(
                        Issue(
                            number=num,
                            title=item.get("title", ""),
                            html_url=item.get("html_url", ""),
                            url=item.get("html_url"),
                            labels=[
                                l.get("name", "")
                                for l in item.get("labels", [])
                                if isinstance(l, dict) and "name" in l
                            ],
                            created_at=item.get("created_at", ""),
                            updated_at=item.get("updated_at"),
                            comments=item.get("comments", 0),
                            body=body_raw,
                            body_preview=preview,
                        )
                    )
                    if len(all_issues) >= limit:
                        break
            except Exception:
                continue

        # 2. If under limit, fetch general open issues (still excluding pull requests)
        if len(all_issues) < limit:
            try:
                r = await c.get(
                    f"/repos/{owner}/{repo}/issues",
                    params={
                        "state": "open",
                        "per_page": limit,
                        "sort": "updated",
                        "direction": "desc",
                    },
                )
                if r.status_code == 200:
                    items = r.json()
                    if isinstance(items, list):
                        for item in items:
                            if not isinstance(item, dict):
                                continue
                            if item.get("pull_request") is not None:
                                continue
                            num = item.get("number")
                            if not num or num in seen_numbers:
                                continue
                            seen_numbers.add(num)
                            body_raw = item.get("body")
                            preview = (body_raw[:200] + "...") if body_raw and len(body_raw) > 200 else body_raw
                            all_issues.append(
                                Issue(
                                    number=num,
                                    title=item.get("title", ""),
                                    html_url=item.get("html_url", ""),
                                    url=item.get("html_url"),
                                    labels=[
                                        l.get("name", "")
                                        for l in item.get("labels", [])
                                        if isinstance(l, dict) and "name" in l
                                    ],
                                    created_at=item.get("created_at", ""),
                                    updated_at=item.get("updated_at"),
                                    comments=item.get("comments", 0),
                                    body=body_raw,
                                    body_preview=preview,
                                )
                            )
                            if len(all_issues) >= limit:
                                break
            except Exception:
                pass

    return all_issues


async def fetch_contributors(
    owner: str, repo: str, limit: int = 10
) -> list[Contributor]:
    """Fetch top contributors."""
    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/contributors",
                params={"per_page": limit},
            )
            if r.status_code != 200:
                return []
            data = r.json()
            if not isinstance(data, list):
                return []
            return [
                Contributor(
                    login=c_data.get("login", ""),
                    avatar_url=c_data.get("avatar_url", ""),
                    html_url=c_data.get("html_url", ""),
                    contributions=c_data.get("contributions", 0),
                )
                for c_data in data
                if isinstance(c_data, dict) and c_data.get("type") == "User"
            ][:limit]
        except Exception:
            return []


async def fetch_file_tree(
    owner: str, repo: str, branch: str = "main"
) -> tuple[list[FileTreeEntry], bool]:
    """Fetch recursive file tree via Git Trees API (?recursive=1) or Contents API fallback.

    Returns:
        tuple[list[FileTreeEntry], bool]: (entries, is_empty_repo)
    """
    async with _client() as c:
        # 1. Try recursive Git Trees API (?recursive=1)
        try:
            r = await c.get(f"/repos/{owner}/{repo}/git/trees/{branch}", params={"recursive": "1"})
            # 409 Conflict: Genuinely empty Git repository
            if r.status_code == 409:
                return [], True

            if r.status_code == 200:
                tree = r.json().get("tree", [])
                if isinstance(tree, list):
                    entries = [
                        FileTreeEntry(
                            path=item["path"],
                            type=item.get("type", "blob"),
                            size=item.get("size"),
                        )
                        for item in tree
                        if isinstance(item, dict) and "path" in item
                    ][:MAX_TREE_ENTRIES]
                    is_empty = len(entries) == 0
                    return entries, is_empty
        except Exception:
            pass

        # 2. Fallback to Contents API
        try:
            r = await c.get(f"/repos/{owner}/{repo}/contents")
            if r.status_code == 404:
                # 404 on contents often means empty repository without commits
                return [], True
            if r.status_code == 200:
                items = r.json()
                if isinstance(items, list):
                    entries = [
                        FileTreeEntry(
                            path=item.get("name", ""),
                            type="tree" if item.get("type") == "dir" else "blob",
                            size=item.get("size"),
                        )
                        for item in items
                        if isinstance(item, dict) and "name" in item
                    ][:MAX_TREE_ENTRIES]
                    return entries, len(entries) == 0
        except Exception:
            pass

        return [], False


async def fetch_config_file(owner: str, repo: str, path: str) -> tuple[str, str | None]:
    """Fetch raw text content of a small repository config or manifest file."""
    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/contents/{path}",
                headers={**get_github_headers(), "Accept": "application/vnd.github.raw+json"},
            )
            if r.status_code == 200:
                return path, r.text[:MAX_CONFIG_FILE_SIZE]
        except Exception:
            pass
    return path, None


async def fetch_file_content_by_path(
    owner: str, repo: str, path: str, branch: str = "main"
) -> dict[str, Any]:
    """Fetch real file content safely from GitHub Contents API.

    Prevents directory traversal and limits file size to avoid memory exhaustion.
    """
    import base64

    # Reject absolute paths and directory traversal
    if path.startswith("/") or path.startswith("\\") or ".." in path:
        raise HTTPException(status_code=400, detail="Invalid file path.")

    clean_path = path.strip()

    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/contents/{clean_path}",
                params={"ref": branch} if branch else {},
                headers={**get_github_headers(), "Accept": "application/vnd.github+json"},
            )
            if r.status_code == 404:
                return {
                    "path": clean_path,
                    "content": None,
                    "size": None,
                    "is_binary": False,
                    "truncated": False,
                    "error": "File not found in repository.",
                    "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
                }
            if r.status_code in (403, 429):
                remaining = r.headers.get("x-ratelimit-remaining", "0")
                return {
                    "path": clean_path,
                    "content": None,
                    "size": None,
                    "is_binary": False,
                    "truncated": False,
                    "error": f"GitHub API rate limit exceeded ({remaining} remaining).",
                    "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
                }
            if r.status_code != 200:
                return {
                    "path": clean_path,
                    "content": None,
                    "size": None,
                    "is_binary": False,
                    "truncated": False,
                    "error": f"GitHub API error (HTTP {r.status_code}).",
                    "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
                }

            data = r.json()
            if not isinstance(data, dict):
                return {
                    "path": clean_path,
                    "content": None,
                    "size": None,
                    "is_binary": False,
                    "truncated": False,
                    "error": "Unexpected GitHub response structure.",
                    "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
                }

            if data.get("type") != "file":
                return {
                    "path": clean_path,
                    "content": None,
                    "size": None,
                    "is_binary": False,
                    "truncated": False,
                    "error": f"Path is a {data.get('type')}, not a regular file.",
                    "html_url": data.get("html_url") or f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
                }

            file_size = data.get("size", 0)
            html_url = data.get("html_url") or f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}"

            # If file is over 150 KB, don't download full content
            if file_size > 150_000:
                return {
                    "path": clean_path,
                    "content": None,
                    "size": file_size,
                    "is_binary": False,
                    "truncated": True,
                    "error": f"File is too large to preview directly ({round(file_size / 1024, 1)} KB). View on GitHub.",
                    "html_url": html_url,
                }

            raw_b64 = data.get("content")
            if not raw_b64:
                return {
                    "path": clean_path,
                    "content": "",
                    "size": file_size,
                    "is_binary": False,
                    "truncated": False,
                    "error": None,
                    "html_url": html_url,
                }

            try:
                decoded_bytes = base64.b64decode(raw_b64.replace("\n", ""))
                # Check for binary null bytes
                if b"\x00" in decoded_bytes[:1024]:
                    return {
                        "path": clean_path,
                        "content": None,
                        "size": file_size,
                        "is_binary": True,
                        "truncated": False,
                        "error": "Binary file preview not supported in browser.",
                        "html_url": html_url,
                    }
                content_text = decoded_bytes.decode("utf-8", errors="replace")
                return {
                    "path": clean_path,
                    "content": content_text,
                    "size": file_size,
                    "is_binary": False,
                    "truncated": False,
                    "error": None,
                    "html_url": html_url,
                }
            except Exception as e:
                return {
                    "path": clean_path,
                    "content": None,
                    "size": file_size,
                    "is_binary": True,
                    "truncated": False,
                    "error": f"Could not decode file content: {str(e)}",
                    "html_url": html_url,
                }
        except httpx.TimeoutException:
            return {
                "path": clean_path,
                "content": None,
                "size": None,
                "is_binary": False,
                "truncated": False,
                "error": "Timeout while fetching file from GitHub.",
                "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
            }
        except Exception as e:
            return {
                "path": clean_path,
                "content": None,
                "size": None,
                "is_binary": False,
                "truncated": False,
                "error": f"Network error: {str(e)}",
                "html_url": f"https://github.com/{owner}/{repo}/blob/{branch}/{clean_path}",
            }


async def fetch_readme_html(owner: str, repo: str) -> str | None:
    """Fetch the rendered README as HTML."""
    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/readme",
                headers={**get_github_headers(), "Accept": "application/vnd.github.html+json"},
            )
            if r.status_code == 200:
                return r.text
        except Exception:
            pass
        return None


async def fetch_readme_raw(owner: str, repo: str) -> str | None:
    """Fetch the raw README content."""
    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/readme",
                headers={**get_github_headers(), "Accept": "application/vnd.github.raw+json"},
            )
            if r.status_code == 200:
                return r.text[:MAX_CONFIG_FILE_SIZE * 2]
        except Exception:
            pass
        return None


async def fetch_contributing_raw(
    owner: str, repo: str, file_tree: list[FileTreeEntry]
) -> tuple[str | None, str | None]:
    """Fetch raw content of CONTRIBUTING.md if present in repository.

    Returns:
        (content, path) or (None, None)
    """
    contributing_path = None
    for f in file_tree:
        lower = f.path.lower()
        if lower in (
            "contributing.md",
            ".github/contributing.md",
            "docs/contributing.md",
            ".github/contributing.rst",
            "contributing.rst",
        ):
            contributing_path = f.path
            break

    if not contributing_path:
        contributing_path = "CONTRIBUTING.md"

    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/contents/{contributing_path}",
                headers={**get_github_headers(), "Accept": "application/vnd.github.raw+json"},
            )
            if r.status_code == 200:
                return r.text[:MAX_CONFIG_FILE_SIZE], contributing_path
        except Exception:
            pass
    return None, None


async def get_rate_limit() -> int | None:
    """Return remaining GitHub API rate limit."""
    async with _client() as c:
        try:
            r = await c.get("/rate_limit")
            if r.status_code == 200:
                return r.json().get("resources", {}).get("core", {}).get("remaining")
        except Exception:
            pass
    return None


# ── In-Memory Repository Cache (TTL: 5 minutes) ─────────────────────────────
_REPO_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 300.0


def clear_repo_cache() -> None:
    """Clear in-memory repository analysis cache (for testing or manual invalidation)."""
    _REPO_CACHE.clear()


async def fetch_all(owner: str, repo: str) -> dict[str, Any]:
    """Fetch all repository data concurrently with in-memory TTL caching."""
    import time

    cache_key = f"{owner.lower()}/{repo.lower()}"
    now = time.time()
    if cache_key in _REPO_CACHE:
        cached_time, cached_data = _REPO_CACHE[cache_key]
        if now - cached_time < _CACHE_TTL_SECONDS:
            return cached_data

    # 1. Fetch repo metadata first (required for default_branch and size)
    meta, _ = await fetch_repo(owner, repo)
    branch = meta.default_branch

    # 2. Concurrently fetch languages, issues, contributors, recursive tree, readme, rate
    langs_res, issues_res, contribs_res, tree_res, readme_html_res, readme_raw_res, rate_res = (
        await asyncio.gather(
            fetch_languages(owner, repo),
            fetch_issues(owner, repo),
            fetch_contributors(owner, repo),
            fetch_file_tree(owner, repo, branch),
            fetch_readme_html(owner, repo),
            fetch_readme_raw(owner, repo),
            get_rate_limit(),
            return_exceptions=True,
        )
    )

    langs = langs_res if isinstance(langs_res, LanguageBreakdown) else LanguageBreakdown(languages={}, percentages={})
    issues = issues_res if isinstance(issues_res, list) else []
    contribs = contribs_res if isinstance(contribs_res, list) else []

    if isinstance(tree_res, tuple):
        tree, tree_empty = tree_res
        if tree_empty and meta.size_kb == 0:
            meta.is_empty = True
        elif len(tree) > 0:
            meta.is_empty = False
    elif isinstance(tree_res, list):
        tree = tree_res
        if len(tree) == 0 and meta.size_kb == 0:
            meta.is_empty = True
    else:
        tree = []

    readme_html = readme_html_res if isinstance(readme_html_res, str) else None
    readme_raw = readme_raw_res if isinstance(readme_raw_res, str) else None
    rate = rate_res if isinstance(rate_res, int) else None

    # 3. Discover and fetch manifests & configuration files
    manifest_names = {
        "package.json",
        "requirements.txt",
        "pyproject.toml",
        "setup.py",
        "cargo.toml",
        "go.mod",
        "dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        "pom.xml",
        "build.gradle",
        "cmake_lists.txt",
        "makefile",
        "pytest.ini",
        "vitest.config.ts",
        "vitest.config.js",
        "jest.config.js",
        "jest.config.ts",
        "tsconfig.json",
    }

    # Find matching manifest paths in recursive tree
    config_candidates: list[str] = []
    for f in tree:
        p_lower = f.path.lower()
        basename = p_lower.split("/")[-1]
        if basename in manifest_names:
            config_candidates.append(f.path)
            if len(config_candidates) >= 6:
                break

    config_files: dict[str, str] = {}
    contributing_raw = None
    contributing_path = None

    tasks_to_gather = []
    # Add manifest tasks
    for p in config_candidates:
        tasks_to_gather.append(fetch_config_file(owner, repo, p))
    # Add contributing task
    tasks_to_gather.append(fetch_contributing_raw(owner, repo, tree))

    results = await asyncio.gather(*tasks_to_gather, return_exceptions=True)

    for res in results[:-1]:
        if isinstance(res, tuple) and res[1] is not None:
            config_files[res[0]] = res[1]

    contrib_res = results[-1]
    if isinstance(contrib_res, tuple) and contrib_res[0] is not None:
        contributing_raw, contributing_path = contrib_res[0], contrib_res[1]

    result_payload = {
        "meta": meta,
        "languages": langs,
        "beginner_issues": issues,
        "contributors": contribs,
        "file_tree": tree,
        "readme_html": readme_html,
        "readme_raw": readme_raw,
        "contributing_raw": contributing_raw,
        "contributing_path": contributing_path,
        "rate_limit_remaining": rate,
        "config_files": config_files,
    }

    _REPO_CACHE[cache_key] = (now, result_payload)
    return result_payload
