import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, PresentationControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "@/lib/theme-provider";

// Altın Varak (Gold) Materyali - Yüksek yansıma ve pürüzsüzlük
const goldMaterial = new THREE.MeshStandardMaterial({
  color: "#d4af37", // Saf Altın
  roughness: 0.15,
  metalness: 1.0,
  envMapIntensity: 2.5,
});

// Alçı/Saten Kumaş (Plaster/Satin) Materyali - Kırık beyaz, yumuşak doku
const plasterMaterial = new THREE.MeshPhysicalMaterial({
  color: "#f8f5e7", // Off-white/Alçı
  roughness: 0.4,
  metalness: 0.1,
  clearcoat: 0.3,
  clearcoatRoughness: 0.5,
});

// Themis Heykelinin Şimdilik Soyut/Geometrik Bir Temsili (Placeholder)
// GERÇEK BİR .GLB MODELİ EKLENDİĞİNDE BU KISIM `useGLTF` İLE DEĞİŞTİRİLECEK
function AbstractThemis() {
  const group = useRef<THREE.Group>(null);
  
  // Fare hareketine göre yavaşça dönme efekti (Parallax)
  useFrame((state) => {
    const targetX = (state.mouse.x * Math.PI) / 8;
    const targetY = (state.mouse.y * Math.PI) / 8;
    if (group.current) {
      group.current.rotation.y += 0.05 * (targetX - group.current.rotation.y);
      group.current.rotation.x += 0.05 * (targetY - group.current.rotation.x);
    }
  });

  /*
   * === GERÇEK 3D MODEL ENTEGRASYONU İÇİN NOT ===
   * public/models/themis.glb dosyasını yüklediğinizde aşağıdaki kodu açıp 
   * mevcut <Float> içeriğini silebilirsiniz:
   * 
   * const { nodes } = useGLTF('/models/themis.glb') as any;
   * 
   * return (
   *   <group ref={group} dispose={null}>
   *      <mesh geometry={nodes.Body.geometry} material={plasterMaterial} />
   *      <mesh geometry={nodes.Scales.geometry} material={goldMaterial} />
   *      <mesh geometry={nodes.Sword.geometry} material={goldMaterial} />
   *   </group>
   * )
   */

  return (
    <group ref={group}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1.5}>
        {/* Ana Gövde (Alçı) */}
        <mesh position={[0, -1, 0]} castShadow receiveShadow material={plasterMaterial}>
          <cylinderGeometry args={[0.5, 0.8, 3.5, 32]} />
        </mesh>
        
        {/* Baş (Altın Detay) */}
        <mesh position={[0, 1.3, 0]} castShadow material={goldMaterial}>
          <sphereGeometry args={[0.5, 32, 32]} />
        </mesh>

        {/* Terazi Ana Gövdesi (Altın) */}
        <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={goldMaterial}>
          <cylinderGeometry args={[0.08, 0.08, 4, 32]} />
        </mesh>

        {/* Sol Terazi Kefesi (Altın) */}
        <mesh position={[-1.9, -0.5, 0]} castShadow material={goldMaterial}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 32]} />
        </mesh>
        <mesh position={[-1.9, 0, 0]} castShadow material={goldMaterial}>
          <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        </mesh>

        {/* Sağ Terazi Kefesi (Altın) */}
        <mesh position={[1.9, -0.5, 0]} castShadow material={goldMaterial}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 32]} />
        </mesh>
        <mesh position={[1.9, 0, 0]} castShadow material={goldMaterial}>
          <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        </mesh>
        
        {/* Kılıç (Alçı ve Altın Kabza) */}
        <mesh position={[0, -0.5, 0.7]} castShadow material={plasterMaterial}>
          <boxGeometry args={[0.15, 2.5, 0.05]} />
        </mesh>
        <mesh position={[0, 0.5, 0.7]} castShadow material={goldMaterial}>
          <boxGeometry args={[0.5, 0.1, 0.1]} />
        </mesh>
      </Float>
    </group>
  );
}

export function Scene3D() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* 
        Canvas pointer-events-auto ile sadece 3D objenin kendisinin 
        tıklanabilir olmasını sağlar, arkadaki arayüz butonlarını engellemez.
      */}
      <Canvas
        className="pointer-events-auto"
        shadows
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        {/* PBR Yansımaları için Çevre Haritası */}
        <Environment preset="city" />
        
        {/* Dinamik Işıklandırma (Temaya Göre Şiddet) */}
        <ambientLight intensity={isDark ? 0.4 : 0.9} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={isDark ? 1.5 : 2.5}
          castShadow
          shadow-mapSize={1024}
        />
        {/* Altın bölgeleri parlatmak için sıcak bir spot ışık */}
        <spotLight 
          position={[-5, 5, 5]} 
          intensity={1.2} 
          color="#ffd700" 
          penumbra={1} 
        />
        
        {/* Kullanıcının objeyi tutup çevirmesini sağlayan kontrolcü */}
        <PresentationControls 
          global
          config={{ mass: 2, tension: 500 }}
          snap={{ mass: 4, tension: 1500 }}
          rotation={[0, 0, 0]}
          polar={[-Math.PI / 4, Math.PI / 4]}
          azimuth={[-Math.PI / 2, Math.PI / 2]}
        >
          <AbstractThemis />
        </PresentationControls>

        {/* Yere Vuran Dinamik Gölgeler */}
        <ContactShadows 
          position={[0, -2.5, 0]} 
          opacity={isDark ? 0.6 : 0.3} 
          scale={15} 
          blur={2.5} 
          far={5} 
          color={isDark ? "#000000" : "#475569"}
        />
      </Canvas>
    </div>
  );
}
