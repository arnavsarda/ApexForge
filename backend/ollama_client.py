"""Optional Ollama LLM integration for AI-enhanced onboarding guides.

Target model: qwen3:4b (with graceful fallback to any installed local model or rule-based guides).
"""

from __future__ import annotations

from typing import Any
import httpx

OLLAMA_URL = "http://localhost:11434"
TARGET_MODEL = "qwen3:4b"
DEFAULT_MODEL = "qwen3:4b"
TIMEOUT = 15.0


async def get_available_model(preferred: str | None = None) -> str | None:
    """Return the name of an installed Ollama model, preferring TARGET_MODEL or preferred."""
    target = preferred or TARGET_MODEL
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                models = r.json().get("models", [])
                if not models:
                    return None
                # Check for preferred / target model first
                for m in models:
                    name = m.get("name", "")
                    if target in name or target.split(":")[0] in name:
                        return name
                # Fallback to the first available model
                return models[0].get("name")
    except Exception:
        pass
    return None


async def is_available() -> bool:
    """Check if Ollama is running and has at least one model pulled."""
    model = await get_available_model()
    return model is not None


async def test_ai_inference(
    prompt: str = "Explain what an open source contributor does in 2 sentences.",
    model: str | None = None,
) -> dict[str, Any]:
    """Test Ollama inference directly for the /api/ai-test endpoint."""
    model_name = await get_available_model(preferred=model)
    if not model_name:
        return {
            "status": "unavailable",
            "target_model": TARGET_MODEL,
            "model_used": None,
            "available": False,
            "response": None,
            "error": "Ollama service is not reachable on localhost:11434 or no models are installed.",
        }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": 250,
                        "temperature": 0.7,
                    },
                },
            )
            if r.status_code == 200:
                resp_text = r.json().get("response", "")
                return {
                    "status": "ok",
                    "target_model": TARGET_MODEL,
                    "model_used": model_name,
                    "available": True,
                    "response": resp_text,
                    "error": None,
                }
            return {
                "status": "error",
                "target_model": TARGET_MODEL,
                "model_used": model_name,
                "available": True,
                "response": None,
                "error": f"Ollama returned HTTP {r.status_code}: {r.text[:200]}",
            }
    except Exception as e:
        return {
            "status": "error",
            "target_model": TARGET_MODEL,
            "model_used": model_name,
            "available": False,
            "response": None,
            "error": f"Ollama request error: {str(e)}",
        }


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
