'use client';

import { useRef, useCallback, useState, useEffect } from 'react';

interface AudioRecorderOptions {
  onChunk: (chunk: Blob) => void;
  timesliceMs?: number;
}

export function useAudioRecorder({
  onChunk,
  timesliceMs = 250,
}: AudioRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Safely persist the latest onChunk callback to prevent hook dependency thrashing
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  // Determine the best supported codec at runtime to guarantee cross-browser safety
  const getSupportedMimeType = useCallback((): string => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/aac',
    ];

    for (const type of types) {
      if (typeof window !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
        return type;
      }
    }
    return ''; // Fallback to browser defaults if all else fails
  }, []);

  const startRecording = useCallback(async (): Promise<MediaStream> => {
    // If already active, act defensively and return the current stream context
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      return streamRef.current!;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, 
          channelCount: 1,   
        },
      });

      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          onChunkRef.current(e.data);
        }
      };

      recorder.start(timesliceMs);
      setIsRecording(true);
      return stream;
    } catch (error) {
      console.error('[AudioRecorder SDK] Failed to establish safe hardware stream access:', error);
      throw error;
    }
  }, [timesliceMs, getSupportedMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        if (track.enabled) track.stop();
      });
    }
    setIsRecording(false);
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
  }, []);

  // Cleanup effect: If component unmounts unexpectedly, kill hardware instantly!
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return { startRecording, stopRecording, pauseRecording, resumeRecording, isRecording };
}