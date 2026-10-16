"""Pydantic models for RepoReady API requests and responses."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Request payload for repository analysis."""

    repository_url: str = Field(
        ...,
        description="Public HTTPS GitHub repository URL",
        examples=["https://github.com/fastapi/fastapi"],
    )


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
    license: str | None = None
    has_wiki: bool = False


class LanguageBreakdown(BaseModel):
    """Language usage in bytes and percentages."""

    languages: dict[str, int]  # language -> bytes
    percentages: dict[str, float]  # language -> percent


class Issue(BaseModel):
    """A GitHub issue suitable for beginners."""

    number: int
    title: str
    html_url: str
    labels: list[str]
    created_at: str
    comments: int
    body_preview: str | None = None  # first ~200 chars


class Contributor(BaseModel):
    """A recent contributor."""

    login: str
    avatar_url: str
    html_url: str
    contributions: int


class FileTreeEntry(BaseModel):
    """A top-level file or directory in the repo."""

    path: str
    type: str  # "blob" or "tree"
    size: int | None = None


class OnboardingGuide(BaseModel):
    """The generated onboarding guide content."""

    summary: str
    tech_stack: list[str]
    setup_steps: list[str]
    contribution_tips: list[str]
    key_files: list[str]
    ai_enhanced: bool = False


class AnalysisResponse(BaseModel):
    """Stable response schema for RepoReady POST /api/analyze."""

    repository: RepoMeta
    overview: str
    tech_stack: list[str]
    setup_steps: list[str]
    key_files: list[str]
    contribution_tips: list[str]
    recommended_issues: list[Issue]
    sources: list[str]
    warnings: list[str]
    generated_at: str

    # Extended metadata for UI rendering
    languages: LanguageBreakdown | None = None
    contributors: list[Contributor] = []
    file_tree: list[FileTreeEntry] = []
    readme_html: str | None = None
    rate_limit_remaining: int | None = None


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
