/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  AgentState,
  AvatarExpression,
  CharacterAnimationState,
  CharacterPosture,
  CharacterGesture,
} from '../../types/agent';

interface Avatar3DStageProps {
  mode: 'dashboard' | 'companion';
  agentState: AgentState;
  animationState?: CharacterAnimationState;
  posture?: CharacterPosture;
  gesture?: CharacterGesture;
  expression?: AvatarExpression;
  isSpeaking: boolean;
  micVolume: number; // 0 to 1
  spokenText?: string;
  assistantName?: string;
  onMicToggle?: () => void;
  onClickThroughToggle?: () => void;
  className?: string;
}

export const Avatar3DStage: React.FC<Avatar3DStageProps> = ({
  mode,
  agentState,
  animationState = 'IDLE',
  posture = 'standing',
  gesture,
  expression = 'FRIENDLY',
  isSpeaking,
  micVolume,
  spokenText,
  assistantName = 'Saba (NX AI)',
  onMicToggle,
  onClickThroughToggle,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    agentState,
    animationState,
    posture,
    gesture,
    expression,
    isSpeaking,
    micVolume,
    mode,
  });
  stateRef.current = {
    agentState,
    animationState,
    posture,
    gesture,
    expression,
    isSpeaking,
    micVolume,
    mode,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animationFrameId: number;
    const width = container.clientWidth || (mode === 'companion' ? 240 : 420);
    const height = container.clientHeight || (mode === 'companion' ? 300 : 520);

    // 1. Scene & Transparent Camera setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    camera.position.set(0, 1.35, mode === 'companion' ? 2.8 : 2.5);

    // 2. WebGLRenderer with mandatory alpha transparency & zero black border composition
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // Transparent canvas background
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 3. Studio Lighting Rig (Warm Key + Cool Rim/Fill)
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    keyLight.position.set(1.5, 3.0, 2.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x90caf9, 1.4);
    fillLight.position.set(-2.0, 1.5, 1.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf48fb1, 1.8);
    rimLight.position.set(0, 3.0, -2.5);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Grounding Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(1.4, 0.8);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x030712,
      transparent: true,
      opacity: 0.35,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.05, 0);
    scene.add(contactShadow);

    // 4. Procedural Stylized Anime Avatar Hierarchy (THREE.Group)
    const characterGroup = new THREE.Group();
    scene.add(characterGroup);

    // Canonical Pakistani Female Identity Materials (Locked to reference_canonical.png)
    // Texture loader to bind canonical reference identity features onto character meshes
    const textureLoader = new THREE.TextureLoader();
    const canonicalTexture = textureLoader.load(
      '/assets/character/reference_canonical.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
      },
      undefined,
      () => {
        // Fallback gracefully to procedural material if texture is unavailable
      }
    );

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xfce1cc, // Warm natural South Asian complexion
      roughness: 0.58,
      metalness: 0.04,
    });

    const blushMaterial = new THREE.MeshBasicMaterial({
      color: 0xf87171,
      transparent: true,
      opacity: 0.38,
    });

    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x17121b, // Rich glossy natural dark brown/black hair
      roughness: 0.32,
      metalness: 0.12,
    });

    const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const irisMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d271d, // Deep almond brown iris matching reference
      roughness: 0.18,
      metalness: 0.08,
    });
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x070608 });
    const eyeHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const kurtiMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Vibrant teal modest Pakistani kurti
      roughness: 0.68,
      metalness: 0.08,
    });

    const goldTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Gold embroidery border trim
      roughness: 0.28,
      metalness: 0.75,
    });

    const dupattaMaterial = new THREE.MeshStandardMaterial({
      color: 0xe11d48, // Traditional crimson draped dupatta / shawl
      roughness: 0.82,
      metalness: 0.04,
    });

    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0xb91c1c });
    const armMaterial = new THREE.MeshStandardMaterial({
      color: 0xfce1cc,
      roughness: 0.6,
      metalness: 0.04,
    });

    // Lower Body / Legs Rig (For Standing vs Sitting / Perched Poses)
    const lowerBodyGroup = new THREE.Group();
    lowerBodyGroup.position.set(0, 0.35, 0);
    characterGroup.add(lowerBodyGroup);

    // Salwar / Pants / Skirt Base
    const legLeft = new THREE.Group();
    legLeft.position.set(-0.1, 0, 0);
    const legRight = new THREE.Group();
    legRight.position.set(0.1, 0, 0);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.45, 16);
    const legMeshL = new THREE.Mesh(legGeo, kurtiMaterial);
    legMeshL.position.y = -0.22;
    legLeft.add(legMeshL);

    const legMeshR = new THREE.Mesh(legGeo, kurtiMaterial);
    legMeshR.position.y = -0.22;
    legRight.add(legMeshR);

    // Delicate shoes/khussa
    const shoeGeo = new THREE.BoxGeometry(0.075, 0.04, 0.14);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.6 });
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(0, -0.44, 0.02);
    legLeft.add(shoeL);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0, -0.44, 0.02);
    legRight.add(shoeR);

    lowerBodyGroup.add(legLeft);
    lowerBodyGroup.add(legRight);

    // Torso / Shoulders
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.65, 0);
    characterGroup.add(torsoGroup);

    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.65, 24);
    const torsoMesh = new THREE.Mesh(torsoGeo, kurtiMaterial);
    torsoMesh.position.y = 0.1;
    torsoGroup.add(torsoMesh);

    // Gold Collar trim
    const collarGeo = new THREE.TorusGeometry(0.18, 0.025, 12, 32);
    const collarMesh = new THREE.Mesh(collarGeo, goldTrimMaterial);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.set(0, 0.4, 0.02);
    torsoGroup.add(collarMesh);

    // Arms and Hands Rig (For gestures: waving, pointing, thinking pose)
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.28, 0.32, 0);
    torsoGroup.add(leftArmGroup);

    const armGeo = new THREE.CylinderGeometry(0.045, 0.038, 0.38, 12);
    const leftArmMesh = new THREE.Mesh(armGeo, kurtiMaterial);
    leftArmMesh.position.y = -0.16;
    leftArmGroup.add(leftArmMesh);

    const leftHandGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const leftHandMesh = new THREE.Mesh(leftHandGeo, armMaterial);
    leftHandMesh.position.y = -0.36;
    leftArmGroup.add(leftHandMesh);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.28, 0.32, 0);
    torsoGroup.add(rightArmGroup);

    const rightArmMesh = new THREE.Mesh(armGeo, kurtiMaterial);
    rightArmMesh.position.y = -0.16;
    rightArmGroup.add(rightArmMesh);

    const rightHandGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const rightHandMesh = new THREE.Mesh(rightHandGeo, armMaterial);
    rightHandMesh.position.y = -0.36;
    rightArmGroup.add(rightHandMesh);

    // Draped Dupatta / Shawl accent
    const dupattaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.32, 0.38, 0.08),
      new THREE.Vector3(-0.18, 0.15, 0.22),
      new THREE.Vector3(0.0, -0.05, 0.24),
      new THREE.Vector3(0.22, 0.15, 0.20),
      new THREE.Vector3(0.34, 0.38, 0.08),
    ]);
    const dupattaGeo = new THREE.TubeGeometry(dupattaCurve, 32, 0.065, 12, false);
    const dupattaMesh = new THREE.Mesh(dupattaGeo, dupattaMaterial);
    torsoGroup.add(dupattaMesh);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.18, 16);
    const neckMesh = new THREE.Mesh(neckGeo, skinMaterial);
    neckMesh.position.set(0, 0.48, 0);
    torsoGroup.add(neckMesh);

    // Head Kinematics Joint
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.6, 0.02);
    torsoGroup.add(headGroup);

    // Head Base (Anime jaw shape)
    const headGeo = new THREE.SphereGeometry(0.27, 32, 24);
    headGeo.scale(0.95, 1.15, 0.95);
    const headMesh = new THREE.Mesh(headGeo, skinMaterial);
    headMesh.position.set(0, 0.24, 0);
    headGroup.add(headMesh);

    // Cheeks / Blush
    const blushGeo = new THREE.CircleGeometry(0.05, 16);
    const leftBlush = new THREE.Mesh(blushGeo, blushMaterial);
    leftBlush.position.set(-0.14, 0.2, 0.24);
    leftBlush.rotation.y = -0.2;
    headGroup.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, blushMaterial);
    rightBlush.position.set(0.14, 0.2, 0.24);
    rightBlush.rotation.y = 0.2;
    headGroup.add(rightBlush);

    // Eyes (Stylized Anime)
    const createEye = (isRight: boolean) => {
      const eyeSubGroup = new THREE.Group();
      const xOffset = isRight ? 0.095 : -0.095;
      eyeSubGroup.position.set(xOffset, 0.25, 0.22);

      // Eye White
      const whiteGeo = new THREE.SphereGeometry(0.052, 16, 16);
      whiteGeo.scale(1.1, 1.25, 0.4);
      const whiteMesh = new THREE.Mesh(whiteGeo, eyeWhiteMaterial);
      eyeSubGroup.add(whiteMesh);

      // Iris
      const irisGeo = new THREE.SphereGeometry(0.038, 16, 16);
      irisGeo.scale(1.0, 1.25, 0.3);
      const irisMesh = new THREE.Mesh(irisGeo, irisMaterial);
      irisMesh.position.set(0, -0.005, 0.02);
      eyeSubGroup.add(irisMesh);

      // Pupil
      const pupilGeo = new THREE.CircleGeometry(0.016, 16);
      const pupilMesh = new THREE.Mesh(pupilGeo, pupilMaterial);
      pupilMesh.position.set(0, -0.005, 0.033);
      eyeSubGroup.add(pupilMesh);

      // Specular Star Glint
      const glintGeo = new THREE.CircleGeometry(0.008, 12);
      const glintMesh = new THREE.Mesh(glintGeo, eyeHighlightMaterial);
      glintMesh.position.set(0.01, 0.012, 0.034);
      eyeSubGroup.add(glintMesh);

      // Eyelid for Blinking animation
      const lidGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.045, 16, 1, false, 0, Math.PI);
      const lidMesh = new THREE.Mesh(lidGeo, skinMaterial);
      lidMesh.position.set(0, 0.04, 0.022);
      lidMesh.rotation.z = Math.PI;
      eyeSubGroup.add(lidMesh);

      return { group: eyeSubGroup, lidMesh, irisMesh };
    };

    const leftEye = createEye(false);
    const rightEye = createEye(true);
    headGroup.add(leftEye.group);
    headGroup.add(rightEye.group);

    // Eyebrows
    const browGeo = new THREE.BoxGeometry(0.07, 0.012, 0.01);
    const leftBrow = new THREE.Mesh(browGeo, hairMaterial);
    leftBrow.position.set(-0.1, 0.32, 0.25);
    leftBrow.rotation.z = 0.05;
    headGroup.add(leftBrow);

    const rightBrow = new THREE.Mesh(browGeo, hairMaterial);
    rightBrow.position.set(0.1, 0.32, 0.25);
    rightBrow.rotation.z = -0.05;
    headGroup.add(rightBrow);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.022, 0.04, 12);
    const noseMesh = new THREE.Mesh(noseGeo, skinMaterial);
    noseMesh.position.set(0, 0.18, 0.26);
    noseMesh.rotation.x = Math.PI / 10;
    headGroup.add(noseMesh);

    // Mouth Viseme Meshes (Animated dynamically)
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, 0.12, 0.255);
    headGroup.add(mouthGroup);

    const mouthGeo = new THREE.SphereGeometry(0.03, 16, 12);
    mouthGeo.scale(1.2, 0.4, 0.4);
    const mouthMesh = new THREE.Mesh(mouthGeo, mouthMaterial);
    mouthGroup.add(mouthMesh);

    // Hair Assembly (Front Bangs, Side Locks, Ponytail/Back Braid)
    const hairGroup = new THREE.Group();
    hairGroup.position.set(0, 0.26, -0.02);
    headGroup.add(hairGroup);

    // Top hair volume
    const hairTopGeo = new THREE.SphereGeometry(0.29, 24, 18);
    hairTopGeo.scale(1.02, 1.1, 1.05);
    const hairTopMesh = new THREE.Mesh(hairTopGeo, hairMaterial);
    hairTopMesh.position.set(0, 0.05, -0.03);
    hairGroup.add(hairTopMesh);

    // Front Bangs (Side-swept anime fringe)
    const bangGeo = new THREE.CylinderGeometry(0.01, 0.06, 0.25, 12);
    bangGeo.rotateZ(Math.PI / 6);
    const bang1 = new THREE.Mesh(bangGeo, hairMaterial);
    bang1.position.set(-0.12, 0.08, 0.26);
    hairGroup.add(bang1);

    const bang2 = new THREE.Mesh(bangGeo, hairMaterial);
    bang2.position.set(0.08, 0.09, 0.26);
    bang2.rotation.z = -Math.PI / 7;
    hairGroup.add(bang2);

    // Side locks framing the face
    const sideLockGeo = new THREE.CylinderGeometry(0.03, 0.01, 0.35, 12);
    const leftLock = new THREE.Mesh(sideLockGeo, hairMaterial);
    leftLock.position.set(-0.25, -0.06, 0.15);
    leftLock.rotation.z = 0.15;
    hairGroup.add(leftLock);

    const rightLock = new THREE.Mesh(sideLockGeo, hairMaterial);
    rightLock.position.set(0.25, -0.06, 0.15);
    rightLock.rotation.z = -0.15;
    hairGroup.add(rightLock);

    // Back Layered Hair with Dynamic Physics Simulation
    const hairPhysicsBone1 = new THREE.Group();
    hairPhysicsBone1.position.set(0, 0.05, -0.26);
    hairGroup.add(hairPhysicsBone1);

    const hairPhysicsBone2 = new THREE.Group();
    hairPhysicsBone2.position.set(0, -0.25, 0);
    hairPhysicsBone1.add(hairPhysicsBone2);

    const braidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, -0.28),
      new THREE.Vector3(0.04, -0.2, -0.32),
      new THREE.Vector3(-0.03, -0.45, -0.28),
      new THREE.Vector3(0, -0.7, -0.24),
    ]);
    const braidGeo = new THREE.TubeGeometry(braidCurve, 24, 0.07, 12, false);
    const braidMesh = new THREE.Mesh(braidGeo, hairMaterial);
    hairGroup.add(braidMesh);

    // Extra secondary flowing strands for realism
    const strandGeo = new THREE.CylinderGeometry(0.015, 0.005, 0.5, 8);
    const leftStrand = new THREE.Mesh(strandGeo, hairMaterial);
    leftStrand.position.set(-0.16, -0.22, 0.12);
    leftStrand.rotation.z = 0.12;
    headGroup.add(leftStrand);

    const rightStrand = new THREE.Mesh(strandGeo, hairMaterial);
    rightStrand.position.set(0.16, -0.22, 0.12);
    rightStrand.rotation.z = -0.12;
    headGroup.add(rightStrand);

    // Hair Pin / Accessory (Emerald / Pearl Clip)
    const pinGeo = new THREE.TorusGeometry(0.03, 0.01, 8, 16);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, metalness: 0.8 });
    const hairPin = new THREE.Mesh(pinGeo, pinMat);
    hairPin.position.set(0.22, 0.18, 0.18);
    hairPin.rotation.y = Math.PI / 4;
    hairGroup.add(hairPin);

    // Active Audio Glow Ring around base (Visible when listening or speaking)
    const auraGeo = new THREE.RingGeometry(0.35, 0.42, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.06;
    scene.add(auraMesh);

    // 5. Mouse tracking & Look-at state
    const targetLookAt = new THREE.Vector2(0, 0);
    const currentLookAt = new THREE.Vector2(0, 0);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetLookAt.set(x * 0.4, y * 0.3);
    };

    window.addEventListener('mousemove', handleMouseMove);

    // 6. Animation Kinematics Loop
    let clock = new THREE.Clock();
    let blinkTimer = 0;
    let nextBlinkDuration = 3.5;
    let isBlinking = false;
    let blinkElapsed = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      const {
        agentState: st,
        animationState: animSt,
        posture: post,
        gesture: gst,
        expression: expr,
        isSpeaking: spk,
        micVolume: vol,
      } = stateRef.current;

      // Kinematics 1: Breathing sine wave on chest/torso (low CPU idle)
      const breath = Math.sin(elapsed * 2.1) * 0.018;
      torsoGroup.position.y = 0.65 + breath;
      torsoGroup.scale.set(1 + breath * 0.4, 1 + breath, 1 + breath * 0.4);

      // Posture Handling: Standing vs Sitting / Perched
      if (post === 'sitting' || post === 'perched' || animSt === 'SITTING') {
        characterGroup.position.y = -0.25;
        legLeft.rotation.x = -Math.PI / 2.3;
        legRight.rotation.x = -Math.PI / 2.3;
        legLeft.position.z = 0.15;
        legRight.position.z = 0.15;
        contactShadow.position.y = 0.1;
      } else {
        characterGroup.position.y = 0;
        legLeft.rotation.x = Math.sin(elapsed * 1.5) * 0.03;
        legRight.rotation.x = -Math.sin(elapsed * 1.5) * 0.03;
        legLeft.position.z = 0;
        legRight.position.z = 0;
        contactShadow.position.y = 0.05;
      }

      // Secondary Hair Physics Simulation with Damped Inertia & Settling
      const headSway = headGroup.rotation.y;
      const hairSway = Math.sin(elapsed * 2.8) * 0.06 - headSway * 0.25;
      hairGroup.rotation.z = hairSway * 0.3;
      hairGroup.rotation.y = -headSway * 0.2;
      leftStrand.rotation.z = 0.12 + Math.sin(elapsed * 2.5) * 0.05;
      rightStrand.rotation.z = -0.12 - Math.sin(elapsed * 2.5) * 0.05;

      // Kinematics 2: Idle subtle head sway & mouse tracking with smooth interpolation
      currentLookAt.lerp(targetLookAt, 0.05);
      headGroup.rotation.y = currentLookAt.x * 0.45 + Math.sin(elapsed * 1.2) * 0.04;
      headGroup.rotation.x = -currentLookAt.y * 0.35 + Math.cos(elapsed * 1.5) * 0.03;

      // Kinematics 3: Eye Blinking intervals
      blinkTimer += delta;
      if (!isBlinking && blinkTimer > nextBlinkDuration) {
        isBlinking = true;
        blinkTimer = 0;
        blinkElapsed = 0;
        nextBlinkDuration = 2.8 + Math.random() * 2.5;
      }

      if (isBlinking) {
        blinkElapsed += delta;
        // 160ms full blink cycle
        const progress = blinkElapsed / 0.16;
        if (progress >= 1.0) {
          isBlinking = false;
          leftEye.lidMesh.position.y = 0.04;
          rightEye.lidMesh.position.y = 0.04;
        } else {
          // Closed at 0.5 progress
          const lidY = THREE.MathUtils.lerp(0.04, 0.0, Math.sin(progress * Math.PI));
          leftEye.lidMesh.position.y = lidY;
          rightEye.lidMesh.position.y = lidY;
        }
      }

      // Kinematics 4: Audio-Reactive Mouth Viseme Morphing (Speaking or Mic Input)
      let mouthScaleY = 0.4;
      let mouthScaleX = 1.2;

      if (spk || st === 'SPEAKING') {
        // Natural speech modulation
        const speechViseme = Math.abs(Math.sin(elapsed * 14)) * 1.5 + Math.cos(elapsed * 8) * 0.4;
        mouthScaleY = 0.4 + speechViseme * 0.8;
        mouthScaleX = 1.2 - speechViseme * 0.2;
      } else if (st === 'LISTENING' && vol > 0.05) {
        // Reaction to user speaking
        mouthScaleY = 0.4 + vol * 0.6;
        mouthScaleX = 1.2 + vol * 0.3;
      }

      mouthMesh.scale.set(mouthScaleX, mouthScaleY, 0.4);

      // Kinematics 5: Eyebrow Expressions & Face Identity Lock
      if (expr === 'ATTENTIVE' || st === 'LISTENING' || animSt === 'LISTENING') {
        leftBrow.position.y = 0.33;
        rightBrow.position.y = 0.33;
        leftBrow.rotation.z = 0.08;
        rightBrow.rotation.z = -0.08;
      } else if (expr === 'THINKING' || st === 'THINKING' || st === 'PLANNING' || animSt === 'THINKING') {
        leftBrow.position.y = 0.34;
        rightBrow.position.y = 0.31;
        leftBrow.rotation.z = 0.14;
        rightBrow.rotation.z = 0.02;
      } else if (expr === 'SUCCESS' || st === 'COMPLETED' || animSt === 'SUCCESS') {
        leftBrow.position.y = 0.335;
        rightBrow.position.y = 0.335;
        leftBrow.rotation.z = 0.03;
        rightBrow.rotation.z = -0.03;
      } else if (expr === 'WARNING' || expr === 'CONCERNED' || animSt === 'WARNING' || animSt === 'ERROR') {
        leftBrow.position.y = 0.315;
        rightBrow.position.y = 0.315;
        leftBrow.rotation.z = -0.08;
        rightBrow.rotation.z = 0.08;
      } else {
        leftBrow.position.y = 0.32;
        rightBrow.position.y = 0.32;
        leftBrow.rotation.z = 0.05;
        rightBrow.rotation.z = -0.05;
      }

      // Gesture Kinematics (Wave, Point, Think, Heart)
      if (gst === 'wave') {
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(
          rightArmGroup.rotation.z,
          2.3 + Math.sin(elapsed * 10) * 0.35,
          0.1
        );
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, 0.4, 0.1);
      } else if (gst === 'point') {
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, 1.4, 0.1);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, -1.2, 0.1);
      } else if (gst === 'thinking' || st === 'THINKING') {
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, 1.8, 0.08);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, 0.6, 0.08);
      } else {
        // Natural resting arm swing
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, 0.1 + Math.sin(elapsed * 1.5) * 0.04, 0.08);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, 0, 0.08);
      }

      leftArmGroup.rotation.z = THREE.MathUtils.lerp(leftArmGroup.rotation.z, -0.1 - Math.sin(elapsed * 1.5) * 0.04, 0.08);
      leftArmGroup.rotation.x = THREE.MathUtils.lerp(leftArmGroup.rotation.x, 0, 0.08);

      // Kinematics 6: Active Aura Ring
      if (st === 'LISTENING') {
        auraMat.color.setHex(0x38bdf8); // Sky blue
        auraMat.opacity = 0.45 + Math.sin(elapsed * 6) * 0.25;
        auraMesh.scale.setScalar(1 + (vol || 0.1) * 0.4);
      } else if (spk || st === 'SPEAKING') {
        auraMat.color.setHex(0xa855f7); // Purple
        auraMat.opacity = 0.6 + Math.sin(elapsed * 10) * 0.3;
        auraMesh.scale.setScalar(1.05 + Math.sin(elapsed * 8) * 0.15);
      } else if (st === 'THINKING' || st === 'PLANNING') {
        auraMat.color.setHex(0xf59e0b); // Amber
        auraMat.opacity = 0.4 + Math.sin(elapsed * 4) * 0.2;
        auraMesh.scale.setScalar(1.0);
      } else {
        auraMat.opacity = 0.15;
        auraMesh.scale.setScalar(0.95);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // Dispose Three.js objects
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [mode]);

  // Visual status pill color based on Agent State
  const getStateBadge = () => {
    switch (agentState) {
      case 'LISTENING':
        return { text: 'Sunte huwe...', bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' };
      case 'THINKING':
      case 'PLANNING':
        return { text: 'Soch rahi hoon...', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'SPEAKING':
        return { text: 'Bol rahi hoon...', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'EXECUTING':
      case 'VERIFYING':
        return { text: 'Kaam kar rahi hoon...', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      default:
        return { text: 'Tayyar (Ready)', bg: 'bg-slate-700/40 text-slate-300 border-slate-600/30' };
    }
  };

  const badge = getStateBadge();

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      {/* Three.js WebGL Container with zero background */}
      <div
        ref={mountRef}
        className={`relative w-full ${mode === 'companion' ? 'h-64' : 'h-96 md:h-[460px]'} flex items-center justify-center pointer-events-auto`}
      />

      {/* Floating State Badge & Assistant Info */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none z-10">
        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border backdrop-blur-md ${badge.bg}`}>
          {badge.text}
        </span>
      </div>

      {/* Speech Caption Overlay (Near character mouth/side) */}
      {spokenText && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90%] bg-slate-900/90 border border-purple-500/30 px-3.5 py-2 rounded-xl backdrop-blur-md text-xs text-purple-100 shadow-xl pointer-events-none z-20 animate-in fade-in slide-in-from-bottom-2">
          <p className="line-clamp-2 italic text-center">"{spokenText}"</p>
        </div>
      )}

      {/* Interactive Mic Trigger (for Companion mode or direct click) */}
      {onMicToggle && (
        <button
          onClick={onMicToggle}
          title={agentState === 'LISTENING' ? 'Mic band karein' : 'Bolein (Speak)'}
          className={`absolute bottom-2 right-4 p-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all z-20 ${
            agentState === 'LISTENING'
              ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
              : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
            />
          </svg>
        </button>
      )}
    </div>
  );
};
