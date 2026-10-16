"""Pydantic models for RepoReady API requests and responses."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Request payload for repository analysis supporting both repository_url and repo_url aliases."""

    repository_url: str | None = Field(
        None,
        description="Public HTTPS GitHub repository URL",
        examples=["https://github.com/fastapi/fastapi"],
    )
    repo_url: str | None = Field(
        None,
        description="Alias for repository_url",
    )
    url: str | None = Field(
        None,
        description="Alias for repository_url",
    )

    def get_url(self) -> str:
        """Resolve the effective repository URL from provided fields."""
        for candidate in (self.repository_url, self.repo_url, self.url):
            if candidate and candidate.strip():
                return candidate.strip()
        return ""


class RepoMeta(BaseModel):
    """Core repository metadata returned by GitHub."""

    owner: str
    name: str
    full_name: str
    description: str | None = None
    html_url: str
    stars: int
    forks: int
    open_issues: int
    default_branch: str
    language: str | None = None
    topics: list[str] = []
    created_at: str
    updated_at: str
    pushed_at: str | None = None
    license: str | None = None
    has_wiki: bool = False
    is_empty: bool = False
    size_kb: int = 0


class LanguageBreakdown(BaseModel):
    """Language usage in bytes and percentages."""

    languages: dict[str, int]  # language -> bytes
    percentages: dict[str, float]  # language -> percent


class Issue(BaseModel):
    """A real GitHub issue (excluding PRs) with metadata and preview."""

    number: int
    title: str
    html_url: str
    url: str | None = None
    labels: list[str] = []
    created_at: str
    updated_at: str | None = None
    comments: int = 0
    body: str | None = None
    body_preview: str | None = None  # first ~200 chars


class Contributor(BaseModel):
    """A recent contributor."""

    login: str
    avatar_url: str
    html_url: str
    contributions: int


class FileTreeEntry(BaseModel):
    """A file or directory entry in the repository tree."""

    path: str
    type: str  # "blob" or "tree"
    size: int | None = None


class OnboardingGuide(BaseModel):
    """The generated onboarding guide content with all 12 evidence-based sections."""

    summary: str
    tech_stack: list[str]
    setup_steps: list[str]
    contribution_tips: list[str]
    key_files: list[str]
    ai_enhanced: bool = False
    ai_model: str | None = None
    prerequisites: list[str] = []
    run_commands: list[str] = []
    test_commands: list[str] = []
    suggested_first_contribution: str | None = None
    common_problems: list[str] = []
    unavailable_info: list[str] = []
    sections: dict[str, str] = {}
    full_guide_markdown: str | None = None
    ai_status: dict[str, Any] = {}


class AnalysisResponse(BaseModel):
    """Stable response schema for RepoReady POST /api/analyze and POST /api/analyze-repo."""

    repository: RepoMeta
    overview: str
    tech_stack: list[str]
    setup_steps: list[str]
    key_files: list[str]
    contribution_tips: list[str]
    recommended_issues: list[Issue]
    sources: list[str]
    warnings: list[str]
    errors: list[str] = []
    generated_at: str

    # Extended metadata and evidence for UI rendering
    languages: LanguageBreakdown | None = None
    contributors: list[Contributor] = []
    file_tree: list[FileTreeEntry] = []
    selected_files: dict[str, str] = {}
    has_readme: bool = False
    has_contributing: bool = False
    readme_html: str | None = None
    readme_content: str | None = None
    contributing_content: str | None = None
    rate_limit_remaining: int | None = None

    # Prompt 5: Rich 12-section guide and honest AI status
    guide: OnboardingGuide | None = None
    sections: dict[str, str] = {}
    full_guide_markdown: str | None = None
    ai_status: dict[str, Any] = {}


class OnboardResponse(BaseModel):
    """Legacy response schema for /api/onboard/{owner}/{repo} compatibility."""

    repo: RepoMeta
    languages: LanguageBreakdown
    beginner_issues: list[Issue]
    contributors: list[Contributor]
    file_tree: list[FileTreeEntry]
    guide: OnboardingGuide
    readme_html: str | None = None
    rate_limit_remaining: int | None = None


class AiTestRequest(BaseModel):
    """Payload for POST /api/ai-test."""

    prompt: str = "Explain what an open source contributor does in 2 sentences."
    model: str | None = None


class AiTestResponse(BaseModel):
    """Response payload for POST /api/ai-test."""

    status: str
    target_model: str
    model_used: str | None = None
    available: bool
    model_installed: bool = False
    response: str | None = None
    error: str | None = None

