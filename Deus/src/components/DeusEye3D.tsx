import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { EyeMode } from '../lib/eyeState';
import { getEyePulse } from '../lib/eyeAnimation';

type Props = { mode: EyeMode; onLook?: (x: number, y: number) => void };

const irisShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    void main(){
      vec2 p=vUv-0.5; float r=length(p); float a=atan(p.y,p.x);
      float fibers=sin(a*92.0+sin(a*17.0)*2.0+r*34.0)*0.5+0.5;
      float rays=smoothstep(0.2,0.95,fibers);
      float edge=smoothstep(0.51,0.34,r);
      vec3 deep=vec3(0.015,0.12,0.23); vec3 blue=vec3(0.04,0.43,0.68);
      vec3 teal=vec3(0.08,0.72,0.60); vec3 amber=vec3(0.72,0.52,0.20);
      float band=smoothstep(0.48,0.28,r);
      vec3 col=mix(deep,blue,band*0.72);
      col=mix(col,teal,smoothstep(0.36,0.23,r)*0.55);
      col=mix(col,amber,smoothstep(0.27,0.20,r)*0.42);
      col+=rays*vec3(0.12,0.30,0.34)*smoothstep(0.18,0.34,r);
      col*=edge; col+=vec3(0.10,0.32,0.42)*pow(max(0.0,1.0-r*2.0),12.0);
      gl_FragColor=vec4(col,1.0);
    }`
};

export default function DeusEye3D({ mode, onLook }: Props) {
  const look = useRef({ x: 0, y: 0 });
  const modeRef = useRef(mode);
  const disposeRef = useRef<(() => void) | null>(null);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => () => { disposeRef.current?.(); }, []);
  const size = useRef({ width: 1, height: 1 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  }, []);
  const handleTouch = useCallback((e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = THREE.MathUtils.clamp((locationX / size.current.width - 0.5) * 2, -1, 1);
    const y = THREE.MathUtils.clamp((locationY / size.current.height - 0.5) * -2, -1, 1);
    look.current = { x, y }; onLook?.(x, y);
  }, [onLook]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#03070D');
    const camera = new THREE.PerspectiveCamera(34, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100);
    camera.position.z = 7.4;
    const renderer = new THREE.WebGLRenderer({ context: gl as any, antialias: true, alpha: false });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setClearColor('#03070D', 1);
    const root = new THREE.Group(); scene.add(root);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.78, 64, 48), new THREE.MeshPhysicalMaterial({ color: '#B8D9DF', roughness: 0.2, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }));
    eye.scale.set(1.55, 0.91, 0.62); root.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.94, 128), new THREE.ShaderMaterial({ vertexShader: irisShader.vertexShader, fragmentShader: irisShader.fragmentShader, side: THREE.DoubleSide }));
    iris.position.set(0, 0, 1.04); root.add(iris);
    const irisRim = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.075, 16, 128), new THREE.MeshStandardMaterial({ color: '#7CABB7', metalness: 0.88, roughness: 0.22 }));
    irisRim.position.z = 1.07; root.add(irisRim);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.39, 48, 32), new THREE.MeshPhysicalMaterial({ color: '#01050A', roughness: 0.06, metalness: 0.1, clearcoat: 1 }));
    pupil.position.set(0, 0, 1.19); pupil.scale.set(1, 1, 0.28); root.add(pupil);
    const pupilRing = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 10, 80), new THREE.MeshStandardMaterial({ color: '#D2E9E9', metalness: 0.85, roughness: 0.18 }));
    pupilRing.position.z = 1.23; root.add(pupilRing);
    const shell = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.16, 20, 160), new THREE.MeshPhysicalMaterial({ color: '#AFC8CE', metalness: 0.92, roughness: 0.18, clearcoat: 0.8 }));
    shell.scale.set(1.55, 0.91, 0.55); shell.position.z = 0.08; root.add(shell);

    const lights = [
      new THREE.PointLight('#B7F5FF', 3.2, 15), new THREE.PointLight('#247EBB', 2.5, 12),
      new THREE.PointLight('#D4B66D', 1.1, 9),
    ]; lights[0].position.set(-3, 3, 5); lights[1].position.set(3, -2, 4); lights[2].position.set(0, 2, -2); lights.forEach(l => scene.add(l));
    const ambient = new THREE.AmbientLight('#8BB6C5', 1.25); scene.add(ambient);
    const particles = new THREE.Group(); scene.add(particles);
    for (let i = 0; i < 32; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.025, 8, 8), new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? '#9AEFFF' : '#477C91', transparent: true, opacity: 0.3 + Math.random() * 0.45 }));
      dot.position.set((Math.random() - 0.5) * 6.4, (Math.random() - 0.5) * 4.4, (Math.random() - 0.5) * 2 - 0.5); particles.add(dot);
    }
    let frame = 0; let running = true;
    const animate = () => {
      if (!running) return;
      frame += 0.012;
      const targetX = look.current.x * 0.42; const targetY = look.current.y * 0.3;
      pupil.position.x += (targetX - pupil.position.x) * 0.12;
      pupil.position.y += (targetY - pupil.position.y) * 0.12;
      pupilRing.position.x = pupil.position.x; pupilRing.position.y = pupil.position.y;
      const pulse = getEyePulse(modeRef.current, frame);
      iris.scale.setScalar(pulse); irisRim.scale.setScalar(pulse);
      root.rotation.y += ((look.current.x * 0.11 + Math.sin(frame * 0.35) * 0.025) - root.rotation.y) * 0.025;
      root.rotation.x += ((-look.current.y * 0.07 + Math.sin(frame * 0.5) * 0.018) - root.rotation.x) * 0.025;
      particles.rotation.z = Math.sin(frame * 0.15) * 0.035;
      renderer.render(scene, camera); gl.endFrameEXP();
      requestAnimationFrame(animate);
    }; animate();
    disposeRef.current = () => { running = false; renderer.dispose(); };
  }, []);

  return <View style={styles.wrap} onLayout={onLayout} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={handleTouch} onResponderMove={handleTouch}>
    <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
  </View>;
}
const styles = StyleSheet.create({ wrap: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#03070D' } });
