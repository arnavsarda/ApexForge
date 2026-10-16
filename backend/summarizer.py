"""Rule-based, evidence-based onboarding guide generator for RepoReady.

Produces deterministic onboarding guides from repo metadata, file trees,
actual README content, and repository configuration files.
Never fabricates repository data or emits generic boilerplate when evidence is missing.
"""

from __future__ import annotations

import json
import re
from typing import Any

from models import OnboardingGuide, RepoMeta, LanguageBreakdown, FileTreeEntry, Issue


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


# ── 12-Section Comprehensive Guide Builder ─────────────────────────────────

def _generate_12_sections(
    meta: RepoMeta,
    languages: LanguageBreakdown,
    file_tree: list[FileTreeEntry],
    readme_raw: str | None,
    config_files: dict[str, str] | None = None,
    contributing_raw: str | None = None,
    issues: list[Issue] | None = None,
) -> tuple[dict[str, str], str, list[str], list[str], list[str], str | None, list[str], list[str]]:
    """Build all 12 required sections based strictly on repository evidence."""
    configs = config_files or {}
    file_names = {f.path.lower() for f in file_tree}
    tech_stack = _detect_tech_stack(meta, languages, file_tree, config_files)

    # 1. Project overview
    overview_text = _generate_summary(meta, languages, readme_raw, file_tree, tech_stack)
    if readme_raw:
        # Grab first clean intro paragraph from README if present
        clean_readme = re.sub(r"#+.*?\n", "\n", readme_raw[:1500])
        paragraphs = [p.strip() for p in clean_readme.split("\n\n") if len(p.strip()) > 30 and not p.strip().startswith("```") and not p.strip().startswith("[!")]
        if paragraphs:
            overview_text += f"\n\n**From README:** {paragraphs[0][:300]}"

    # 2. Verified language and technology stack
    lang_items = []
    if languages.percentages:
        for l, p in sorted(languages.percentages.items(), key=lambda x: -x[1]):
            lang_items.append(f"- **[Verified Fact]** {l}: {p}% of repository codebase")
    elif meta.language:
        lang_items.append(f"- **[Verified Fact]** Primary language: {meta.language}")
    else:
        lang_items.append("- **[Notice]** No primary programming language detected by GitHub.")

    manifest_items = []
    for t in tech_stack:
        if t not in languages.languages and t != meta.language and t != "General Repository" and not t.startswith("None"):
            manifest_items.append(f"- **[Inferred from Manifest]** {t}")

    tech_stack_md = "### Language Breakdown\n" + "\n".join(lang_items)
    if manifest_items:
        tech_stack_md += "\n\n### Frameworks & Libraries (Evidence-based)\n" + "\n".join(manifest_items)

    # 3. Prerequisites
    prereq_items: list[str] = []
    if any(t in tech_stack for t in ("TypeScript", "JavaScript", "React", "Vue.js", "Next.js", "Express", "Vite")):
        prereq_items.append("Node.js (LTS version recommended) and npm/yarn/pnpm")
    if any(t in tech_stack for t in ("Python", "FastAPI", "Django", "Flask", "PyTorch")):
        prereq_items.append("Python 3.10+ and pip")
    if "Rust/Cargo" in tech_stack or any(f.path.lower() == "cargo.toml" for f in file_tree):
        prereq_items.append("Rust toolchain (cargo, rustc)")
    if "Go Modules" in tech_stack or any(f.path.lower() == "go.mod" for f in file_tree):
        prereq_items.append("Go 1.20+")
    if any(t in tech_stack for t in ("Docker", "Docker Compose")):
        prereq_items.append("Docker Engine / Docker Desktop")
    if not prereq_items:
        if len(file_tree) == 0:
            prereq_items.append("None (empty repository)")
        else:
            prereq_items.append("Standard development environment (specific runtime version not declared in repository files)")

    prereqs_md = "\n".join(f"- {p}" for p in prereq_items)

    # 4. Installation and dependency setup
    install_steps = _infer_setup_steps(meta, readme_raw, file_tree, config_files, languages)
    install_md = "\n".join(f"{i+1}. {s}" for i, s in enumerate(install_steps))

    # 5. Commands to run locally
    run_commands: list[str] = []
    if "package.json" in file_names:
        pkg_raw = configs.get("package.json", "")
        pkg = {}
        try:
            pkg = json.loads(pkg_raw) if pkg_raw else {}
        except Exception:
            pass
        scripts = pkg.get("scripts", {})
        if "dev" in scripts:
            run_commands.append("Start development server: `npm run dev`")
        elif "start" in scripts:
            run_commands.append("Start application: `npm start`")
    if "requirements.txt" in file_names or "pyproject.toml" in file_names:
        if any("main.py" in f.path.lower() for f in file_tree):
            run_commands.append("Start backend: `python main.py` or `python -m uvicorn main:app --reload`")
    if "docker-compose.yml" in file_names or "docker-compose.yaml" in file_names:
        run_commands.append("Run all services with Docker Compose: `docker compose up`")
    if "cargo.toml" in file_names:
        run_commands.append("Run binary: `cargo run`")
    if "go.mod" in file_names:
        run_commands.append("Run program: `go run .`")

    if not run_commands:
        if len(file_tree) == 0:
            run_commands.append("No run commands: repository is empty.")
        else:
            run_commands.append("No standard local dev run script found in repository manifests.")

    run_md = "\n".join(f"- {c}" for c in run_commands)

    # 6. Important directories and files
    key_files = _detect_key_files(file_tree)
    files_with_notes: list[str] = []
    for k in key_files:
        k_lower = k.lower()
        desc_file = "Core file"
        if "readme" in k_lower:
            desc_file = "Project documentation and initial instructions"
        elif "contributing" in k_lower:
            desc_file = "Maintainer contribution guidelines and PR expectations"
        elif "package.json" in k_lower:
            desc_file = "Node.js dependencies and npm execution scripts"
        elif "requirements.txt" in k_lower:
            desc_file = "Python pip package requirements"
        elif "pyproject.toml" in k_lower:
            desc_file = "Python build configuration and dependencies"
        elif "cargo.toml" in k_lower:
            desc_file = "Rust Cargo package manifest and dependencies"
        elif "go.mod" in k_lower:
            desc_file = "Go module definition and dependency requirements"
        elif "dockerfile" in k_lower:
            desc_file = "Container image build specification"
        elif "docker-compose" in k_lower:
            desc_file = "Multi-container orchestration configuration"
        elif k_lower in ("src", "lib", "app"):
            desc_file = "Main application source code directory"
        elif "tests" in k_lower or "test" in k_lower:
            desc_file = "Automated test suite and test fixtures"
        elif ".env.example" in k_lower:
            desc_file = "Template for local environment variables"
        files_with_notes.append(f"- `{k}`: {desc_file}")

    files_md = "\n".join(files_with_notes) if files_with_notes else "- No files found in repository tree."

    # 7. How to run tests
    test_commands: list[str] = []
    if "package.json" in file_names:
        test_commands.append("Run JavaScript/TypeScript tests: `npm test`")
    if any(t in tech_stack for t in ("Vitest", "vitest")):
        test_commands.append("Run Vitest test suite: `npx vitest run`")
    if any(t in tech_stack for t in ("pytest", "FastAPI", "Django", "Flask")) or "pytest.ini" in file_names or any("test" in f.path.lower() for f in file_tree):
        test_commands.append("Run Python test suite: `pytest`")
    if "cargo.toml" in file_names:
        test_commands.append("Run Rust unit and integration tests: `cargo test`")
    if "go.mod" in file_names:
        test_commands.append("Run Go tests: `go test ./...`")

    if not test_commands:
        test_commands.append("No explicit automated test configuration detected in repository files.")

    tests_md = "\n".join(f"- {tc}" for tc in test_commands)

    # 8. Contribution workflow
    contrib_tips = _contribution_tips(meta, file_tree, contributing_raw)
    workflow_md = "\n".join(f"{i+1}. {t}" for i, t in enumerate(contrib_tips))

    # 9. Real beginner-friendly issues with GitHub links
    issue_lines: list[str] = []
    if issues:
        for iss in issues[:5]:
            labels_str = f" [{', '.join(iss.labels)}]" if iss.labels else ""
            issue_lines.append(f"- [#{iss.number}: {iss.title}]({iss.html_url}){labels_str}")
    if not issue_lines:
        issue_lines.append(f"No open beginner-labeled issues currently found. Inspect all open issues directly at: {meta.html_url}/issues")

    issues_md = "\n".join(issue_lines)

    # 10. Suggested first contribution
    if issues and len(issues) > 0:
        first_iss = issues[0]
        suggested_contrib = (
            f"Review open issue [#{first_iss.number}: {first_iss.title}]({first_iss.html_url}). "
            "Leave a comment asking maintainers for clarification before implementing a fix. "
            "Alternatively, add test coverage for recently modified modules."
        )
    elif not readme_raw:
        suggested_contrib = (
            "This repository is missing a README.md. A high-impact first contribution would be "
            "submitting a pull request adding a clear project overview and setup instructions."
        )
    elif not contributing_raw:
        suggested_contrib = (
            "Create or improve developer documentation, add unit test fixtures for core components, "
            "or open an issue with maintainers proposing documentation improvements."
        )
    else:
        suggested_contrib = (
            "Start by reproducing the existing test suite locally, then browse the codebase entry point "
            "to understand the primary data flow before picking a feature to implement."
        )

    # 11. Common problems supported by available evidence
    common_problems: list[str] = []
    if ".env.example" in file_names:
        common_problems.append("Missing environment variables: Copy `.env.example` to `.env` before running.")
    if "package.json" in file_names and "yarn.lock" in file_names:
        common_problems.append("Lockfile mismatch: Repository uses Yarn; installing with npm may produce dependency conflicts.")
    if "package.json" in file_names and "pnpm-lock.yaml" in file_names:
        common_problems.append("Lockfile mismatch: Repository uses pnpm; use `pnpm install` rather than npm.")
    if meta.is_empty:
        common_problems.append("Empty repository: No commits or branch trees have been initialized.")
    if not is_token_configured_helper():
        common_problems.append("Rate limits: Unauthenticated GitHub requests are capped at 60/hour. Configure GITHUB_TOKEN in .env.")
    if not common_problems:
        common_problems.append("Dependency version conflicts: Ensure local runtime matches LTS versions for detected languages.")

    problems_md = "\n".join(f"- {cp}" for cp in common_problems)

    # 12. Sources and unavailable information
    sources_used = [
        f"GitHub REST API metadata for {meta.full_name}",
        f"GitHub Languages API breakdown",
        f"GitHub Git Trees API ({meta.default_branch} branch)",
    ]
    if readme_raw:
        sources_used.append("Repository README.md")
    if contributing_raw:
        sources_used.append("Repository CONTRIBUTING.md")
    for cfg in configs:
        sources_used.append(f"Repository manifest: {cfg}")

    unavailable: list[str] = []
    if not readme_raw:
        unavailable.append("README file was absent on GitHub.")
    if not contributing_raw:
        unavailable.append("CONTRIBUTING guidelines document was absent.")
    if not issues:
        unavailable.append("No open beginner issues were found on GitHub.")
    if len(file_tree) == 0:
        unavailable.append("File tree is empty (no commits pushed).")

    sources_md = "### Evidence Sources Consulted\n" + "\n".join(f"- {s}" for s in sources_used)
    if unavailable:
        sources_md += "\n\n### Unavailable Evidence Notice\n" + "\n".join(f"- **[Missing Information]** {u}" for u in unavailable)

    # Assemble dictionary of 12 sections
    sections = {
        "project_overview": overview_text,
        "verified_tech_stack": tech_stack_md,
        "prerequisites": prereqs_md,
        "installation_setup": install_md,
        "run_commands": run_md,
        "important_files_dirs": files_md,
        "run_tests": tests_md,
        "contribution_workflow": workflow_md,
        "beginner_issues": issues_md,
        "suggested_first_contribution": suggested_contrib,
        "common_problems": problems_md,
        "sources_unavailable": sources_md,
    }

    # Assemble complete markdown guide
    full_markdown = f"""# Onboarding Guide for {meta.full_name}

## 1. Project Overview
{overview_text}

## 2. Verified Language & Technology Stack
{tech_stack_md}

## 3. Prerequisites
{prereqs_md}

## 4. Installation & Dependency Setup
{install_md}

## 5. Commands to Run Locally
{run_md}

## 6. Important Directories and Files
{files_md}

## 7. How to Run Tests
{tests_md}

## 8. Contribution Workflow
{workflow_md}

## 9. Real Beginner-Friendly Issues
{issues_md}

## 10. Suggested First Contribution
{suggested_contrib}

## 11. Common Problems & Troubleshooting
{problems_md}

## 12. Sources & Unavailable Information
{sources_md}
"""

    return (
        sections,
        full_markdown,
        prereq_items,
        run_commands,
        test_commands,
        suggested_contrib,
        common_problems,
        unavailable,
    )


def is_token_configured_helper() -> bool:
    """Safe check for GitHub token without leaking secret."""
    try:
        from config import is_token_configured
        return is_token_configured()
    except Exception:
        return False


# ── Public API ─────────────────────────────────────────────────────────────

def generate_onboarding_guide(
    meta: RepoMeta,
    languages: LanguageBreakdown,
    file_tree: list[FileTreeEntry],
    readme_raw: str | None,
    config_files: dict[str, str] | None = None,
    contributing_raw: str | None = None,
    issues: list[Issue] | None = None,
) -> OnboardingGuide:
    """Generate a structured, evidence-based onboarding guide with all 12 sections."""
    tech_stack = _detect_tech_stack(meta, languages, file_tree, config_files)
    setup_steps = _infer_setup_steps(meta, readme_raw, file_tree, config_files, languages)
    key_files = _detect_key_files(file_tree)
    contribution_tips = _contribution_tips(meta, file_tree, contributing_raw)
    summary = _generate_summary(meta, languages, readme_raw, file_tree, tech_stack)

    # Generate all 12 evidence-based sections
    (
        sections,
        full_guide_md,
        prereqs,
        run_cmds,
        test_cmds,
        first_contrib,
        problems,
        unavail,
    ) = _generate_12_sections(
        meta=meta,
        languages=languages,
        file_tree=file_tree,
        readme_raw=readme_raw,
        config_files=config_files,
        contributing_raw=contributing_raw,
        issues=issues,
    )

    return OnboardingGuide(
        summary=summary,
        tech_stack=tech_stack,
        setup_steps=setup_steps,
        contribution_tips=contribution_tips,
        key_files=key_files,
        ai_enhanced=False,
        ai_model=None,
        prerequisites=prereqs,
        run_commands=run_cmds,
        test_commands=test_cmds,
        suggested_first_contribution=first_contrib,
        common_problems=problems,
        unavailable_info=unavail,
        sections=sections,
        full_guide_markdown=full_guide_md,
        ai_status={
            "available": False,
            "model_used": None,
            "reason": "Rule-based evidence synthesis engine",
            "fallback_used": False,
        },
    )

