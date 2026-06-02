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
