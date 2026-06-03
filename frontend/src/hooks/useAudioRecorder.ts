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
  const [isRecording, setRecording] = useState(false);

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

  

}
