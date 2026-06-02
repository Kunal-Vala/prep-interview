import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { TranscriptMessage, NextQuestionPayload } from '@/types/interview.types';

interface InterviewState {
  currentQuestion: NextQuestionPayload | null;
  transcript: TranscriptMessage[];
  streamingText: string;
  sessionClosed: boolean;
  feedbackJobId: string | null;
  error: string | null;
}

interface InterviewActions {
  setCurrentQuestion: (question: NextQuestionPayload) => void;
  appendTranscript: (message: TranscriptMessage) => void;
  appendAITokenDelta: (delta: string) => void;
  finalizeAIResponse: (fullText: string) => void;
  setSessionClosed: (feedbackJobId: string) => void;
  setError: (message: string | null) => void;
  resetStore: () => void;
}

// Separate state from action contracts for cleaner architecture scaling
type InterviewStore = InterviewState & InterviewActions;

const initialState: InterviewState = {
  currentQuestion: null,
  transcript: [],
  streamingText: '',
  sessionClosed: false,
  feedbackJobId: null,
  error: null,
};

export const useInterviewStore = create<InterviewStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setCurrentQuestion: (question) => 
        set({ currentQuestion: question, streamingText: '' }, false, 'setCurrentQuestion'),
        
      appendTranscript: (message) =>
        set(
          (state) => ({ transcript: [...state.transcript, message] }),
          false,
          'appendTranscript'
        ),

      appendAITokenDelta: (delta) =>
        set(
          (state) => ({ streamingText: state.streamingText + delta }),
          false,
          'appendAITokenDelta'
        ),

      finalizeAIResponse: (fullText) =>
        set(
          (state) => ({
            transcript: [...state.transcript, { role: 'interviewer', content: fullText }],
            streamingText: '',
          }),
          false,
          'finalizeAIResponse'
        ),

      setSessionClosed: (feedbackJobId) => 
        set({ sessionClosed: true, feedbackJobId }, false, 'setSessionClosed'),
        
      setError: (message) => 
        set({ error: message }, false, 'setError'),

      resetStore: () => 
        set(initialState, false, 'resetStore'),
    }),
    { name: 'InterviewSessionStore' }
  )
);