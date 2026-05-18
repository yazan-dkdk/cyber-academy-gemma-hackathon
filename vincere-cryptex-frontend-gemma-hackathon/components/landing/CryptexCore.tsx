"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const particleStyles = Array.from({ length: 46 }, (_, index) => {
  const x = 6 + ((index * 29) % 88);
  const y = 8 + ((index * 47) % 82);
  const size = 1.8 + (index % 5) * 0.75;
  const driftX = ((index % 9) - 4) * 0.5;
  const driftY = (((index * 2) % 11) - 5) * 0.42;
  const depth = 0.52 + (index % 6) * 0.12;

  return {
    "--particle-x": `${x}%`,
    "--particle-y": `${y}%`,
    "--particle-size": `${size}px`,
    "--particle-opacity": `${0.24 + (index % 5) * 0.09}`,
    "--particle-delay": `${index * -0.23}s`,
    "--particle-duration": `${5.8 + (index % 6) * 0.7}s`,
    "--particle-drift-x": `${driftX}rem`,
    "--particle-drift-y": `${driftY}rem`,
    "--particle-depth": `${depth}`,
    "--particle-parallax-x": `${-2.1 * depth}rem`,
    "--particle-parallax-y": `${-1.25 * depth}rem`,
  } as CSSProperties;
});

const orbitDots = Array.from({ length: 14 }, (_, index) => ({
  "--dot-angle": `${index * (360 / 14)}deg`,
  "--dot-delay": `${index * -0.16}s`,
} as CSSProperties));

export function CryptexCore() {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const tick = () => {
      const stage = stageRef.current;
      const current = currentRef.current;
      const target = targetRef.current;

      current.x += (target.x - current.x) * 0.11;
      current.y += (target.y - current.y) * 0.11;

      if (stage) {
        stage.style.setProperty("--mouse-x", current.x.toFixed(3));
        stage.style.setProperty("--mouse-y", current.y.toFixed(3));
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    };
  };

  const handlePointerLeave = () => {
    targetRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={stageRef}
      className="cryptex-hero-stage"
      style={{ "--mouse-x": 0, "--mouse-y": 0 } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div className="cryptex-bg-layer" />
      <div className="cryptex-depth cryptex-depth--back" />
      <div className="cryptex-light-core" />
      <div className="cryptex-base-platform">
        <span />
        <span />
        <span />
      </div>

      <div className="cryptex-orbit-field cryptex-orbit-field--behind">
        <span className="cryptex-orbit cryptex-orbit--one">
          {orbitDots.slice(0, 6).map((style, index) => (
            <i key={`behind-one-${index}`} style={style} />
          ))}
        </span>
        <span className="cryptex-orbit cryptex-orbit--two">
          {orbitDots.slice(2, 10).map((style, index) => (
            <i key={`behind-two-${index}`} style={style} />
          ))}
        </span>
      </div>

      <div className="cryptex-artifact-shell">
        <div className="cryptex-artifact-shadow" />
        <div className="cryptex-artifact-crop">
          <Image
            className="cryptex-artifact"
            src="/images/cryptex-hero.png"
            alt=""
            width={1586}
            height={672}
            sizes="(min-width: 1024px) 52rem, 94vw"
            priority
            draggable={false}
          />
        </div>
        <span className="cryptex-artifact-hotspot cryptex-artifact-hotspot--cyan" />
        <span className="cryptex-artifact-hotspot cryptex-artifact-hotspot--purple" />
        <span className="cryptex-light-sweep" />
      </div>

      <div className="cryptex-orbit-field cryptex-orbit-field--front">
        <span className="cryptex-orbit cryptex-orbit--three">
          {orbitDots.slice(4, 12).map((style, index) => (
            <i key={`front-three-${index}`} style={style} />
          ))}
        </span>
        <span className="cryptex-orbit cryptex-orbit--four">
          {orbitDots.slice(0, 8).map((style, index) => (
            <i key={`front-four-${index}`} style={style} />
          ))}
        </span>
      </div>

      <div className="cryptex-particle-field">
        {particleStyles.map((style, index) => (
          <span key={index} style={style} />
        ))}
      </div>

      <div className="cryptex-depth cryptex-depth--front" />
      <div className="cryptex-scanline" />
    </div>
  );
}
