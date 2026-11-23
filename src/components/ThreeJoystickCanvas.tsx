import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { JoystickScreenBounds } from '../types/controller';

interface StickInputTarget {
  rawX: number;
  rawY: number;
  active: boolean;
}

interface ThreeJoystickCanvasProps {
  leftStickRef: React.MutableRefObject<StickInputTarget>;
  rightStickRef: React.MutableRefObject<StickInputTarget>;
  stickSize: number;
  layoutSpread: number;
  accentTheme: 'crimson' | 'gold';
  illuminationIntensity: number;
  onBoundsChange: (bounds: JoystickScreenBounds) => void;
  renderTriggerRef: React.MutableRefObject<(() => void) | null>;
}

interface StickRig {
  root: THREE.Group;
  pivot: THREE.Group;
  accentRingMat: THREE.MeshStandardMaterial;
  capGlowMat: THREE.MeshStandardMaterial;
  currentX: number;
  currentY: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createThumbCapBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Concentric elastomer grip ridges around the outer shoulder
  for (let r = 20; r < size * 0.48; r += 6) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = r > size * 0.32 ? 'rgba(240,240,240,0.6)' : 'rgba(150,150,150,0.28)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Micro-knurling stipple for tactile rubber grip
  for (let y = 0; y < size; y += 5) {
    for (let x = 0; x < size; x += 5) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > size * 0.28 && dist < size * 0.48) {
        const shade = (x + y) % 10 === 0 ? 225 : 75;
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createGraphiteGrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const v = 104 + ((i * 29) % 44);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 3, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  return tex;
}

function buildAnalogStickAssembly(
  thumbBumpTex: THREE.CanvasTexture,
  chassisTex: THREE.CanvasTexture,
  accentHex: number,
  disposables: Array<{ dispose: () => void }>,
): StickRig {
  const root = new THREE.Group();

  // 1. Stationary outer chamfered bezel (brushed titanium)
  const bezelProfile = [
    new THREE.Vector2(0.84, -0.09),
    new THREE.Vector2(1.06, -0.09),
    new THREE.Vector2(1.09, -0.01),
    new THREE.Vector2(1.01, 0.06),
    new THREE.Vector2(0.85, 0.06),
    new THREE.Vector2(0.82, -0.02),
  ];
  const bezelGeo = new THREE.LatheGeometry(bezelProfile, 48);
  bezelGeo.rotateX(Math.PI / 2);
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x252a34,
    metalness: 0.82,
    roughness: 0.3,
    bumpMap: chassisTex,
    bumpScale: 0.004,
  });
  const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
  bezelMesh.receiveShadow = true;
  root.add(bezelMesh);

  // 2. Inner anti-friction glide ring with restrained crimson/gold accent
  const ringGeo = new THREE.TorusGeometry(0.835, 0.015, 14, 48);
  const accentRingMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.14,
    metalness: 0.55,
    roughness: 0.3,
  });
  const ringMesh = new THREE.Mesh(ringGeo, accentRingMat);
  ringMesh.position.z = 0.045;
  root.add(ringMesh);

  // 3. Recessed socket cavity wall & floor
  const socketProfile = [
    new THREE.Vector2(0.0, -0.45),
    new THREE.Vector2(0.58, -0.42),
    new THREE.Vector2(0.83, 0.02),
    new THREE.Vector2(0.79, 0.02),
    new THREE.Vector2(0.52, -0.38),
    new THREE.Vector2(0.0, -0.41),
  ];
  const socketGeo = new THREE.LatheGeometry(socketProfile, 40);
  socketGeo.rotateX(Math.PI / 2);
  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0e,
    metalness: 0.08,
    roughness: 0.92,
  });
  const socketMesh = new THREE.Mesh(socketGeo, socketMat);
  socketMesh.receiveShadow = true;
  root.add(socketMesh);

  // 4. Soft radial contact shadow inside socket well
  const shadowGeo = new THREE.CircleGeometry(0.76, 36);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.z = -0.14;
  root.add(shadowMesh);

  // Articulated pivot group positioned at gimbal center
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, -0.38);
  root.add(pivot);

  // 5. Gimbal dome / dust shroud
  const domeGeo = new THREE.SphereGeometry(0.42, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.52);
  domeGeo.rotateX(Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x181b22,
    metalness: 0.16,
    roughness: 0.68,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  domeMesh.position.z = 0.04;
  pivot.add(domeMesh);

  // 6. Machined metallic analog shaft stem
  const stemGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.56, 28);
  stemGeo.rotateX(Math.PI / 2);
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x5c6475,
    metalness: 0.92,
    roughness: 0.22,
  });
  const stemMesh = new THREE.Mesh(stemGeo, stemMat);
  stemMesh.position.z = 0.52;
  stemMesh.castShadow = true;
  pivot.add(stemMesh);

  // 7. Flared under-cap neck collar (ends cleanly at z = 0.85, below thumb cap)
  const collarProfile = [
    new THREE.Vector2(0.17, 0.0),
    new THREE.Vector2(0.28, 0.05),
    new THREE.Vector2(0.54, 0.13),
    new THREE.Vector2(0.0, 0.13),
  ];
  const collarGeo = new THREE.LatheGeometry(collarProfile, 36);
  collarGeo.rotateX(Math.PI / 2);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x20242c,
    metalness: 0.35,
    roughness: 0.45,
  });
  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.position.z = 0.72;
  pivot.add(collarMesh);

  // 8. Under-lip subtle active illumination hairline
  const lipGlowGeo = new THREE.TorusGeometry(0.62, 0.011, 10, 48);
  const capGlowMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.08,
    metalness: 0.4,
    roughness: 0.3,
  });
  const lipGlowMesh = new THREE.Mesh(lipGlowGeo, capGlowMat);
  lipGlowMesh.position.z = 0.89;
  pivot.add(lipGlowMesh);

  // 9. Convex/ergonomic rubberized thumb cap with textured outer grip rim
  const capProfile = [
    new THREE.Vector2(0.0, 0.14),
    new THREE.Vector2(0.24, 0.135),
    new THREE.Vector2(0.42, 0.145),
    new THREE.Vector2(0.56, 0.165),
    new THREE.Vector2(0.66, 0.152),
    new THREE.Vector2(0.69, 0.085),
    new THREE.Vector2(0.65, 0.02),
    new THREE.Vector2(0.48, 0.0),
    new THREE.Vector2(0.0, 0.0),
  ];
  const capGeo = new THREE.LatheGeometry(capProfile, 48);
  capGeo.rotateX(Math.PI / 2);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e38,
    metalness: 0.08,
    roughness: 0.72,
    bumpMap: thumbBumpTex,
    bumpScale: 0.022,
    roughnessMap: thumbBumpTex,
  });
  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.position.z = 0.87;
  capMesh.castShadow = true;
  capMesh.receiveShadow = true;
  pivot.add(capMesh);

  // 10. Sculpted metallic crown trim ring around thumb cap lip for clear 3D edge read
  const capRimGeo = new THREE.TorusGeometry(0.61, 0.018, 12, 48);
  const capRimMat = new THREE.MeshStandardMaterial({
    color: 0x3b404e,
    metalness: 0.55,
    roughness: 0.35,
  });
  const capRimMesh = new THREE.Mesh(capRimGeo, capRimMat);
  capRimMesh.position.z = 1.015;
  pivot.add(capRimMesh);

  disposables.push(
    bezelGeo,
    bezelMat,
    ringGeo,
    accentRingMat,
    socketGeo,
    socketMat,
    shadowGeo,
    shadowMat,
    domeGeo,
    domeMat,
    stemGeo,
    stemMat,
    collarGeo,
    collarMat,
    lipGlowGeo,
    capGlowMat,
    capGeo,
    capMat,
    capRimGeo,
    capRimMat,
  );

  return {
    root,
    pivot,
    accentRingMat,
    capGlowMat,
    currentX: 0,
    currentY: 0,
  };
}

export function ThreeJoystickCanvas({
  leftStickRef,
  rightStickRef,
  stickSize,
  layoutSpread,
  accentTheme,
  illuminationIntensity,
  onBoundsChange,
  renderTriggerRef,
}: ThreeJoystickCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    stickSize,
    layoutSpread,
    accentTheme,
    illuminationIntensity,
    onBoundsChange,
  });
  propsRef.current = {
    stickSize,
    layoutSpread,
    accentTheme,
    illuminationIntensity,
    onBoundsChange,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const disposables: Array<{ dispose: () => void }> = [];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090a0c);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();
    disposables.push(envTex);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 40);

    // Studio lighting: warm directional key + cool hemisphere fill + crisp rim highlight
    const hemiLight = new THREE.HemisphereLight(0x9bb3d6, 0x101116, 0.8);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1df, 2.0);
    keyLight.position.set(-3.2, 4.8, 6.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    const d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc8d4ea, 0.75);
    rimLight.position.set(3.5, -2.5, 3.6);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const thumbBumpTex = createThumbCapBumpTexture(maxAniso);
    const chassisTex = createGraphiteGrainTexture(maxAniso);
    disposables.push(thumbBumpTex, chassisTex);

    // Subtle dark sculpted bridge connecting the twin analog stick wells (stays deep obsidian)
    const bridgeShape = new THREE.Shape();
    bridgeShape.moveTo(-2.35, -1.68);
    bridgeShape.quadraticCurveTo(0, -1.25, 2.35, -1.68);
    bridgeShape.lineTo(2.45, -0.35);
    bridgeShape.quadraticCurveTo(0, -0.58, -2.45, -0.35);
    bridgeShape.closePath();

    const bridgeGeo = new THREE.ExtrudeGeometry(bridgeShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 3,
    });
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x0d0f13,
      metalness: 0.18,
      roughness: 0.84,
      bumpMap: chassisTex,
      bumpScale: 0.004,
    });
    const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridgeMesh.position.set(0, 0, -0.26);
    bridgeMesh.receiveShadow = true;
    scene.add(bridgeMesh);
    disposables.push(bridgeGeo, bridgeMat);

    // Subtle brushed graphite accent seam across center bridge
    const seamGeo = new THREE.BoxGeometry(1.75, 0.014, 0.015);
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x262a34,
      metalness: 0.75,
      roughness: 0.32,
    });
    const seamMesh = new THREE.Mesh(seamGeo, seamMat);
    seamMesh.position.set(0, -0.96, -0.01);
    scene.add(seamMesh);
    disposables.push(seamGeo, seamMat);

    const initialAccentHex =
      propsRef.current.accentTheme === 'gold' ? 0xd4a853 : 0xc81e32;
    const leftRig = buildAnalogStickAssembly(
      thumbBumpTex,
      chassisTex,
      initialAccentHex,
      disposables,
    );
    const rightRig = buildAnalogStickAssembly(
      thumbBumpTex,
      chassisTex,
      initialAccentHex,
      disposables,
    );
    scene.add(leftRig.root);
    scene.add(rightRig.root);

    const _projCenter = new THREE.Vector3();
    const _projEdge = new THREE.Vector3();

    const syncLayoutAndCamera = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const aspect = w / h;

      camera.aspect = aspect;
      const baseZ = aspect < 1.35 ? 11.4 : 9.4;
      camera.position.set(0, -1.25, baseZ);
      camera.lookAt(0, -0.22, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);

      const spread = propsRef.current.layoutSpread;
      const isCompactLandscape = h < 460;
      const baseScale = isCompactLandscape ? 0.62 : aspect < 1.35 ? 0.68 : 0.72;
      const stickScale = propsRef.current.stickSize * baseScale;

      const xOffset = (aspect < 1.35 ? 1.25 : 1.48) * spread;
      const yOffset = isCompactLandscape ? -1.08 : -1.04;

      leftRig.root.position.set(-xOffset, yOffset, 0);
      leftRig.root.scale.setScalar(stickScale);
      rightRig.root.position.set(xOffset, yOffset, 0);
      rightRig.root.scale.setScalar(stickScale);

      bridgeMesh.scale.set(spread * (aspect < 1.35 ? 0.85 : 1.0), 1, 1);

      leftRig.root.updateMatrixWorld(true);
      rightRig.root.updateMatrixWorld(true);

      const projectRig = (rig: StickRig) => {
        _projCenter.set(0, 0, 0.56).applyMatrix4(rig.root.matrixWorld).project(camera);
        _projEdge.set(1.06, 0, 0.04).applyMatrix4(rig.root.matrixWorld).project(camera);
        const cx = ((_projCenter.x + 1) * 0.5) * w;
        const cy = ((-_projCenter.y + 1) * 0.5) * h;
        const ex = ((_projEdge.x + 1) * 0.5) * w;
        const ey = ((-_projEdge.y + 1) * 0.5) * h;
        const radius = Math.max(38, Math.hypot(ex - cx, ey - cy));
        return { x: cx, y: cy, radius };
      };

      propsRef.current.onBoundsChange({
        left: projectRig(leftRig),
        right: projectRig(rightRig),
      });
    };

    syncLayoutAndCamera();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Immediate synchronous initial paint so first frame is never blank
    renderer.render(scene, camera);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const updateStickRig = (
      rig: StickRig,
      target: StickInputTarget,
      dt: number,
      accentHex: number,
      illum: number,
    ): boolean => {
      const speed = target.active ? 34 : 19;
      const alpha = 1 - Math.exp(-speed * dt);
      rig.currentX += (target.rawX - rig.currentX) * alpha;
      rig.currentY += (target.rawY - rig.currentY) * alpha;

      if (Math.abs(target.rawX - rig.currentX) < 0.0008) rig.currentX = target.rawX;
      if (Math.abs(target.rawY - rig.currentY) < 0.0008) rig.currentY = target.rawY;

      const maxTilt = 0.42;
      rig.pivot.rotation.y = rig.currentX * maxTilt;
      rig.pivot.rotation.x = -rig.currentY * maxTilt;

      const mag = Math.min(1, Math.hypot(rig.currentX, rig.currentY));
      rig.accentRingMat.color.setHex(accentHex);
      rig.accentRingMat.emissive.setHex(accentHex);
      rig.accentRingMat.emissiveIntensity = (0.12 + mag * 0.68) * illum;

      rig.capGlowMat.color.setHex(accentHex);
      rig.capGlowMat.emissive.setHex(accentHex);
      rig.capGlowMat.emissiveIntensity = (0.06 + mag * 0.85) * illum;

      return (
        Math.abs(target.rawX - rig.currentX) > 0.001 ||
        Math.abs(target.rawY - rig.currentY) > 0.001 ||
        target.active
      );
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const accentHex =
          propsRef.current.accentTheme === 'gold' ? 0xd4a853 : 0xc81e32;
        const illum = propsRef.current.illuminationIntensity;

        const leftNeedsMore = updateStickRig(
          leftRig,
          leftStickRef.current,
          dt,
          accentHex,
          illum,
        );
        const rightNeedsMore = updateStickRig(
          rightRig,
          rightStickRef.current,
          dt,
          accentHex,
          illum,
        );

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || leftNeedsMore || rightNeedsMore)) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    renderTriggerRef.current = () => {
      syncLayoutAndCamera();
      requestRender();
    };

    const handleResize = () => {
      syncLayoutAndCamera();
      renderer.render(scene, camera);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      renderTriggerRef.current = null;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      disposables.forEach((dItem) => dItem.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [leftStickRef, rightStickRef, renderTriggerRef]);

  useEffect(() => {
    renderTriggerRef.current?.();
  }, [stickSize, layoutSpread, accentTheme, illuminationIntensity, renderTriggerRef]);

  return (
    <div
      ref={mountRef}
      data-testid="three-joystick-canvas"
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
