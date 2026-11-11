import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { EyeMode } from '../lib/eyeState';
import { getEyeMotion, getLiquidShellMotion, getLiquidShellWave, getSplashShardMotion } from '../lib/eyeAnimation';

type Props = { mode: EyeMode; onLook?: (x: number, y: number) => void };

const irisShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uGlow;
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float fibers = sin(a * 146.0 + sin(a * 23.0) * 3.5 + r * 37.0 + sin(r * 74.0) * 1.1);
      float fineFibers = sin(a * 281.0 + r * 92.0 + sin(a * 31.0) * 2.0);
      float radial = smoothstep(0.20, 0.96, fibers * 0.5 + 0.5);
      float fine = fineFibers * 0.5 + 0.5;
      float irisMask = 1.0 - smoothstep(0.91, 1.0, r);
      float outerShade = 1.0 - smoothstep(0.58, 1.02, r);
      float innerGlow = 1.0 - smoothstep(0.12, 0.52, r);

      vec3 deep = vec3(0.008, 0.035, 0.095);
      vec3 ocean = vec3(0.018, 0.22, 0.43);
      vec3 cyan = vec3(0.035, 0.58, 0.68);
      vec3 green = vec3(0.10, 0.58, 0.39);
      vec3 gold = vec3(0.72, 0.49, 0.17);
      float outerBand = 1.0 - smoothstep(0.72, 0.98, r);
      float midBand = 1.0 - smoothstep(0.42, 0.76, r);
      float innerBand = 1.0 - smoothstep(0.16, 0.40, r);

      vec3 col = mix(deep, ocean, outerBand * 0.95);
      col = mix(col, cyan, midBand * (0.38 + radial * 0.22));
      col = mix(col, green, smoothstep(0.67, 0.38, r) * 0.48);
      col = mix(col, gold, innerBand * 0.58);
      col += radial * vec3(0.11, 0.28, 0.34) * smoothstep(0.20, 0.48, r);
      col += fine * vec3(0.035, 0.10, 0.13) * smoothstep(0.18, 0.88, r);

      float limbalRing = smoothstep(0.88, 0.84, r) * (1.0 - smoothstep(0.96, 0.92, r));
      float innerRing = smoothstep(0.34, 0.31, r) * (1.0 - smoothstep(0.39, 0.36, r));
      col *= 1.0 - limbalRing * 0.58;
      col += innerRing * vec3(0.38, 0.24, 0.08);

      float scanAngle = a - uTime * 0.22;
      float scan = pow(max(0.0, cos(scanAngle)), 34.0) * smoothstep(0.28, 0.82, r);
      col += scan * vec3(0.10, 0.36, 0.48) * uGlow;
      float glint = pow(max(0.0, 1.0 - length(p - vec2(-0.28, 0.34)) * 5.0), 18.0);
      col += glint * vec3(0.72, 0.94, 1.0);
      col += innerGlow * vec3(0.10, 0.13, 0.07);
      col *= outerShade * irisMask;
      gl_FragColor = vec4(col, 1.0);
    }
  `
};

function makeOrganicRing(radius: number, tube: number, color: string, opacity = 1) {
  const geometry = new THREE.TorusGeometry(radius, tube, 28, 192);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(y, x);
    const wave = Math.sin(angle * 2.0 + 0.35) * 0.105 + Math.sin(angle * 3.0 - 0.8) * 0.075;
    const fineWave = Math.sin(angle * 5.0 + 1.2) * 0.035 + Math.sin(angle * 9.0) * 0.018;
    const scale = 1.0 + wave + fineWave;
    const splash = Math.pow(Math.max(0, Math.sin(angle * 5.0 + 0.7)), 8.0) * 0.11;
    positions.setXYZ(i, x * (scale + splash), y * (scale + splash), z + Math.sin(angle * 2.0) * 0.07 + splash * 0.6);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color, metalness: 0.46, roughness: 0.095, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: opacity < 1, opacity
  }));
}


function deformLiquidRing(mesh: THREE.Mesh, basePositions: Float32Array, time: number, intensity: number) {
  const positions = mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const offset = index * 3;
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    const radius = Math.hypot(x, y) || 1;
    const wave = getLiquidShellWave(Math.atan2(y, x), time, intensity);
    positions.setXYZ(index, x + (x / radius) * wave.radial, y + (y / radius) * wave.radial, z + wave.depth);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}


function makeChromeShard() {
  const profile = [
    new THREE.Vector2(0.002, -0.5),
    new THREE.Vector2(0.026, -0.34),
    new THREE.Vector2(0.052, -0.08),
    new THREE.Vector2(0.043, 0.22),
    new THREE.Vector2(0.018, 0.43),
    new THREE.Vector2(0.001, 0.58),
  ];
  const geometry = new THREE.LatheGeometry(profile, 20);
  return new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: '#DDFBFF',
    metalness: 0.38,
    roughness: 0.075,
    clearcoat: 1,
    clearcoatRoughness: 0.012,
    emissive: '#477D89',
    emissiveIntensity: 0.12,
  }));
}

function makeChromeReflectionArc(angle: number, radius: number, length: number, z: number) {
  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= 12; step++) {
    const t = step / 12 - 0.5;
    const a = angle + t * length;
    const r = radius + Math.sin(t * Math.PI) * 0.018;
    points.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z + Math.cos(t * Math.PI * 2) * 0.018));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 24, 0.009, 6, false);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#E9FFFF',
    metalness: 0.22,
    roughness: 0.055,
    clearcoat: 1,
    emissive: '#79D5E2',
    emissiveIntensity: 0.24,
    transparent: true,
    opacity: 0.78,
  });
  return new THREE.Mesh(geometry, material);
}

export default function DeusEye3D({ mode, onLook }: Props) {
  const look = useRef({ x: 0, y: 0 });
  const modeRef = useRef(mode);
  const disposeRef = useRef<(() => void) | null>(null);
  const size = useRef({ width: 1, height: 1 });
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => () => { disposeRef.current?.(); }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  }, []);

  const handleTouch = useCallback((e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = THREE.MathUtils.clamp((locationX / size.current.width - 0.5) * 2, -1, 1);
    const y = THREE.MathUtils.clamp((locationY / size.current.height - 0.5) * -2, -1, 1);
    look.current = { x, y };
    onLook?.(x, y);
  }, [onLook]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    const camera = new THREE.PerspectiveCamera(34, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100);
    camera.position.z = 7.05;
    const renderer = new THREE.WebGLRenderer({ context: gl as any, antialias: true, alpha: false });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setClearColor('#000000', 1);
    const root = new THREE.Group();
    scene.add(root);

    // The reference is a floating eye: no solid eyeball, no oversized HUD.
    // The silver shell is intentionally irregular, like liquid chrome frozen mid-splash.
    const outerShell = makeOrganicRing(1.32, 0.105, '#F3FFFF');
    outerShell.position.z = 0.02;
    root.add(outerShell);
    const outerShellBase = new Float32Array((outerShell.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array);

    const shellHighlight = makeOrganicRing(1.27, 0.032, '#FFFFFF', 1);
    shellHighlight.position.z = 0.14;
    root.add(shellHighlight);
    const shellHighlightBase = new Float32Array((shellHighlight.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array);

    const innerMetal = makeOrganicRing(0.98, 0.042, '#C7E6E8', 1);
    innerMetal.position.z = 0.76;
    root.add(innerMetal);

    // Broken liquid-chrome splinters: elongated, tapered and individually animated.
    const droplets: THREE.Mesh[] = [];
    const dropletSeeds: { angle: number; index: number }[] = [];
    for (let i = 0; i < 11; i++) {
      const shard = makeChromeShard();
      const angle = (i / 11) * Math.PI * 2 + Math.sin(i * 2.3) * 0.16;
      shard.scale.set(0.72 + (i % 3) * 0.18, 1.0, 0.72 + (i % 2) * 0.16);
      root.add(shard);
      droplets.push(shard);
      dropletSeeds.push({ angle, index: i });
    }

    // Narrow specular streaks fake a moving studio reflection across the chrome.
    const reflectionArcs: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const arc = makeChromeReflectionArc(i * (Math.PI * 2 / 7) + 0.18, 1.315, 0.24 + (i % 3) * 0.1, 0.16 + (i % 2) * 0.035);
      root.add(arc);
      reflectionArcs.push(arc);
    }

    const irisUniforms = { uTime: { value: 0 }, uGlow: { value: 0.58 } };
    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 160),
      new THREE.ShaderMaterial({
        vertexShader: irisShader.vertexShader,
        fragmentShader: irisShader.fragmentShader,
        uniforms: irisUniforms,
        side: THREE.DoubleSide
      })
    );
    iris.position.set(0, 0, 0.94);
    root.add(iris);

    const irisRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.795, 0.035, 20, 160),
      new THREE.MeshPhysicalMaterial({ color: '#9AC6CB', metalness: 0.9, roughness: 0.13, clearcoat: 1 })
    );
    irisRim.position.z = 0.965;
    root.add(irisRim);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 64, 48),
      new THREE.MeshPhysicalMaterial({ color: '#010207', roughness: 0.035, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.015 })
    );
    pupil.position.set(0, 0, 1.06);
    pupil.scale.set(1.04, 1.04, 0.28);
    root.add(pupil);

    const pupilRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.315, 0.014, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#D8F6F4', metalness: 0.94, roughness: 0.12 })
    );
    pupilRing.position.z = 1.09;
    root.add(pupilRing);

    const lights = [
      new THREE.PointLight('#F1FFFF', 6.2, 18),
      new THREE.PointLight('#238FC0', 3.2, 13),
      new THREE.PointLight('#D5B36B', 1.45, 10),
      new THREE.PointLight('#78E8D9', 1.0, 8)
    ];
    lights[0].position.set(-3.2, 3.0, 5.2);
    lights[1].position.set(3.0, -2.2, 4.0);
    lights[2].position.set(-0.2, 2.3, -1.5);
    lights[3].position.set(2.5, 1.5, 2.5);
    lights.forEach(light => scene.add(light));
    scene.add(new THREE.AmbientLight('#C5E5E8', 1.3));

    const particles = new THREE.Group();
    scene.add(particles);
    for (let i = 0; i < 10; i++) {
      const radius = 0.008 + Math.random() * 0.014;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 10),
        new THREE.MeshBasicMaterial({
          color: i % 5 === 0 ? '#B9F7FF' : i % 3 === 0 ? '#5DA5B8' : '#315C70',
          transparent: true,
          opacity: 0.22 + Math.random() * 0.5
        })
      );
      dot.position.set((Math.random() - 0.5) * 3.8, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 1.0 - 0.25);
      particles.add(dot);
    }

    let frame = 0;
    let running = true;
    const animate = () => {
      if (!running) return;
      frame += 0.012;
      const motion = getEyeMotion(modeRef.current, frame);
      const liquid = getLiquidShellMotion(modeRef.current, frame);
      const targetX = look.current.x * 0.42 * motion.gazeSensitivity;
      const targetY = look.current.y * 0.30 * motion.gazeSensitivity;
      pupil.position.x += (targetX - pupil.position.x) * 0.105;
      pupil.position.y += (targetY - pupil.position.y) * 0.105;
      pupilRing.position.x = pupil.position.x;
      pupilRing.position.y = pupil.position.y;

      iris.scale.set(motion.pulse, motion.pulse, 1);
      irisRim.scale.set(motion.pulse, motion.pulse, 1);
      pupil.scale.set(1.04 * motion.pupilScale, 1.04 * motion.pupilScale, 0.28);
      pupilRing.scale.setScalar(motion.pupilScale);
      irisUniforms.uTime.value = frame * motion.scanSpeed;
      irisUniforms.uGlow.value = motion.glow;
      const breath = 1 + Math.sin(frame * 1.15) * 0.006;
      root.scale.setScalar(0.82 * breath * liquid.shellPulse);
      root.rotation.y += ((look.current.x * 0.105 + Math.sin(frame * 0.31) * 0.024) - root.rotation.y) * 0.022;
      root.rotation.x += ((-look.current.y * 0.065 + Math.sin(frame * 0.43) * 0.016) - root.rotation.x) * 0.022;
      deformLiquidRing(outerShell, outerShellBase, frame, liquid.splashAmount);
      deformLiquidRing(shellHighlight, shellHighlightBase, frame * 0.86, liquid.splashAmount * 0.68);
      outerShell.rotation.z = Math.sin(frame * 0.42) * 0.025;
      shellHighlight.rotation.z = -Math.sin(frame * 0.31) * 0.032;
      innerMetal.rotation.z = Math.sin(frame * 0.24) * 0.018;
      droplets.forEach((shard, index) => {
        const seed = dropletSeeds[index];
        const motion = getSplashShardMotion(seed.angle, frame, seed.index, liquid.splashAmount);
        const angle = seed.angle + Math.sin(frame * 0.22 + seed.index) * 0.035;
        const radialX = Math.cos(angle);
        const radialY = Math.sin(angle);
        const tangentX = -radialY;
        const tangentY = radialX;
        shard.position.set(
          radialX * motion.radial + tangentX * motion.tangent,
          radialY * motion.radial + tangentY * motion.tangent,
          motion.depth
        );
        shard.rotation.z = angle - Math.PI / 2 + motion.twist;
        shard.rotation.x = Math.sin(frame * 0.9 + index) * 0.32;
        shard.rotation.y = Math.cos(frame * 0.7 + index * 1.4) * 0.26;
        shard.scale.set(0.72 * motion.width, motion.stretch, 0.72 * motion.width);
      });
      reflectionArcs.forEach((arc, index) => {
        const material = arc.material as THREE.MeshPhysicalMaterial;
        material.opacity = 0.52 + (Math.sin(frame * 0.9 + index * 1.7) + 1) * 0.18;
        arc.rotation.z = Math.sin(frame * 0.24 + index) * 0.012;
      });
      particles.rotation.z = Math.sin(frame * 0.14) * 0.025;
      renderer.render(scene, camera);
      gl.endFrameEXP();
      requestAnimationFrame(animate);
    };
    animate();

    disposeRef.current = () => {
      running = false;
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#000000' }
});
