import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { OceanEngine } from './engine';
import type { SharkSpec } from './world';
import './KoiPond.css';

type KoiPondProps = {
  className?: string;
  sharks?: SharkSpec[];
};

/**
 * ASCII koi pond hero background.
 * Adapted from stackedlol/ascii-sharks (MIT) — see ./LICENSE.
 */
export function KoiPond({ className, sharks }: KoiPondProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OceanEngine | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const engine = new OceanEngine(canvas, sharks);
    engineRef.current = engine;
    engine.setTheme(theme === 'light');

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // Roster is fixed for the life of the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setTheme(theme === 'light');
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`koi-pond ${className ?? ''}`.trim()}
    />
  );
}

export default KoiPond;
