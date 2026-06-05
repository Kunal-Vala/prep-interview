'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getInterviewSocket, disconnectSocket } from '@/lib/socket';
import { useInterviewStore } from '@/store/interviewStore';
import type {
  NextQuestionPayload,
  TranscriptionReadyPayload,
  AIResponseStreamPayload,
  AIResponseEndPayload,
  SessionClosedPayload,
  WSErrorPayload,
} from '@/types/interview.types';

// DESIGN DECISION: Extract updaters statically outside the React loop.
// Since Zustand actions are completely stable references that never change, 
// we can read them once on file evaluation. This completely bypasses the React render phase!
const storeActions = {
  setCurrentQuestion: useInterviewStore.getState().setCurrentQuestion,
  appendTranscript: useInterviewStore.getState().appendTranscript,
  appendAITokenDelta: useInterviewStore.getState().appendAITokenDelta,
  finalizeAIResponse: useInterviewStore.getState().finalizeAIResponse,
  setSessionClosed: useInterviewStore.getState().setSessionClosed,
  setError: useInterviewStore.getState().setError,
};

export function useInterviewSocket(token: string, sessionId: string) {
  const socketRef = useRef<Socket | null>(null);
  const sequenceIdRef = useRef<number>(0);

  const sendAudioChunk = useCallback((blob: Blob) => {
    if (!socketRef.current?.connected) {
      console.warn('[Network Core] Audio packet dropped: Socket connection is currently offline.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        socketRef.current?.emit('audio-chunk', {
          sessionId,
          chunk: arrayBuffer,
          sequenceId: ++sequenceIdRef.current,
          timestamp: performance.now(),
        });
      } catch (error) {
        console.error('[Network Core] Failed to process audio binary serialization:', error);
      }
    };
    reader.readAsArrayBuffer(blob);
  }, [sessionId]);

  const signalSpeechEnded = useCallback((questionId: string) => {
    socketRef.current?.emit('speech-ended', {
      sessionId,
      questionId,
      totalChunks: sequenceIdRef.current,
    });
    sequenceIdRef.current = 0;
  }, [sessionId]);

  const sendTextMessage = useCallback((text: string) => {
    if (!socketRef.current?.connected) {
      console.warn('[Network Core] Text message dropped: Socket connection is currently offline.');
      return;
    }
    // Immediately show the candidate's message in the transcript
    storeActions.appendTranscript({ role: 'candidate', content: text });
    socketRef.current.emit('user-message', { sessionId, content: text });
  }, [sessionId]);

  const endSession = useCallback((reason: 'user-quit' | 'time-limit' = 'user-quit') => {
    socketRef.current?.emit('session-end', { sessionId, reason });
  }, [sessionId]);

  useEffect(() => {
    const socketInstance = getInterviewSocket(token);
    socketRef.current = socketInstance;

    // Register decoupled state processing pipelines using static store updaters
    socketInstance.on('next-question', (data: NextQuestionPayload) => {
      storeActions.setCurrentQuestion(data);
      // Note: transcript entry is added by finalizeAIResponse via ai-response-end event
    });

    socketInstance.on('transcription-ready', (data: TranscriptionReadyPayload) => {
      storeActions.appendTranscript({ role: 'candidate', content: data.transcript });
    });

    socketInstance.on('ai-response-stream', (data: AIResponseStreamPayload) => {
      storeActions.appendAITokenDelta(data.delta);
    });

    socketInstance.on('ai-response-end', (data: AIResponseEndPayload) => {
      storeActions.finalizeAIResponse(data.fullText);
    });

    socketInstance.on('session-closed', (data: SessionClosedPayload) => {
      storeActions.setSessionClosed(data.feedbackJobId);
      disconnectSocket();
    });

    socketInstance.on('ws-error', (data: WSErrorPayload) => {
      storeActions.setError(data.message);
    });

    // Establish room channel boundaries
    socketInstance.emit('join-session', { sessionId });

    return () => {
      socketInstance.off('next-question');
      socketInstance.off('transcription-ready');
      socketInstance.off('ai-response-stream');
      socketInstance.off('ai-response-end');
      socketInstance.off('session-closed');
      socketInstance.off('ws-error');
    };
  }, [token, sessionId]);

  return { sendAudioChunk, signalSpeechEnded, endSession, sendTextMessage };
}