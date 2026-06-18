export interface ResumeAnalysisResult {
  atsScore: number;
  formattingScore: number;
  skillsScore: number;
  jobAlignmentScore: number;
  profileSummary: string;
  extractedSkills: {
    technical: string[];
    soft: string[];
    missing: string[];
  };
  experienceAnalysis: Array<{
    company: string;
    role: string;
    duration: string;
    impactEvaluation: string;
  }>;
  atsFormattingIssues: string[];
  actionableImprovements: Array<{
    section: string;
    issue: string;
    recommendation: string;
    exampleBefore?: string;
    exampleAfter?: string;
  }>;
  targetRoleAlignment: {
    role: string;
    alignmentSummary: string;
    skillsGap: string[];
  };
}

export function buildResumePrompt(
  parsedText: string,
  targetRole: string,
): string {
  return `
You are an expert ATS (Applicant Tracking System) optimizer and professional resume reviewer.
Analyze the raw text extracted from a candidate's resume and evaluate it against the target role: **${targetRole}**.

Provide a single, complete, valid JSON object following this schema:
{
  "atsScore": 85,
  "formattingScore": 90,
  "skillsScore": 80,
  "jobAlignmentScore": 85,
  "profileSummary": "Summary bio...",
  "extractedSkills": {
    "technical": ["TS", "Node"],
    "soft": ["Mentorship"],
    "missing": ["GraphQL"]
  },
  "experienceAnalysis": [
    {
      "company": "Company",
      "role": "Role",
      "duration": "Duration",
      "impactEvaluation": "STAR metrics audit..."
    }
  ],
  "atsFormattingIssues": [
    "Double-column warnings..."
  ],
  "actionableImprovements": [
    {
      "section": "Experience",
      "issue": "Missing metrics",
      "recommendation": "Quantify outcomes.",
      "exampleBefore": "Wrote code.",
      "exampleAfter": "Delivered features reducing latency by 30%."
    }
  ],
  "targetRoleAlignment": {
    "role": "${targetRole}",
    "alignmentSummary": "Overall analysis...",
    "skillsGap": ["Redis"]
  }
}

Output ONLY the raw JSON - no markdown fences or preambles.

Resume Text:
${parsedText}
`;
}

interface RawParsedResult {
  atsScore?: number | string;
  formattingScore?: number | string;
  skillsScore?: number | string;
  jobAlignmentScore?: number | string;
  profileSummary?: string;
  extractedSkills?: {
    technical?: string[];
    soft?: string[];
    missing?: string[];
  };
  experienceAnalysis?: Array<{
    company?: string;
    role?: string;
    duration?: string;
    impactEvaluation?: string;
  }>;
  atsFormattingIssues?: string[];
  actionableImprovements?: Array<{
    section?: string;
    issue?: string;
    recommendation?: string;
    exampleBefore?: string;
    exampleAfter?: string;
  }>;
  targetRoleAlignment?: {
    role?: string;
    alignmentSummary?: string;
    skillsGap?: string[];
  };
}

export function parseResumeResponse(rawJson: string): ResumeAnalysisResult {
  const cleaned = rawJson
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as RawParsedResult;
  return {
    atsScore: Number(parsed.atsScore) || 70,
    formattingScore: Number(parsed.formattingScore) || 70,
    skillsScore: Number(parsed.skillsScore) || 70,
    jobAlignmentScore: Number(parsed.jobAlignmentScore) || 70,
    profileSummary: parsed.profileSummary || '',
    extractedSkills: {
      technical: parsed.extractedSkills?.technical || [],
      soft: parsed.extractedSkills?.soft || [],
      missing: parsed.extractedSkills?.missing || [],
    },
    experienceAnalysis: (parsed.experienceAnalysis || []).map((item) => ({
      company: item?.company || '',
      role: item?.role || '',
      duration: item?.duration || '',
      impactEvaluation: item?.impactEvaluation || '',
    })),
    atsFormattingIssues: parsed.atsFormattingIssues || [],
    actionableImprovements: (parsed.actionableImprovements || []).map(
      (item) => ({
        section: item?.section || '',
        issue: item?.issue || '',
        recommendation: item?.recommendation || '',
        exampleBefore: item?.exampleBefore,
        exampleAfter: item?.exampleAfter,
      }),
    ),
    targetRoleAlignment: {
      role: parsed.targetRoleAlignment?.role || '',
      alignmentSummary: parsed.targetRoleAlignment?.alignmentSummary || '',
      skillsGap: parsed.targetRoleAlignment?.skillsGap || [],
    },
  };
}
