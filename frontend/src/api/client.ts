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
  is_empty?: boolean;
  size_kb?: number;
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
  ai_model?: string | null;
  prerequisites?: string[];
  run_commands?: string[];
  test_commands?: string[];
  suggested_first_contribution?: string | null;
  common_problems?: string[];
  unavailable_info?: string[];
  sections?: Record<string, string>;
  full_guide_markdown?: string | null;
  ai_status?: {
    available: boolean;
    model_installed?: boolean;
    model_used?: string | null;
    target_model?: string;
    fallback_used?: boolean;
    reason?: string;
  };
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
  errors?: string[];
  generated_at: string;
  languages?: LanguageBreakdown;
  contributors?: Contributor[];
  file_tree?: FileTreeEntry[];
  selected_files?: Record<string, string>;
  has_readme?: boolean;
  has_contributing?: boolean;
  readme_html?: string | null;
  readme_content?: string | null;
  contributing_content?: string | null;
  rate_limit_remaining?: number | null;
  guide?: OnboardingGuide;
  sections?: Record<string, string>;
  full_guide_markdown?: string | null;
  ai_status?: {
    available: boolean;
    model_installed?: boolean;
    model_used?: string | null;
    target_model?: string;
    fallback_used?: boolean;
    reason?: string;
  };
  documentation_status?: DocumentationStatus;
  contributor_roadmap?: RoadmapPhase[];
}

export interface DocStatusItem {
  name: string;
  filename?: string | null;
  present: boolean;
  path?: string | null;
  description: string;
}

export interface DocumentationStatus {
  score_percentage: number;
  present_count: number;
  total_count: number;
  health_grade: string;
  items: DocStatusItem[];
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  description: string;
  milestones: string[];
  suggested_commands?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RepoChatRequest {
  repository_url?: string | null;
  repo_name?: string | null;
  question: string;
  history?: ChatMessage[];
  context_overview?: string | null;
  context_tech_stack?: string[];
  context_files?: string[];
  context_setup_steps?: string[];
  selected_file_path?: string | null;
  selected_file_content?: string | null;
  current_view?: string | null;
}

export interface RepoChatResponse {
  answer: string;
  sources: string[];
  ai_model?: string | null;
  ai_available: boolean;
  fallback_used: boolean;
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
  ollama_running?: boolean;
  target_ai_model?: string;
  ollama_model_installed?: boolean;
  installed_ai_models?: string[];
  diagnostics?: {
    github_token_configured: boolean;
    rate_limit_tier: string;
    env_file_detected: boolean;
    env_file_path?: string | null;
  };
}

export interface AiTestResponse {
  status: string;
  target_model: string;
  model_used?: string | null;
  available: boolean;
  model_installed: boolean;
  response?: string | null;
  error?: string | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function testAi(prompt?: string, model?: string): Promise<AiTestResponse> {
  const res = await fetch(`${API_BASE}/api/ai-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model }),
  });
  return res.json();
}

export interface ApiError {
  detail: string;
}

/**
 * Call POST /api/analyze to analyze a public GitHub repository.
 */
export async function analyzeRepository(repositoryUrl: string): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
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
  const res = await fetch(`${API_BASE}/api/onboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && 'status' in data) {
        return data as HealthResponse;
      }
    }
  } catch {
    // fallback below
  }

  const fallback = await fetch(`${API_BASE}/health`);
  if (!fallback.ok) throw new Error('Backend unreachable');
  return fallback.json();
}

/**
 * Send a question to repository-aware AI chat.
 */
export async function sendRepoChat(req: RepoChatRequest): Promise<RepoChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.json();
}

export interface RepoFileContentRequest {
  repository_url: string;
  path: string;
  branch?: string;
}

export interface RepoFileContentResponse {
  path: string;
  content: string | null;
  size: number | null;
  is_binary: boolean;
  truncated: boolean;
  error: string | null;
  html_url: string | null;
}

/**
 * Fetch real file contents on-demand for repository graph details view.
 */
export async function fetchFileContent(req: RepoFileContentRequest): Promise<RepoFileContentResponse> {
  const res = await fetch(`${API_BASE}/api/file-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.json();
}

