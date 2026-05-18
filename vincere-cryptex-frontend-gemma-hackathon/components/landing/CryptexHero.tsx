"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Vector3Tuple = [number, number, number];
type PointerInteraction = {
  active: boolean;
  enabled: boolean;
  targetX: number;
  targetY: number;
};

const ringCount = 7;
const ringSpacing = 0.84;
const ringRadius = 1.74;
const ringDepth = 0.74;
const ringSpeeds = [0.18, -0.14, 0.21, -0.16, 0.13, -0.19, 0.15];
const neonColors = ["#f853e4", "#8012ed", "#07ebfe"];
const runeChars =
  "\u16a0\u16a2\u16a6\u16a8\u16b1\u16b2\u16b7\u16b9\u16ba\u16be\u16c1\u16c3\u16c7\u16c8\u16c9\u16ca\u16cf\u16d2\u16d6\u16d7\u16da\u16dc\u16de\u16df";
const cameraBase = {
  x: 0,
  y: 2.05,
  z: 12.4,
};

function subscribeToClientReady() {
  return () => undefined;
}

function getClientReadySnapshot() {
  return true;
}

function getServerReadySnapshot() {
  return false;
}

function useClientReady() {
  return useSyncExternalStore(
    subscribeToClientReady,
    getClientReadySnapshot,
    getServerReadySnapshot,
  );
}

function subscribeToReducedMotion(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  mediaQuery.addEventListener("change", callback);

  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerReducedMotionSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
}

function subscribeToFinePointer(callback: () => void) {
  const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

  mediaQuery.addEventListener("change", callback);

  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getFinePointerSnapshot() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function getServerFinePointerSnapshot() {
  return false;
}

function useHasFinePointer() {
  return useSyncExternalStore(
    subscribeToFinePointer,
    getFinePointerSnapshot,
    getServerFinePointerSnapshot,
  );
}

function useResponsiveSceneScale(baseWidth: number, minScale = 0.58) {
  const { viewport } = useThree();

  return Math.min(1, Math.max(minScale, viewport.width / baseWidth));
}

function useTextureCleanup(texture: THREE.Texture | null | undefined) {
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);
}

function createNoiseTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture();
  }

  const imageData = context.createImageData(size, size);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const column = (index / 4) % size;
    const row = Math.floor(index / 4 / size);
    const grain = 122 + Math.random() * 82;
    const fineScratch = Math.sin(column * 0.34 + row * 0.08) * 14;
    const value = Math.max(36, Math.min(255, grain + fineScratch));

    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
    imageData.data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  context.strokeStyle = "rgba(255,255,255,0.08)";

  for (let scratch = 0; scratch < 42; scratch += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const length = 16 + Math.random() * 54;
    const angle = -0.2 + Math.random() * 0.4;

    context.lineWidth = 0.45 + Math.random() * 0.65;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 1);

  return texture;
}

function createRuneTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture();
  }

  context.fillStyle = "#05060b";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const columns = 18;
  const cellWidth = canvas.width / columns;

  for (let column = 0; column < columns; column += 1) {
    const rune = runeChars[(column * 7 + color.length) % runeChars.length];
    const x = column * cellWidth + cellWidth / 2;
    const y = canvas.height / 2;

    context.font = "bold 68px serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = color;
    context.shadowBlur = 18;
    context.fillStyle = color;
    context.globalAlpha = 0.58;
    context.fillText(rune, x, y);

    context.shadowBlur = 4;
    context.fillStyle = "#ffffff";
    context.globalAlpha = 0.86;
    context.fillText(rune, x, y);
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.08, 1);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function CryptexRing({
  color,
  index,
  noiseTexture,
}: {
  color: string;
  index: number;
  noiseTexture: THREE.Texture;
}) {
  const ringRef = useRef<THREE.Group>(null);
  const runeTexture = useMemo(() => createRuneTexture(color), [color]);
  const emissiveColor = useMemo(() => new THREE.Color(color), [color]);
  const x = (index - Math.floor(ringCount / 2)) * ringSpacing;

  useTextureCleanup(runeTexture);

  useFrame((state, delta) => {
    if (!ringRef.current) {
      return;
    }

    const drift = Math.sin(state.clock.elapsedTime * 0.36 + index * 0.75) * 0.018;
    ringRef.current.rotation.x += (ringSpeeds[index] + drift) * delta;
  });

  return (
    <group ref={ringRef} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[ringRadius, ringRadius, ringDepth, 96]} />
        <meshPhysicalMaterial
          clearcoat={0.55}
          clearcoatRoughness={0.32}
          color="#20222c"
          emissive={emissiveColor}
          emissiveIntensity={0.72}
          emissiveMap={runeTexture}
          map={runeTexture}
          metalness={0.86}
          roughness={0.29}
          roughnessMap={noiseTexture}
        />
      </mesh>

      {[-ringDepth / 2 - 0.018, ringDepth / 2 + 0.018].map((offset) => (
        <mesh key={offset} position={[0, offset, 0]} castShadow receiveShadow>
          <torusGeometry args={[ringRadius + 0.018, 0.035, 12, 96]} />
          <meshStandardMaterial
            color="#080912"
            emissive={emissiveColor}
            emissiveIntensity={1.05}
            metalness={0.8}
            roughness={0.18}
          />
        </mesh>
      ))}

      <mesh scale={[1.015, 1.015, 1.015]}>
        <cylinderGeometry args={[ringRadius + 0.02, ringRadius + 0.02, ringDepth + 0.018, 96, 1, true]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={color}
          depthWrite={false}
          opacity={0.06}
          side={THREE.BackSide}
          transparent
        />
      </mesh>
    </group>
  );
}

function EndCap({ positionX, rotationOffset = 0 }: { positionX: number; rotationOffset?: number }) {
  const capRef = useRef<THREE.Group>(null);
  const cyan = useMemo(() => new THREE.Color("#07ebfe"), []);

  useFrame((state) => {
    if (capRef.current) {
      capRef.current.rotation.y = state.clock.elapsedTime * 0.08 + rotationOffset;
    }
  });

  return (
    <group ref={capRef} position={[positionX, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[ringRadius + 0.1, ringRadius + 0.06, 0.34, 8]} />
        <meshPhysicalMaterial
          clearcoat={0.4}
          color="#11131c"
          metalness={0.9}
          roughness={0.22}
        />
      </mesh>

      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.58, 0.58, 0.04, 6]} />
        <meshStandardMaterial
          color="#07ebfe"
          emissive={cyan}
          emissiveIntensity={2.2}
          metalness={0}
          roughness={0.18}
        />
      </mesh>

      {[0.82, 1.16].map((radius, index) => (
        <mesh key={radius} position={[0, 0.205, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.018, 8, 96]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={index === 0 ? "#07ebfe" : "#8012ed"}
            opacity={0.64}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function NeonOrbit({
  axis,
  color,
  radius,
  speed,
}: {
  axis: Vector3Tuple;
  color: string;
  radius: number;
  speed: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const particleRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += speed * delta * 0.22;
      groupRef.current.rotation.x += speed * delta * 0.04;
    }

    if (particleRef.current) {
      const time = state.clock.elapsedTime * speed;
      particleRef.current.position.set(Math.cos(time) * radius, 0, Math.sin(time) * radius);
    }
  });

  return (
    <group ref={groupRef} rotation={axis}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.012, 8, 132]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={color}
          depthWrite={false}
          opacity={0.24}
          transparent
        />
      </mesh>

      <group ref={particleRef}>
        <mesh>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh scale={[2.3, 2.3, 2.3]}>
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={color}
            depthWrite={false}
            opacity={0.16}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

function Pedestal() {
  return (
    <group position={[0, -2.75, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[3.1, 4.05, 0.54, 96]} />
        <meshPhysicalMaterial
          clearcoat={0.36}
          color="#0b0c13"
          metalness={0.88}
          roughness={0.34}
        />
      </mesh>

      <mesh position={[0, 0.29, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.34, 2.58, 96]} />
        <meshBasicMaterial blending={THREE.AdditiveBlending} color="#07ebfe" opacity={0.82} transparent />
      </mesh>

      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.32, 1.4, 96]} />
        <meshBasicMaterial blending={THREE.AdditiveBlending} color="#8012ed" opacity={0.58} transparent />
      </mesh>

      <pointLight color="#07ebfe" decay={2} distance={9} intensity={16} position={[0, 0.92, 0]} />
      <pointLight color="#f853e4" decay={2} distance={8} intensity={5.5} position={[-1.5, 0.5, 1.4]} />
    </group>
  );
}

function CryptexAssembly() {
  const groupRef = useRef<THREE.Group>(null);
  const noiseTexture = useMemo(() => createNoiseTexture(), []);

  useTextureCleanup(noiseTexture);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    const time = state.clock.elapsedTime;
    groupRef.current.position.y = 0.24 + Math.sin(time * 0.72) * 0.18 + Math.sin(time * 1.18) * 0.035;
    groupRef.current.rotation.y = Math.sin(time * 0.32) * 0.075;
    groupRef.current.rotation.z = Math.sin(time * 0.46) * 0.018;
  });

  const leftCapX = -Math.floor(ringCount / 2) * ringSpacing - ringDepth / 2 - 0.2;
  const rightCapX = Math.floor(ringCount / 2) * ringSpacing + ringDepth / 2 + 0.2;

  return (
    <group ref={groupRef}>
      {Array.from({ length: ringCount }).map((_, index) => (
        <CryptexRing
          key={index}
          color={neonColors[index % neonColors.length]}
          index={index}
          noiseTexture={noiseTexture}
        />
      ))}
      <EndCap positionX={leftCapX} />
      <EndCap positionX={rightCapX} rotationOffset={Math.PI / 6} />
    </group>
  );
}

function CryptexScene({
  interaction,
}: {
  interaction: MutableRefObject<PointerInteraction>;
}) {
  const scale = useResponsiveSceneScale(9.6);
  const sceneRef = useRef<THREE.Group>(null);
  const smoothedPointerRef = useRef({ x: 0, y: 0 });

  useFrame(({ camera }, delta) => {
    const target = interaction.current;
    const pointer = smoothedPointerRef.current;
    const ease = 1 - Math.exp(-delta * 4.2);

    pointer.x += (target.targetX - pointer.x) * ease;
    pointer.y += (target.targetY - pointer.y) * ease;

    camera.position.x = cameraBase.x + pointer.x * 0.34;
    camera.position.y = cameraBase.y - pointer.y * 0.2;
    camera.position.z = cameraBase.z + Math.abs(pointer.x) * 0.04;
    camera.lookAt(pointer.x * 0.28, 0.15 - pointer.y * 0.18, 0);

    if (sceneRef.current) {
      sceneRef.current.position.x = pointer.x * 0.12;
      sceneRef.current.position.y = -pointer.y * 0.05;
      sceneRef.current.rotation.x = 0.02 + pointer.y * 0.025;
      sceneRef.current.rotation.y = pointer.x * 0.045;
    }
  });

  return (
    <>
      <fog attach="fog" args={["#090910", 11, 24]} />
      <ambientLight color="#99aaff" intensity={0.16} />
      <hemisphereLight args={["#748aff", "#05050a", 0.42]} />
      <directionalLight color="#ffffff" intensity={1.6} position={[1.2, 4.5, 5.5]} castShadow />
      <pointLight color="#07ebfe" distance={14} intensity={8} position={[5.2, 2.8, 3.8]} />
      <pointLight color="#f853e4" distance={12} intensity={5.8} position={[-4.2, 2.2, 4.2]} />
      <pointLight color="#8012ed" distance={13} intensity={6.4} position={[0, 5, -4.5]} />

      <group ref={sceneRef} scale={scale} rotation={[0.02, 0, 0]}>
        <CryptexAssembly />
        <Pedestal />
        <NeonOrbit axis={[0.12, 0, Math.PI / 6]} color="#07ebfe" radius={3.44} speed={0.58} />
        <NeonOrbit axis={[Math.PI / 4.2, Math.PI / 7, 0]} color="#f853e4" radius={4.02} speed={0.42} />
        <NeonOrbit axis={[Math.PI / 2.8, 0, Math.PI / 3.6]} color="#8012ed" radius={4.52} speed={0.34} />
      </group>
    </>
  );
}

function CryptexHeroFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#090910]" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,240,255,0.26),transparent_31%),radial-gradient(circle_at_62%_54%,rgba(248,83,228,0.2),transparent_38%),radial-gradient(circle_at_42%_64%,rgba(128,18,237,0.22),transparent_42%)]" />
      <div className="absolute left-1/2 top-1/2 h-24 w-[72%] -translate-x-1/2 -translate-y-1/2 border border-primary/24 bg-primary/10 shadow-[0_0_42px_rgba(0,240,255,0.18)]" />
    </div>
  );
}

export function CryptexHero() {
  const isClientReady = useClientReady();
  const prefersReducedMotion = usePrefersReducedMotion();
  const hasFinePointer = useHasFinePointer();
  const interactionRef = useRef<PointerInteraction>({
    active: false,
    enabled: false,
    targetX: 0,
    targetY: 0,
  });
  const interactionEnabled = isClientReady && !prefersReducedMotion && hasFinePointer;

  useEffect(() => {
    const interaction = interactionRef.current;
    interaction.enabled = interactionEnabled;

    if (!interactionEnabled) {
      interaction.active = false;
      interaction.targetX = 0;
      interaction.targetY = 0;
    }
  }, [interactionEnabled]);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;

    if (!interaction.enabled || event.pointerType !== "mouse") {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    interaction.active = true;
    interaction.targetX = THREE.MathUtils.clamp(
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      -1,
      1,
    );
    interaction.targetY = THREE.MathUtils.clamp(
      ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      -1,
      1,
    );
  }

  function handlePointerLeave() {
    const interaction = interactionRef.current;
    interaction.active = false;
    interaction.targetX = 0;
    interaction.targetY = 0;
  }

  return (
    <div
      className="pointer-events-auto relative h-[420px] min-w-0 overflow-hidden lg:h-[620px]"
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      aria-hidden="true"
    >
      <div className="absolute inset-0 overflow-hidden bg-[#090910] shadow-[0_0_58px_rgba(0,240,255,0.08)] [mask-image:radial-gradient(ellipse_at_50%_52%,#000_0_68%,rgba(0,0,0,0.82)_82%,transparent_100%)]">
        {!isClientReady || prefersReducedMotion ? (
          <CryptexHeroFallback />
        ) : (
          <Canvas
            camera={{ position: [cameraBase.x, cameraBase.y, cameraBase.z], fov: 42 }}
            dpr={[1, 1.35]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.08;
              gl.shadowMap.enabled = true;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
            }}
          >
            <color attach="background" args={["#090910"]} />
            <CryptexScene interaction={interactionRef} />
          </Canvas>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(5,7,15,0.22)_72%,rgba(5,7,15,0.76)_100%)]" />
      </div>
    </div>
  );
}
