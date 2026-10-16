"""GitHub REST API client for RepoReady.

Fetches real repository metadata, languages, issues, contributors, file trees,
README, CONTRIBUTING.md, and configuration files asynchronously using httpx.
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


def _client() -> httpx.AsyncClient:
    """Create an async httpx client with standardized RepoReady GitHub headers."""
    return httpx.AsyncClient(
        base_url=BASE_URL,
        headers=get_github_headers(),
        timeout=TIMEOUT,
        follow_redirects=True,
    )


async def fetch_repo(owner: str, repo: str) -> tuple[RepoMeta, dict]:
    """Fetch core repo metadata. Returns (RepoMeta, raw_json)."""
    async with _client() as c:
        r = await c.get(f"/repos/{owner}/{repo}")
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
        r.raise_for_status()
        d = r.json()

        lic = d.get("license")
        license_name = None
        if isinstance(lic, dict):
            license_name = lic.get("spdx_id") or lic.get("name")
            if license_name == "NOASSERTION":
                license_name = lic.get("name") or "Custom"

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
            license=license_name,
            has_wiki=bool(d.get("has_wiki", False)),
        )
        return meta, d


async def fetch_languages(owner: str, repo: str) -> LanguageBreakdown:
    """Fetch language breakdown."""
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


async def fetch_beginner_issues(
    owner: str, repo: str, limit: int = 15
) -> list[Issue]:
    """Fetch issues labelled 'good first issue' or similar beginner labels."""
    labels_to_try = [
        "good first issue",
        "good-first-issue",
        "beginner",
        "help wanted",
        "easy",
    ]
    all_issues: list[Issue] = []
    seen_numbers: set[int] = set()

    async with _client() as c:
        for label in labels_to_try:
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
                    if item.get("number") in seen_numbers:
                        continue
                    # Skip pull requests
                    if "pull_request" in item:
                        continue
                    seen_numbers.add(item["number"])
                    body = (item.get("body") or "")[:200]
                    all_issues.append(
                        Issue(
                            number=item["number"],
                            title=item["title"],
                            html_url=item["html_url"],
                            labels=[
                                l.get("name", "")
                                for l in item.get("labels", [])
                                if isinstance(l, dict)
                            ],
                            created_at=item.get("created_at", ""),
                            comments=item.get("comments", 0),
                            body_preview=body if body else None,
                        )
                    )
                    if len(all_issues) >= limit:
                        break
            except Exception:
                continue

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
) -> list[FileTreeEntry]:
    """Fetch top-level file tree via Git Trees API or Contents API fallback."""
    async with _client() as c:
        # 1. Try Git Trees API
        try:
            r = await c.get(f"/repos/{owner}/{repo}/git/trees/{branch}")
            if r.status_code == 200:
                tree = r.json().get("tree", [])
                if isinstance(tree, list):
                    return [
                        FileTreeEntry(
                            path=item["path"],
                            type=item.get("type", "blob"),
                            size=item.get("size"),
                        )
                        for item in tree
                        if isinstance(item, dict) and "path" in item
                    ]
        except Exception:
            pass

        # 2. Fallback to Contents API
        try:
            r = await c.get(f"/repos/{owner}/{repo}/contents")
            if r.status_code == 200:
                items = r.json()
                if isinstance(items, list):
                    return [
                        FileTreeEntry(
                            path=item.get("name", ""),
                            type="tree" if item.get("type") == "dir" else "blob",
                            size=item.get("size"),
                        )
                        for item in items
                        if isinstance(item, dict) and "name" in item
                    ]
        except Exception:
            pass

        return []


async def fetch_config_file(owner: str, repo: str, path: str) -> tuple[str, str | None]:
    """Fetch raw text content of a small repository config file."""
    async with _client() as c:
        try:
            r = await c.get(
                f"/repos/{owner}/{repo}/contents/{path}",
                headers={**get_github_headers(), "Accept": "application/vnd.github.raw+json"},
            )
            if r.status_code == 200:
                return path, r.text[:25000]
        except Exception:
            pass
    return path, None


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
                return r.text
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
        if lower in ("contributing.md", ".github/contributing.md", "docs/contributing.md"):
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
                return r.text[:25000], contributing_path
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


async def fetch_all(owner: str, repo: str) -> dict[str, Any]:
    """Fetch all repository data concurrently."""
    # 1. Fetch repo metadata first (required for default_branch)
    meta, _ = await fetch_repo(owner, repo)
    branch = meta.default_branch

    # 2. Concurrently fetch languages, issues, contributors, tree, readme, rate
    langs_res, issues_res, contribs_res, tree_res, readme_html_res, readme_raw_res, rate_res = (
        await asyncio.gather(
            fetch_languages(owner, repo),
            fetch_beginner_issues(owner, repo),
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
    tree = tree_res if isinstance(tree_res, list) else []
    readme_html = readme_html_res if isinstance(readme_html_res, str) else None
    readme_raw = readme_raw_res if isinstance(readme_raw_res, str) else None
    rate = rate_res if isinstance(rate_res, int) else None

    # 3. Fetch CONTRIBUTING.md and configuration files
    evidence_names = {
        "package.json", "requirements.txt", "pyproject.toml",
        "cargo.toml", "go.mod", "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    }
    config_candidates = [
        f.path for f in tree
        if f.path.lower() in evidence_names
    ][:4]

    config_files: dict[str, str] = {}
    contributing_raw = None
    contributing_path = None

    tasks_to_gather = []
    # Add config file tasks
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

    return {
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
