"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface AudioRecorderOptions {
  onChunk: (chunk: Blob) => void;
  timesliceMs?: number;
}

export function useAudioRecorder({
  onChunk,
  timesliceMs = 250,
}: AudioRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const steamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Safely persist the latest onChunk callback to prevent hook dependency thrashing
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const getSupportedMimeType = useCallback((): string => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
    ];

    for (const type of types) {
      if (
        typeof window !== "undefined" &&
        MediaRecorder.isTypeSupported?.(type)
      ) {
        return type;
      }
    }
    return ""; // Fallback to browser defaults if all else fails
  }, []);

  const startRecording = useCallback(async (): Promise<MediaStream> => {
    // IF Already Active
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      return steamRef.current!;
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

      steamRef.current = stream;
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
      console.error(
        "[AudioRecorder SDK] Failed to establish safe hardware stream access:",
        error,
      );
      throw error;
    }
  }, [timesliceMs, getSupportedMimeType]);
}
