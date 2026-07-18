import { useQuery } from "@tanstack/react-query";
import { type PointerEvent, useEffect, useRef } from "react";

import { getWaveform } from "../api/catalog";

interface WaveformSeekbarProps {
  trackId: number;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** CSS height in pixels of the drawn waveform. */
  height?: number;
  className?: string;
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** SoundCloud-style seekbar drawn from the track's waveform peaks; falls
 *  back to a plain range input while loading or when ffmpeg is missing. */
export function WaveformSeekbar({
  trackId,
  currentTime,
  duration,
  onSeek,
  height = 28,
  className,
}: WaveformSeekbarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const waveform = useQuery({
    queryKey: ["waveform", trackId],
    queryFn: () => getWaveform(trackId),
    staleTime: Infinity,
    retry: false,
  });
  const peaks = waveform.data?.peaks;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !peaks || peaks.length === 0) return;
    const width = canvas.offsetWidth;
    if (width === 0) return;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const accent = cssColor("--color-emerald-500", "#10b981");
    const rest = cssColor("--color-zinc-700", "#3f3f46");
    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const barWidth = width / peaks.length;
    const gap = Math.min(1, barWidth * 0.25);
    const middle = height / 2;

    for (let index = 0; index < peaks.length; index++) {
      const barHeight = Math.max(2, peaks[index] * (height - 2));
      context.fillStyle = (index + 0.5) / peaks.length <= progress ? accent : rest;
      context.fillRect(
        index * barWidth,
        middle - barHeight / 2,
        Math.max(1, barWidth - gap),
        barHeight,
      );
    }
  }, [peaks, currentTime, duration, height]);

  const seekFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(fraction * (duration || 0));
  };

  if (!peaks || peaks.length === 0) {
    return (
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.5}
        value={Math.min(currentTime, duration || 1)}
        onChange={(event) => onSeek(Number(event.target.value))}
        className={`h-1 cursor-pointer ${className ?? ""}`}
        aria-label="Seek"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className={`w-full cursor-pointer ${className ?? ""}`}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) seekFromEvent(event);
      }}
      onPointerUp={(event) => {
        draggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
