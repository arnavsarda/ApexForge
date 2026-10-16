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
from models import (
    AnalyzeRequest,
    AnalysisResponse,
    OnboardResponse,
    OnboardingGuide,
    AiTestRequest,
    AiTestResponse,
    LanguageBreakdown,
)
from validator import validate_and_parse_github_url
from github_client import fetch_all
from summarizer import generate_onboarding_guide
from ollama_client import (
    check_ollama_health,
    generate_ai_guide,
    test_ai_inference,
    enhance_guide,
    is_available as ollama_available,
    get_ollama_model,
)

# Load project .env at startup
load_project_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    load_project_env()
    token_ok = is_token_configured()
    ollama_stat = await check_ollama_health()
    diag = get_token_diagnostics()

    print("[*] RepoReady backend starting")
    print(f"    GitHub token: {'[OK] configured (' + str(diag.get('rate_limit_tier')) + ')' if token_ok else '[!!] not configured (60 req/hr limit)'}")
    print(f"    Env file:     {diag.get('env_file_path') or 'not found'}")
    print(f"    Ollama:       {'[OK] running' if ollama_stat['running'] else '[--] not running (rule-based fallback active)'}")
    print(f"    Ollama model: {'[OK] ' + ollama_stat['target_model'] + ' available' if ollama_stat['model_installed'] else '[--] ' + ollama_stat['target_model'] + ' not pulled'}")
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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint confirming service identity, version, and supported endpoints."""
    return {
        "app": "RepoReady",
        "version": "0.1.0",
        "status": "running",
        "description": "Evidence-based onboarding guide generator for public GitHub repositories",
        "endpoints": {
            "root": "GET /",
            "health": "GET /health",
            "api_health": "GET /api/health",
            "ai_test": "POST /api/ai-test",
            "analyze_repo": "POST /api/analyze-repo",
            "analyze_alias": "POST /api/analyze",
            "onboard_legacy": "GET /api/onboard/{owner}/{repo}",
        },
    }


@app.get("/health")
@app.get("/api/health")
async def health():
    """Health check endpoint reporting safe diagnostics without exposing secrets."""
    load_project_env()
    diag = get_token_diagnostics()
    ollama_stat = await check_ollama_health()
    return {
        "status": "ok",
        "app": "RepoReady",
        "version": "0.1.0",
        "github_token_set": diag["github_token_configured"],
        "diagnostics": diag,
        "ollama_available": ollama_stat["running"] and ollama_stat["model_installed"],
        "ollama_running": ollama_stat["running"],
        "target_ai_model": ollama_stat["target_model"],
        "ollama_model_installed": ollama_stat["model_installed"],
        "installed_ai_models": ollama_stat["installed_models"],
    }


@app.post("/api/ai-test", response_model=AiTestResponse)
async def ai_test(req: AiTestRequest | None = None):
    """Test local Ollama AI model inference (target model: qwen3:4b) safely."""
    prompt = req.prompt if req else "Explain what an open source contributor does in 2 sentences."
    model = req.model if req else None
    result = await test_ai_inference(prompt=prompt, model=model)
    return AiTestResponse(
        status=result.get("status", "error"),
        target_model=result.get("target_model", get_ollama_model()),
        model_used=result.get("model_used"),
        available=result.get("available", False),
        model_installed=result.get("model_installed", False),
        response=result.get("response"),
        error=result.get("error"),
    )


async def _analyze_repository(owner: str, repo: str) -> AnalysisResponse:
    """Internal helper to fetch, synthesize, and assemble the analysis response."""
    try:
        data = await fetch_all(owner, repo)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="GitHub authentication failed (401 Bad Credentials). Please verify GITHUB_TOKEN in .env.",
            )
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Repository {owner}/{repo} not found or is private. Only public GitHub repositories are supported.",
            )
        if e.response.status_code in (403, 429):
            raise HTTPException(
                status_code=429,
                detail="GitHub API rate limit exceeded. Set GITHUB_TOKEN in .env for 5,000 requests/hour.",
            )
        raise HTTPException(status_code=502, detail=f"GitHub API upstream error: {e.response.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to GitHub API timed out.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach GitHub API: {str(e)}")

    meta = data["meta"]
    languages = data["languages"]
    file_tree = data["file_tree"]
    readme_raw = data["readme_raw"]
    config_files = data.get("config_files", {})
    contributing_raw = data.get("contributing_raw")
    contributing_path = data.get("contributing_path") or "CONTRIBUTING.md"
    issues = data.get("beginner_issues", [])

    # 1. Deterministic evidence-based guide with all 12 sections
    base_guide = generate_onboarding_guide(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw=readme_raw,
        config_files=config_files,
        contributing_raw=contributing_raw,
        issues=issues,
    )

    # 2. Local Qwen3 AI guide generation with honest fallback
    file_paths = [f.path for f in file_tree]
    final_guide, ai_status = await generate_ai_guide(
        repo_name=meta.full_name,
        description=meta.description,
        readme_snippet=readme_raw,
        tech_stack=base_guide.tech_stack,
        file_tree_paths=file_paths,
        config_files=config_files,
        contributing_raw=contributing_raw,
        issues=issues,
        base_guide=base_guide,
    )

    # Assemble evidence sources
    sources = [
        f"GitHub REST API: https://api.github.com/repos/{owner}/{repo}",
        f"GitHub Languages API: https://api.github.com/repos/{owner}/{repo}/languages",
        f"GitHub Git Trees API: https://api.github.com/repos/{owner}/{repo}/git/trees/{meta.default_branch}?recursive=1",
        f"GitHub Issues API: https://api.github.com/repos/{owner}/{repo}/issues",
    ]
    if readme_raw:
        sources.append(f"Repository README: https://github.com/{owner}/{repo}#readme")
    if contributing_raw:
        sources.append(f"Repository Contributing Guidelines: https://github.com/{owner}/{repo}/blob/{meta.default_branch}/{contributing_path}")
    if config_files:
        for cfg in config_files:
            sources.append(f"Repository Manifest: https://github.com/{owner}/{repo}/blob/{meta.default_branch}/{cfg}")
    if data.get("contributors"):
        sources.append(f"GitHub Contributors API: https://api.github.com/repos/{owner}/{repo}/contributors")

    # Assemble evidence warnings
    warnings: list[str] = []
    if not is_token_configured():
        warnings.append("GitHub token not configured in .env. Unauthenticated requests are limited to 60 requests/hour.")
    if meta.is_empty or len(file_tree) == 0:
        warnings.append("Repository appears genuinely empty on GitHub (0 files or uninitialized default branch).")
    elif not readme_raw:
        warnings.append("No README found. Setup steps are derived from detected project configuration files.")
    if meta.license is None:
        warnings.append("No open-source license detected in repository metadata.")
    if not issues:
        warnings.append("No open issues found or no beginner-friendly labels detected.")
    if ai_status.get("fallback_used"):
        warnings.append(f"AI Guide Synthesis: {ai_status.get('reason', 'Using rule-based evidence engine')}.")

    now_iso = datetime.now(timezone.utc).isoformat()

    return AnalysisResponse(
        repository=meta,
        overview=final_guide.summary,
        tech_stack=final_guide.tech_stack,
        setup_steps=final_guide.setup_steps,
        key_files=final_guide.key_files,
        contribution_tips=final_guide.contribution_tips,
        recommended_issues=issues,
        sources=sources,
        warnings=warnings,
        errors=[],
        generated_at=now_iso,
        languages=languages,
        contributors=data["contributors"],
        file_tree=file_tree,
        selected_files=config_files,
        has_readme=bool(readme_raw),
        has_contributing=bool(contributing_raw),
        readme_html=data["readme_html"],
        readme_content=readme_raw,
        contributing_content=contributing_raw,
        rate_limit_remaining=data["rate_limit_remaining"],
        guide=final_guide,
        sections=final_guide.sections,
        full_guide_markdown=final_guide.full_guide_markdown,
        ai_status=ai_status,
    )



@app.post("/api/analyze-repo", response_model=AnalysisResponse)
@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    """Analyze a public GitHub repository URL and return an evidence-based onboarding guide.

    Accepts both /api/analyze-repo and /api/analyze for compatibility.
    """
    url_to_use = req.get_url()
    if not url_to_use:
        raise HTTPException(status_code=400, detail="Repository URL cannot be empty.")
    owner, repo = validate_and_parse_github_url(url_to_use)
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
