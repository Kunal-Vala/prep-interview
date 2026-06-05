export interface EvaluatorInput {
  targetRole: string;
  difficulty: number;
  transcript: TranscriptMessage[];
  sessionDurationSeconds: number;
}

export interface TranscriptMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  questionCategory?: string;
  timestamp: string;
}

interface LlmEvaluationSchema {
  overallScore: number;
  dimensions: {
    technicalScore: number;
    communicationScore: number;
    pacingScore: number;
    codeQualityScore: number | null;
    behavioralScore: number | null;
  };
  strengths: string[];
  improvements: Array<{
    area: string;
    severity: 'low' | 'medium' | 'high';
    detail: string;
    actionableAdvice: string;
    exampleFromSession: string;
  }>;
  questionFeedback: Array<{
    sequenceNumber: number;
    category: string;
    questionSummary: string;
    answerQuality: string;
    score: number;
    comment: string;
    suggestionsForImprovement: string;
    idealResponseOutline: string;
  }>;
  hiringRecommendation: string;
  hiringRationale: string;
  studyRecommendations: string[];
}

/**
 * Compiles the full evaluation prompt injected as a one-shot user message.
 */
export function buildEvaluatorPrompt(input: EvaluatorInput): string {
  const transcriptText = input.transcript
    .map(
      (m) =>
        `[${m.role.toUpperCase()}${m.questionCategory ? ` - ${m.questionCategory}` : ''}]: ${m.content}`,
    )
    .join('\n\n');

  return `
You are an expert interview evaluator with 15 years of experience conducting and reviewing technical
interviews at top technology companies (Google, Meta, Amazon, Microsoft). You have just observed
a complete interview transcript for the role of **${input.targetRole}** at difficulty level **${input.difficulty}/5**.

The interview ran for ${Math.round(input.sessionDurationSeconds / 60)} minutes.

## Your Task

Analyze the FULL TRANSCRIPT below and produce a single, complete, valid JSON object — nothing else.
No markdown fences. No prose before or after. Only the raw JSON.

## Scoring Rubric

Score each dimension on a scale of **0.0 to 10.0** (one decimal place):

### 1. Technical Accuracy (technicalScore)
- 9–10: Answers are precise, reference correct terminology, demonstrate deep mastery with nuanced trade-offs
- 7–8: Mostly correct, minor gaps, good conceptual understanding
- 5–6: Fundamental concepts understood but significant gaps in advanced application
- 3–4: Partial understanding, multiple factual errors or misconceptions
- 0–2: Severely incorrect or no substantive technical answer provided

### 2. Communication Clarity (communicationScore)
- 9–10: Structured answers (STAR, ProblemSolutionResult), confident delivery, no filler
- 7–8: Clear and organized, occasional vagueness, minor rambling
- 5–6: Understandable but lacks structure, frequent backtracking
- 3–4: Difficult to follow, unclear reasoning, excessive filler
- 0–2: Incoherent or extremely brief answers

### 3. Answer Pacing (pacingScore)
- 9–10: Consistent, appropriately concise — neither rushed nor excessive; all questions answered
- 7–8: Minor pacing issues on 1–2 questions
- 5–6: Noticeably rushed or overly long on several answers
- 3–4: Significant pacing problems affecting interview quality
- 0–2: Extremely mismatched pacing (near silent or extremely verbose throughout)

### 4. Code & System Quality (codeQualityScore)
- Evaluate only if coding or system design questions were present.
- 9–10: Optimal algorithms, correct complexity analysis, considers edge cases and scalability
- 7–8: Correct approach, minor inefficiencies or missed edge cases
- 5–6: Working but sub-optimal, O(n²) when O(n) exists, no complexity discussion
- 3–4: Incorrect or incomplete solution, major logic errors
- 0–2: No meaningful technical approach offered
- null: No coding/design questions were present

### 5. Behavioral Quality (behavioralScore)
- Evaluate STAR (Situation, Task, Action, Result) adherence:
- 9–10: All behavioral answers are concrete, specific, quantified outcomes, clear personal ownership
- 7–8: Good stories but missing one STAR element or lacking quantified results
- 5–6: Generic, theoretical, or vague behavioral answers
- 3–4: Deflected, shifted blame, no clear personal ownership
- 0–2: No behavioral examples provided or completely off-topic
- null: No behavioral questions were asked

### 6. Overall Score (overallScore)
Weighted average:
  (technicalScore × 0.35) + (communicationScore × 0.20) + (pacingScore × 0.15)
  + (codeQualityScore ?? technicalScore) × 0.20 + (behavioralScore ?? communicationScore) × 0.10

## Required JSON Output Schema

\`\`\`json
{
  "overallScore": 7.8,
  "dimensions": {
    "technicalScore": 8.2,
    "communicationScore": 7.5,
    "pacingScore": 7.0,
    "codeQualityScore": 6.5,
    "behavioralScore": 8.5
  },
  "strengths": [
    "Clear articulation of trade-offs in system design scenarios",
    "Strong use of concrete examples in behavioral responses",
    "Demonstrated genuine experience with the stated tech stack"
  ],
  "improvements": [
    {
      "area": "Code Quality",
      "severity": "medium",
      "detail": "When proposing solutions, explicitly state time and space complexity.",
      "actionableAdvice": "Before explaining any algorithm, state your approach in one sentence, then justify it with its complexity.",
      "exampleFromSession": "In your rate-limiter answer, you described using Redis correctly but never mentioned O(1) INCR vs O(log N) ZADD trade-offs."
    }
  ],
  "questionFeedback": [
    {
      "sequenceNumber": 1,
      "category": "TECHNICAL",
      "questionSummary": "Horizontal vs vertical scaling",
      "answerQuality": "strong",
      "score": 8.5,
      "comment": "Correctly identified the core distinction and gave a practical use case.",
      "suggestionsForImprovement": "Discuss specific database partitioning strategies when scaling horizontally, and highlight cost/hardware limits when scaling vertically.",
      "idealResponseOutline": "1. Definition: Horizontal (adding machines) vs Vertical (adding power to 1 machine).\n2. Trade-offs: Cost, single point of failure, load balancing overhead, data consistency.\n3. Application: When to use which (e.g. database read replicas vs quick hardware upgrades)."
    }
  ],
  "hiringRecommendation": "lean_yes",
  "hiringRationale": "The candidate demonstrates solid foundations but code quality needs optimization.",
  "studyRecommendations": [
    "Distributed systems: Clock synchronization",
    "Algorithm complexity: Practice stating Big-O"
  ]
}
\`\`\`

## Full Interview Transcript

${transcriptText}

---
Now produce the evaluation JSON for the above transcript. Output ONLY valid JSON.
`.trim();
}

/**
 * Parses and maps the raw LLM JSON response to the DB feedback object.
 */
export function parseEvaluatorResponse(rawJson: string) {
  const cleaned = rawJson
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const parsed = JSON.parse(cleaned) as LlmEvaluationSchema;

  return {
    overallScore: parsed.overallScore,
    technicalScore: parsed.dimensions.technicalScore,
    communicationScore: parsed.dimensions.communicationScore,
    pacingScore: parsed.dimensions.pacingScore,
    codeQualityScore: parsed.dimensions.codeQualityScore ?? null,
    behavioralScore: parsed.dimensions.behavioralScore ?? null,
    strengths: parsed.strengths ?? [],
    improvements: parsed.improvements ?? [],
    questionFeedback: parsed.questionFeedback ?? [],
    rawLlmResponse: rawJson,
  };
}

/* cspell:ignore ZADD */
