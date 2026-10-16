"""Comprehensive tests for RepoReady FastAPI backend.

Tests:
- Token loading and safe diagnostics (no secret leakage)
- GitHub response parsing and field mapping
- Missing README handling (evidence-based fallbacks)
- Missing language data handling (no "Unknown-based project")
- API error handling (404 not found, 429/403 rate limits)
- Public HTTPS GitHub repository URL validation
- CORS headers for local frontend
- Response schema stability
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from main import app
from config import (
    load_project_env,
    get_github_token,
    is_token_configured,
    get_token_diagnostics,
    get_github_headers,
)
from validator import validate_and_parse_github_url
from models import RepoMeta, LanguageBreakdown, Issue, Contributor, FileTreeEntry
from summarizer import generate_onboarding_guide, _detect_tech_stack, _infer_setup_steps


@pytest.fixture
def client():
    """Create a FastAPI test client."""
    return TestClient(app)


# ── 1. Token Loading & Diagnostics Tests ────────────────────────────────────

def test_token_loading_and_diagnostics():
    """Diagnostics must report configuration status without exposing token value."""
    diag = get_token_diagnostics()
    assert "github_token_configured" in diag
    assert "rate_limit_tier" in diag
    assert isinstance(diag["github_token_configured"], bool)

    # Security check: Token value must never be present in diagnostics
    diag_str = str(diag).lower()
    token = get_github_token()
    if token:
        assert token.lower() not in diag_str


def test_github_headers_format():
    """GitHub API headers must use Accept: application/vnd.github+json and Bearer token if set."""
    headers = get_github_headers()
    assert headers["Accept"] == "application/vnd.github+json"
    assert headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert "User-Agent" in headers

    if is_token_configured():
        assert headers["Authorization"].startswith("Bearer ")
        assert len(headers["Authorization"]) > 10


def test_unauthenticated_headers_when_no_token():
    """When token is absent, Authorization header should not be present."""
    with patch("config.get_github_token", return_value=None):
        headers = get_github_headers()
        assert "Authorization" not in headers
        assert headers["Accept"] == "application/vnd.github+json"


# ── 2. Health Endpoint Tests ────────────────────────────────────────────────

def test_health_check(client):
    """GET /health must return status ok, RepoReady app name, and token diagnostics."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "RepoReady"
    assert "github_token_set" in data
    assert "diagnostics" in data
    assert "github_token_configured" in data["diagnostics"]


def test_api_health_alias(client):
    """GET /api/health should also work as an alias."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ── 3. URL Validation Tests ─────────────────────────────────────────────────

def test_validate_valid_github_urls():
    """Valid public HTTPS GitHub URLs must parse into (owner, repo)."""
    owner, repo = validate_and_parse_github_url("https://github.com/fastapi/fastapi")
    assert owner == "fastapi"
    assert repo == "fastapi"

    owner, repo = validate_and_parse_github_url("https://github.com/torvalds/linux.git")
    assert owner == "torvalds"
    assert repo == "linux"

    owner, repo = validate_and_parse_github_url("https://www.github.com/facebook/react/")
    assert owner == "facebook"
    assert repo == "react"


def test_validate_rejects_non_https():
    """HTTP URLs must be rejected with 400 Bad Request."""
    with pytest.raises(Exception) as exc_info:
        validate_and_parse_github_url("http://github.com/owner/repo")
    assert "https" in str(exc_info.value.detail).lower()


def test_validate_rejects_non_github():
    """Non-GitHub domains must be rejected with 400 Bad Request."""
    with pytest.raises(Exception) as exc_info:
        validate_and_parse_github_url("https://gitlab.com/owner/repo")
    assert "github.com" in str(exc_info.value.detail).lower()


def test_validate_rejects_invalid_paths():
    """Deep paths or empty paths must be rejected."""
    invalid_urls = [
        "https://github.com",
        "https://github.com/",
        "https://github.com/owner",
        "https://github.com/owner/repo/tree/main/src",
        "https://github.com/owner/repo/issues",
    ]
    for url in invalid_urls:
        with pytest.raises(Exception):
            validate_and_parse_github_url(url)


# ── 4. Missing README & Missing Language Data Handling ──────────────────────

def test_missing_readme_evidence_based_fallback():
    """When README is missing, guide derives steps from package files without generic clone boilerplate."""
    meta = RepoMeta(
        owner="testowner",
        name="testrepo",
        full_name="testowner/testrepo",
        html_url="https://github.com/testowner/testrepo",
        stars=50,
        forks=5,
        open_issues=2,
        default_branch="main",
        language="TypeScript",
        topics=[],
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    file_tree = [
        FileTreeEntry(path="package.json", type="blob"),
        FileTreeEntry(path="src", type="tree"),
    ]
    pkg_content = '{"scripts": {"dev": "vite", "test": "vitest", "build": "tsc && vite build"}}'

    guide = generate_onboarding_guide(
        meta=meta,
        languages=LanguageBreakdown(languages={"TypeScript": 5000}, percentages={"TypeScript": 100.0}),
        file_tree=file_tree,
        readme_raw=None,  # Genuinely missing README
        config_files={"package.json": pkg_content},
    )

    # Must detect Vite and Vitest from package.json
    assert "Vite" in guide.tech_stack
    assert "Vitest" in guide.tech_stack

    # Must generate real npm commands, NOT generic fork/clone boilerplate
    setup_str = " ".join(guide.setup_steps)
    assert "npm install" in setup_str
    assert "npm run dev" in setup_str
    assert "npm test" in setup_str
    assert "Fork the repository on GitHub" not in setup_str


def test_missing_language_data_handling():
    """When language breakdown is empty, guide uses meta.language and never outputs 'Unknown'."""
    meta = RepoMeta(
        owner="docowner",
        name="docrepo",
        full_name="docowner/docrepo",
        html_url="https://github.com/docowner/docrepo",
        stars=10,
        forks=2,
        open_issues=0,
        default_branch="main",
        language="Python",  # GitHub metadata knows it's Python
        topics=["docs"],
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    # Empty languages endpoint
    empty_langs = LanguageBreakdown(languages={}, percentages={})

    guide = generate_onboarding_guide(
        meta=meta,
        languages=empty_langs,
        file_tree=[FileTreeEntry(path="README.md", type="blob")],
        readme_raw="# Documentation",
    )

    assert "Unknown-based" not in guide.summary
    assert "Python" in guide.tech_stack or "Python" in guide.summary


def test_empty_repository_handling():
    """When a repository has 0 files and 0 commits, state this transparently."""
    meta = RepoMeta(
        owner="emptyowner",
        name="emptyrepo",
        full_name="emptyowner/emptyrepo",
        html_url="https://github.com/emptyowner/emptyrepo",
        stars=0,
        forks=0,
        open_issues=0,
        default_branch="main",
        language=None,
        topics=[],
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    guide = generate_onboarding_guide(
        meta=meta,
        languages=LanguageBreakdown(languages={}, percentages={}),
        file_tree=[],
        readme_raw=None,
    )
    assert "empty repository" in guide.summary.lower()
    assert any("empty" in s.lower() for s in guide.setup_steps)


# ── 5. API Error Handling (404, 429) ────────────────────────────────────────

def test_analyze_rejects_invalid_url(client):
    """POST /api/analyze must reject invalid URLs with 400."""
    response = client.post(
        "/api/analyze",
        json={"repository_url": "http://github.com/fastapi/fastapi"},
    )
    assert response.status_code == 400
    assert "https" in response.json()["detail"].lower()


def test_cors_headers(client):
    """CORS headers should allow local frontend origins."""
    response = client.options(
        "/api/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers


# ── 6. Stable Schema & Full Analysis Tests ──────────────────────────────────

@pytest.mark.anyio
def test_analyze_response_schema_stability(client):
    """POST /api/analyze must conform strictly to the required schema keys."""
    mock_data = {
        "meta": RepoMeta(
            owner="mockowner",
            name="mockrepo",
            full_name="mockowner/mockrepo",
            description="A test repository for onboarding",
            html_url="https://github.com/mockowner/mockrepo",
            stars=1200,
            forks=300,
            open_issues=45,
            default_branch="main",
            language="Python",
            topics=["fastapi", "testing"],
            created_at="2023-01-01T00:00:00Z",
            updated_at="2023-01-02T00:00:00Z",
            license="MIT",
            has_wiki=False,
        ),
        "languages": LanguageBreakdown(
            languages={"Python": 90000, "Shell": 10000},
            percentages={"Python": 90.0, "Shell": 10.0},
        ),
        "beginner_issues": [
            Issue(
                number=1,
                title="Add documentation for feature X",
                html_url="https://github.com/mockowner/mockrepo/issues/1",
                labels=["good first issue"],
                created_at="2023-01-01T00:00:00Z",
                comments=2,
                body_preview="Please add docs for feature X",
            )
        ],
        "contributors": [
            Contributor(
                login="alice",
                avatar_url="https://avatars.githubusercontent.com/u/1",
                html_url="https://github.com/alice",
                contributions=50,
            )
        ],
        "file_tree": [
            FileTreeEntry(path="README.md", type="blob", size=1024),
            FileTreeEntry(path="requirements.txt", type="blob", size=100),
            FileTreeEntry(path="src", type="tree", size=None),
        ],
        "readme_html": "<h1>Mock Repo</h1>",
        "readme_raw": "# Mock Repo\n\n## Installation\n\n- Clone repository\n- Run pip install -r requirements.txt",
        "rate_limit_remaining": 4990,
        "config_files": {"requirements.txt": "fastapi>=0.100.0\npytest>=7.0.0\n"},
    }

    with patch("main.fetch_all", new=AsyncMock(return_value=mock_data)):
        response = client.post(
            "/api/analyze",
            json={"repository_url": "https://github.com/mockowner/mockrepo"},
        )
        assert response.status_code == 200
        data = response.json()

        # Check all required schema keys exist
        required_schema_keys = [
            "repository",
            "overview",
            "tech_stack",
            "setup_steps",
            "key_files",
            "contribution_tips",
            "recommended_issues",
            "sources",
            "warnings",
            "generated_at",
        ]
        for key in required_schema_keys:
            assert key in data, f"Required schema key '{key}' missing from response"

        # Verify types and contents
        assert data["repository"]["full_name"] == "mockowner/mockrepo"
        assert data["repository"]["stars"] == 1200
        assert data["repository"]["forks"] == 300
        assert "Python" in data["tech_stack"]
        assert "FastAPI" in data["tech_stack"]  # Inferred from requirements.txt!
        assert len(data["setup_steps"]) > 0
        assert "README.md" in data["key_files"]
        assert len(data["recommended_issues"]) == 1
        assert len(data["sources"]) > 0
        assert isinstance(data["warnings"], list)
        assert isinstance(data["generated_at"], str)


def test_404_repository_not_found(client):
    """POST /api/analyze must return 404 with clear message when repository is not found or private."""
    from fastapi import HTTPException
    with patch("main.fetch_all", side_effect=HTTPException(status_code=404, detail="Repository not found or is private")):
        response = client.post(
            "/api/analyze",
            json={"repository_url": "https://github.com/nonexistent/missing-repo-xyz"},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


def test_429_rate_limit_exceeded(client):
    """POST /api/analyze must return 429 when GitHub rate limit is exceeded."""
    from fastapi import HTTPException
    with patch("main.fetch_all", side_effect=HTTPException(status_code=429, detail="GitHub API rate limit exceeded")):
        response = client.post(
            "/api/analyze",
            json={"repository_url": "https://github.com/fastapi/fastapi"},
        )
        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower()


@pytest.mark.anyio
async def test_fetch_repo_response_parsing_offline():
    """Verify GitHub API repository payload parsing into RepoMeta without network."""
    import httpx
    from github_client import fetch_repo

    raw_gh_payload = {
        "name": "sample-project",
        "full_name": "testorg/sample-project",
        "owner": {"login": "testorg"},
        "description": "High performance async framework",
        "html_url": "https://github.com/testorg/sample-project",
        "stargazers_count": 45200,
        "forks_count": 8900,
        "open_issues_count": 120,
        "default_branch": "develop",
        "language": "Rust",
        "topics": ["rust", "async", "networking"],
        "created_at": "2022-05-10T12:00:00Z",
        "updated_at": "2024-03-15T08:30:00Z",
        "license": {"spdx_id": "Apache-2.0", "name": "Apache License 2.0"},
        "has_wiki": True,
        "size": 1500,
    }

    mock_resp = httpx.Response(200, json=raw_gh_payload, request=httpx.Request("GET", "https://api.github.com/repos/testorg/sample-project"))

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
        meta, raw = await fetch_repo("testorg", "sample-project")
        assert meta.owner == "testorg"
        assert meta.name == "sample-project"
        assert meta.full_name == "testorg/sample-project"
        assert meta.stars == 45200
        assert meta.forks == 8900
        assert meta.open_issues == 120
        assert meta.default_branch == "develop"
        assert meta.language == "Rust"
        assert "rust" in meta.topics
        assert meta.license == "Apache-2.0"
        assert meta.has_wiki is True


@pytest.mark.anyio
def test_contributing_and_docker_evidence_integration(client):
    """Verify CONTRIBUTING.md and Docker evidence are correctly integrated in guide and sources."""
    mock_data = {
        "meta": RepoMeta(
            owner="dockorg",
            name="microservice",
            full_name="dockorg/microservice",
            description="Containerized microservice",
            html_url="https://github.com/dockorg/microservice",
            stars=800,
            forks=95,
            open_issues=12,
            default_branch="main",
            language="Python",
            topics=["docker", "microservice"],
            created_at="2023-01-01T00:00:00Z",
            updated_at="2023-01-02T00:00:00Z",
            license="MIT",
            has_wiki=False,
        ),
        "languages": LanguageBreakdown(
            languages={"Python": 80000},
            percentages={"Python": 100.0},
        ),
        "beginner_issues": [],
        "contributors": [],
        "file_tree": [
            FileTreeEntry(path="README.md", type="blob"),
            FileTreeEntry(path="CONTRIBUTING.md", type="blob"),
            FileTreeEntry(path="Dockerfile", type="blob"),
            FileTreeEntry(path="docker-compose.yml", type="blob"),
        ],
        "readme_html": "<p>Read me</p>",
        "readme_raw": "# Microservice\n\nRun the service locally.",
        "contributing_raw": "# Contributing Guidelines\n\n- Fork the repo and create feature branches\n- All PRs require tests to pass",
        "contributing_path": "CONTRIBUTING.md",
        "rate_limit_remaining": 4950,
        "config_files": {"docker-compose.yml": "version: '3'\nservices:\n  web:\n    build: .\n"},
    }

    with patch("main.fetch_all", new=AsyncMock(return_value=mock_data)):
        response = client.post(
            "/api/analyze",
            json={"repository_url": "https://github.com/dockorg/microservice"},
        )
        assert response.status_code == 200
        data = response.json()

        # Evidence checks
        assert any("CONTRIBUTING.md" in src for src in data["sources"])
        assert any("docker-compose.yml" in src for src in data["sources"])
        assert "Docker Compose" in data["tech_stack"]
        assert any("docker compose" in step for step in data["setup_steps"])
        assert any("CONTRIBUTING.md" in tip for tip in data["contribution_tips"])


