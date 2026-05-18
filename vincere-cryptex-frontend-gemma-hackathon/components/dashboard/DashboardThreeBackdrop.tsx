"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function DashboardThreeBackdrop() {
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
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 0, 13);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    mount.appendChild(renderer.domElement);

    const depthGroup = new THREE.Group();
    scene.add(depthGroup);

    const particleCount = 96;
    const particlePositions = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const offset = index * 3;
      particlePositions[offset] = (Math.random() - 0.5) * 21;
      particlePositions[offset + 1] = (Math.random() - 0.5) * 11;
      particlePositions[offset + 2] = -Math.random() * 12;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.045,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    depthGroup.add(particles);

    const nodeGeometry = new THREE.SphereGeometry(0.055, 12, 12);
    const cyanNodeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
    });
    const purpleNodeMaterial = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
    });
    const nodes: THREE.Mesh[] = [];
    const baseNodePositions: THREE.Vector3[] = [];

    for (let index = 0; index < 11; index += 1) {
      const node = new THREE.Mesh(
        nodeGeometry,
        index % 3 === 0 ? purpleNodeMaterial : cyanNodeMaterial,
      );
      const basePosition = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 8,
        -1 - Math.random() * 8,
      );
      node.position.copy(basePosition);
      node.userData.phase = Math.random() * Math.PI * 2;
      nodes.push(node);
      baseNodePositions.push(basePosition);
      depthGroup.add(node);
    }

    const linePairs = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [1, 6],
      [6, 7],
      [2, 8],
      [8, 9],
      [5, 10],
      [7, 10],
      [0, 8],
    ];
    const linePositions = new Float32Array(linePairs.length * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x7df4ff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    depthGroup.add(lines);

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

      depthGroup.rotation.x = Math.sin(elapsed * 0.12) * 0.035;
      depthGroup.rotation.y = Math.sin(elapsed * 0.1) * 0.055;
      particles.rotation.y = elapsed * 0.018;
      particles.rotation.x = Math.sin(elapsed * 0.08) * 0.025;

      nodes.forEach((node, index) => {
        const phase = node.userData.phase as number;
        const base = baseNodePositions[index];
        node.position.set(
          base.x + Math.sin(elapsed * 0.45 + phase) * 0.18,
          base.y + Math.cos(elapsed * 0.38 + phase) * 0.14,
          base.z + Math.sin(elapsed * 0.3 + phase) * 0.22,
        );
        const scale = 1 + Math.sin(elapsed * 1.5 + phase) * 0.22;
        node.scale.setScalar(scale);
      });

      const positions = lineGeometry.attributes.position.array as Float32Array;
      linePairs.forEach(([start, end], index) => {
        const offset = index * 6;
        const startNode = nodes[start].position;
        const endNode = nodes[end].position;

        positions[offset] = startNode.x;
        positions[offset + 1] = startNode.y;
        positions[offset + 2] = startNode.z;
        positions[offset + 3] = endNode.x;
        positions[offset + 4] = endNode.y;
        positions[offset + 5] = endNode.z;
      });
      lineGeometry.attributes.position.needsUpdate = true;
      lineMaterial.opacity = 0.14 + Math.sin(elapsed * 0.9) * 0.045;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);

      depthGroup.remove(particles, lines, ...nodes);
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      nodeGeometry.dispose();
      cyanNodeMaterial.dispose();
      purpleNodeMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  if (reducedMotion !== false) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-40"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(0,240,255,0.16),transparent_28%),radial-gradient(circle_at_78%_38%,rgba(168,85,247,0.14),transparent_32%),linear-gradient(135deg,transparent,rgba(0,240,255,0.06),transparent)]" />
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="pointer-events-none absolute inset-0 z-[1] opacity-55 mix-blend-screen"
      aria-hidden="true"
    />
  );
}
