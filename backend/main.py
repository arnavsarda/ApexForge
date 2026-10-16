"""RepoReady — FastAPI backend.

Analyzes public GitHub repositories and generates evidence-based onboarding guides.
"""

from __future__ import annotations

from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

from config import (
    load_project_env,
    is_token_configured,
    get_token_diagnostics,
)
from models import AnalyzeRequest, AnalysisResponse, OnboardResponse, OnboardingGuide
from validator import validate_and_parse_github_url
from github_client import fetch_all
from summarizer import generate_onboarding_guide
from ollama_client import enhance_guide, is_available as ollama_available

# Load project .env at startup
load_project_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    load_project_env()
    token_ok = is_token_configured()
    ollama_ok = await ollama_available()
    diag = get_token_diagnostics()

    print("[*] RepoReady backend starting")
    print(f"    GitHub token: {'[OK] configured (' + str(diag.get('rate_limit_tier')) + ')' if token_ok else '[!!] not configured (60 req/hr limit)'}")
    print(f"    Env file:     {diag.get('env_file_path') or 'not found'}")
    print(f"    Ollama:       {'[OK] available' if ollama_ok else '[--] not available (using rule-based guides)'}")
    yield
    print("[*] RepoReady backend shutting down")


app = FastAPI(
    title="RepoReady",
    description="Evidence-based onboarding guide generator for public GitHub repositories",
    version="0.1.0",
    lifespan=lifespan,
)

# Local frontend CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/health")
async def health():
    """Health check endpoint reporting safe diagnostics without exposing secrets."""
    load_project_env()
    diag = get_token_diagnostics()
    return {
        "status": "ok",
        "app": "RepoReady",
        "version": "0.1.0",
        "github_token_set": diag["github_token_configured"],
        "diagnostics": diag,
        "ollama_available": await ollama_available(),
    }


async def _analyze_repository(owner: str, repo: str) -> AnalysisResponse:
    """Internal helper to fetch and assemble the analysis response."""
    try:
        data = await fetch_all(owner, repo)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Repository {owner}/{repo} not found or is private. Only public GitHub repositories are supported.",
            )
        if e.response.status_code in (403, 429):
            raise HTTPException(
                status_code=429,
                detail="GitHub API rate limit exceeded. Set GITHUB_TOKEN in .env for higher limits.",
            )
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach GitHub API: {str(e)}")

    meta = data["meta"]
    languages = data["languages"]
    file_tree = data["file_tree"]
    readme_raw = data["readme_raw"]
    config_files = data.get("config_files", {})

    # Generate the evidence-based onboarding guide
    contributing_raw = data.get("contributing_raw")
    contributing_path = data.get("contributing_path") or "CONTRIBUTING.md"

    guide = generate_onboarding_guide(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw=readme_raw,
        config_files=config_files,
        contributing_raw=contributing_raw,
    )

    # Optional local Ollama enhancement
    enhanced = await enhance_guide(
        repo_name=meta.full_name,
        description=meta.description,
        readme_snippet=readme_raw,
        tech_stack=guide.tech_stack,
        existing_summary=guide.summary,
    )
    if enhanced:
        guide.summary = enhanced
        guide.ai_enhanced = True

    # Assemble evidence sources
    sources = [
        f"GitHub REST API: https://api.github.com/repos/{owner}/{repo}",
        f"GitHub Languages API: https://api.github.com/repos/{owner}/{repo}/languages",
        f"GitHub Git Trees API: https://api.github.com/repos/{owner}/{repo}/git/trees/{meta.default_branch}",
        f"GitHub Issues API: https://api.github.com/repos/{owner}/{repo}/issues",
    ]
    if readme_raw:
        sources.append(f"Repository README: https://github.com/{owner}/{repo}#readme")
    if contributing_raw:
        sources.append(f"Repository Contributing Guidelines: https://github.com/{owner}/{repo}/blob/{meta.default_branch}/{contributing_path}")
    if config_files:
        for cfg in config_files:
            sources.append(f"Repository Configuration: https://github.com/{owner}/{repo}/blob/{meta.default_branch}/{cfg}")
    if data.get("contributors"):
        sources.append(f"GitHub Contributors API: https://api.github.com/repos/{owner}/{repo}/contributors")

    # Assemble evidence warnings
    warnings: list[str] = []
    if not is_token_configured():
        warnings.append("GitHub token not configured in .env. Unauthenticated requests are limited to 60 requests/hour.")
    if len(file_tree) == 0:
        warnings.append("Repository appears empty on GitHub (0 files or uninitialized default branch).")
    elif not readme_raw:
        warnings.append("No README found. Setup steps are derived from detected project configuration files.")
    if meta.license is None:
        warnings.append("No open-source license detected in repository metadata.")
    if not data["beginner_issues"]:
        warnings.append("No open beginner-friendly issues ('good first issue', 'help wanted') found.")

    now_iso = datetime.now(timezone.utc).isoformat()

    return AnalysisResponse(
        repository=meta,
        overview=guide.summary,
        tech_stack=guide.tech_stack,
        setup_steps=guide.setup_steps,
        key_files=guide.key_files,
        contribution_tips=guide.contribution_tips,
        recommended_issues=data["beginner_issues"],
        sources=sources,
        warnings=warnings,
        generated_at=now_iso,
        languages=languages,
        contributors=data["contributors"],
        file_tree=file_tree,
        readme_html=data["readme_html"],
        rate_limit_remaining=data["rate_limit_remaining"],
    )


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    """Analyze a public GitHub repository URL and return an evidence-based onboarding guide."""
    owner, repo = validate_and_parse_github_url(req.repository_url)
    return await _analyze_repository(owner, repo)


@app.get("/api/onboard/{owner}/{repo}", response_model=OnboardResponse)
async def onboard_legacy(owner: str, repo: str):
    """Legacy endpoint for direct owner/repo onboarding."""
    analysis = await _analyze_repository(owner, repo)
    guide_obj = OnboardingGuide(
        summary=analysis.overview,
        tech_stack=analysis.tech_stack,
        setup_steps=analysis.setup_steps,
        contribution_tips=analysis.contribution_tips,
        key_files=analysis.key_files,
        ai_enhanced=False,
    )
    return OnboardResponse(
        repo=analysis.repository,
        languages=analysis.languages or LanguageBreakdown(languages={}, percentages={}),
        beginner_issues=analysis.recommended_issues,
        contributors=analysis.contributors,
        file_tree=analysis.file_tree,
        guide=guide_obj,
        readme_html=analysis.readme_html,
        rate_limit_remaining=analysis.rate_limit_remaining,
    )
