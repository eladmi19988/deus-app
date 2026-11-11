import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { EyeMode } from '../lib/eyeState';
import { getEyePulse } from '../lib/eyeAnimation';

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
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float fibers = sin(a * 146.0 + sin(a * 23.0) * 3.5 + r * 37.0 + sin(r * 74.0) * 1.1);
      float fineFibers = sin(a * 281.0 + r * 92.0 + sin(a * 31.0) * 2.0);
      float radial = smoothstep(0.20, 0.96, fibers * 0.5 + 0.5);
      float fine = fineFibers * 0.5 + 0.5;
      float irisMask = 1.0 - smoothstep(0.91, 1.0, r);
      float outerShade = smoothstep(1.02, 0.58, r);
      float innerGlow = 1.0 - smoothstep(0.12, 0.52, r);

      vec3 deep = vec3(0.008, 0.035, 0.095);
      vec3 ocean = vec3(0.018, 0.22, 0.43);
      vec3 cyan = vec3(0.035, 0.58, 0.68);
      vec3 green = vec3(0.10, 0.58, 0.39);
      vec3 gold = vec3(0.72, 0.49, 0.17);
      float outerBand = smoothstep(0.98, 0.72, r);
      float midBand = smoothstep(0.76, 0.42, r);
      float innerBand = smoothstep(0.40, 0.16, r);

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
      col += scan * vec3(0.10, 0.36, 0.48);
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
    const wave = Math.sin(angle * 2.0 + 0.35) * 0.075 + Math.sin(angle * 3.0 - 0.8) * 0.035;
    const fineWave = Math.sin(angle * 5.0 + 1.2) * 0.014;
    const scale = 1.0 + wave + fineWave;
    positions.setXYZ(i, x * scale, y * scale, z + Math.sin(angle * 2.0) * 0.035);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color, metalness: 0.92, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06,
    transparent: opacity < 1, opacity
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
    scene.background = new THREE.Color('#020509');
    const camera = new THREE.PerspectiveCamera(34, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100);
    camera.position.z = 7.35;
    const renderer = new THREE.WebGLRenderer({ context: gl as any, antialias: true, alpha: false });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setClearColor('#020509', 1);
    const root = new THREE.Group();
    scene.add(root);

    // Soft, organic eyeball volume with a cool porcelain-metal finish.
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(1.78, 96, 64),
      new THREE.MeshPhysicalMaterial({ color: '#D4E8E9', roughness: 0.17, metalness: 0.28, clearcoat: 1, clearcoatRoughness: 0.045 })
    );
    eye.scale.set(1.58, 0.94, 0.62);
    root.add(eye);

    // Layered, asymmetrical liquid-metal shell around the eye.
    const outerShell = makeOrganicRing(1.78, 0.19, '#B8D0D3');
    outerShell.scale.set(1.58, 0.94, 0.56);
    outerShell.position.set(0, 0, 0.04);
    root.add(outerShell);
    const shellHighlight = makeOrganicRing(1.62, 0.055, '#F0FFFF', 0.82);
    shellHighlight.scale.set(1.62, 0.96, 0.48);
    shellHighlight.position.set(0, 0.015, 0.16);
    root.add(shellHighlight);
    const innerMetal = makeOrganicRing(1.04, 0.065, '#6F9DA8');
    innerMetal.scale.set(1.03, 1.0, 0.62);
    innerMetal.position.z = 0.89;
    root.add(innerMetal);

    const irisUniforms = { uTime: { value: 0 } };
    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.96, 160),
      new THREE.ShaderMaterial({
        vertexShader: irisShader.vertexShader,
        fragmentShader: irisShader.fragmentShader,
        uniforms: irisUniforms,
        side: THREE.DoubleSide
      })
    );
    iris.position.set(0, 0, 1.045);
    root.add(iris);

    const irisRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.975, 0.055, 20, 160),
      new THREE.MeshPhysicalMaterial({ color: '#9AC6CB', metalness: 0.9, roughness: 0.13, clearcoat: 1 })
    );
    irisRim.position.z = 1.065;
    root.add(irisRim);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.39, 64, 48),
      new THREE.MeshPhysicalMaterial({ color: '#010207', roughness: 0.035, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.015 })
    );
    pupil.position.set(0, 0, 1.19);
    pupil.scale.set(1.04, 1.04, 0.28);
    root.add(pupil);

    const pupilRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.425, 0.018, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#D8F6F4', metalness: 0.94, roughness: 0.12 })
    );
    pupilRing.position.z = 1.225;
    root.add(pupilRing);

    const lights = [
      new THREE.PointLight('#D7FAFF', 3.8, 16),
      new THREE.PointLight('#238FC0', 2.7, 13),
      new THREE.PointLight('#D5B36B', 1.45, 10),
      new THREE.PointLight('#78E8D9', 1.0, 8)
    ];
    lights[0].position.set(-3.2, 3.0, 5.2);
    lights[1].position.set(3.0, -2.2, 4.0);
    lights[2].position.set(-0.2, 2.3, -1.5);
    lights[3].position.set(2.5, 1.5, 2.5);
    lights.forEach(light => scene.add(light));
    scene.add(new THREE.AmbientLight('#9CC9D1', 1.05));

    const particles = new THREE.Group();
    scene.add(particles);
    for (let i = 0; i < 54; i++) {
      const radius = 0.012 + Math.random() * 0.028;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 10),
        new THREE.MeshBasicMaterial({
          color: i % 5 === 0 ? '#B9F7FF' : i % 3 === 0 ? '#5DA5B8' : '#315C70',
          transparent: true,
          opacity: 0.22 + Math.random() * 0.5
        })
      );
      dot.position.set((Math.random() - 0.5) * 6.5, (Math.random() - 0.5) * 4.8, (Math.random() - 0.5) * 2.4 - 0.55);
      particles.add(dot);
    }

    let frame = 0;
    let running = true;
    const animate = () => {
      if (!running) return;
      frame += 0.012;
      const targetX = look.current.x * 0.42;
      const targetY = look.current.y * 0.30;
      pupil.position.x += (targetX - pupil.position.x) * 0.105;
      pupil.position.y += (targetY - pupil.position.y) * 0.105;
      pupilRing.position.x = pupil.position.x;
      pupilRing.position.y = pupil.position.y;

      const pulse = getEyePulse(modeRef.current, frame);
      iris.scale.setScalar(pulse);
      irisRim.scale.setScalar(pulse);
      irisUniforms.uTime.value = frame;
      const breath = 1 + Math.sin(frame * 1.15) * 0.006;
      root.scale.set(1.0 * breath, 1.0 * breath, 1.0);
      root.rotation.y += ((look.current.x * 0.105 + Math.sin(frame * 0.31) * 0.024) - root.rotation.y) * 0.022;
      root.rotation.x += ((-look.current.y * 0.065 + Math.sin(frame * 0.43) * 0.016) - root.rotation.x) * 0.022;
      outerShell.rotation.z = Math.sin(frame * 0.22) * 0.009;
      shellHighlight.rotation.z = -Math.sin(frame * 0.18) * 0.012;
      particles.rotation.z = Math.sin(frame * 0.14) * 0.032;
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
  wrap: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#020509' }
});
