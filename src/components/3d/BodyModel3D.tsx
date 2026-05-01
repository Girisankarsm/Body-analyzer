'use client';

import { useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export interface MorphTargets {
  morph_scales: {
    torso: number;
    belly: number;
    chest: number;
    hips:  number;
    arms:  number;
    legs:  number;
  };
  heatmap: {
    abdomen: number;
    chest:   number;
    back:    number;
    arms:    number;
    thighs:  number;
    calves:  number;
  };
  overall_fatness: number;
}

/**
 * Convert a 0–1 heatmap intensity to a Three.js Color.
 * 0.0 → cool green (#22c55e)
 * 0.5 → warm yellow (#eab308)
 * 1.0 → hot red (#ef4444)
 */
function heatToColor(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    // green → yellow
    const f = t * 2;
    return new THREE.Color(f * 0.92, 0.77 - f * 0.07, 0.22 * (1 - f));
  } else {
    // yellow → red
    const f = (t - 0.5) * 2;
    return new THREE.Color(0.94, 0.70 * (1 - f * 0.55), 0.13 * (1 - f));
  }
}

/**
 * Determine body region from a mesh's name or bounding-box Y position.
 * Returns a heatmap key.
 */
function classifyRegion(
  name: string,
  yNorm: number   // 0 = feet, 1 = head
): keyof MorphTargets['heatmap'] {
  const n = name.toLowerCase();

  if (n.includes('head') || n.includes('face') || n.includes('skull')) return 'chest'; // neutral
  if (n.includes('neck') || n.includes('shoulder')) return 'chest';
  if (n.includes('arm') || n.includes('hand') || n.includes('fore')) return 'arms';
  if (n.includes('chest') || n.includes('torso') || n.includes('breast')) return 'chest';
  if (n.includes('abdomen') || n.includes('belly') || n.includes('stomach') || n.includes('waist')) return 'abdomen';
  if (n.includes('back') || n.includes('spine') || n.includes('loin')) return 'back';
  if (n.includes('hip') || n.includes('pelvi') || n.includes('glute') || n.includes('butt')) return 'thighs';
  if (n.includes('thigh') || n.includes('upper_leg') || n.includes('leg')) return 'thighs';
  if (n.includes('knee') || n.includes('calf') || n.includes('shin') || n.includes('lower_leg')) return 'calves';
  if (n.includes('foot') || n.includes('feet') || n.includes('ankle') || n.includes('toe')) return 'calves';

  // Fallback: classify by Y position in body
  if (yNorm > 0.82) return 'chest';       // head/neck/shoulders
  if (yNorm > 0.65) return 'chest';       // upper chest
  if (yNorm > 0.50) return 'abdomen';     // mid torso
  if (yNorm > 0.38) return 'back';        // lower back / hip
  if (yNorm > 0.20) return 'thighs';      // upper legs
  return 'calves';                        // lower legs / feet
}

interface ModelProps {
  path:        string;
  baseColor:   string;
  morph?:      MorphTargets;
  heatmapMode: boolean;
}

function Model({ path, baseColor, morph, heatmapMode }: ModelProps) {
  const { scene } = useGLTF(path);
  const groupRef  = useRef<THREE.Group>(null);

  // Compute bounding box extremes once for Y-normalisation
  const { yMin, yMax } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    return { yMin: box.min.y, yMax: box.max.y };
  }, [scene]);

  // ── Effect 1: Fit model to canvas — runs ONCE when scene loads ────────────
  useEffect(() => {
    if (!scene) return;
    const box    = new THREE.Box3().setFromObject(scene);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale  = 5 / Math.max(size.x, size.y, size.z);
    scene.scale.setScalar(scale);
    scene.position.sub(center.multiplyScalar(scale));
  }, [scene]);

  // ── Effect 2: Coloring + morphing — re-runs when heatmap/morph changes ────
  useEffect(() => {
    if (!scene) return;

    const scaleVal = scene.scale.x;  // use existing fitted scale

    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      // Y-normalised position in body (0=feet, 1=head)
      const mb    = new THREE.Box3().setFromObject(mesh);
      const mc    = mb.getCenter(new THREE.Vector3());
      const yNorm = (mc.y - yMin * scaleVal) / Math.max(1e-3, (yMax - yMin) * scaleVal);
      const region = classifyRegion(mesh.name, yNorm);

      // Color
      let meshColor: THREE.Color;
      if (heatmapMode && morph) {
        meshColor = heatToColor(morph.heatmap[region] ?? 0);
      } else {
        meshColor = new THREE.Color(baseColor);
      }

      mesh.material = new THREE.MeshStandardMaterial({
        color:           meshColor,
        roughness:       heatmapMode ? 0.55 : 0.38,
        metalness:       0.03,
        envMapIntensity: 0.65,
      });
      mesh.castShadow    = true;
      mesh.receiveShadow = true;

      // Subtle shape morph (capped ±18%)
      if (morph) {
        const s     = morph.morph_scales;
        const clamp = (v: number) => Math.max(0.92, Math.min(1.18, v));
        if      (region === 'abdomen') { const b = clamp(s.belly); mesh.scale.set(b,   1, b);   }
        else if (region === 'chest')   { const c = clamp(s.chest); mesh.scale.set(c,   1, c);   }
        else if (region === 'back')    { const t = clamp(s.torso); mesh.scale.set(t,   1, t);   }
        else if (region === 'thighs')  { const h = clamp(s.hips);  mesh.scale.set(h,   1, h);   }
        else if (region === 'calves')  { const l = clamp(s.legs);  mesh.scale.set(l,   1, l);   }
        else if (region === 'arms')    { const a = clamp(s.arms);  mesh.scale.set(a,   1, a);   }
        else                           {                            mesh.scale.set(1,   1, 1);   }
      }
    });
  }, [scene, baseColor, morph, heatmapMode, yMin, yMax]);

  return <primitive ref={groupRef} object={scene} />;
}

function Loader() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#1c1c1c" />
    </mesh>
  );
}

export interface BodyModel3DProps {
  gender:      'male' | 'female';
  color:       string;
  morph?:      MorphTargets;
  heatmapMode?: boolean;
}

export default function BodyModel3D({ gender, color, morph, heatmapMode = false }: BodyModel3DProps) {
  const path = gender === 'male' ? '/models/male.glb' : '/models/female.glb';

  return (
    <Canvas
      camera={{ position: [0, 0.5, 8], fov: 45 }}
      style={{ background: 'transparent' }}
      shadows
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.4} color="#a0c4ff" />
      <pointLight position={[0, -3, 3]} intensity={0.3} color="#4ade80" />

      <Suspense fallback={<Loader />}>
        <Model
          path={path}
          baseColor={color}
          morph={morph}
          heatmapMode={heatmapMode}
        />
        <ContactShadows
          position={[0, -3.5, 0]}
          opacity={0.4}
          scale={6}
          blur={2}
          far={4}
          color="#000"
        />
        <Environment preset="city" />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        maxDistance={14}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.9}
        autoRotate
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
