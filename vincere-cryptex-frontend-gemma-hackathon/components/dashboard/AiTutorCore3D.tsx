"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }

  material.dispose();
}

export function AiTutorCore3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion !== false || !mountRef.current) {
      return;
    }

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.set(0, 0, 5.4);

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      mount.classList.add("dashboard-ai-core-static");
      return () => {
        mount.classList.remove("dashboard-ai-core-static");
      };
    }

    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.domElement.className = "dashboard-ai-core-canvas";
    mount.appendChild(renderer.domElement);

    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const coreGeometry = new THREE.SphereGeometry(0.42, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.84,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    coreGroup.add(core);

    const glowGeometry = new THREE.SphereGeometry(0.82, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    coreGroup.add(glow);

    const shellGeometry = new THREE.IcosahedronGeometry(0.68, 2);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0xddb7ff,
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    coreGroup.add(shell);

    const ringGeometry = new THREE.TorusGeometry(0.98, 0.012, 8, 112);
    const cyanRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.66,
      blending: THREE.AdditiveBlending,
    });
    const purpleRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
    });
    const pinkRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const cyanRing = new THREE.Mesh(ringGeometry, cyanRingMaterial);
    const purpleRing = new THREE.Mesh(ringGeometry, purpleRingMaterial);
    const pinkRing = new THREE.Mesh(ringGeometry, pinkRingMaterial);

    cyanRing.rotation.x = Math.PI / 2.5;
    purpleRing.rotation.y = Math.PI / 2.25;
    pinkRing.rotation.x = Math.PI / 3.2;
    pinkRing.rotation.y = Math.PI / 4.4;
    coreGroup.add(cyanRing, purpleRing, pinkRing);

    const particleCount = 36;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const color = new THREE.Color();

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (index / particleCount) * Math.PI * 2;
      const radius = 1.18 + Math.sin(index * 2.4) * 0.14;
      const offset = index * 3;

      particlePositions[offset] = Math.cos(angle) * radius;
      particlePositions[offset + 1] = Math.sin(angle) * radius * 0.72;
      particlePositions[offset + 2] = (Math.random() - 0.5) * 0.64;

      color.set(index % 4 === 0 ? 0xa855f7 : 0x00f0ff);
      particleColors[offset] = color.r;
      particleColors[offset + 1] = color.g;
      particleColors[offset + 2] = color.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.052,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orbitParticles = new THREE.Points(particleGeometry, particleMaterial);
    coreGroup.add(orbitParticles);

    const spokePositions = new Float32Array(8 * 6);

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const offset = index * 6;
      const innerRadius = 0.52;
      const outerRadius = 1.22;

      spokePositions[offset] = Math.cos(angle) * innerRadius;
      spokePositions[offset + 1] = Math.sin(angle) * innerRadius * 0.7;
      spokePositions[offset + 2] = 0;
      spokePositions[offset + 3] = Math.cos(angle) * outerRadius;
      spokePositions[offset + 4] = Math.sin(angle) * outerRadius * 0.7;
      spokePositions[offset + 5] = 0;
    }

    const spokeGeometry = new THREE.BufferGeometry();
    spokeGeometry.setAttribute("position", new THREE.BufferAttribute(spokePositions, 3));
    const spokeMaterial = new THREE.LineBasicMaterial({
      color: 0x7df4ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    });
    const spokes = new THREE.LineSegments(spokeGeometry, spokeMaterial);
    coreGroup.add(spokes);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener("resize", resize);

    let frameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const pulse = 1 + Math.sin(elapsed * 2.3) * 0.12;

      core.scale.setScalar(pulse);
      glow.scale.setScalar(1.02 + Math.sin(elapsed * 1.65) * 0.18);
      shell.rotation.x = elapsed * 0.18;
      shell.rotation.y = elapsed * 0.32;
      shell.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.04);

      cyanRing.rotation.z = elapsed * 0.78;
      purpleRing.rotation.z = -elapsed * 0.58;
      pinkRing.rotation.z = elapsed * 0.34;
      cyanRing.scale.setScalar(1 + Math.sin(elapsed * 1.1) * 0.045);
      purpleRing.scale.setScalar(1 + Math.cos(elapsed * 1.05) * 0.055);
      pinkRing.scale.setScalar(1 + Math.sin(elapsed * 0.82) * 0.075);

      orbitParticles.rotation.z = elapsed * 0.34;
      orbitParticles.rotation.x = Math.sin(elapsed * 0.44) * 0.2;
      spokes.rotation.z = -elapsed * 0.22;
      coreGroup.rotation.y = Math.sin(elapsed * 0.55) * 0.12;

      coreMaterial.opacity = 0.72 + Math.sin(elapsed * 2.3) * 0.12;
      glowMaterial.opacity = 0.16 + Math.sin(elapsed * 1.65) * 0.08;
      cyanRingMaterial.opacity = 0.52 + Math.sin(elapsed * 1.4) * 0.14;
      purpleRingMaterial.opacity = 0.44 + Math.cos(elapsed * 1.1) * 0.12;
      pinkRingMaterial.opacity = 0.3 + Math.sin(elapsed * 0.9) * 0.1;
      particleMaterial.opacity = 0.68 + Math.sin(elapsed * 1.7) * 0.12;
      spokeMaterial.opacity = 0.14 + Math.sin(elapsed * 1.9) * 0.08;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      coreGroup.remove(
        core,
        glow,
        shell,
        cyanRing,
        purpleRing,
        pinkRing,
        orbitParticles,
        spokes,
      );
      scene.remove(coreGroup);

      coreGeometry.dispose();
      glowGeometry.dispose();
      shellGeometry.dispose();
      ringGeometry.dispose();
      particleGeometry.dispose();
      spokeGeometry.dispose();
      disposeMaterial(coreMaterial);
      disposeMaterial(glowMaterial);
      disposeMaterial(shellMaterial);
      disposeMaterial(cyanRingMaterial);
      disposeMaterial(purpleRingMaterial);
      disposeMaterial(pinkRingMaterial);
      disposeMaterial(particleMaterial);
      disposeMaterial(spokeMaterial);
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  if (reducedMotion !== false) {
    return (
      <div
        className="dashboard-ai-core-static h-full w-full"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={mountRef}
      className="dashboard-ai-core-3d h-full w-full"
      aria-hidden="true"
    />
  );
}
