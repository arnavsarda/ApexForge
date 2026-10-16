/**
 * API client for RepoReady backend.
 */

export interface RepoMeta {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stars: number;
  forks: number;
  open_issues: number;
  default_branch: string;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
  license: string | null;
  has_wiki: boolean;
}

export interface LanguageBreakdown {
  languages: Record<string, number>;
  percentages: Record<string, number>;
}

export interface Issue {
  number: number;
  title: string;
  html_url: string;
  labels: string[];
  created_at: string;
  comments: number;
  body_preview: string | null;
}

export interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

export interface FileTreeEntry {
  path: string;
  type: string;
  size: number | null;
}

export interface OnboardingGuide {
  summary: string;
  tech_stack: string[];
  setup_steps: string[];
  contribution_tips: string[];
  key_files: string[];
  ai_enhanced: boolean;
}

export interface AnalysisResponse {
  repository: RepoMeta;
  overview: string;
  tech_stack: string[];
  setup_steps: string[];
  key_files: string[];
  contribution_tips: string[];
  recommended_issues: Issue[];
  sources: string[];
  warnings: string[];
  generated_at: string;
  languages?: LanguageBreakdown;
  contributors?: Contributor[];
  file_tree?: FileTreeEntry[];
  readme_html?: string | null;
  rate_limit_remaining?: number | null;
}

export interface OnboardResponse {
  repo: RepoMeta;
  languages: LanguageBreakdown;
  beginner_issues: Issue[];
  contributors: Contributor[];
  file_tree: FileTreeEntry[];
  guide: OnboardingGuide;
  readme_html: string | null;
  rate_limit_remaining: number | null;
}

export interface HealthResponse {
  status: string;
  app?: string;
  version?: string;
  github_token_set: boolean;
  ollama_available: boolean;
  diagnostics?: {
    github_token_configured: boolean;
    rate_limit_tier: string;
    env_file_detected: boolean;
    env_file_path?: string | null;
  };
}

export interface ApiError {
  detail: string;
}

/**
 * Call POST /api/analyze to analyze a public GitHub repository.
 */
export async function analyzeRepository(repositoryUrl: string): Promise<AnalysisResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repository_url: repositoryUrl }),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.json();
}

/**
 * Legacy GET /api/onboard/{owner}/{repo} endpoint.
 */
export async function fetchOnboard(owner: string, repo: string): Promise<OnboardResponse> {
  const res = await fetch(`/api/onboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && 'status' in data) {
        return data as HealthResponse;
      }
    }
  } catch {
    // fallback below
  }

  const fallback = await fetch('/health');
  if (!fallback.ok) throw new Error('Backend unreachable');
  return fallback.json();
}
