import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { EyeMode } from '../lib/eyeState';
import { getEyeMotion, getEyeBlinkAmount, getLiquidShellMotion, getSplashShardMotion, getChromeShellLayout, getChromeSurfaceProfile, getWrappedChromeShellPoint } from '../lib/eyeAnimation';

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

function addChromeVertexColors(geometry: THREE.BufferGeometry) {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const baseColor = new THREE.Color('#D4DEE1');

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const radius = Math.hypot(x, y, z) || 1;
    const angle = Math.atan2(y, x);
    const polar = Math.acos(THREE.MathUtils.clamp(z / radius, -1, 1));
    const profile = getChromeSurfaceProfile(angle, Math.PI / 2 - polar, 0, 1);
    const angularReflection = 0.5 + 0.5 * Math.sin(angle * 2.3 + 0.55);
    const shade = THREE.MathUtils.clamp(0.12 + profile.reflection * 0.92 + angularReflection * 0.16, 0.08, 1.65);
    colors[i * 3] = baseColor.r * shade;
    colors[i * 3 + 1] = baseColor.g * shade;
    colors[i * 3 + 2] = baseColor.b * shade;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function makeChromeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#FFFFFF',
    metalness: 0.82,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    emissive: '#111C22',
    emissiveIntensity: 0.08,
  });
}

/** One continuous spherical skin: it begins at the iris aperture and wraps around the eye to its back. */
function makeWrappedChromeShell(layout: ReturnType<typeof getChromeShellLayout>, material: THREE.Material) {
  const azimuthSegments = 192;
  const polarSegments = 64;
  const rowLength = azimuthSegments + 1;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= polarSegments; row++) {
    const polar = THREE.MathUtils.lerp(layout.shellStartPolar, layout.shellEndPolar, row / polarSegments);
    for (let column = 0; column <= azimuthSegments; column++) {
      const angle = (column / azimuthSegments) * Math.PI * 2;
      const point = getWrappedChromeShellPoint(angle, polar, 0, 1);
      positions.push(point.x, point.y, point.z);
    }
  }

  for (let row = 0; row < polarSegments; row++) {
    for (let column = 0; column < azimuthSegments; column++) {
      const a = row * rowLength + column;
      const b = a + rowLength;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  addChromeVertexColors(geometry);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function deformWrappedChromeShell(mesh: THREE.Mesh, basePositions: Float32Array, time: number, intensity: number) {
  const positions = mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const offset = index * 3;
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    const radius = Math.hypot(x, y, z) || 1;
    const angle = Math.atan2(y, x);
    const polar = Math.acos(THREE.MathUtils.clamp(z / radius, -1, 1));
    const point = getWrappedChromeShellPoint(angle, polar, time, intensity);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}


function makeChromeShard() {
  const profile = [
    new THREE.Vector2(0.002, -0.5),
    new THREE.Vector2(0.035, -0.48),
    new THREE.Vector2(0.082, -0.30),
    new THREE.Vector2(0.112, -0.06),
    new THREE.Vector2(0.086, 0.20),
    new THREE.Vector2(0.042, 0.43),
    new THREE.Vector2(0.001, 0.58),
  ];
  const geometry = new THREE.LatheGeometry(profile, 20);
  return new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: '#EAFBFF',
    metalness: 0.22,
    roughness: 0.045,
    clearcoat: 1,
    clearcoatRoughness: 0.012,
    emissive: '#9CCBD4',
    emissiveIntensity: 0.34,
  }));
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

    // One continuous chrome skin wraps the centered eyeball, leaving only the iris opening exposed.
    const chromeLayout = getChromeShellLayout();
    const chromeMaterial = makeChromeMaterial();
    const outerShell = makeWrappedChromeShell(chromeLayout, chromeMaterial);
    root.add(outerShell);
    const outerShellBase = new Float32Array((outerShell.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array);

    const eyeBall = new THREE.Mesh(
      new THREE.SphereGeometry(chromeLayout.eyeRadius, 96, 64),
      new THREE.MeshPhysicalMaterial({
        color: '#07151E',
        metalness: 0.18,
        roughness: 0.26,
        clearcoat: 0.9,
        clearcoatRoughness: 0.08,
      })
    );
    eyeBall.position.z = chromeLayout.eyeCenterZ;
    root.add(eyeBall);

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

    const irisUniforms = { uTime: { value: 0 }, uGlow: { value: 0.58 } };
    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(chromeLayout.irisRadius, 160),
      new THREE.ShaderMaterial({
        vertexShader: irisShader.vertexShader,
        fragmentShader: irisShader.fragmentShader,
        uniforms: irisUniforms,
        side: THREE.DoubleSide
      })
    );
    iris.position.set(0, 0, chromeLayout.irisZ);
    root.add(iris);

    const irisRim = new THREE.Mesh(
      new THREE.TorusGeometry(chromeLayout.irisRadius + 0.015, 0.03, 20, 160),
      new THREE.MeshPhysicalMaterial({ color: '#9AC6CB', metalness: 0.9, roughness: 0.13, clearcoat: 1 })
    );
    irisRim.position.z = chromeLayout.irisZ + 0.012;
    root.add(irisRim);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(chromeLayout.pupilRadius, 64, 48),
      new THREE.MeshPhysicalMaterial({ color: '#010207', roughness: 0.035, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.015 })
    );
    pupil.position.set(0, 0, chromeLayout.pupilZ);
    pupil.scale.set(1.04, 1.04, 0.28);
    root.add(pupil);

    const pupilRing = new THREE.Mesh(
      new THREE.TorusGeometry(chromeLayout.pupilRadius + 0.025, 0.014, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#D8F6F4', metalness: 0.94, roughness: 0.12 })
    );
    pupilRing.position.z = chromeLayout.pupilZ + 0.03;
    root.add(pupilRing);

    // Blink lids share the exact chrome material used by the surrounding shell.
    const upperLidGeometry = new THREE.SphereGeometry(chromeLayout.irisRadius + 0.04, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const lowerLidGeometry = new THREE.SphereGeometry(chromeLayout.irisRadius + 0.04, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    addChromeVertexColors(upperLidGeometry);
    addChromeVertexColors(lowerLidGeometry);
    const upperBlinkLid = new THREE.Mesh(upperLidGeometry, chromeMaterial);
    upperBlinkLid.scale.set(1.04, 1.04, 0.16);
    upperBlinkLid.position.set(0, chromeLayout.irisRadius + 0.06, chromeLayout.pupilZ + 0.08);
    root.add(upperBlinkLid);

    const lowerBlinkLid = new THREE.Mesh(lowerLidGeometry, chromeMaterial);
    lowerBlinkLid.scale.set(1.04, 1.04, 0.16);
    lowerBlinkLid.position.set(0, -(chromeLayout.irisRadius + 0.06), chromeLayout.pupilZ + 0.08);
    root.add(lowerBlinkLid);

    const lights = [
      new THREE.PointLight('#FFFFFF', 14.0, 18),
      new THREE.PointLight('#8EDFFF', 6.5, 13),
      new THREE.PointLight('#E8F2FF', 3.2, 10),
      new THREE.PointLight('#78E8D9', 1.7, 8)
    ];
    lights[0].position.set(-2.4, 2.8, 5.4);
    lights[1].position.set(2.8, -1.8, 4.8);
    lights[2].position.set(-0.2, 2.3, -1.5);
    lights[3].position.set(2.5, 1.4, 3.4);
    lights.forEach(light => scene.add(light));
    scene.add(new THREE.AmbientLight('#E8F7FA', 1.8));

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
      const blink = getEyeBlinkAmount(frame);
      // The pupil is deliberately anchored to the iris center; only the whole eye may orient.
      pupil.position.set(0, 0, chromeLayout.pupilZ);
      pupilRing.position.set(0, 0, chromeLayout.pupilZ + 0.03);

      const lidOffset = (chromeLayout.irisRadius + 0.06) * (1 - blink);
      upperBlinkLid.position.y = lidOffset;
      lowerBlinkLid.position.y = -lidOffset;
      upperBlinkLid.visible = blink > 0.008;
      lowerBlinkLid.visible = blink > 0.008;
      pupil.scale.set(1.04, 1.04, 0.28);
      pupilRing.scale.setScalar(1);
      irisUniforms.uTime.value = frame * motion.scanSpeed;
      irisUniforms.uGlow.value = motion.glow;
      const breath = 1 + Math.sin(frame * 1.15) * 0.006;
      root.scale.setScalar(0.82 * breath * liquid.shellPulse);
      root.rotation.y += ((look.current.x * 0.105 + Math.sin(frame * 0.31) * 0.024) - root.rotation.y) * 0.022;
      root.rotation.x += ((-look.current.y * 0.065 + Math.sin(frame * 0.43) * 0.016) - root.rotation.x) * 0.022;
      deformWrappedChromeShell(outerShell, outerShellBase, frame, liquid.splashAmount);
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
