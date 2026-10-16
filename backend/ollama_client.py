"""Optional Ollama LLM integration for AI-enhanced onboarding guides."""

from __future__ import annotations

import httpx

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "phi3:mini"
TIMEOUT = 15.0


async def get_available_model() -> str | None:
    """Return the name of an installed Ollama model, or None if none installed."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                models = r.json().get("models", [])
                if not models:
                    return None
                # Prefer DEFAULT_MODEL if installed, else use the first available model
                for m in models:
                    name = m.get("name", "")
                    if DEFAULT_MODEL in name:
                        return name
                return models[0].get("name")
    except Exception:
        pass
    return None


async def is_available() -> bool:
    """Check if Ollama is running and has at least one model pulled."""
    model = await get_available_model()
    return model is not None


async def enhance_guide(
    repo_name: str,
    description: str | None,
    readme_snippet: str | None,
    tech_stack: list[str],
    existing_summary: str,
) -> str | None:
    """Use Ollama to generate an AI-enhanced onboarding summary.

    Returns the enhanced summary or None if Ollama is unavailable.
    """
    model = await get_available_model()
    if not model:
        return None

    readme_part = (readme_snippet or "")[:2000]
    tech = ", ".join(tech_stack) if tech_stack else "Unknown"

    prompt = f"""You are a helpful open-source mentor. Given the following repository information, 
write a concise, encouraging onboarding guide for a new contributor. Keep it under 300 words.
Focus on: what the project does, why it matters, and practical first steps.

Repository: {repo_name}
Description: {description or 'N/A'}
Tech Stack: {tech}

README excerpt:
{readme_part}

Current summary:
{existing_summary}

Write an improved, welcoming onboarding summary:"""

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": 400,
                        "temperature": 0.7,
                    },
                },
            )
            if r.status_code == 200:
                return r.json().get("response")
    except Exception:
        pass

    return None
