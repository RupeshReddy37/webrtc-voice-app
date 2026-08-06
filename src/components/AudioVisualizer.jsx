// src/components/AudioVisualizer.jsx
// Web Audio API frequency-bar visualizer (canvas), ported from
// public/js/visualizer.js. Renders the live microphone spectrum.
import { useEffect, useRef } from 'react';

export default function AudioVisualizer({ stream, active = true, barColor = '#38bdf8', accentColor = '#818cf8' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!stream || !active) return undefined;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return undefined;

    const audioCtx = new AudioContext();
    // Resume in case the context was created outside a user gesture
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const barCount = 48;
      const gap = w * 0.006;
      const barW = (w - gap * (barCount - 1)) / barCount;
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(1, accentColor);

      for (let i = 0; i < barCount; i += 1) {
        const idx = Math.floor((i / barCount) * data.length * 0.6);
        const v = data[idx] / 255;
        const barH = Math.max(4, v * h);
        const x = i * (barW + gap);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.45 + v * 0.55;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, h - barH, barW, barH, barW / 2);
        } else {
          ctx.rect(x, h - barH, barW, barH);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        audioCtx.close();
      } catch (e) {
        /* ignore */
      }
    };
  }, [stream, active, barColor, accentColor]);

  return <canvas ref={canvasRef} className="audio-visualizer" aria-hidden="true" />;
}
