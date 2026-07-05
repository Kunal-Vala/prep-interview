/* cspell:words timeslice */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useInterviewStore } from '@/store/interviewStore';
import { useInterviewSocket } from '@/hooks/useInterviewSocket';
import { useSpeechRecognition, SpeechRecognitionErrorEvent } from '@/hooks/useSpeechRecognition';
import { useTheme } from '@/hooks/useTheme';

export default function InterviewRoomPage() {
  const { id: sessionId } = useParams() as { id: string };
  const { token, loading } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Optimized Zustand Selectors to isolate component re-render vectors
  const transcript = useInterviewStore((state) => state.transcript);
  const streamingText = useInterviewStore((state) => state.streamingText);
  const currentQuestion = useInterviewStore((state) => state.currentQuestion);
  const sessionClosed = useInterviewStore((state) => state.sessionClosed);
  const globalError = useInterviewStore((state) => state.error);
  const setGlobalError = useInterviewStore((state) => state.setError);
  const resetStore = useInterviewStore((state) => state.resetStore);
  const isProcessing = useInterviewStore((state) => state.isProcessing);
  const setProcessing = useInterviewStore((state) => state.setProcessing);

  const isWrapUp = currentQuestion?.isWrapUp || false;

  const [textInput, setTextInput] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea height dynamically matching text content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [textInput]);

  // Auth Enforcer Guard
  useEffect(() => {
    if (!loading && !token) {
      router.push('/login');
    }
  }, [token, loading, router]);

  // Persistent Bidirectional WebSocket Gateway Integration
  const { endSession, sendTextMessage } = useInterviewSocket(
    token || '',
    sessionId
  );

  // Speech Recognition Event Node
  const { startListening, stopListening, isListening } = useSpeechRecognition({
    onResult: useCallback((text: string) => {
      setTextInput(text);
    }, []),
    onEnd: useCallback((finalText: string) => {
      console.log('[SpeechRecognition] Final text captured:', finalText);
      if (finalText.trim()) {
        setTextInput(finalText.trim());
      }
    }, []),
    onError: useCallback((event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] Error event:', event);
      if (event.error === 'not-allowed') {
        setGlobalError('Microphone access denied. Please verify system/browser permissions.');
      } else if (event.error !== 'aborted') {
        setGlobalError(`Speech recognition failed: ${event.error}. Please try again.`);
      }
    }, [setGlobalError]),
  });

  const toggleMic = () => {
    if (isProcessing) return;
    if (isListening) {
      stopListening();
    } else {
      setShowRetry(false);
      startListening();
    }
  };

  const handleSendText = () => {
    if (!textInput.trim() || isProcessing) return;
    setShowRetry(false);
    setProcessing(true);
    sendTextMessage(textInput.trim());
    setTextInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleRetry = useCallback(() => {
    const lastCandidateMsg = [...transcript].reverse().find((m) => m.role === 'candidate');
    if (!lastCandidateMsg) return;

    setGlobalError(null);
    setShowRetry(false);
    setProcessing(true);
    sendTextMessage(lastCandidateMsg.content, true);
  }, [transcript, sendTextMessage, setGlobalError, setProcessing]);

  // Watchdog watchdog timer to catch stuck LLM response requests
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isProcessing && !streamingText) {
      timer = setTimeout(() => {
        setGlobalError("The interviewer is taking longer than expected to respond. Please retry.");
        setShowRetry(true);
        setProcessing(false);
      }, 20000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isProcessing, streamingText, setGlobalError, setProcessing]);

  // Automatically mute/deactivate mic when processing begins
  useEffect(() => {
    if (isProcessing && isListening) {
      stopListening();
    }
  }, [isProcessing, isListening, stopListening]);

  // Safe unmount context cleanup lifecycle ring
  useEffect(() => {
    return () => {
      stopListening();
      resetStore();
    };
  }, [stopListening, resetStore]);

  // Session Close Navigation Monitor
  useEffect(() => {
    if (sessionClosed) {
      router.push(`/feedback/${sessionId}`);
    }
  }, [sessionClosed, sessionId, router]);

  if (loading || !token) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
        <span className="text-zinc-500 animate-pulse text-sm font-semibold tracking-wider">INITIALIZING STREAM GATEWAY...</span>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans select-none overflow-hidden transition-colors duration-200">
      {/* Top Application Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <span className="text-sm sm:text-base px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-lg font-bold font-mono">LIVE ASSESSOR STREAM</span>
          <span className="text-sm sm:text-base text-zinc-650 dark:text-zinc-300 font-mono hidden sm:inline">ROOM_ID: {sessionId.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-650 dark:text-zinc-350 transition-colors cursor-pointer"
            aria-label="Toggle Theme Mode"
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => endSession()}
            className={`px-5 py-2.5 rounded-lg border text-sm sm:text-base font-bold transition-all cursor-pointer ${
              isWrapUp
                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 border-indigo-500 text-white animate-pulse shadow-lg shadow-indigo-600/30'
                : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/50 dark:border-red-900/40 dark:text-red-400'
            }`}
          >
            {isWrapUp ? 'Finish & View Feedback' : 'Wrap Session'}
          </button>
        </div>
      </header>

      {/* Main Execution Framework Layout Box */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-7xl w-full mx-auto px-6 py-8 gap-6 min-h-0">
        
        {/* Left Column: Live Transcript stream */}
        <main className="flex-1 flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden h-full min-h-0 shadow-sm">
          {/* Complies with accessible standards using role configuration and polite notification profiles */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6" role="log" aria-live="polite">
            {transcript.length === 0 && (
              <div className="h-full flex items-center justify-center text-center text-zinc-500 dark:text-zinc-400 text-base">
                Awaiting connection framework initialization pipeline...
              </div>
            )}
            
            {transcript.map((msg, idx) => (
              <article
                key={idx}
                className={`flex flex-col max-w-[80%] ${msg.role === 'candidate' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                <span className="text-xs font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-1.5">
                  {msg.role === 'candidate' ? 'Candidate (You)' : 'Interviewer'}
                </span>
                <div
                  className={`px-4 py-3 rounded-2xl text-base leading-relaxed border ${
                    msg.role === 'candidate'
                      ? 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-850 text-zinc-900 dark:text-zinc-555'
                      : 'bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20 text-indigo-950 dark:text-indigo-100'
                  }`}
                >
                  {msg.content}
                </div>
              </article>
            ))}

            {streamingText && (
              <div className="flex flex-col max-w-[80%] items-start mr-auto">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1.5 animate-pulse">
                  Interviewer Synthesizing Response...
                </span>
                <div className="px-4 py-3 rounded-2xl text-base leading-relaxed border bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20 text-indigo-950 dark:text-indigo-100">
                  {streamingText}
                  <span className="inline-block w-1.5 h-3.5 bg-indigo-500 animate-pulse ml-0.5 align-middle" aria-hidden="true" />
                </div>
              </div>
            )}

            {isProcessing && !streamingText && (
              <div className="flex flex-col max-w-[80%] items-start mr-auto">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1.5 animate-pulse">
                  Interviewer is transcribing & thinking...
                </span>
                <div className="px-4 py-3 rounded-2xl text-base leading-relaxed border bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Localized Error Banner Overlay */}
          {globalError && (
            <div role="alert" className="p-4 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900/40 text-sm text-red-700 dark:text-red-400 flex items-center justify-between gap-4">
              <span className="flex-1 font-medium">{globalError}</span>
              <div className="flex items-center gap-3">
                {showRetry && (
                  <button
                    onClick={handleRetry}
                    className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-xs font-bold text-white transition-colors cursor-pointer select-none"
                  >
                    Retry
                  </button>
                )}
                <button onClick={() => setGlobalError(null)} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 font-bold font-mono cursor-pointer">Dismiss</button>
              </div>
            </div>
          )}

          {/* Text Mode Input Area */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isWrapUp
                  ? "Interview complete. Please click 'Finish & View Feedback' above to view your report."
                  : isProcessing
                  ? "Processing response..."
                  : "Type your answer here..."
              }
              disabled={isProcessing || isWrapUp}
              rows={3}
              style={{ minHeight: '60px', maxHeight: '200px' }}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendText}
              disabled={!textInput.trim() || isProcessing || isWrapUp}
              className="px-6 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-base font-bold text-white disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-650 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </main>

        {/* Right Column: Audio Controls Panel */}
        <aside className="w-full md:w-80 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col items-center justify-between gap-8 h-auto md:h-full shadow-sm">
          <div className="w-full text-center">
            <h2 className="font-extrabold text-zinc-850 dark:text-zinc-100 text-2xl mb-1.5">Audio Controls</h2>
            <p className="text-base text-zinc-600 dark:text-zinc-300">Toggle your microphone connection to process answers.</p>
          </div>

          {/* Mic Button with Pulse Ring */}
          <div className="relative w-44 h-44 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden">
            {isListening && (
              <div
                className="absolute w-36 h-36 border-2 border-indigo-500/30 rounded-full animate-ping"
                style={{ animationDuration: '2s' }}
                aria-hidden="true"
              />
            )}
            
            <button
              onClick={toggleMic}
              disabled={isProcessing || isWrapUp}
              aria-label={isListening ? 'Deactivate microphone input stream' : 'Activate microphone input stream'}
              className={`w-28 h-28 rounded-full flex items-center justify-center relative z-10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isListening
                  ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 dark:shadow-indigo-600/20'
              }`}
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isListening ? "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" : "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"} />
              </svg>
            </button>
          </div>

          <div className="w-full text-center">
            <span className="text-xs font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-widest block">MICROPHONE STATUS</span>
            <div className="mt-2 text-base font-semibold" role="status">
              {isWrapUp ? (
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">Interview Complete</span>
              ) : isProcessing ? (
                <span className="text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5 text-base font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" aria-hidden="true" /> Processing Response...
                </span>
              ) : isListening ? (
                <span className="text-emerald-600 dark:text-emerald-450 flex items-center justify-center gap-1.5 text-base font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" aria-hidden="true" /> Listening...
                </span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400 text-base">Microphone Off</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}