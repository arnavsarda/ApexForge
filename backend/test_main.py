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
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

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
from ollama_client import check_ollama_health, generate_ai_guide


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
    with patch("main.fetch_all", side_effect=HTTPException(status_code=404, detail="Repository not found or is private")):
        response = client.post(
            "/api/analyze",
            json={"repository_url": "https://github.com/nonexistent/missing-repo-xyz"},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


def test_429_rate_limit_exceeded(client):
    """POST /api/analyze must return 429 when GitHub rate limit is exceeded."""
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


# ── 7. Root Endpoint and AI Test Endpoint Tests ──────────────────────────────

def test_root_endpoint(client):
    """GET / must return 200 with RepoReady status and endpoints."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "RepoReady"
    assert data["status"] == "running"
    assert "endpoints" in data
    assert "analyze_repo" in data["endpoints"]


@pytest.mark.anyio
async def test_ai_test_endpoint_mocked_available(client):
    """POST /api/ai-test must return structured AI response targeting qwen3:4b."""
    mock_result = {
        "status": "ok",
        "target_model": "qwen3:4b",
        "model_used": "qwen3:4b",
        "available": True,
        "response": "Open source contributors collaborate globally to improve software.",
        "error": None,
    }
    with patch("main.test_ai_inference", new=AsyncMock(return_value=mock_result)):
        response = client.post("/api/ai-test", json={"prompt": "What is open source?"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["target_model"] == "qwen3:4b"
        assert data["model_used"] == "qwen3:4b"
        assert data["available"] is True
        assert "collaborate" in data["response"]


@pytest.mark.anyio
async def test_ai_test_endpoint_unavailable(client):
    """POST /api/ai-test must return graceful unavailable status when Ollama is offline."""
    mock_result = {
        "status": "unavailable",
        "target_model": "qwen3:4b",
        "model_used": None,
        "available": False,
        "response": None,
        "error": "Ollama service is not reachable on localhost:11434",
    }
    with patch("main.test_ai_inference", new=AsyncMock(return_value=mock_result)):
        response = client.post("/api/ai-test", json={})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "unavailable"
        assert data["available"] is False
        assert "not reachable" in data["error"]


# ── 8. Endpoint Aliases: POST /api/analyze-repo and POST /api/analyze ─────────

@pytest.mark.anyio
def test_analyze_repo_endpoint_and_param_aliases(client):
    """POST /api/analyze-repo must work with repository_url, repo_url, or url."""
    mock_meta = RepoMeta(
        owner="aliasowner",
        name="aliasrepo",
        full_name="aliasowner/aliasrepo",
        html_url="https://github.com/aliasowner/aliasrepo",
        stars=10,
        forks=2,
        open_issues=0,
        default_branch="main",
        language="Python",
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
        pushed_at="2024-01-03T00:00:00Z",
        size_kb=50,
        is_empty=False,
    )
    mock_data = {
        "meta": mock_meta,
        "languages": LanguageBreakdown(languages={"Python": 1000}, percentages={"Python": 100.0}),
        "beginner_issues": [],
        "contributors": [],
        "file_tree": [FileTreeEntry(path="main.py", type="blob", size=100)],
        "readme_html": None,
        "readme_raw": None,
        "contributing_raw": None,
        "contributing_path": None,
        "rate_limit_remaining": 4900,
        "config_files": {},
    }

    with patch("main.fetch_all", new=AsyncMock(return_value=mock_data)):
        # 1. Test /api/analyze-repo with repository_url
        res1 = client.post("/api/analyze-repo", json={"repository_url": "https://github.com/aliasowner/aliasrepo"})
        assert res1.status_code == 200
        assert res1.json()["repository"]["full_name"] == "aliasowner/aliasrepo"

        # 2. Test /api/analyze-repo with repo_url alias
        res2 = client.post("/api/analyze-repo", json={"repo_url": "https://github.com/aliasowner/aliasrepo"})
        assert res2.status_code == 200

        # 3. Test older /api/analyze route
        res3 = client.post("/api/analyze", json={"repository_url": "https://github.com/aliasowner/aliasrepo"})
        assert res3.status_code == 200


# ── 9. URL Security Tests (Credentials, Custom Ports, Localhost) ────────────

def test_url_rejects_credentials():
    """URLs containing credentials (user:pass@) must be rejected with HTTP 400."""
    with pytest.raises(Exception) as exc_info:
        validate_and_parse_github_url("https://user:secret123@github.com/owner/repo")
    assert "credentials" in str(exc_info.value.detail).lower()


def test_url_rejects_custom_ports():
    """URLs with non-standard ports must be rejected."""
    with pytest.raises(Exception) as exc_info:
        validate_and_parse_github_url("https://github.com:8443/owner/repo")
    assert "custom port" in str(exc_info.value.detail).lower()


def test_url_rejects_localhost_and_private_ips():
    """Localhost and private IP addresses must be rejected."""
    for bad_url in (
        "https://localhost/owner/repo",
        "https://127.0.0.1/owner/repo",
        "https://192.168.1.10/owner/repo",
        "https://10.0.0.1/owner/repo",
    ):
        with pytest.raises(Exception) as exc_info:
            validate_and_parse_github_url(bad_url)
        assert "invalid repository host" in str(exc_info.value.detail).lower()


# ── 10. Issue Filtering: Strictly Exclude Pull Requests ──────────────────────

@pytest.mark.anyio
async def test_fetch_issues_strictly_excludes_pull_requests():
    """fetch_issues must exclude items containing the pull_request field."""
    from github_client import fetch_issues

    mock_github_items = [
        {
            "number": 101,
            "title": "Real Bug Report Issue",
            "html_url": "https://github.com/org/repo/issues/101",
            "labels": [{"name": "good first issue"}],
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-02T00:00:00Z",
            "comments": 3,
            "body": "This is a real issue description.",
            # Note: "pull_request" is absent
        },
        {
            "number": 102,
            "title": "Pull Request pretending to be an issue",
            "html_url": "https://github.com/org/repo/pull/102",
            "labels": [{"name": "good first issue"}],
            "created_at": "2024-01-01T00:00:00Z",
            "pull_request": {"url": "https://api.github.com/repos/org/repo/pulls/102"},
        },
        {
            "number": 103,
            "title": "Another Real Open Issue",
            "html_url": "https://github.com/org/repo/issues/103",
            "labels": [{"name": "help wanted"}],
            "created_at": "2024-01-03T00:00:00Z",
            "updated_at": "2024-01-04T00:00:00Z",
            "comments": 1,
            "body": "Fix typo in documentation.",
            # Note: "pull_request" is absent
        },
    ]

    mock_resp = httpx.Response(
        200,
        json=mock_github_items,
        request=httpx.Request("GET", "https://api.github.com/repos/org/repo/issues"),
    )

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
        issues = await fetch_issues("org", "repo", limit=10)

        # PR #102 MUST be excluded!
        issue_numbers = [i.number for i in issues]
        assert 101 in issue_numbers
        assert 103 in issue_numbers
        assert 102 not in issue_numbers

        # Verify Issue field population
        first = next(i for i in issues if i.number == 101)
        assert first.title == "Real Bug Report Issue"
        assert first.url == "https://github.com/org/repo/issues/101"
        assert first.updated_at == "2024-01-02T00:00:00Z"
        assert first.body == "This is a real issue description."


# ── 11. Genuinely Empty Repository Detection vs API Errors ───────────────────

@pytest.mark.anyio
def test_genuinely_empty_repo_detection(client):
    """Empty repo (size=0, 0 files) returns 200 with is_empty=True and warning, NOT 404/429."""
    empty_meta = RepoMeta(
        owner="emptyuser",
        name="freshrepo",
        full_name="emptyuser/freshrepo",
        html_url="https://github.com/emptyuser/freshrepo",
        stars=0,
        forks=0,
        open_issues=0,
        default_branch="main",
        language=None,
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-01T00:00:00Z",
        pushed_at=None,
        is_empty=True,
        size_kb=0,
    )
    empty_data = {
        "meta": empty_meta,
        "languages": LanguageBreakdown(languages={}, percentages={}),
        "beginner_issues": [],
        "contributors": [],
        "file_tree": [],
        "readme_html": None,
        "readme_raw": None,
        "contributing_raw": None,
        "contributing_path": None,
        "rate_limit_remaining": 4999,
        "config_files": {},
    }

    with patch("main.fetch_all", new=AsyncMock(return_value=empty_data)):
        response = client.post("/api/analyze-repo", json={"repository_url": "https://github.com/emptyuser/freshrepo"})
        assert response.status_code == 200
        data = response.json()
        assert data["repository"]["is_empty"] is True
        assert data["has_readme"] is False
        assert data["has_contributing"] is False
        assert any("empty" in w.lower() for w in data["warnings"])


def test_auth_failure_401_handling(client):
    """GitHub 401 Bad Credentials must return 401 with clear message."""
    with patch("main.fetch_all", side_effect=HTTPException(status_code=401, detail="GitHub authentication failed (401 Bad Credentials). Please verify GITHUB_TOKEN in .env.")):
        response = client.post("/api/analyze", json={"repository_url": "https://github.com/fastapi/fastapi"})
        assert response.status_code == 401
        assert "bad credentials" in response.json()["detail"].lower()


# ── 12. Local Ollama & Qwen3 Guide Generation Tests ─────────────────────────

@pytest.mark.anyio
async def test_ollama_health_check_offline():
    """When Ollama cannot be reached, report honest running=False without hanging."""
    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Connection refused")):
        status = await check_ollama_health()
        assert status["running"] is False
        assert status["model_installed"] is False
        assert status["error"] is not None


@pytest.mark.anyio
async def test_ollama_health_check_online_model_missing():
    """When Ollama is running but qwen3:4b is not installed, report honest status."""
    mock_resp = httpx.Response(200, json={"models": [{"name": "llama3:latest"}]}, request=httpx.Request("GET", "http://localhost:11434/api/tags"))
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
        status = await check_ollama_health()
        assert status["running"] is True
        assert status["model_installed"] is False
        assert status["target_model"] == "qwen3:4b"


@pytest.mark.anyio
async def test_ollama_health_check_online_model_present():
    """When Ollama has qwen3:4b installed, report model_installed=True."""
    mock_resp = httpx.Response(200, json={"models": [{"name": "qwen3:4b"}, {"name": "other:latest"}]}, request=httpx.Request("GET", "http://localhost:11434/api/tags"))
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
        status = await check_ollama_health()
        assert status["running"] is True
        assert status["model_installed"] is True
        assert status["matched_model"] == "qwen3:4b"


@pytest.mark.anyio
async def test_generate_ai_guide_with_mocked_qwen3():
    """When Qwen3 generates valid guide output, verify synthesis and ai_enhanced=True."""
    meta = RepoMeta(
        owner="aiuser",
        name="airepo",
        full_name="aiuser/airepo",
        html_url="https://github.com/aiuser/airepo",
        stars=10,
        forks=2,
        open_issues=1,
        default_branch="main",
        language="Python",
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    languages = LanguageBreakdown(languages={"Python": 1000}, percentages={"Python": 100.0})
    file_tree = [FileTreeEntry(path="main.py", type="blob", size=100)]
    issues = [Issue(number=1, title="Starter bug", html_url="https://github.com/aiuser/airepo/issues/1", labels=["good first issue"], created_at="2024-01-01T00:00:00Z")]

    base_guide = generate_onboarding_guide(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw="# AI Repo\nSample",
    )

    mock_health = {
        "running": True,
        "host": "http://localhost:11434",
        "target_model": "qwen3:4b",
        "model_installed": True,
        "matched_model": "qwen3:4b",
        "installed_models": ["qwen3:4b"],
        "error": None,
    }

    qwen3_text = "This repository implements an AI data processing pipeline with Python."
    mock_post_resp = httpx.Response(200, json={"response": qwen3_text}, request=httpx.Request("POST", "http://localhost:11434/api/generate"))

    with patch("ollama_client.check_ollama_health", new=AsyncMock(return_value=mock_health)), \
         patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_post_resp)):
        guide, ai_status = await generate_ai_guide(
            repo_name="aiuser/airepo",
            description="AI Repo",
            readme_snippet="# AI Repo\nSample",
            tech_stack=["Python"],
            file_tree_paths=["main.py"],
            config_files={},
            contributing_raw=None,
            issues=issues,
            base_guide=base_guide,
        )

        assert guide.ai_enhanced is True
        assert guide.ai_model == "qwen3:4b"
        assert ai_status["fallback_used"] is False
        assert "pipeline" in guide.summary
        assert len(guide.sections) == 12


@pytest.mark.anyio
async def test_generate_ai_guide_honest_fallback_when_model_missing():
    """When Qwen3 model is missing, return honest fallback and never claim it was AI-generated."""
    meta = RepoMeta(
        owner="fallbackuser",
        name="fallbackrepo",
        full_name="fallbackuser/fallbackrepo",
        html_url="https://github.com/fallbackuser/fallbackrepo",
        stars=5,
        forks=1,
        open_issues=0,
        default_branch="main",
        language="Python",
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    languages = LanguageBreakdown(languages={"Python": 500}, percentages={"Python": 100.0})
    file_tree = [FileTreeEntry(path="app.py", type="blob", size=100)]

    base_guide = generate_onboarding_guide(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw="# Fallback",
    )

    mock_health = {
        "running": True,
        "host": "http://localhost:11434",
        "target_model": "qwen3:4b",
        "model_installed": False,
        "matched_model": None,
        "installed_models": [],
        "error": None,
    }

    with patch("ollama_client.check_ollama_health", new=AsyncMock(return_value=mock_health)):
        guide, ai_status = await generate_ai_guide(
            repo_name="fallbackuser/fallbackrepo",
            description="Fallback Repo",
            readme_snippet="# Fallback",
            tech_stack=["Python"],
            file_tree_paths=["app.py"],
            config_files={},
            contributing_raw=None,
            issues=[],
            base_guide=base_guide,
        )

        assert guide.ai_enhanced is False
        assert ai_status["fallback_used"] is True
        assert ai_status["model_installed"] is False
        assert "not installed" in ai_status["reason"].lower()
        assert len(guide.sections) == 12


@pytest.mark.anyio
async def test_generate_ai_guide_timeout_handling():
    """When Ollama call times out, gracefully fall back to rule engine without hanging."""
    meta = RepoMeta(
        owner="timeoutuser",
        name="timeoutrepo",
        full_name="timeoutuser/timeoutrepo",
        html_url="https://github.com/timeoutuser/timeoutrepo",
        stars=5,
        forks=1,
        open_issues=0,
        default_branch="main",
        language="TypeScript",
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    languages = LanguageBreakdown(languages={"TypeScript": 500}, percentages={"TypeScript": 100.0})
    file_tree = [FileTreeEntry(path="package.json", type="blob", size=50)]

    base_guide = generate_onboarding_guide(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw="Slow repo",
    )

    mock_health = {
        "running": True,
        "host": "http://localhost:11434",
        "target_model": "qwen3:4b",
        "model_installed": True,
        "matched_model": "qwen3:4b",
        "installed_models": ["qwen3:4b"],
        "error": None,
    }

    with patch("ollama_client.check_ollama_health", new=AsyncMock(return_value=mock_health)), \
         patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Generation timed out")):
        guide, ai_status = await generate_ai_guide(
            repo_name="timeoutuser/timeoutrepo",
            description="Timeout",
            readme_snippet="Slow repo",
            tech_stack=["TypeScript"],
            file_tree_paths=["package.json"],
            config_files={"package.json": '{"scripts": {"dev": "vite"}}'},
            contributing_raw=None,
            issues=[],
            base_guide=base_guide,
        )

        assert guide.ai_enhanced is False
        assert ai_status["fallback_used"] is True
        assert "timed out" in ai_status["reason"].lower() or "failed" in ai_status["reason"].lower()
        assert len(guide.sections) == 12


def test_untrusted_repository_prompt_injection_safety():
    """Verify system prompt instructs model to treat repository content as untrusted evidence."""
    from ollama_client import SYSTEM_PROMPT

    prompt_lower = SYSTEM_PROMPT.lower()
    assert "untrusted" in prompt_lower
    assert "instructions" in prompt_lower
    assert "evidence" in prompt_lower


