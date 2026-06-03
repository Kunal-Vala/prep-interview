'use client';

import { useRef, useCallback, useEffect } from 'react';

interface VADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  silenceThresholdMs?: number;
  volumeThreshold?: number;
  onVolumeTick?: (rms: number) => void;
}

export function useVAD({
  onSpeechStart,
  onSpeechEnd,
  silenceThresholdMs = 1500,
  volumeThreshold = 0.015,
  onVolumeTick,
}: VADOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  
  // Safely persist hot event callbacks to prevent hook dependency thrashing
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd, onVolumeTick });
  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd, onVolumeTick };
  }, [onSpeechStart, onSpeechEnd, onVolumeTick]);

  const getRMS = (buffer: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  };

  const startAnalysis = useCallback(async (stream: MediaStream) => {
    // Prevent duplicate context instantiation bugs
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = ctx;

    // Handle Chrome's strict autoplay policy restrictions
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const buffer = new Float32Array(analyser.fftSize);

    const tick = () => {
      // FIX: Clean safety check using the parent audio context state
      if (audioContextRef.current?.state === 'closed') return;
      
      analyser.getFloatTimeDomainData(buffer);
      const rms = getRMS(buffer);

      // Stream high-frequency metrics cleanly outside of React's state loop
      if (callbacksRef.current.onVolumeTick) {
        callbacksRef.current.onVolumeTick(rms);
      }

      if (rms > volumeThreshold) {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          callbacksRef.current.onSpeechStart();
        }
      } else if (isSpeakingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          isSpeakingRef.current = false;
          silenceTimerRef.current = null;
          callbacksRef.current.onSpeechEnd();
        }, silenceThresholdMs);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceThresholdMs, volumeThreshold]);

  const stopAnalysis = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    isSpeakingRef.current = false;
  }, []);

  // Structural unmount cleanup protection guarantee
  useEffect(() => {
    return () => stopAnalysis();
  }, [stopAnalysis]);

  return { startAnalysis, stopAnalysis };
}