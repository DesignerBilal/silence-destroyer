import React, { useRef, useEffect } from 'react';

interface WaveformProps {
  buffer: AudioBuffer;
  color?: string;
  height?: number;
  className?: string;
}

export function Waveform({ buffer, color = '#3b82f6', height = 80, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, amp + min * amp);
      ctx.lineTo(i, amp + max * amp);
    }
    ctx.stroke();
  }, [buffer, color, height]);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={height}
      className={className}
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    />
  );
}
