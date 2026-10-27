export interface RiskyClaim {
  claim: string;
  risk: string;
  suggestion: string;
}

export interface AiView {
  /** A realistic ChatGPT/Gemini-style answer to "What does <product> do?" based only on public info */
  answer: string;
  /** Things an AI would likely leave out */
  missing: string[];
  /** Things an AI would likely get confused or wrong about */
  confusing: string[];
}

export interface Profile {
  name: string;
  url: string;
  tagline: string;
  summary: string;
  targetUsers: string[];
  features: string[];
  useCases: string[];
  pricing: string;
  does: string[];
  doesNot: string[];
  limitations: string[];
  missingFacts: string[];
  riskyClaims: RiskyClaim[];
  aiView: AiView;
  sources: string[];
  updatedAt: string;
}

export interface AnalyzeInput {
  url: string;
  name: string;
  description: string;
  targetUser: string;
}

export interface PageInfo {
  url: string;
  chars: number;
}
