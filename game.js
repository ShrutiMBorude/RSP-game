const choices = ["rock", "paper", "scissors"];

let score = { wins: 0, losses: 0, draws: 0 };
let isAnimating = false;

let duel = null;
let animationFrame = null;
let audioCtx = null;

const tempLookTarget = new THREE.Vector3();

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtor();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

function tone(start, duration, freq, type, volume = 0.07, slideTo = null) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playSfx(kind) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;

  if (kind === "throw") {
    tone(t, 0.08, 220, "triangle", 0.05, 320);
    tone(t + 0.05, 0.08, 320, "triangle", 0.045, 260);
    return;
  }

  if (kind === "reveal") {
    tone(t, 0.06, 420, "square", 0.045, 520);
    return;
  }

  if (kind === "win") {
    tone(t, 0.09, 440, "sine", 0.06, 660);
    tone(t + 0.1, 0.11, 660, "sine", 0.065, 980);
    tone(t + 0.22, 0.13, 980, "triangle", 0.05, 1200);
    return;
  }

  if (kind === "lose") {
    tone(t, 0.12, 360, "sawtooth", 0.06, 210);
    tone(t + 0.12, 0.16, 210, "sawtooth", 0.05, 130);
    return;
  }

  if (kind === "draw") {
    tone(t, 0.08, 420, "triangle", 0.05, 390);
    tone(t + 0.09, 0.08, 390, "triangle", 0.05, 420);
    return;
  }

  if (kind === "reset") {
    tone(t, 0.07, 520, "sine", 0.045, 420);
    return;
  }
}

function speakResult(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1.05;
  utterance.volume = 0.9;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function makeMaterial(color, emissive = 0x000000, metalness = 0.35, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.25,
    metalness,
    roughness
  });
}

function createLimb(radius, length, material) {
  const limb = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 12),
    material
  );

  const capTop = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), material);
  const capBottom = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), material);
  capTop.position.y = length / 2;
  capBottom.position.y = -length / 2;

  limb.add(core, capTop, capBottom);
  return limb;
}

function createFinger(length, width, material) {
  const finger = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, length * 0.58, width * 0.9),
    material
  );
  base.position.y = length * 0.29;

  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.9, length * 0.42, width * 0.85),
    material
  );
  tip.position.y = length * 0.79;

  finger.add(base, tip);
  return finger;
}

function setFingerCurl(finger, curl) {
  finger.rotation.x = -curl;
}

function createGestureProp(gesture, accentColor) {
  if (gesture === "rock") {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      makeMaterial(accentColor, 0x08120c, 0.2, 0.65)
    );
    rock.rotation.set(0.4, 0.2, -0.2);
    return rock;
  }

  if (gesture === "paper") {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.03, 0.19),
      makeMaterial(0xf4f0df, 0x111111, 0.02, 0.9)
    );
    paper.rotation.set(-0.45, 0.12, 0.1);
    return paper;
  }

  const scissor = new THREE.Group();
  const bladeMat = makeMaterial(0xdde3f3, 0x1b2130, 0.85, 0.2);
  const handleMat = makeMaterial(0x2f3d59, 0x0b0f19, 0.2, 0.55);

  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.015), bladeMat);
  bladeA.position.set(0.07, 0.028, 0);
  bladeA.rotation.z = 0.42;

  const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.015), bladeMat);
  bladeB.position.set(0.07, -0.028, 0);
  bladeB.rotation.z = -0.42;

  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 10, 20), handleMat);
  ringA.position.set(-0.055, 0.034, 0.012);

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 10, 20), handleMat);
  ringB.position.set(-0.055, -0.034, -0.012);

  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), handleMat);

  scissor.add(bladeA, bladeB, ringA, ringB, pivot);
  scissor.rotation.set(0.2, 0.8, 0.1);
  return scissor;
}

function setHandProp(boy, gesture) {
  if (boy.handProp) {
    boy.gesturePropMount.remove(boy.handProp);
    boy.handProp = null;
  }

  const prop = createGestureProp(gesture, boy.gestureColor);
  prop.position.set(0.03, 0.02, 0.16);
  prop.scale.set(2, 2, 2);
  boy.gesturePropMount.add(prop);
  boy.handProp = prop;
}

function createBoy(config) {
  const boy = new THREE.Group();

  const skinMat = makeMaterial(config.skin, 0x140b08, 0.08, 0.72);
  const shirtMat = makeMaterial(config.shirt, config.shirt, 0.25, 0.45);
  const pantsMat = makeMaterial(config.pants, 0x0c0f14, 0.25, 0.5);
  const shoeMat = makeMaterial(0x111319, 0x000000, 0.2, 0.65);
  const hairMat = makeMaterial(config.hair || 0x2c1f17, 0x120c08, 0.05, 0.82);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.14, 12), skinMat);
  neck.position.y = 1.63;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.34), shirtMat);
  torso.position.y = 1.18;

  const chestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.46, 0.06),
    makeMaterial(config.accent, config.accent, 0.18, 0.5)
  );
  chestPlate.position.set(0, 1.2, 0.2);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.3), shirtMat);
  hips.position.y = 0.72;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 20), skinMat);
  head.position.y = 1.86;

  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 20), hairMat);
  hairTop.position.set(0, 1.94, -0.02);
  hairTop.scale.set(1.05, 0.68, 1.05);

  const hairFringe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.14), hairMat);
  hairFringe.position.set(0, 1.86, 0.17);

  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), skinMat);
  const earR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), skinMat);
  earL.position.set(-0.23, 1.84, 0.01);
  earR.position.set(0.23, 1.84, 0.01);

  const eyeMat = makeMaterial(0x111111);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyeMat);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyeMat);
  eyeL.position.set(-0.085, 1.84, 0.2);
  eyeR.position.set(0.085, 1.84, 0.2);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), skinMat);
  nose.position.set(0, 1.79, 0.225);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.015, 0.02),
    makeMaterial(0x6f2f2f, 0x200b0b, 0.05, 0.8)
  );
  mouth.position.set(0, 1.72, 0.22);

  const shoulderL = new THREE.Group();
  shoulderL.position.set(-0.38, 1.33, 0.02);
  const upperArmL = createLimb(0.07, 0.5, skinMat);
  upperArmL.position.set(0, -0.24, 0);

  const forearmL = new THREE.Group();
  forearmL.position.set(0, -0.5, 0);
  const forearmLMesh = createLimb(0.06, 0.34, skinMat);
  forearmLMesh.position.set(0, -0.19, 0);

  shoulderL.add(upperArmL, forearmL);
  forearmL.add(forearmLMesh);

  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.38, 1.33, 0.02);

  const upperArmR = createLimb(0.07, 0.5, skinMat);
  upperArmR.position.set(0, -0.25, 0);

  const forearmR = new THREE.Group();
  forearmR.position.set(0, -0.5, 0);

  const forearmMesh = createLimb(0.06, 0.36, skinMat);
  forearmMesh.position.set(0, -0.2, 0);

  const handR = new THREE.Group();
  handR.position.set(0, -0.4, 0.02);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.17), skinMat);
  palm.position.set(0, 0, 0.03);

  const thumb = createFinger(0.1, 0.04, skinMat);
  thumb.position.set(-0.09, -0.01, 0.03);
  thumb.rotation.z = 0.65;

  const index = createFinger(0.14, 0.036, skinMat);
  index.position.set(-0.05, 0.02, 0.1);

  const middle = createFinger(0.15, 0.038, skinMat);
  middle.position.set(-0.015, 0.03, 0.1);

  const ring = createFinger(0.14, 0.036, skinMat);
  ring.position.set(0.02, 0.02, 0.1);

  const pinky = createFinger(0.12, 0.032, skinMat);
  pinky.position.set(0.055, 0.0, 0.09);

  const gesturePropMount = new THREE.Group();
  gesturePropMount.position.set(0.02, 0.0, 0.08);

  handR.add(palm, thumb, index, middle, ring, pinky, gesturePropMount);
  forearmR.add(forearmMesh, handR);
  shoulderR.add(upperArmR, forearmR);

  const legL = createLimb(0.08, 0.52, pantsMat);
  legL.position.set(-0.14, 0.35, 0);

  const legR = createLimb(0.08, 0.52, pantsMat);
  legR.position.set(0.14, 0.35, 0);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.32), shoeMat);
  shoeL.position.set(-0.14, 0.03, 0.08);

  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.32), shoeMat);
  shoeR.position.set(0.14, 0.03, 0.08);

  boy.add(
    torso,
    chestPlate,
    hips,
    neck,
    head,
    hairTop,
    hairFringe,
    earL,
    earR,
    eyeL,
    eyeR,
    nose,
    mouth,
    shoulderL,
    shoulderR,
    legL,
    legR,
    shoeL,
    shoeR
  );

  boy.position.set(config.x, 0, config.z);
  boy.rotation.y = config.facing;
  boy.scale.set(2, 2, 2);

  return {
    root: boy,
    torso,
    shoulderL,
    shoulderR,
    forearmR,
    handR,
    gesturePropMount,
    fingers: { thumb, index, middle, ring, pinky },
    shirtMat,
    gestureColor: config.gestureColor || config.accent,
    handProp: null,
    mood: "thinking",
    gesture: "rock",
    baseX: config.x,
    baseZ: config.z,
    facing: config.facing
  };
}

function setGesturePose(boy, gesture) {
  const { thumb, index, middle, ring, pinky } = boy.fingers;
  boy.gesture = gesture;
  setHandProp(boy, gesture);

  if (gesture === "paper") {
    setFingerCurl(thumb, 0.35);
    setFingerCurl(index, 0.1);
    setFingerCurl(middle, 0.08);
    setFingerCurl(ring, 0.12);
    setFingerCurl(pinky, 0.15);
    return;
  }

  if (gesture === "scissors") {
    setFingerCurl(thumb, 0.55);
    setFingerCurl(index, 0.08);
    setFingerCurl(middle, 0.08);
    setFingerCurl(ring, 1.05);
    setFingerCurl(pinky, 1.15);
    return;
  }

  setFingerCurl(thumb, 0.9);
  setFingerCurl(index, 1.05);
  setFingerCurl(middle, 1.12);
  setFingerCurl(ring, 1.15);
  setFingerCurl(pinky, 1.2);
}

function setBoyMood(boy, mood) {
  boy.mood = mood;

  if (mood === "win") {
    boy.shirtMat.emissive.setHex(0x2caa5b);
    boy.shirtMat.emissiveIntensity = 0.6;
  } else if (mood === "lose") {
    boy.shirtMat.emissive.setHex(0x6d1f2f);
    boy.shirtMat.emissiveIntensity = 0.45;
  } else if (mood === "draw") {
    boy.shirtMat.emissive.setHex(0x926a19);
    boy.shirtMat.emissiveIntensity = 0.45;
  } else {
    boy.shirtMat.emissive.copy(boy.shirtMat.color);
    boy.shirtMat.emissiveIntensity = 0.25;
  }
}

function createDuelScene() {
  const container = document.getElementById("duel-scene");
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
  camera.position.set(0, 3.6, 11.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(3.8, 5.4, 5.8);

  const fill = new THREE.DirectionalLight(0x84b3ff, 0.35);
  fill.position.set(-3.5, 2.4, 2.5);

  const rimLeft = new THREE.PointLight(0x4dffad, 0.65, 12);
  rimLeft.position.set(-3.8, 1.9, 2.8);

  const rimRight = new THREE.PointLight(0xb785ff, 0.65, 12);
  rimRight.position.set(3.8, 1.9, 2.8);

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.6, 0.2, 64),
    makeMaterial(0x273248, 0x050a12, 0.2, 0.72)
  );
  floor.position.y = -0.08;

  const floorRing = new THREE.Mesh(
    new THREE.TorusGeometry(5.7, 0.1, 18, 96),
    makeMaterial(0x4fbfdf, 0x4fbfdf, 0.4, 0.35)
  );
  floorRing.position.y = 0.03;
  floorRing.rotation.x = Math.PI / 2;

  const player = createBoy({
    x: -2.8,
    z: 0.6,
    facing: 0.15,
    skin: 0xf0bf95,
    shirt: 0x29c47b,
    pants: 0x2a3550,
    accent: 0x145137,
    gestureColor: 0x38d39d,
    hair: 0x2f1f13
  });

  const cpu = createBoy({
    x: 2.8,
    z: -0.6,
    facing: -3.0,
    skin: 0xe2b188,
    shirt: 0x5c7cff,
    pants: 0x3d2f56,
    accent: 0x2b2e78,
    gestureColor: 0x8f9dff,
    hair: 0x1f1a17
  });

  scene.add(ambient, key, fill, rimLeft, rimRight, floor, floorRing, player.root, cpu.root);

  return {
    container,
    scene,
    camera,
    renderer,
    floorRing,
    player,
    cpu
  };
}

function makeBoysFaceEachOther() {
  const left = duel.player;
  const right = duel.cpu;

  tempLookTarget.set(right.root.position.x, left.root.position.y + 1.25, right.root.position.z);
  left.root.lookAt(tempLookTarget);
  left.root.rotation.x = 0;
  left.root.rotation.z = 0;

  tempLookTarget.set(left.root.position.x, right.root.position.y + 1.25, left.root.position.z);
  right.root.lookAt(tempLookTarget);
  right.root.rotation.x = 0;
  right.root.rotation.z = 0;
}

function updateDuelAnimation(time) {
  if (!duel) return;

  const pulse = Math.sin(time * 1.2) * 0.5 + 0.5;
  duel.floorRing.material.emissiveIntensity = 0.25 + pulse * 0.3;
  duel.floorRing.rotation.z += 0.004;

  [duel.player, duel.cpu].forEach((boy, index) => {
    const phase = index === 0 ? 0 : Math.PI;
    const idle = Math.sin(time * 2.2 + phase);

    let bodyBob = 0.035;
    let forearmSwing = 0.3;
    let forearmOffsetY = -0.5;
    let forearmOffsetZ = 0.03;

    if (boy.mood === "thinking") {
      bodyBob = 0.055;
      forearmSwing = 0.45;
    } else if (boy.mood === "win") {
      bodyBob = 0.08;
      forearmSwing = 0.6;
      forearmOffsetY = -0.45;
    } else if (boy.mood === "lose") {
      bodyBob = 0.015;
      forearmSwing = 0.15;
      forearmOffsetY = -0.56;
    }

    if (boy.gesture === "paper") {
      forearmOffsetZ = 0.1;
    } else if (boy.gesture === "scissors") {
      forearmOffsetZ = 0.08;
    }

    boy.root.position.y = Math.max(0, idle * bodyBob);
    boy.root.position.x = boy.baseX + Math.sin(time * 1.1 + phase) * 0.03;
    boy.root.position.z = boy.baseZ + Math.cos(time * 0.9 + phase) * 0.02;

    boy.shoulderR.rotation.x = -0.3 + Math.sin(time * 3.3 + phase) * 0.12;
    boy.forearmR.position.y = forearmOffsetY;
    boy.forearmR.position.z = forearmOffsetZ;
    boy.forearmR.rotation.x = -0.15 + Math.sin(time * 4.2 + phase) * forearmSwing;

    boy.shoulderL.rotation.x = -0.25 + Math.sin(time * 2.6 + phase) * 0.08;
    boy.shoulderL.rotation.z = index === 0 ? 0.14 : -0.14;
  });

  makeBoysFaceEachOther();
}

function animate() {
  const time = performance.now() * 0.001;
  updateDuelAnimation(time);

  if (duel) {
    duel.renderer.render(duel.scene, duel.camera);
  }

  animationFrame = requestAnimationFrame(animate);
}

function resizeScene() {
  if (!duel) return;

  const width = duel.container.clientWidth;
  const height = duel.container.clientHeight;

  duel.camera.aspect = width / height;
  duel.camera.updateProjectionMatrix();
  duel.renderer.setSize(width, height);
}

function getResult(player, cpu) {
  if (player === cpu) return "draw";

  if (
    (player === "rock" && cpu === "scissors") ||
    (player === "paper" && cpu === "rock") ||
    (player === "scissors" && cpu === "paper")
  ) {
    return "win";
  }

  return "lose";
}

function play(choice) {
  if (isAnimating || !duel) return;
  isAnimating = true;
  playSfx("throw");

  const resultEl = document.getElementById("result");
  resultEl.textContent = "";
  resultEl.className = "result";

  setGesturePose(duel.player, choice);
  setBoyMood(duel.player, "thinking");

  setGesturePose(duel.cpu, "rock");
  setBoyMood(duel.cpu, "thinking");

  document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.disabled = true;
  });

  setTimeout(() => {
    const cpuChoice = choices[Math.floor(Math.random() * 3)];
    setGesturePose(duel.cpu, cpuChoice);
    playSfx("reveal");

    const roundResult = getResult(choice, cpuChoice);

    setTimeout(() => {
      if (roundResult === "win") {
        score.wins++;
        setBoyMood(duel.player, "win");
        setBoyMood(duel.cpu, "lose");
        playSfx("win");
        speakResult("You win");
        resultEl.textContent = "YOU WIN!";
        resultEl.className = "result win";
      } else if (roundResult === "lose") {
        score.losses++;
        setBoyMood(duel.player, "lose");
        setBoyMood(duel.cpu, "win");
        playSfx("lose");
        speakResult("You lose");
        resultEl.textContent = "YOU LOSE!";
        resultEl.className = "result lose";
      } else {
        score.draws++;
        setBoyMood(duel.player, "draw");
        setBoyMood(duel.cpu, "draw");
        playSfx("draw");
        speakResult("Draw");
        resultEl.textContent = "DRAW!";
        resultEl.className = "result draw";
      }

      updateScore();
      document.querySelectorAll(".choice-btn").forEach(btn => {
        btn.disabled = false;
      });
      isAnimating = false;
    }, 520);
  }, 760);
}

function updateScore() {
  document.getElementById("wins").textContent = score.wins + "W";
  document.getElementById("draws").textContent = score.draws + "D";
  document.getElementById("losses").textContent = score.losses + "L";
}

function resetScore() {
  score = { wins: 0, losses: 0, draws: 0 };
  updateScore();
  playSfx("reset");

  if (duel) {
    setGesturePose(duel.player, "rock");
    setGesturePose(duel.cpu, "rock");
    setBoyMood(duel.player, "thinking");
    setBoyMood(duel.cpu, "thinking");
  }

  const resultEl = document.getElementById("result");
  resultEl.textContent = "";
  resultEl.className = "result";
}

function initializeGame3D() {
  if (!window.THREE) {
    const resultEl = document.getElementById("result");
    resultEl.textContent = "3D library failed to load";
    resultEl.className = "result lose";
    return;
  }

  duel = createDuelScene();

  setGesturePose(duel.player, "rock");
  setGesturePose(duel.cpu, "rock");
  setBoyMood(duel.player, "thinking");
  setBoyMood(duel.cpu, "thinking");

  makeBoysFaceEachOther();

  window.addEventListener("resize", resizeScene);
  resizeScene();

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
  animate();
}