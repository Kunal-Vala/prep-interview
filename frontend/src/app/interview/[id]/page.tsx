/* cspell:words timeslice */
'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useInterviewStore } from '@/store/interviewStore';
import { useInterviewSocket } from '@/hooks/useInterviewSocket';
import { useSpeechRecognition, SpeechRecognitionErrorEvent } from '@/hooks/useSpeechRecognition';
import { useVAD } from '@/hooks/useVAD';

export default function InterviewRoomPage() {
  const { id: sessionId } = useParams() as { id: string };
  const { token, loading } = useAuth();
  const router = useRouter();

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

  const [micActive, setMicActive] = useState(false);
  const [rmsVolume, setRmsVolume] = useState(0);
  const [textInput, setTextInput] = useState('');
  const wasMicActiveRef = useRef(false);

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

  const handleVolumeTick = useCallback((rms: number) => {
    setRmsVolume(rms);
  }, []);

  // Speech Recognition Event Node
  const { startListening, stopListening } = useSpeechRecognition({
    onResult: useCallback((text: string) => {
      setTextInput(text);
    }, []),
    onEnd: useCallback((finalText: string) => {
      console.log('[SpeechRecognition] Final text captured:', finalText);
      if (finalText.trim() && currentQuestion?.questionId) {
        const store = useInterviewStore.getState();
        if (!store.isProcessing) {
          store.setProcessing(true);
          sendTextMessage(finalText.trim());
          setTextInput('');
        }
      }
    }, [currentQuestion, sendTextMessage]),
    onError: useCallback((event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] Error event:', event);
      if (event.error === 'not-allowed') {
        setGlobalError('Microphone access denied. Please verify system/browser permissions.');
      } else if (event.error !== 'aborted') {
        setGlobalError(`Speech recognition failed: ${event.error}. Please try again.`);
      }
    }, [setGlobalError]),
  });

  // VAD Audio Engine Initialization Node
  const { startAnalysis, stopAnalysis } = useVAD({
    onSpeechStart: useCallback(() => console.log('[VAD] Speech Start Detected'), []),
    onSpeechEnd: useCallback(() => {
      console.log('[VAD] Silence detected (1500ms threshold reached). Finalizing speech...');
      stopListening(); // Trigger SpeechRecognition end & submission
    }, [stopListening]),
    onVolumeTick: handleVolumeTick,
    silenceThresholdMs: 1500,
    volumeThreshold: 0.01,
  });

  const toggleMic = async () => {
    if (isProcessing) return;
    if (micActive) {
      stopListening();
      stopAnalysis();
      setMicActive(false);
      setRmsVolume(0);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        await startAnalysis(stream);
        startListening();
        setMicActive(true);
      } catch { 
        setGlobalError('Hardware microphone configuration failed. Verify system permissions.');
      }
    }
  };

  const handleSendText = () => {
    if (!textInput.trim() || isProcessing) return;
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

  // Automatically mute/deactivate mic when processing begins, and restore when it ends
  useEffect(() => {
    if (isProcessing) {
      if (micActive) {
        wasMicActiveRef.current = true;
        stopListening();
        stopAnalysis();
        setTimeout(() => {
          setMicActive(false);
          setRmsVolume(0);
        }, 0);
      }
    } else {
      if (wasMicActiveRef.current && !micActive) {
        wasMicActiveRef.current = false;
        // Reactivate mic
        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
            await startAnalysis(stream);
            startListening();
            setTimeout(() => {
              setMicActive(true);
            }, 0);
          } catch {
            setGlobalError('Hardware microphone configuration failed. Verify system permissions.');
          }
        })();
      }
    }
  }, [isProcessing, micActive, stopListening, stopAnalysis, startListening, startAnalysis, setGlobalError]);

  // Safe unmount context cleanup lifecycle ring
  useEffect(() => {
    return () => {
      stopListening();
      stopAnalysis();
      resetStore();
    };
  }, [stopListening, stopAnalysis, resetStore]);

  // Session Close Navigation Monitor
  useEffect(() => {
    if (sessionClosed) {
      router.push(`/feedback/${sessionId}`);
    }
  }, [sessionClosed, sessionId, router]);

  // Memoized performance styles for animated visual loops
  const scaleStyle = useMemo(() => ({
    transform: `scale(${1 + rmsVolume * 2.0})`,
    opacity: Math.max(0.05, 0.4 - rmsVolume),
  }), [rmsVolume]);

  if (loading || !token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
        <span className="text-zinc-500 animate-pulse text-sm font-semibold tracking-wider">INITIALIZING STREAM GATEWAY...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none">
      {/* Top Application Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <span className="text-base px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded font-bold font-mono">LIVE ASSESSOR STREAM</span>
          <span className="text-base text-zinc-300 font-mono">ROOM_ID: {sessionId.toUpperCase()}</span>
        </div>
        <button
          onClick={() => endSession()}
          className="px-5 py-2.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-900/40 text-base font-bold text-red-400 transition-colors cursor-pointer animate-fade-in"
        >
          Wrap Session
        </button>
      </header>

      {/* Main Execution Framework Layout Box */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-6xl w-full mx-auto px-6 py-8 gap-6 h-[calc(100vh-140px)]">
        
        {/* Left Column: Live Transcript stream */}
        <main className="flex-1 flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden h-full">
          {/* Complies with accessible standards using role configuration and polite notification profiles */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6" role="log" aria-live="polite">
            {transcript.length === 0 && (
              <div className="h-full flex items-center justify-center text-center text-zinc-400 text-base">
                Awaiting connection framework initialization pipeline...
              </div>
            )}
            
            {transcript.map((msg, idx) => (
              <article
                key={idx}
                className={`flex flex-col max-w-[80%] ${msg.role === 'candidate' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                  {msg.role === 'candidate' ? 'Candidate (You)' : 'Interviewer'}
                </span>
                <div
                  className={`px-4 py-3 rounded-2xl text-base leading-relaxed border ${
                    msg.role === 'candidate'
                      ? 'bg-zinc-950 border-zinc-850 text-zinc-50'
                      : 'bg-indigo-600/5 border-indigo-500/20 text-indigo-100'
                  }`}
                >
                  {msg.content}
                </div>
              </article>
            ))}

            {streamingText && (
              <div className="flex flex-col max-w-[80%] items-start mr-auto">
                <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-1.5 animate-pulse">
                  Interviewer Synthesizing Response...
                </span>
                <div className="px-4 py-3 rounded-2xl text-base leading-relaxed border bg-indigo-600/5 border-indigo-500/20 text-indigo-100">
                  {streamingText}
                  <span className="inline-block w-1.5 h-3.5 bg-indigo-500 animate-pulse ml-0.5 align-middle" aria-hidden="true" />
                </div>
              </div>
            )}

            {isProcessing && !streamingText && (
              <div className="flex flex-col max-w-[80%] items-start mr-auto">
                <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-1.5 animate-pulse">
                  Interviewer is transcribing & thinking...
                </span>
                <div className="px-4 py-3 rounded-2xl text-base leading-relaxed border bg-zinc-900 border-zinc-850 text-zinc-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Localized Error Banner Overlay */}
          {globalError && (
            <div role="alert" className="p-4 bg-red-950/30 border-t border-red-900/40 text-sm text-red-400 flex items-center justify-between">
              <span>{globalError}</span>
              <button onClick={() => setGlobalError(null)} className="text-zinc-400 hover:text-zinc-200 font-bold font-mono cursor-pointer">Dismiss</button>
            </div>
          )}

          {/* Text Mode Input Area */}
          <div className="p-4 border-t border-zinc-800 flex gap-3 items-end">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? "Processing response..." : "Type your answer here..."}
              disabled={isProcessing}
              rows={2}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendText}
              disabled={!textInput.trim() || isProcessing}
              className="px-6 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </main>

        {/* Right Column: Hardware Audio Telemetry Context Console */}
        <aside className="w-full md:w-80 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col items-center justify-between gap-8 h-full md:h-auto">
          <div className="w-full text-center">
            <h2 className="font-extrabold text-zinc-100 text-2xl mb-1.5">Audio Controls</h2>
            <p className="text-base text-zinc-300">Toggle your microphone connection to process answers.</p>
          </div>

          {/* Pulsing Visual Wave Mapper Nodes */}
          <div className="relative w-44 h-44 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden">
            {micActive && (
              <div
                style={scaleStyle}
                className="absolute w-36 h-36 border-2 border-indigo-500/30 rounded-full transition-transform duration-75 ease-out"
                aria-hidden="true"
              />
            )}
            
            <button
              onClick={toggleMic}
              disabled={isProcessing}
              aria-label={micActive ? 'Deactivate microphone input stream' : 'Activate microphone input stream'}
              className={`w-28 h-28 rounded-full flex items-center justify-center relative z-10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                micActive
                  ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
              }`}
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={micActive ? "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" : "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"} />
              </svg>
            </button>
          </div>

          <div className="w-full text-center">
            <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest block">TELEMETRY MONITOR STATUS</span>
            <div className="mt-2 text-base font-semibold" role="status">
              {isProcessing ? (
                <span className="text-indigo-400 flex items-center justify-center gap-1.5 text-base font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" aria-hidden="true" /> Processing Response...
                </span>
              ) : micActive ? (
                <span className="text-emerald-400 flex items-center justify-center gap-1.5 text-base font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" aria-hidden="true" /> Audio Stream Online
                </span>
              ) : (
                <span className="text-zinc-400 text-base">Audio Stream Offline</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}