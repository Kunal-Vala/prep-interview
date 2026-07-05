export interface TranscriptMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  questionCategory?: string;
  timestamp?: string;
}

// ─── CLIENT → SERVER EVENT PAYLOADS ──────────────────────────────────────────
export interface AudioChunkPayload {
  sessionId: string;
  chunk: ArrayBuffer;      // Raw binary audio (webm/opus)
  sequenceId: number;      // Monotonic counter
  timestamp: number;       // performance.now()
}

export interface SpeechEndedPayload {
  sessionId: string;
  questionId: string;
  totalChunks: number;
}
export interface SessionEndPayload {
  sessionId: string;
  reason: 'user-quit' | 'time-limit' | 'connection-drop';
}


// ─── SERVER → CLIENT EVENT PAYLOADS ──────────────────────────────────────────
export interface TranscriptionReadyPayload {
  sessionId: string;
  questionId: string;
  transcript: string;
  confidence: number;
  processingMs: number;
}
export interface AIResponseStreamPayload {
  sessionId: string;
  delta: string;
  streamId: string;
}
export interface AIResponseEndPayload {
  sessionId: string;
  streamId: string;
  fullText: string;
  role: 'follow-up' | 'next-question' | 'closing';
}
export interface TTSChunkPayload {
  sessionId: string;
  audioChunk: ArrayBuffer;
  streamId: string;
  isLast: boolean;
}
export interface NextQuestionPayload {
  sessionId: string;
  questionId?: string;
  sequenceNumber: number;
  category: string;
  questionText: string;
  isWrapUp?: boolean;
}
export interface SessionClosedPayload {
  sessionId: string;
  feedbackJobId: string;
  summary: {
    totalQuestions: number;
    durationSeconds: number;
  };
}
export interface WSErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}