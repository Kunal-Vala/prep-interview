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
  isProcessing: boolean;
}

interface InterviewActions {
  setCurrentQuestion: (question: NextQuestionPayload) => void;
  appendTranscript: (message: TranscriptMessage) => void;
  appendAITokenDelta: (delta: string) => void;
  finalizeAIResponse: (fullText: string) => void;
  setSessionClosed: (feedbackJobId: string) => void;
  setError: (message: string | null) => void;
  setProcessing: (val: boolean) => void;
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
  isProcessing: false,
};

export const useInterviewStore = create<InterviewStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setCurrentQuestion: (question) => 
        set({ currentQuestion: question, streamingText: '', isProcessing: false }, false, 'setCurrentQuestion'),
        
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
            isProcessing: false,
          }),
          false,
          'finalizeAIResponse'
        ),

      setSessionClosed: (feedbackJobId) => 
        set({ sessionClosed: true, feedbackJobId }, false, 'setSessionClosed'),
        
      setError: (message) => 
        set({ error: message, isProcessing: false }, false, 'setError'),

      setProcessing: (val) =>
        set({ isProcessing: val }, false, 'setProcessing'),

      resetStore: () => 
        set(initialState, false, 'resetStore'),
    }),
    { name: 'InterviewSessionStore' }
  )
);