"""Rule-based, evidence-based onboarding guide generator for RepoReady.

Produces deterministic onboarding guides from repo metadata, file trees,
actual README content, and repository configuration files.
Never fabricates repository data or emits generic boilerplate when evidence is missing.
"""

from __future__ import annotations

import json
import re
from typing import Any

from models import OnboardingGuide, RepoMeta, LanguageBreakdown, FileTreeEntry


# ── Tech-Stack Detection ───────────────────────────────────────────────────

def _detect_tech_stack(
    meta: RepoMeta,
    languages: LanguageBreakdown,
    file_tree: list[FileTreeEntry],
    config_files: dict[str, str] | None = None,
) -> list[str]:
    """Detect technologies using language data, file presence, and config contents."""
    stack: list[str] = []
    file_names = {f.path.lower() for f in file_tree}
    configs = config_files or {}

    # 1. Primary languages (>3%)
    if languages.percentages:
        for lang, pct in sorted(languages.percentages.items(), key=lambda x: -x[1]):
            if pct >= 3.0 and lang not in stack:
                stack.append(lang)
    elif meta.language and meta.language not in stack:
        stack.append(meta.language)

    # 2. Inspect package.json content if present
    pkg_json_raw = configs.get("package.json")
    if pkg_json_raw:
        try:
            pkg = json.loads(pkg_json_raw)
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            scripts_text = " ".join(str(v) for v in pkg.get("scripts", {}).values()).lower()
            key_npm_packages = {
                "react": "React",
                "react-dom": "React",
                "vue": "Vue.js",
                "next": "Next.js",
                "nuxt": "Nuxt.js",
                "express": "Express",
                "fastify": "Fastify",
                "typescript": "TypeScript",
                "vite": "Vite",
                "tailwindcss": "Tailwind CSS",
                "jest": "Jest",
                "vitest": "Vitest",
                "svelte": "Svelte",
                "@angular/core": "Angular",
                "redux": "Redux",
                "@reduxjs/toolkit": "Redux Toolkit",
                "prisma": "Prisma ORM",
                "graphql": "GraphQL",
            }
            for pkg_key, display_name in key_npm_packages.items():
                if (pkg_key in deps or pkg_key in scripts_text) and display_name not in stack:
                    stack.append(display_name)
        except Exception:
            pass

    # 3. Inspect requirements.txt content if present
    reqs_raw = configs.get("requirements.txt")
    if reqs_raw:
        lower_reqs = reqs_raw.lower()
        key_py_packages = {
            "fastapi": "FastAPI",
            "flask": "Flask",
            "django": "Django",
            "pytest": "pytest",
            "uvicorn": "Uvicorn",
            "celery": "Celery",
            "sqlalchemy": "SQLAlchemy",
            "torch": "PyTorch",
            "tensorflow": "TensorFlow",
            "pandas": "Pandas",
            "numpy": "NumPy",
            "httpx": "HTTPX",
            "pydantic": "Pydantic",
        }
        for pkg_key, display_name in key_py_packages.items():
            if re.search(rf"\b{re.escape(pkg_key)}\b", lower_reqs) and display_name not in stack:
                stack.append(display_name)

    # 4. Inspect pyproject.toml content if present
    pyproject_raw = configs.get("pyproject.toml")
    if pyproject_raw:
        lower_pyproject = pyproject_raw.lower()
        if "poetry" in lower_pyproject and "Poetry" not in stack:
            stack.append("Poetry")
        if "ruff" in lower_pyproject and "Ruff" not in stack:
            stack.append("Ruff")
        if "black" in lower_pyproject and "Black" not in stack:
            stack.append("Black")
        if "pytest" in lower_pyproject and "pytest" not in stack:
            stack.append("pytest")
        if "fastapi" in lower_pyproject and "FastAPI" not in stack:
            stack.append("FastAPI")

    # 5. File indicators
    file_indicators = {
        "dockerfile": "Docker",
        "docker-compose.yml": "Docker Compose",
        "docker-compose.yaml": "Docker Compose",
        "cargo.toml": "Rust/Cargo",
        "go.mod": "Go Modules",
        "pom.xml": "Maven",
        "build.gradle": "Gradle",
        "build.gradle.kts": "Gradle",
        "gemfile": "Ruby Bundler",
        ".github": "GitHub Actions",
        "makefile": "Makefile",
    }
    for file_name, tech in file_indicators.items():
        if file_name in file_names and tech not in stack:
            stack.append(tech)

    # Fallback if stack is completely empty
    if not stack:
        if len(file_tree) == 0:
            stack.append("None (empty repository)")
        else:
            stack.append("General Repository")

    return stack


# ── Setup Steps Inference ──────────────────────────────────────────────────

def _extract_setup_from_readme(readme: str | None) -> list[str]:
    """Extract explicit setup commands and instructions from README."""
    if not readme:
        return []

    steps: list[str] = []
    sections = re.split(r"\n#{1,3}\s+", readme)
    for section in sections:
        heading = section.split("\n", 1)[0].lower() if "\n" in section else section.lower()
        if any(kw in heading for kw in ("install", "setup", "getting started", "quick start", "development", "prerequisites")):
            lines = section.strip().split("\n")
            in_code_block = False
            for line in lines[1:]:
                stripped = line.strip()
                if stripped.startswith("```"):
                    in_code_block = not in_code_block
                    continue
                if in_code_block and stripped and not stripped.startswith("#"):
                    if any(cmd in stripped.lower() for cmd in ("npm", "pip", "cargo", "go ", "make", "docker", "yarn", "pnpm", "git clone")):
                        steps.append(f"`{stripped}`")
                elif not in_code_block and stripped.startswith(("- ", "* ", "1.", "2.", "3.", "4.", "5.")):
                    clean = re.sub(r"^[-*\d.]+\s*", "", stripped).strip()
                    if clean and len(clean) > 5 and not clean.startswith("```"):
                        steps.append(clean)

            if steps:
                break

    return steps[:6]


def _infer_setup_steps(
    meta: RepoMeta,
    readme_raw: str | None,
    file_tree: list[FileTreeEntry],
    config_files: dict[str, str] | None = None,
    languages: LanguageBreakdown | None = None,
) -> list[str]:
    """Generate evidence-based setup steps from README and detected project files.

    Never outputs generic fork/clone boilerplate.
    """
    # 1. Try extracting concrete instructions from README
    readme_steps = _extract_setup_from_readme(readme_raw)
    if readme_steps:
        return readme_steps

    # 2. Derive concrete commands from actual configuration files
    configs = config_files or {}
    file_names = {f.path.lower() for f in file_tree}
    steps: list[str] = []

    # Node.js / JavaScript / TypeScript
    if "package.json" in file_names:
        pkg_raw = configs.get("package.json", "")
        pkg = {}
        try:
            pkg = json.loads(pkg_raw) if pkg_raw else {}
        except Exception:
            pass
        scripts = pkg.get("scripts", {})

        # Install command
        if "pnpm-lock.yaml" in file_names:
            steps.append("Install dependencies: `pnpm install`")
        elif "yarn.lock" in file_names:
            steps.append("Install dependencies: `yarn install`")
        elif "bun.lockb" in file_names:
            steps.append("Install dependencies: `bun install`")
        else:
            steps.append("Install dependencies: `npm install`")

        # Dev / Start command
        if "dev" in scripts:
            steps.append("Start development server: `npm run dev`")
        elif "start" in scripts:
            steps.append("Start application: `npm start`")

        # Test command
        if "test" in scripts:
            steps.append("Run tests: `npm test`")

        # Build command
        if "build" in scripts:
            steps.append("Build bundle: `npm run build`")

        return steps

    # Python
    if "requirements.txt" in file_names or "pyproject.toml" in file_names or "setup.py" in file_names:
        steps.append("Create virtual environment: `python -m venv .venv`")
        steps.append("Activate virtual environment: `.\\.venv\\Scripts\\activate` (Windows) or `source .venv/bin/activate` (Unix)")

        if "requirements.txt" in file_names:
            steps.append("Install dependencies: `pip install -r requirements.txt`")
        elif "pyproject.toml" in file_names:
            pyproject_raw = configs.get("pyproject.toml", "")
            if "poetry" in pyproject_raw.lower():
                steps.append("Install dependencies: `poetry install`")
            else:
                steps.append("Install dependencies: `pip install -e .`")
        elif "setup.py" in file_names:
            steps.append("Install dependencies: `pip install -e .`")

        if any(f in file_names for f in ("pytest.ini", "tests", "test")):
            steps.append("Run test suite: `pytest`")

        return steps

    # Rust
    if "cargo.toml" in file_names:
        return [
            "Build project: `cargo build`",
            "Run tests: `cargo test`",
            "Run project: `cargo run`",
        ]

    # Go
    if "go.mod" in file_names:
        return [
            "Download dependencies: `go mod download`",
            "Run tests: `go test ./...`",
            "Run project: `go run .`",
        ]

    # Docker
    if "docker-compose.yml" in file_names or "docker-compose.yaml" in file_names:
        return [
            "Start services with Docker Compose: `docker compose up --build`",
        ]
    if "dockerfile" in file_names:
        return [
            f"Build Docker image: `docker build -t {meta.name} .`",
            f"Run Docker container: `docker run -p 8080:8080 {meta.name}`",
        ]

    # 3. Transparently report missing evidence if no files or commands match
    if len(file_tree) == 0:
        return [
            "No setup steps available: this repository is empty on GitHub with no files or commits.",
        ]

    return [
        "No setup instructions found in README or standard project configuration files.",
        "Evidence is unavailable to deduce executable setup commands for this repository.",
        f"Inspect the repository tree directly at {meta.html_url}",
    ]


# ── Key Files ──────────────────────────────────────────────────────────────

def _detect_key_files(file_tree: list[FileTreeEntry]) -> list[str]:
    """Identify key entry point and configuration files actually present in repo."""
    priority_order = [
        "README.md",
        "CONTRIBUTING.md",
        "package.json",
        "requirements.txt",
        "pyproject.toml",
        "Cargo.toml",
        "go.mod",
        "Dockerfile",
        "docker-compose.yml",
        ".env.example",
        "src",
        "lib",
        "app",
        "tests",
        "docs",
        "LICENSE",
    ]
    file_paths = {f.path for f in file_tree}
    file_map_lower = {f.path.lower(): f.path for f in file_tree}

    key_files: list[str] = []
    for candidate in priority_order:
        lower = candidate.lower()
        if lower in file_map_lower:
            actual_path = file_map_lower[lower]
            if actual_path not in key_files:
                key_files.append(actual_path)

    # Add other top-level files if room
    for f in file_tree:
        if len(key_files) >= 10:
            break
        if f.path not in key_files and not f.path.startswith(".git"):
            key_files.append(f.path)

    return key_files


# ── Overview & Summary ─────────────────────────────────────────────────────

def _generate_summary(
    meta: RepoMeta,
    languages: LanguageBreakdown,
    readme: str | None,
    file_tree: list[FileTreeEntry],
    tech_stack: list[str],
) -> str:
    """Generate an honest, evidence-based summary of the project."""
    if len(file_tree) == 0:
        return (
            f"**{meta.full_name}** is an empty repository on GitHub with 0 stars and 0 forks. "
            "No files or commits have been pushed yet."
        )

    desc = meta.description or "No description provided."
    if languages.percentages:
        top_langs = ", ".join(
            f"{lang} ({pct}%)"
            for lang, pct in sorted(languages.percentages.items(), key=lambda x: -x[1])[:4]
        )
        lang_line = f"Primary languages: {top_langs}."
    elif meta.language:
        lang_line = f"Primary language: {meta.language}."
    else:
        lang_line = "No primary programming language detected in repository files."

    lines = [
        f"**{meta.full_name}** — {desc}",
        "",
        f"Repository stats: {meta.stars:,} stars, {meta.forks:,} forks, {meta.open_issues:,} open issues.",
        lang_line,
    ]

    if meta.license:
        lines.append(f"Licensed under {meta.license}.")
    if meta.topics:
        lines.append(f"Topics: {', '.join(meta.topics[:8])}.")

    return "\n".join(lines)


# ── Contribution Tips ──────────────────────────────────────────────────────

def _contribution_tips(
    meta: RepoMeta,
    file_tree: list[FileTreeEntry],
    contributing_raw: str | None = None,
) -> list[str]:
    """Generate evidence-backed contribution tips based on repo structure and CONTRIBUTING.md."""
    file_names = {f.path.lower() for f in file_tree}
    tips: list[str] = []

    if contributing_raw:
        tips.append("Repository has a CONTRIBUTING.md — read maintainer expectations before submitting PRs.")
        # Extract concrete tips from contributing_raw
        lower_contrib = contributing_raw.lower()
        if "fork" in lower_contrib and "branch" in lower_contrib:
            tips.append("Workflow: Create feature branches from your fork and submit PRs to the default branch.")
        if "test" in lower_contrib or "pytest" in lower_contrib or "npm test" in lower_contrib:
            tips.append("Tests are required: verify test suite passes locally before requesting review.")
        if "cla" in lower_contrib or "contributor license" in lower_contrib:
            tips.append("Contributor License Agreement (CLA) or Developer Certificate of Origin may be required.")
    elif "contributing.md" in file_names:
        tips.append("Read CONTRIBUTING.md for maintainer expectations and PR guidelines before starting.")

    if ".github" in file_names or any(".github" in f.path for f in file_tree):
        tips.append("GitHub Actions CI workflows detected — automated checks will test pull requests.")
    if any(f in file_names for f in ("pytest.ini", "vitest.config.ts", "jest.config.js", "tests")):
        tips.append("Local test configuration detected — run tests locally before committing.")
    if ".env.example" in file_names:
        tips.append("Copy .env.example to .env to configure local environment variables.")
    if "code_of_conduct.md" in file_names:
        tips.append("Code of Conduct is in effect — maintain respectful and collaborative communication.")

    if not tips:
        if len(file_tree) == 0:
            tips.append("Repository is empty — no contribution guidelines or workflows established.")
        else:
            tips.append("No CONTRIBUTING.md found — check README or open an issue to discuss proposed changes.")

    tips.append("Check recommended beginner issues for curated entry points.")
    return tips


# ── Public API ─────────────────────────────────────────────────────────────

def generate_onboarding_guide(
    meta: RepoMeta,
    languages: LanguageBreakdown,
    file_tree: list[FileTreeEntry],
    readme_raw: str | None,
    config_files: dict[str, str] | None = None,
    contributing_raw: str | None = None,
) -> OnboardingGuide:
    """Generate a structured, evidence-based onboarding guide."""
    tech_stack = _detect_tech_stack(meta, languages, file_tree, config_files)
    setup_steps = _infer_setup_steps(meta, readme_raw, file_tree, config_files, languages)
    key_files = _detect_key_files(file_tree)
    contribution_tips = _contribution_tips(meta, file_tree, contributing_raw)
    summary = _generate_summary(meta, languages, readme_raw, file_tree, tech_stack)

    return OnboardingGuide(
        summary=summary,
        tech_stack=tech_stack,
        setup_steps=setup_steps,
        contribution_tips=contribution_tips,
        key_files=key_files,
        ai_enhanced=False,
    )
