import { useEffect, useRef } from "react";

import { audioGraph } from "../lib/audioGraph";

/** Frequency-bar visualizer fed by the player's shared AnalyserNode.
 *  Renders nothing under prefers-reduced-motion. */
export function Visualizer({ className, bars = 56 }: { className?: string; bars?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-emerald-500")
      .trim() || "#10b981";
    let raf = 0;
    const data = new Uint8Array(1024);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const analyser = audioGraph.analyser;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      if (!analyser || width === 0) return;
      if (canvas.width !== width * devicePixelRatio) {
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
      }
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(data);
      const usable = Math.floor(data.length * 0.7); // drop the near-silent top end
      const barWidth = width / bars;
      context.fillStyle = accent;
      context.globalAlpha = 0.85;
      for (let index = 0; index < bars; index++) {
        const start = Math.floor((index / bars) * usable);
        const end = Math.floor(((index + 1) / bars) * usable);
        let peak = 0;
        for (let i = start; i < end; i++) if (data[i] > peak) peak = data[i];
        const barHeight = Math.max(2, (peak / 255) * height);
        context.fillRect(
          index * barWidth,
          height - barHeight,
          Math.max(1, barWidth - 2),
          barHeight,
        );
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bars, reduced]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
