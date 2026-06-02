export interface TranscriptMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  questionCategory?: string;
  timestamp?: string;
}

