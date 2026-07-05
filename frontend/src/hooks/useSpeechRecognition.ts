'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: {
    transcript: string;
  };
}

export interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface UseSpeechRecognitionOptions {
  onResult?: (text: string, isFinal: boolean) => void;
  onEnd?: (finalText: string) => void;
  onError?: (event: SpeechRecognitionErrorEvent) => void;
  lang?: string;
}

type SpeechRecognitionClass = new () => SpeechRecognitionInstance;

function getSpeechRecognitionClass(): SpeechRecognitionClass | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionClass }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionClass }).webkitSpeechRecognition ??
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN: "Session Rotation" strategy
//
// Chrome's webkitSpeechRecognition has a hard ~60s session limit and can
// silently freeze. Instead of waiting for Chrome to kill the session and
// HOPING the restart works, we proactively rotate sessions:
//
//  1. After each "isFinal" segment (natural sentence pause) → rotate
//  2. Hard cap at 20 seconds per session → force rotate
//  3. Watchdog: 10 seconds with zero results → force rotate
//
// Each rotation creates a brand-new SpeechRecognition instance.
// All final text is accumulated in `accumulatedRef` across rotations.
// `isListening` stays TRUE during rotation gaps so React effects don't fire.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SESSION_MS = 20_000;   // Rotate before Chrome's ~60s limit
const WATCHDOG_MS = 10_000;      // Force rotate if no results for 10s
const MIN_SESSION_MS = 2_000;    // Don't rotate too fast after isFinal
const RESTART_DELAY_MS = 80;     // Gap between sessions during rotation
const MAX_RAPID_FAILS = 5;       // Give up after 5 consecutive instant failures

export function useSpeechRecognition({
  onResult,
  onEnd,
  onError,
  lang = 'en-US',
}: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);

  // Stable callback refs
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onResult, onEnd, onError]);

  // Cross-session accumulated final text
  const accumulatedRef = useRef('');

  // User intent flag
  const wantStopRef = useRef(true);

  // Active recognition instance
  const activeRef = useRef<SpeechRecognitionInstance | null>(null);

  // Timers
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Failure tracking
  const failCountRef = useRef(0);

  const launchSessionRef = useRef<() => void>(() => {});

  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // ── Timer helpers ──────────────────────────────────────────────────────

  const clearAllTimers = useCallback(() => {
    for (const ref of [restartTimerRef, watchdogTimerRef, maxDurationTimerRef, rotationTimerRef]) {
      if (ref.current) { clearTimeout(ref.current); ref.current = null; }
    }
  }, []);

  const resetWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
    if (wantStopRef.current) return;
    watchdogTimerRef.current = setTimeout(() => {
      watchdogTimerRef.current = null;
      if (!wantStopRef.current && activeRef.current) {
        console.log('[STT] Watchdog: no results for 10s → rotating');
        try { activeRef.current.abort(); } catch { /* onend handles restart */ }
      }
    }, WATCHDOG_MS);
  }, []);

  // ── Core session launcher ─────────────────────────────────────────────

  const launchSession = useCallback(() => {
    const Cls = getSpeechRecognitionClass();
    if (!Cls || wantStopRef.current) return;

    const rec = new Cls();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langRef.current;

    const sessionStart = Date.now();

    rec.onstart = () => {
      failCountRef.current = 0;
      resetWatchdog();

      // Schedule forced rotation at MAX_SESSION_MS
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = setTimeout(() => {
        maxDurationTimerRef.current = null;
        if (!wantStopRef.current && activeRef.current === rec) {
          console.log('[STT] Max session duration → rotating');
          try { rec.stop(); } catch { try { rec.abort(); } catch { /* ignore */ } }
        }
      }, MAX_SESSION_MS);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      resetWatchdog();

      let interim = '';
      let gotFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const sep = accumulatedRef.current ? ' ' : '';
          accumulatedRef.current += sep + text.trim();
          gotFinal = true;
        } else {
          interim += text;
        }
      }

      // Push combined text to the UI
      const combined = (accumulatedRef.current + (interim ? ' ' + interim : '')).trim();
      onResultRef.current?.(combined, interim === '');

      // ── Proactive rotation after a final segment ──
      // Only if session has been alive for at least MIN_SESSION_MS to avoid
      // rapid rotation loops when Chrome sends quick consecutive finals
      if (gotFinal && !wantStopRef.current && activeRef.current === rec) {
        const age = Date.now() - sessionStart;
        if (age >= MIN_SESSION_MS) {
          // Cancel any existing rotation timer
          if (rotationTimerRef.current) clearTimeout(rotationTimerRef.current);
          // Defer stop to next tick to let Chrome finish its internal bookkeeping
          rotationTimerRef.current = setTimeout(() => {
            rotationTimerRef.current = null;
            if (!wantStopRef.current && activeRef.current === rec) {
              console.log('[STT] Final segment received → rotating');
              try { rec.stop(); } catch { /* onend handles restart */ }
            }
          }, 50);
        }
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Critical errors — stop everything
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        console.error('[STT] Critical error:', event.error);
        wantStopRef.current = true;
        onErrorRef.current?.(event);
        return;
      }
      // 'no-speech', 'aborted', and 'network' are expected during session
      // rotations and stops — Chrome drops its WebSocket to Google's speech
      // servers and fires these. The rotation mechanism handles recovery.
      if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'network') {
        onErrorRef.current?.(event);
      }
    };

    rec.onend = () => {
      activeRef.current = null;
      if (maxDurationTimerRef.current) { clearTimeout(maxDurationTimerRef.current); maxDurationTimerRef.current = null; }

      // ── User wants to stop → deliver final text ──
      if (wantStopRef.current) {
        clearAllTimers();
        setIsListening(false);
        const text = accumulatedRef.current.trim();
        accumulatedRef.current = '';
        onEndRef.current?.(text);
        return;
      }

      // ── Auto-restart (rotation) ──
      const sessionDuration = Date.now() - sessionStart;
      if (sessionDuration < 500) {
        failCountRef.current++;
      }

      if (failCountRef.current >= MAX_RAPID_FAILS) {
        console.warn('[STT] Too many rapid failures → stopping');
        wantStopRef.current = true;
        clearAllTimers();
        setIsListening(false);
        const text = accumulatedRef.current.trim();
        accumulatedRef.current = '';
        onEndRef.current?.(text);
        return;
      }

      // isListening stays TRUE — no flicker during rotation gap
      const delay = Math.min(RESTART_DELAY_MS * (1 + failCountRef.current), 400);
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!wantStopRef.current) {
          launchSessionRef.current();
        }
      }, delay);
    };

    activeRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      console.warn('[STT] start() failed:', err);
      activeRef.current = null;
      failCountRef.current++;

      if (!wantStopRef.current && failCountRef.current < MAX_RAPID_FAILS) {
        const delay = Math.min(200 * failCountRef.current, 1000);
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (!wantStopRef.current) launchSessionRef.current();
        }, delay);
      }
    }
  }, [clearAllTimers, resetWatchdog]);

  useEffect(() => {
    launchSessionRef.current = launchSession;
  }, [launchSession]);

  // ── Public API ────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    clearAllTimers();
    accumulatedRef.current = '';
    failCountRef.current = 0;
    wantStopRef.current = false;

    if (activeRef.current) {
      const old = activeRef.current;
      activeRef.current = null;
      try { old.abort(); } catch { /* ignore */ }
      setIsListening(true);
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!wantStopRef.current) launchSession();
      }, 150);
    } else {
      setIsListening(true);
      launchSession();
    }
  }, [launchSession, clearAllTimers]);

  const stopListening = useCallback(() => {
    wantStopRef.current = true;
    failCountRef.current = 0;
    clearAllTimers();

    if (activeRef.current) {
      try {
        activeRef.current.stop(); // triggers onend → delivers text
      } catch {
        try { activeRef.current.abort(); } catch { /* ignore */ }
      }
    } else {
      setIsListening(false);
      const text = accumulatedRef.current.trim();
      accumulatedRef.current = '';
      if (text) onEndRef.current?.(text);
    }
  }, [clearAllTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantStopRef.current = true;
      clearAllTimers();
      try { activeRef.current?.abort(); } catch { /* ignore */ }
    };
  }, [clearAllTimers]);

  return {
    startListening,
    stopListening,
    isListening,
    isSupported: !!getSpeechRecognitionClass(),
  };
}
