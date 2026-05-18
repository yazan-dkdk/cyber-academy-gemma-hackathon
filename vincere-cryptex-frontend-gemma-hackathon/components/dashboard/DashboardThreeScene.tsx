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

export function DashboardThreeScene() {
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
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);
    camera.position.set(0, 0, 18);

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      mount.classList.add("dashboard-three-fallback");
      return () => {
        mount.classList.remove("dashboard-three-fallback");
      };
    }

    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
    renderer.domElement.className = "dashboard-three-canvas";
    mount.appendChild(renderer.domElement);

    const depthGroup = new THREE.Group();
    scene.add(depthGroup);

    const particleCount = 150;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const color = new THREE.Color();

    for (let index = 0; index < particleCount; index += 1) {
      const offset = index * 3;

      particlePositions[offset] = (Math.random() - 0.5) * 28;
      particlePositions[offset + 1] = (Math.random() - 0.5) * 15;
      particlePositions[offset + 2] = -Math.random() * 20;

      color.set(index % 5 === 0 ? 0xa855f7 : index % 7 === 0 ? 0xff4fd8 : 0x00f0ff);
      particleColors[offset] = color.r;
      particleColors[offset + 1] = color.g;
      particleColors[offset + 2] = color.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.042,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    depthGroup.add(particles);

    const nodeGeometry = new THREE.SphereGeometry(0.065, 12, 12);
    const cyanNodeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const purpleNodeMaterial = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const nodes: THREE.Mesh[] = [];
    const baseNodePositions: THREE.Vector3[] = [];

    for (let index = 0; index < 14; index += 1) {
      const node = new THREE.Mesh(
        nodeGeometry,
        index % 3 === 0 ? purpleNodeMaterial : cyanNodeMaterial,
      );
      const basePosition = new THREE.Vector3(
        (Math.random() - 0.5) * 21,
        (Math.random() - 0.5) * 10,
        -2 - Math.random() * 13,
      );

      node.position.copy(basePosition);
      node.userData.phase = Math.random() * Math.PI * 2;
      nodes.push(node);
      baseNodePositions.push(basePosition);
      depthGroup.add(node);
    }

    const linePairs: Array<[number, number]> = [];

    for (let start = 0; start < baseNodePositions.length; start += 1) {
      for (let end = start + 1; end < baseNodePositions.length; end += 1) {
        if (linePairs.length >= 22) {
          break;
        }

        if (baseNodePositions[start].distanceTo(baseNodePositions[end]) < 7.3) {
          linePairs.push([start, end]);
        }
      }
    }

    while (linePairs.length < 18) {
      const start = linePairs.length % nodes.length;
      linePairs.push([start, (start + 3) % nodes.length]);
    }

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

    const radarGeometry = new THREE.RingGeometry(1.4, 1.43, 96);
    const radarRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];

    for (let index = 0; index < 3; index += 1) {
      const radarMaterial = new THREE.MeshBasicMaterial({
        color: index === 1 ? 0xa855f7 : 0x00f0ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(radarGeometry, radarMaterial);

      ring.position.set(-4.2, -2.1, -8.5);
      ring.rotation.x = Math.PI * 0.58;
      ring.userData.offset = index / 3;
      radarRings.push(ring);
      depthGroup.add(ring);
    }

    const beamGeometry = new THREE.CircleGeometry(4.8, 40, 0, Math.PI / 5.5);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const scanBeam = new THREE.Mesh(beamGeometry, beamMaterial);
    scanBeam.position.set(-4.2, -2.1, -8.5);
    scanBeam.rotation.x = Math.PI * 0.58;
    depthGroup.add(scanBeam);

    const energyPositions = new Float32Array(8 * 6);

    for (let index = 0; index < 8; index += 1) {
      const offset = index * 6;
      const y = -6 + index * 1.7;
      const z = -16 + (index % 4) * 2.5;
      const xStart = -15 + (index % 3) * 1.7;

      energyPositions[offset] = xStart;
      energyPositions[offset + 1] = y;
      energyPositions[offset + 2] = z;
      energyPositions[offset + 3] = xStart + 7.5;
      energyPositions[offset + 4] = y + 0.9;
      energyPositions[offset + 5] = z - 1.4;
    }

    const energyGeometry = new THREE.BufferGeometry();
    energyGeometry.setAttribute("position", new THREE.BufferAttribute(energyPositions, 3));
    const energyMaterial = new THREE.LineBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
    });
    const energyLines = new THREE.LineSegments(energyGeometry, energyMaterial);
    depthGroup.add(energyLines);

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth || window.innerWidth);
      const height = Math.max(1, mount.clientHeight || window.innerHeight);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let frameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      pointer.x += (pointer.targetX - pointer.x) * 0.045;
      pointer.y += (pointer.targetY - pointer.y) * 0.045;

      camera.position.x = pointer.x * 0.85;
      camera.position.y = -pointer.y * 0.45;
      camera.lookAt(0, 0, -6);

      depthGroup.rotation.x = Math.sin(elapsed * 0.11) * 0.035 - pointer.y * 0.025;
      depthGroup.rotation.y = Math.sin(elapsed * 0.09) * 0.05 + pointer.x * 0.045;
      depthGroup.position.z = Math.sin(elapsed * 0.18) * 0.45;

      particles.rotation.y = elapsed * 0.017;
      particles.rotation.x = Math.sin(elapsed * 0.08) * 0.03;
      particleMaterial.opacity = 0.42 + Math.sin(elapsed * 0.7) * 0.06;

      nodes.forEach((node, index) => {
        const phase = node.userData.phase as number;
        const base = baseNodePositions[index];
        const scale = 1 + Math.sin(elapsed * 1.55 + phase) * 0.24;

        node.position.set(
          base.x + Math.sin(elapsed * 0.36 + phase) * 0.24,
          base.y + Math.cos(elapsed * 0.32 + phase) * 0.18,
          base.z + Math.sin(elapsed * 0.26 + phase) * 0.34,
        );
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
      lineMaterial.opacity = 0.16 + Math.sin(elapsed * 0.85) * 0.045;

      radarRings.forEach((ring) => {
        const phase = (elapsed * 0.19 + (ring.userData.offset as number)) % 1;

        ring.scale.setScalar(0.8 + phase * 3.1);
        ring.material.opacity = (1 - phase) * 0.18;
      });

      scanBeam.rotation.z = elapsed * 0.22;
      beamMaterial.opacity = 0.04 + Math.sin(elapsed * 1.1) * 0.018;
      energyLines.position.x = Math.sin(elapsed * 0.2) * 0.8;
      energyLines.position.y = Math.cos(elapsed * 0.16) * 0.25;
      energyMaterial.opacity = 0.09 + Math.sin(elapsed * 0.9) * 0.045;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);

      depthGroup.remove(particles, lines, scanBeam, energyLines, ...nodes, ...radarRings);
      scene.remove(depthGroup);

      particleGeometry.dispose();
      particleMaterial.dispose();
      nodeGeometry.dispose();
      disposeMaterial(cyanNodeMaterial);
      disposeMaterial(purpleNodeMaterial);
      lineGeometry.dispose();
      lineMaterial.dispose();
      radarGeometry.dispose();
      radarRings.forEach((ring) => ring.material.dispose());
      beamGeometry.dispose();
      beamMaterial.dispose();
      energyGeometry.dispose();
      energyMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  if (reducedMotion !== false) {
    return (
      <div
        className="dashboard-three-fallback pointer-events-none fixed inset-0 z-[1]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={mountRef}
      className="dashboard-three-scene pointer-events-none fixed inset-0 z-[1]"
      aria-hidden="true"
    />
  );
}
