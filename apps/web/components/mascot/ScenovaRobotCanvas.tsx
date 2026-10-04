"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ScenovaMascot.module.css";

export function ScenovaRobotCanvas({ engaged }: { engaged: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engagedRef = useRef(engaged);
  const [ready, setReady] = useState(false);
  useEffect(() => { engagedRef.current = engaged; }, [engaged]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    // Keep Three.js out of the dashboard's initial JavaScript chunk.
    void import("./scenova-robot-scene").then(({ createRobotScene }) => {
      if (cancelled) return;
      const robot = createRobotScene(canvas);
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let visible = true;
      let lost = false;
      let frame = 0;
      let timer = 0;
      let time = 0;
      let announced = false;
      let previous = performance.now();
      const stop = () => {
        window.clearTimeout(timer);
        window.cancelAnimationFrame(frame);
      };
      const draw = () => {
        if (cancelled || lost || document.hidden || !visible) return;
        const now = performance.now();
        time += Math.min((now - previous) / 1000, 0.1);
        previous = now;
        robot.render(time, engagedRef.current, motion.matches);
        if (!announced) { announced = true; setReady(true); }
        if (!motion.matches) {
          // Limit GPU work to 30 fps; don't re-render the React dashboard per frame.
          timer = window.setTimeout(() => { frame = window.requestAnimationFrame(draw); }, 1000 / 30);
        }
      };
      const resume = () => {
        stop();
        previous = performance.now();
        draw();
      };
      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        if (width && height) robot.resize(width, height);
        resume();
      };
      const onLost = (event: Event) => {
        event.preventDefault();
        lost = true;
        announced = false;
        stop();
        setReady(false);
      };
      const onRestored = () => { lost = false; resize(); };
      const observer = new ResizeObserver(resize);
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        resume();
      });
      cleanup = () => {
        stop();
        observer.disconnect();
        intersection.disconnect();
        motion.removeEventListener("change", resume);
        document.removeEventListener("visibilitychange", resume);
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        robot.dispose();
      };
      observer.observe(canvas);
      intersection.observe(canvas);
      motion.addEventListener("change", resume);
      document.addEventListener("visibilitychange", resume);
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      resize();
    }).catch(() => {
      cleanup?.();
      if (!cancelled) setReady(false);
    });
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return (
    <span className={styles.robot} aria-hidden="true">
      {/* A local, lightweight fallback keeps the launcher usable without WebGL. */}
      {!ready && (
        <svg className={styles.fallback} viewBox="0 0 160 180" fill="none">
          <defs>
            <linearGradient id="scenova-shell" x1="30" y1="20" x2="133" y2="160" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fff" /><stop offset="1" stopColor="#a3aecb" />
            </linearGradient>
          </defs>
          <rect x="52" y="137" width="25" height="26" rx="10" fill="url(#scenova-shell)" />
          <rect x="84" y="137" width="25" height="26" rx="10" fill="url(#scenova-shell)" />
          <rect x="42" y="94" width="17" height="40" rx="8" fill="url(#scenova-shell)" transform="rotate(15 42 94)" />
          <rect x="103" y="94" width="17" height="40" rx="8" fill="url(#scenova-shell)" transform="rotate(-15 103 94)" />
          <rect x="51" y="93" width="59" height="51" rx="22" fill="url(#scenova-shell)" />
          <path d="m81 105-13 8v8l13 8 12-8v-8z" fill="#10182d" stroke="#5ee5ff" strokeWidth="3" />
          <rect x="16" y="38" width="22" height="39" rx="11" fill="#5b4aaa" />
          <rect x="122" y="38" width="22" height="39" rx="11" fill="#5b4aaa" />
          <rect x="26" y="19" width="108" height="84" rx="31" fill="url(#scenova-shell)" />
          <rect x="35" y="32" width="90" height="59" rx="22" fill="#10182d" />
          <path d="M49 62q10-20 20 0m22 0q10-20 20 0" stroke="#66eaff" strokeWidth="6" strokeLinecap="round" />
          <path d="M73 73q7 16 14 0" fill="#66eaff" />
          <path d="M67 23h26" stroke="#66eaff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )}
      <canvas ref={canvasRef} className={styles.canvas} style={{ opacity: ready ? 1 : 0 }} />
    </span>
  );
}
