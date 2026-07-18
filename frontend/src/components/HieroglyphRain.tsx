import { useEffect, useRef } from "react";

/** Matrix-style rain of hand-drawn Egyptian glyphs (ankh, eye, water,
 *  pyramid, sun disc, djed, reed). Colors follow the active theme via the
 *  Tailwind CSS variables, so it works with every palette. */

const CELL = 26;

type Column = { x: number; y: number; speed: number };

// Each glyph is drawn inside a 10x10 box centred on (0,0)
const GLYPHS: ((c: CanvasRenderingContext2D) => void)[] = [
  (c) => {
    // ankh
    c.beginPath();
    c.arc(0, -3, 2.4, 0, 7);
    c.moveTo(0, -0.6);
    c.lineTo(0, 5);
    c.moveTo(-3, 1.4);
    c.lineTo(3, 1.4);
    c.stroke();
  },
  (c) => {
    // eye of Horus
    c.beginPath();
    c.moveTo(-4, 0);
    c.quadraticCurveTo(0, -4.4, 4, 0);
    c.quadraticCurveTo(0, 4.4, -4, 0);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 1.3, 0, 7);
    c.stroke();
  },
  (c) => {
    // water
    c.beginPath();
    c.moveTo(-4, -2);
    c.lineTo(-2, -4);
    c.lineTo(0, -2);
    c.lineTo(2, -4);
    c.lineTo(4, -2);
    c.moveTo(-4, 2);
    c.lineTo(-2, 0);
    c.lineTo(0, 2);
    c.lineTo(2, 0);
    c.lineTo(4, 2);
    c.stroke();
  },
  (c) => {
    // pyramid
    c.beginPath();
    c.moveTo(0, -4);
    c.lineTo(4.4, 3.6);
    c.lineTo(-4.4, 3.6);
    c.closePath();
    c.stroke();
  },
  (c) => {
    // sun disc
    c.beginPath();
    c.arc(0, 0, 3.4, 0, 7);
    c.moveTo(1.2, 0);
    c.arc(0, 0, 1.2, 0, 7);
    c.stroke();
  },
  (c) => {
    // djed pillar
    c.beginPath();
    c.moveTo(0, -4);
    c.lineTo(0, 5);
    for (let y = -3; y <= 0; y += 1.6) {
      c.moveTo(-3, y);
      c.lineTo(3, y);
    }
    c.stroke();
  },
  (c) => {
    // reed
    c.beginPath();
    c.moveTo(0, 5);
    c.lineTo(0, -1);
    c.quadraticCurveTo(-3, -3, 0, -5);
    c.quadraticCurveTo(3, -3, 0, -1);
    c.stroke();
  },
];

export function HieroglyphRain({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--color-emerald-500").trim() || "#10b981";
    const backdrop = styles.getPropertyValue("--color-zinc-950").trim() || "#09090b";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let columns: Column[] = [];
    let raf = 0;
    let last = 0;

    const newSpeed = () => 40 + Math.random() * 90;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      canvas.width = box.width * devicePixelRatio;
      canvas.height = box.height * devicePixelRatio;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      columns = Array.from({ length: Math.ceil(box.width / CELL) }, (_, index) => ({
        x: index * CELL + CELL / 2,
        y: Math.random() * box.height,
        speed: newSpeed(),
      }));
      context.globalAlpha = 1;
      context.fillStyle = backdrop;
      context.fillRect(0, 0, box.width, box.height);
    };

    const drawGlyph = (x: number, y: number, alpha: number) => {
      context.save();
      context.translate(x, y);
      context.lineWidth = 1.4;
      context.lineCap = "round";
      context.globalAlpha = alpha;
      context.strokeStyle = accent;
      context.shadowColor = accent;
      context.shadowBlur = alpha > 0.6 ? 8 : 0;
      GLYPHS[(Math.random() * GLYPHS.length) | 0](context);
      context.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const box = canvas.getBoundingClientRect();
      context.globalAlpha = 0.16;
      context.fillStyle = backdrop;
      context.fillRect(0, 0, box.width, box.height);
      context.globalAlpha = 1;
      for (const column of columns) {
        column.y += column.speed * dt;
        if (column.y > box.height + CELL) {
          column.y = -CELL;
          column.speed = newSpeed();
        }
        if (Math.random() < 0.5) drawGlyph(column.x, column.y, 0.8);
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduced) {
      // A static field instead of animation
      const box = canvas.getBoundingClientRect();
      for (const column of columns) {
        for (let y = CELL; y < box.height; y += CELL) {
          if (Math.random() < 0.3) drawGlyph(column.x, y, 0.1 + Math.random() * 0.4);
        }
      }
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
