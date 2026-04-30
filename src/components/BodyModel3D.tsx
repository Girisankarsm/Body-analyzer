'use client';

import { useRef, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

interface ModelProps {
  path: string;
  color: string;
}

function Model({ path, color }: ModelProps) {
  const { scene } = useGLTF(path);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!scene) return;

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxDim;

    scene.scale.setScalar(scale);
    scene.position.sub(center.multiplyScalar(scale));

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: 0.35,
          metalness: 0.05,
          envMapIntensity: 0.6,
        });
        mesh.castShadow = true;
      }
    });
  }, [scene, color]);

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

interface BodyViewerProps {
  gender: 'male' | 'female';
  color: string;
}

export default function BodyModel3D({ gender, color }: BodyViewerProps) {
  const path = gender === 'male' ? '/male_body.glb' : '/womenfemale_body_base_rigged.glb';

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
        <Model path={path} color={color} />
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
