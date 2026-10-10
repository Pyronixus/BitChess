const qs = (s) => document.querySelector(s);
const chessApp = new Chess();
const canvasEl = qs("#boardCanvas");

let playMode = "bot",
  botLevel = 3,
  playerColor = "w",
  chosenColor = "w",
  selectedSq = null,
  legalMoves = [],
  lastMove = [],
  isBusy = 0,
  isGameOver = 0,
  camAzimuth = 0.4,
  camPolar = 0.95,
  camZoom = 1,
  targetAzimuth = null,
  needsRender = 1,
  pointerDown = null,
  isDiscoMode = false;
let discoExitStart = null;
let discoExitFrom = null;
let discoExitBackground = null;
let discoExitMaterials = null;
let discoExitCanvas = null;
let discoExitContext = null;
let discoExitTexture = null;

const bgMusic = new Audio("assets/music/finalBossAscent.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.4;
const discoMusic = new Audio("assets/music/disco.mp3");
discoMusic.loop = false;
let discoTimeout = null;

const LEVEL_LABELS = ["Débutant", "Facile", "Moyen", "Fort", "Expert"];

/* ---- Position pre-calculations (zero allocation during gameplay) ---- */
const SQUARES_LIST = chessApp.SQUARES || [
  "a8",
  "b8",
  "c8",
  "d8",
  "e8",
  "f8",
  "g8",
  "h8",
  "a7",
  "b7",
  "c7",
  "d7",
  "e7",
  "f7",
  "g7",
  "h7",
  "a6",
  "b6",
  "c6",
  "d6",
  "e6",
  "f6",
  "g6",
  "h6",
  "a5",
  "b5",
  "c5",
  "d5",
  "e5",
  "f5",
  "g5",
  "h5",
  "a4",
  "b4",
  "c4",
  "d4",
  "e4",
  "f4",
  "g4",
  "h4",
  "a3",
  "b3",
  "c3",
  "d3",
  "e3",
  "f3",
  "g3",
  "h3",
  "a2",
  "b2",
  "c2",
  "d2",
  "e2",
  "f2",
  "g2",
  "h2",
  "a1",
  "b1",
  "c1",
  "d1",
  "e1",
  "f1",
  "g1",
  "h1",
];

const POSITIONS = {};
for (let f = 0; f < 8; f++) {
  for (let r = 0; r < 8; r++) {
    const sq = "abcdefgh"[f] + (r + 1);
    POSITIONS[sq] = new THREE.Vector3(f - 3.5, 0, 3.5 - r);
  }
}
const getPos = (sq) => POSITIONS[sq];

/* ---- Rendering ---- */
const renderer = new THREE.WebGLRenderer({
  canvas: canvasEl,
  antialias: true,
  powerPreference: "high-performance",
  alpha: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

/* Lighting studio */
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x15151f);

const createSoftBox = (w, h, x, y, z, intensity) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(intensity, intensity * 0.96, intensity * 0.9),
      side: 2,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.lookAt(0, 0, 0);
  envScene.add(mesh);
};

createSoftBox(10, 6, -8, 10, 6, 7);
createSoftBox(8, 4, 10, 5, -3, 3);
createSoftBox(14, 3, 0, 3, -10, 2);
createSoftBox(6, 6, 0, 14, 0, 4);

scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
  envScene,
  0.04,
).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 0.25));

const dirLight = new THREE.DirectionalLight(0xfff0dc, 1.25);
dirLight.position.set(-5, 12, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(512, 512);
dirLight.shadow.bias = -0.0004;

Object.assign(dirLight.shadow.camera, {
  left: -6.5,
  right: 6.5,
  top: 6.5,
  bottom: -6.5,
  near: 1,
  far: 32,
});

scene.add(dirLight);

const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.4 }),
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -0.56;
groundPlane.receiveShadow = true;
groundPlane.matrixAutoUpdate = false;
groundPlane.updateMatrix();
scene.add(groundPlane);

/* ---- Skin (persistent) ---- */
const DEFAULT_SKIN = {
  p: { sh: 0, mt: 1, a: "#fff4dc", b: "#2d2446", g: 0 },
  b: { sh: 0, mt: 0, a: "#e8d9b5", b: "#8b6b4a", g: 0 },
  bg: { a: "#2a1f4a", b: "#0b0814" },
  sp: 1,
  dd: 0,
  mode: "bot",
  lv: 8,
  col: "w",
  ad: 1,
  dt: 1,
  lm: 1,
  pr: 1,
  fl: 0,
  sn: 1,
  vo: 0.5,
  hc: 0,
  ol: 1,
  fx: 1,
  sh: 1,
  rt: 0,
  crt: 0,
  hs: 0,
  q: 1.5,
  ct: 0.5,
  cu: { p: [], b: [], bg: [] },
  musicIdx: 0,
  bgm: 1,
};

let storedSkin = {};
try {
  storedSkin = JSON.parse(localStorage.bc) || {};
} catch (e) {}

const currentSkin = Object.assign({}, DEFAULT_SKIN, storedSkin);
for (const key of ["p", "b", "bg"]) {
  currentSkin[key] = Object.assign({}, DEFAULT_SKIN[key], storedSkin[key]);
}

const saveSkin = () => {
  try {
    localStorage.bc = JSON.stringify(currentSkin);
  } catch (e) {}
};

playMode = currentSkin.mode;
botLevel = currentSkin.lv;
chosenColor = currentSkin.col;

/* name, width, height, flare */
const SHAPE_DATA = [
  ["Classique", 1, 1, 0],
  ["Trapu", 1.15, 0.8, 0],
  ["Élancé", 0.85, 1.25, 0],
  ["Tour", 0.9, 1.5, 0],
  ["Plat", 1.25, 0.6, 0],
  ["Large", 1.3, 1, 0],
  ["Mince", 0.7, 1, 0],
  ["Pyramide", 1.2, 1, 0.12],
  ["Bloc", 1.3, 1.3, 0],
  ["Escalier", 0.8, 1.1, -0.1],
];

/* name, roughness, metalness, clearcoat, opacity, emission */
const MAT_DATA = [
  ["Mat", 0.65, 0, 0, 1, 0],
  ["Laque", 0.2, 0, 1, 1, 0],
  ["Métal", 0.26, 0.95, 0, 1, 0],
  ["Cristal", 0.04, 0.05, 1, 0.6, 0],
  ["Or", 0.18, 1, 0.3, 1, 0],
  ["Néon", 0.4, 0, 0, 1, 0.6],
  ["Pierre", 0.95, 0, 0, 1, 0],
  ["Bois", 0.75, 0, 0.1, 1, 0],
  ["Obsidienne", 0.02, 0.3, 1, 1, 0],
  ["Holo", 0.1, 0.6, 1, 0.85, 0.25],
];

const PIECE_PRESETS = [
  ["Ivoire", "#fff4dc", "#2d2446"],
  ["Marbre", "#f4f4f0", "#26262b"],
  ["Océan", "#e6fbff", "#0d3b66"],
  ["Forêt", "#f0f5dc", "#1f3d2b"],
  ["Rubis", "#ffe6e6", "#6b0f1a"],
  ["Saphir", "#e8eeff", "#14235e"],
  ["Or & Nuit", "#ffe9a8", "#1a1a24"],
  ["Améthyste", "#f1e8ff", "#3b1a5c"],
  ["Cuivre", "#ffd9bf", "#3a1f14"],
  ["Sakura", "#ffe8f0", "#5a2a44"],
  ["Cyber", "#c8fff4", "#1a0f3a"],
  ["Lave", "#ffd8b0", "#2a0c0c"],
  ["Menthe", "#f0fff8", "#2a4a42"],
  ["Rétro", "#fff1b8", "#2b2b6b"],
  ["Sable", "#ecdcb8", "#b8945f"],
  ["Glace", "#dcecf5", "#7fa8c4"],
];

const BG_PRESETS = [
  ["Nuit", "#2a1f4a", "#0b0814"],
  ["Aube", "#ff9e6b", "#3a1f5a"],
  ["Océan", "#2f7f9a", "#05172a"],
  ["Forêt", "#3f8f6a", "#07140e"],
  ["Lave", "#b8381f", "#14060a"],
  ["Néon", "#ff3fa4", "#0a0630"],
  ["Désert", "#f2b66a", "#5a2f3a"],
  ["Glace", "#9fd6f0", "#1a2a4a"],
  ["Sakura", "#f6a6c4", "#3a1a3a"],
  ["Vide", "#1a1a22", "#000000"],
];

const MUSIC_TRACKS = [
  "assets/music/finalBossAscent.mp3",
  "assets/music/aCalculatedTurn.mp3",
  "assets/music/aQuietGambit.mp3",
  "assets/music/pawnLastAscent.mp3",
];

let currentMusicIdx = currentSkin.musicIdx || 0;

bgMusic.loop = true;
bgMusic.volume = 0.4;

const pieceMats = [0, 1].map(() =>
  Array.from(
    { length: 6 },
    () =>
      new THREE.MeshPhysicalMaterial({
        envMapIntensity: 1.15,
        clearcoatRoughness: 0.08,
      }),
  ),
);

const boardMats = Array.from(
  { length: 64 },
  () => new THREE.MeshPhysicalMaterial({ clearcoatRoughness: 0.1 }),
);

const frameMat = new THREE.MeshPhysicalMaterial({ roughness: 0.6 });

const setNearestFilter = (texture) => {
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
};

/* Single pixel noise texture (grayscale) */
const noiseCanvas = document.createElement("canvas");
noiseCanvas.width = noiseCanvas.height = 32;
const noiseCtx = noiseCanvas.getContext("2d");
let seedVal = 5;

const seededRandom = () =>
  (seedVal = (seedVal * 1664525 + 1013904223) >>> 0) / 4294967296;

noiseCtx.fillStyle = "#fff";
noiseCtx.fillRect(0, 0, 32, 32);

for (let i = 0; i < 140; i++) {
  noiseCtx.fillStyle = seededRandom() < 0.5 ? "#d4d4d4" : "#f2f2f2";
  noiseCtx.fillRect(
    (seededRandom() * 32) | 0,
    (seededRandom() * 32) | 0,
    1 + (seededRandom() < 0.3),
    1,
  );
}

noiseCtx.fillStyle = "#fff";
noiseCtx.fillRect(0, 0, 16, 1);
noiseCtx.fillRect(0, 0, 1, 16);
noiseCtx.fillStyle = "#b0b0b0";
noiseCtx.fillRect(0, 15, 16, 1);
noiseCtx.fillRect(15, 0, 1, 16);

const noiseTexture = setNearestFilter(new THREE.CanvasTexture(noiseCanvas));

const applyMatProps = (mat, props) => {
  mat.roughness = props[1];
  mat.metalness = props[2];
  mat.clearcoat = props[3];
  mat.opacity = props[4];
  mat.transparent = props[4] < 1;

  mat.depthWrite = true;

  if (props[5] === 0) {
    mat.emissive.setHex(0x000000);
  } else {
    mat.emissive.copy(mat.color).multiplyScalar(props[5]);
  }

  mat.needsUpdate = true;
};

const skyCanvas = document.createElement("canvas");
skyCanvas.width = 96;
skyCanvas.height = 54;
const skyCtx = skyCanvas.getContext("2d");

function generateSky() {
  const colorA = new THREE.Color(currentSkin.bg.a),
    colorB = new THREE.Color(currentSkin.bg.b),
    tempColor = new THREE.Color();

  for (let y = 0; y < 54; y += 3) {
    skyCtx.fillStyle =
      "#" +
      tempColor
        .copy(colorA)
        .lerp(colorB, y / 54)
        .getHexString();
    skyCtx.fillRect(0, y, 96, 3);
  }

  skyCtx.fillStyle = "#fff";
  seedVal = 7;
  for (let i = 0; i < 50; i++) {
    skyCtx.globalAlpha = 0.3 + seededRandom() * 0.6;
    skyCtx.fillRect((seededRandom() * 96) | 0, (seededRandom() * 40) | 0, 1, 1);
  }

  skyCtx.globalAlpha = 1;
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = setNearestFilter(new THREE.CanvasTexture(skyCanvas));
}

const tempCol = new THREE.Color(),
  WHITE = new THREE.Color(1, 1, 1),
  BLACK = new THREE.Color(0, 0, 0);

const applyGradient = (color, targetObj, fraction) =>
  targetObj.c
    ? color.lerp(tempCol.set(targetObj.c), fraction * 0.7)
    : color.offsetHSL(fraction * 0.15, 0, (fraction - 0.5) * 0.18);

function applySkinSettings() {
  const pieceProps = currentSkin.p,
    boardProps = currentSkin.b;

  pieceMats.forEach((mats, isBlack) =>
    mats.forEach((mat, i) => {
      mat.color.set(isBlack ? pieceProps.b : pieceProps.a);
      if (pieceProps.g) applyGradient(mat.color, pieceProps, i / 5);
      mat.color.lerp(isBlack ? BLACK : WHITE, currentSkin.ct * 0.4);
      applyMatProps(mat, MAT_DATA[pieceProps.mt]);
    }),
  );

  const boardScale = Math.min(
    1,
    boardProps.sh >= 0 ? SHAPE_DATA[boardProps.sh][1] * 0.99 : 1,
  );
  const boardHeight = SHAPE_DATA[boardProps.sh][2];

  boardMats.forEach((mat, i) => {
    const file = i >> 3,
      rank = i & 7;
    mat.color.set((file + rank) % 2 ? boardProps.a : boardProps.b);
    if (boardProps.g) applyGradient(mat.color, boardProps, (file + rank) / 14);
    mat.color.multiplyScalar(1 - 0.35 * currentSkin.ct);
    mat.map = noiseTexture;
    applyMatProps(mat, MAT_DATA[boardProps.mt]);

    if (typeof boardSqMeshes != "undefined" && boardSqMeshes[i]) {
      const squareMesh = boardSqMeshes[i];
      squareMesh.scale.set(boardScale, boardHeight, boardScale);
      squareMesh.position.y = -0.15 * boardHeight;
      squareMesh.updateMatrix();
    }
  });

  frameMat.color.set(boardProps.b).multiplyScalar(0.4);
  generateSky();
  needsRender = 1;
}

/* ---- Board ---- */
const createBoxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const boardFrame = new THREE.Mesh(createBoxGeo(9, 0.5, 9), frameMat);
boardFrame.position.y = -0.3;
boardFrame.castShadow = boardFrame.receiveShadow = true;
boardFrame.matrixAutoUpdate = false;
boardFrame.updateMatrix();
scene.add(boardFrame);

const boardSqMeshes = [],
  highlightMeshes = {},
  dotMeshes = {},
  sqGeo = createBoxGeo(0.99, 0.3, 0.99),
  highlightGeo = createBoxGeo(1, 0.02, 1),
  dotGeo = createBoxGeo(0.28, 0.03, 0.28);

const highlightMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.55,
  toneMapped: false,
});

const dotMat = new THREE.MeshBasicMaterial({
  color: 0x111018,
  transparent: true,
  opacity: 0.42,
  toneMapped: false,
});

for (let file = 0; file < 8; file++) {
  for (let rank = 0; rank < 8; rank++) {
    const squareName = "abcdefgh"[file] + (rank + 1),
      mesh = new THREE.Mesh(sqGeo, boardMats[file * 8 + rank]);

    mesh.position.copy(getPos(squareName));
    mesh.position.y = -0.15;
    mesh.userData.sq = squareName;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    scene.add(mesh);
    boardSqMeshes.push(mesh);

    const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat.clone());
    highlightMesh.position.copy(getPos(squareName));
    highlightMesh.position.y = 0.012;
    highlightMesh.visible = false;
    highlightMesh.matrixAutoUpdate = false;
    highlightMesh.updateMatrix();

    scene.add(highlightMesh);
    highlightMeshes[squareName] = highlightMesh;

    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.position.copy(getPos(squareName));
    dotMesh.position.y = 0.02;
    dotMesh.visible = false;
    dotMesh.matrixAutoUpdate = false;
    dotMesh.updateMatrix();

    scene.add(dotMesh);
    dotMeshes[squareName] = dotMesh;
  }
}

/* ---- Voxel pieces ---- */
const VOXEL_UNIT = 0.11,
  geoCache = {};

const getVoxelGeo = (w, h, d) =>
  geoCache[w + "_" + h + "_" + d] ||
  (geoCache[w + "_" + h + "_" + d] = new THREE.BoxGeometry(
    w * VOXEL_UNIT,
    h * VOXEL_UNIT,
    d * VOXEL_UNIT,
  ));

const PIECE_RECIPES = {
  p: [
    [6, 1],
    [4, 2],
    [2, 1],
    [4, 2],
  ],
  r: [
    [6, 1],
    [4, 4],
    [6, 2],
  ],
  b: [
    [6, 1],
    [4, 2],
    [2, 3],
    [4, 2],
    [2, 1],
  ],
  n: [
    [6, 1],
    [4, 3],
  ],
  q: [
    [6, 1],
    [4, 3],
    [2, 3],
    [6, 1],
    [4, 2],
    [2, 1],
  ],
  k: [
    [6, 1],
    [4, 3],
    [2, 3],
    [6, 1],
    [4, 1],
  ],
};

function buildPieceGroup(type, colorCode) {
  const group = new THREE.Group(),
    shapeConfig = SHAPE_DATA[currentSkin.p.sh],
    matArray = pieceMats[colorCode == "w" ? 0 : 1];

  let yOffset = 0,
    layerIdx = 0;

  const addPart = (w, h, d, x, y, z, matIdx = 5) => {
    const partGeo = new THREE.BoxGeometry(
      w * VOXEL_UNIT * 0.94,
      h * VOXEL_UNIT * 0.94,
      d * VOXEL_UNIT * 0.94,
    );

    const partMesh = new THREE.Mesh(partGeo, matArray[Math.min(5, matIdx)]);
    partMesh.position.set(
      x * VOXEL_UNIT,
      (y + h / 2) * VOXEL_UNIT,
      z * VOXEL_UNIT,
    );
    partMesh.castShadow = true;
    partMesh.matrixAutoUpdate = false;
    partMesh.updateMatrix();
    group.add(partMesh);

    if (currentSkin.ol) {
      const outline = new THREE.Mesh(partMesh.geometry, outlineMat);
      outline.position.copy(partMesh.position);
      // Contour affiné et ajusté pour épouser parfaitement le bloc
      outline.scale.set(1.08, 1.08, 1.08);
      outline.matrixAutoUpdate = false;
      outline.updateMatrix();
      group.add(outline);
    }
  };

  for (const [w, h] of PIECE_RECIPES[type]) {
    const taperFactor = Math.max(0.4, 1 - shapeConfig[3] * layerIdx);
    addPart(w * taperFactor, h, w * taperFactor, 0, yOffset, 0, layerIdx++);
    yOffset += h;
  }

  if (type == "k") {
    addPart(2, 4, 2, 0, yOffset, 0);
    addPart(6, 1, 2, 0, yOffset + 1, 0);
  }

  if (type == "q") {
    for (const x of [-2, 2]) {
      for (const z of [-2, 2]) {
        addPart(1, 2, 1, x, yOffset, z);
      }
    }
    addPart(2, 1, 2, 0, yOffset, 0);
  }

  if (type == "r") {
    for (const x of [-2, 2]) {
      for (const z of [-2, 2]) {
        addPart(2, 1, 2, x, yOffset, z);
      }
    }
  }

  if (type == "b") {
    addPart(1, 1, 1, 0, yOffset + 1, 0);
  }

  if (type == "n") {
    addPart(3, 4, 3, 0, yOffset, 0.5);
    addPart(3, 2, 3, 0, yOffset + 2, -2.5);
    addPart(1, 3, 2, 0, yOffset + 1, 2.5);
    addPart(1, 1, 1, -1, yOffset + 4, 0.5);
    addPart(1, 1, 1, 1, yOffset + 4, 0.5);
  }

  if (colorCode == "b") group.rotation.y = Math.PI;

  group.scale.set(
    1.12 * shapeConfig[1],
    1.12 * shapeConfig[2],
    1.12 * shapeConfig[1],
  );
  group.userData.bs = group.scale.clone();
  return group;
}

let cameraShake = 0;
const outlineMat = new THREE.MeshBasicMaterial({
  color: 0x07050d,
  side: THREE.BackSide,
});

const particlePool = Array.from({ length: 28 }, () => {
  const mesh = new THREE.Mesh(
    getVoxelGeo(1.2, 1.2, 1.2),
    new THREE.MeshBasicMaterial(),
  );
  mesh.visible = false;
  mesh.userData.v = new THREE.Vector3();
  mesh.userData.l = 0;
  scene.add(mesh);
  return mesh;
});

const landAnims = [];

function spawnParticles(posVector, hexColor) {
  if (!currentSkin.fx) return;
  let count = 0;
  for (const particle of particlePool) {
    if (particle.userData.l > 0) continue;
    particle.material.color.setHex(hexColor);
    particle.position.set(posVector.x, 0.3, posVector.z);
    particle.userData.v.set(
      (Math.random() - 0.5) * 3.2,
      2 + Math.random() * 3,
      (Math.random() - 0.5) * 3.2,
    );
    particle.userData.l = 1;
    particle.visible = true;
    if (++count >= 14) break;
  }
  cameraShake = 0.14;
}

let activePieces = {};
const moveAnims = [],
  fadeAnims = [];
returnAnims = [];

function spawnPiece(type, color, square) {
  const group = buildPieceGroup(type, color);
  group.userData.sq = square;
  group.position.copy(getPos(square));
  scene.add(group);
  return group;
}

function resetBoard3D() {
  for (const sq in activePieces) scene.remove(activePieces[sq]);
  fadeAnims.forEach((anim) => scene.remove(anim.g));

  fadeAnims.length = 0;
  activePieces = {};
  moveAnims.length = 0;

  for (let i = 0; i < 64; i++) {
    const sq = SQUARES_LIST[i];
    const piece = chessApp.get(sq);
    if (piece) {
      activePieces[sq] = spawnPiece(piece.type, piece.color, sq);
    }
  }

  needsRender = 1;
}

function startMoveAnim(fromSq, toSq) {
  const pieceGroup = activePieces[fromSq];
  delete activePieces[fromSq];
  activePieces[toSq] = pieceGroup;
  pieceGroup.userData.sq = toSq;
  pieceGroup.userData.an = 1;

  moveAnims.push({
    g: pieceGroup,
    f: pieceGroup.position.clone(),
    to: getPos(toSq),
    t: 0,
  });
}

function applyMoveEffect(moveObj) {
  const rank = moveObj.from[1],
    capturedSq = moveObj.flags.includes("e")
      ? moveObj.to[0] + rank
      : moveObj.to;

  if (moveObj.captured && activePieces[capturedSq]) {
    spawnParticles(
      getPos(capturedSq),
      pieceMats[moveObj.color == "w" ? 1 : 0][2].color.getHex(),
    );
    fadeAnims.push({
      g: activePieces[capturedSq],
      t: 0,
      s: activePieces[capturedSq].scale.clone(),
    });
    delete activePieces[capturedSq];
  }

  if (moveObj.promotion) {
    scene.remove(activePieces[moveObj.from]);
    activePieces[moveObj.from] = spawnPiece(
      moveObj.promotion,
      moveObj.color,
      moveObj.from,
    );
  }

  startMoveAnim(moveObj.from, moveObj.to);

  if (moveObj.flags.includes("k")) startMoveAnim("h" + rank, "f" + rank);
  if (moveObj.flags.includes("q")) startMoveAnim("a" + rank, "d" + rank);
}

/* ---- Game logic ---- */
const isMyTurn = () => playMode == "local" || chessApp.turn() == playerColor;

function getKingSquare() {
  for (let i = 0; i < 64; i++) {
    const sq = SQUARES_LIST[i];
    const piece = chessApp.get(sq);
    if (piece && piece.type == "k" && piece.color == chessApp.turn()) return sq;
  }
  return null;
}

function updateHighlights() {
  const kingSq = chessApp.in_check() ? getKingSquare() : null;

  for (let i = 0; i < 64; i++) {
    const sq = SQUARES_LIST[i];
    const highlight = highlightMeshes[sq],
      dot = dotMeshes[sq],
      isCapture = legalMoves.includes(sq) && chessApp.get(sq);

    let hexColor = null;

    if (currentSkin.lm && lastMove.includes(sq)) hexColor = 0xffd35c;
    if (isCapture) hexColor = 0xff4a4a;
    if (sq == selectedSq) hexColor = 0x6be8ff;
    if (sq == kingSq) hexColor = 0xff2222;

    highlight.visible = !!hexColor;
    if (hexColor) highlight.material.color.setHex(hexColor);

    dot.visible = currentSkin.dt && legalMoves.includes(sq) && !isCapture;
  }

  needsRender = 1;
}

function updateGameStatus(isThinking) {
  let textLabel;

  if (chessApp.in_checkmate()) {
    textLabel =
      "Mat · " + (chessApp.turn() == "w" ? "noirs" : "blancs") + " gagnent";
    isGameOver = 1;
  } else if (chessApp.in_draw()) {
    textLabel = "Partie nulle";
    isGameOver = 1;
  } else {
    textLabel =
      (chessApp.turn() == "w" ? "Blancs" : "Noirs") +
      (chessApp.in_check() ? " · échec" : "") +
      (isThinking ? " · …" : "");
    isGameOver = 0;
  }

  statusTextContent = textLabel + (playMode == "bot" ? " · NV" + botLevel : "");
  qs("#statusText").textContent = statusTextContent + " · " + formatTimer();

  clearTimeout(gameEndTimeout);
  if (isGameOver && !gameEndTriggered) {
    gameEndTriggered = 1;
    gameEndTime = performance.now();
    gameEndTimeout = setTimeout(() => openGameOverModal(textLabel), 900);
  }
  if (!isGameOver) gameEndTriggered = 0;

  qs("#statusDot").style.background = isGameOver
    ? "var(--accent)"
    : chessApp.turn() == "w"
      ? "#fff"
      : "#15121f";
}

function executeMove(moveStr) {
  const moveObj = chessApp.move(moveStr);
  if (!moveObj) return;

  applyMoveEffect(moveObj);

  lastMove = [moveObj.from, moveObj.to];
  selectedSq = null;
  legalMoves = [];

  updateGameStatus();
  updateHighlights();
  playMoveSound(moveObj);
  saveGameState();

  if (currentSkin.fl && playMode == "local" && !isGameOver) {
    setCamAngle(chessApp.turn() == "b" ? Math.PI : 0);
  }

  if (currentSkin.fx && chessApp.in_check()) {
    cameraShake = Math.max(cameraShake, 0.08);
  }

  if (
    playMode == "bot" &&
    currentSkin.ad &&
    moveObj.color == playerColor &&
    !isGameOver
  ) {
    let score = 0;
    for (const row of chessApp.board()) {
      for (const piece of row) {
        if (piece) {
          score +=
            (piece.color == playerColor ? 1 : -1) *
            { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[piece.type];
        }
      }
    }
    if (score >= 2 && botLevel < 21) botLevel++;
    else if (score <= -2 && botLevel > 1) botLevel--;
    currentSkin.lv = botLevel;
    saveSkin();
    updateGameStatus();
  }

  return moveObj;
}

function handleMove(fromSq, toSq) {
  const promoMove = chessApp
    .moves({ square: fromSq, verbose: true })
    .find((m) => m.to == toSq && m.promotion);
  if (promoMove && currentSkin.pr) {
    return openModal("PROMOTION", (panel) =>
      panel.append(
        createSegmentCtrl(["DAME", "TOUR", "FOU", "CAVALIER"], -1, (idx) => {
          closeModal();
          commitMove({ from: fromSq, to: toSq, promotion: "qrbn"[idx] });
        }),
      ),
    );
  }
  commitMove({ from: fromSq, to: toSq, promotion: "q" });
}

function commitMove(moveData) {
  if (!executeMove(moveData)) return;
  if (playMode == "bot" && !isGameOver) requestBotMove();
}

function onSquareClick(sqName) {
  if (isGameOver || isBusy || isModalOpen || isTitleScreen || !isMyTurn())
    return;

  if (selectedSq && legalMoves.includes(sqName)) {
    handleMove(selectedSq, sqName);
    return;
  }

  const piece = chessApp.get(sqName);

  if (piece && piece.color == chessApp.turn() && sqName != selectedSq) {
    selectedSq = sqName;
    legalMoves = chessApp
      .moves({ square: sqName, verbose: true })
      .map((m) => m.to);
  } else {
    selectedSq = null;
    legalMoves = [];
  }

  updateHighlights();
}

function setCamAngle(targetRad) {
  targetAzimuth =
    targetRad +
    Math.PI * 2 * Math.round((camAzimuth - targetRad) / (Math.PI * 2));
}

function startNewGame() {
  hideBottomNewGameButton();
  chessApp.reset();
  if (currentSkin.hc && playMode == "bot") {
    const botColor = playerColor == "w" ? "b" : "w",
      backRank = botColor == "w" ? 1 : 8,
      pawnRank = botColor == "w" ? 2 : 7;
    [
      [],
      ["d" + backRank],
      ["a" + backRank, "h" + backRank],
      ["f" + pawnRank, "g" + pawnRank, "h" + pawnRank],
    ][currentSkin.hc].forEach((sq) => chessApp.remove(sq));

    const fenParts = chessApp.fen().split(" ");
    fenParts[2] = "-";
    chessApp.load(fenParts.join(" "));
  }
  resetBoard3D();

  selectedSq = null;
  legalMoves = [];
  lastMove = [];
  isBusy = 0;
  isGameOver = 0;

  gameStartTime = performance.now();
  updateGameStatus();
  updateHighlights();

  setCamAngle(playerColor == "b" && playMode != "local" ? Math.PI : 0);

  if (playMode == "bot" && playerColor == "b") requestBotMove();
}

function undoLastMove() {
  if (isBusy) return;

  const steps = playMode == "bot" && chessApp.turn() == playerColor ? 2 : 1;
  for (let i = 0; i < steps; i++) chessApp.undo();

  resetBoard3D();
  selectedSq = null;
  legalMoves = [];

  const historyPop = chessApp.history({ verbose: true }).pop();
  lastMove = historyPop ? [historyPop.from, historyPop.to] : [];

  updateGameStatus();
  updateHighlights();

  if (playMode == "bot" && chessApp.turn() != playerColor && !isGameOver)
    requestBotMove();
}

/* ---- Bot (Web Worker: UI never blocked) ---- */
const BOT_WORKER_CODE = `importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js');
const V={p:100,n:320,b:330,r:500,q:900,k:0},G=new Chess();let T,stop,n;
const ev=()=>{let s=0;const b=G.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=b[r][f];if(!p)continue;let v=V[p.type];const c=3.5-Math.max(Math.abs(f-3.5),Math.abs(r-3.5));v+=p.type=='p'?c*4+(p.color=='w'?7-r:r)*6:p.type=='k'?0:c*6;s+=p.color=='w'?v:-v}return G.turn()=='w'?s:-s};
const sc=m=>(m.captured?V[m.captured]*10-V[m.piece]:0)+(m.promotion?800:0),ord=ms=>ms.sort((x,y)=>sc(y)-sc(x));
const tk=()=>{if((++n&255)==0&&Date.now()>T)stop=1};
function q(a,b,d){tk();const s=ev();if(d<=0||stop||s>=b)return s;if(s>a)a=s;for(const m of ord(G.moves({verbose:true}).filter(m=>m.captured))){G.move(m);const v=-q(-b,-a,d-1);G.undo();if(v>=b)return v;if(v>a)a=v}return a}
function nm(d,a,b){tk();if(stop)return 0;if(d<=0)return q(a,b,4);const ms=G.moves({verbose:true});if(!ms.length)return G.in_check()?-1e5-d:0;let best=-1e9;for(const m of ord(ms)){G.move(m);const s=-nm(d-1,-b,-a);G.undo();if(s>best)best=s;if(best>a)a=best;if(a>=b)break}return best}
onmessage=e=>{const{fen,L}=e.data;G.load(fen);const D=[1,1,2,2,2,3,3,3,3,4,4,4,5,5,5,6,6,7,7,8,9][L-1],ms=ord(G.moves({verbose:true}));T=Date.now()+Math.min(3500,80+L*L*8);stop=0;n=0;
let sco=ms.map(()=>0);
for(let d=1;d<=D&&!stop;d++){const r=[];for(let i=0;i<ms.length;i++){G.move(ms[i]);r.push(-nm(d-1,-1e9,1e9));G.undo();if(stop)break}if(stop&&d>1)break;if(r.length==ms.length){sco=r;const bi=r.indexOf(Math.max(...r));ms.unshift(ms.splice(bi,1)[0]);sco.unshift(sco.splice(bi,1)[0])}}
const nz=L<14?420*Math.pow(1-(L-1)/13,1.5):0;let bi=0,bs=-1e9;
sco.forEach((s,i)=>{s+=Math.random()*nz;if(s>bs){bs=s;bi=i}});
if(L<7&&Math.random()<(7-L)*.05)bi=(Math.random()*ms.length)|0;
const m=ms[bi];postMessage(m?{from:m.from,to:m.to}:null)};`;

const chessWorker = new Worker(
  URL.createObjectURL(new Blob([BOT_WORKER_CODE])),
);

function requestBotMove() {
  isBusy = 1;
  updateGameStatus(1);
  chessWorker.onmessage = (e) => {
    isBusy = 0;
    if (e.data)
      executeMove({ from: e.data.from, to: e.data.to, promotion: "q" });
  };
  chessWorker.postMessage({ fen: chessApp.fen(), L: botLevel });
}

/* ---- UI functionality ---- */
let isModalOpen = 0,
  currentSkinTab = "p",
  gameStartTime = 0,
  gameEndTime = 0,
  gameEndTriggered = 0,
  gameEndTimeout = 0,
  statusTextContent = "";

const modalEl = qs("#modalOverlay");

const createEl = (tag, className, text, onClick) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  if (onClick) el.onclick = onClick;
  return el;
};

const formatTimer = () => {
  const rawSeconds =
    (((isGameOver ? gameEndTime : performance.now()) - gameStartTime) / 1e3) |
    0;
  const seconds = Math.max(0, rawSeconds);
  return ((seconds / 60) | 0) + ":" + String(seconds % 60).padStart(2, "0");
};

setInterval(() => {
  if (!isGameOver)
    qs("#statusText").textContent = statusTextContent + " · " + formatTimer();
}, 1000);

let pauseTime = 0,
  closeTimeout = 0,
  isTitleScreen = 1,
  audioCtx;

function closeModal() {
  if (!isModalOpen) return;
  isModalOpen = 0;
  if (pauseTime) {
    gameStartTime += performance.now() - pauseTime;
    pauseTime = 0;
  }
  modalEl.classList.add("fade-out");
  clearTimeout(closeTimeout);
  closeTimeout = setTimeout(() => {
    modalEl.hidden = true;
    modalEl.classList.remove("fade-out");
  }, 180);
  needsRender = 1;
}

function openModal(titleText, buildContent) {
  clearTimeout(closeTimeout);
  modalEl.classList.remove("fade-out");
  modalEl.hidden = false;

  if (!isModalOpen && !isGameOver) pauseTime = performance.now();
  isModalOpen = 1;
  modalEl.onclick = (e) => e.target == modalEl && closeModal();

  let isFirstRender = 1;
  const renderModal = () => {
    const panel = createEl(
      "div",
      "modal-panel panel-bg" + (isFirstRender ? " pop-anim" : ""),
    );
    const header = createEl("div", "modal-header");

    header.append(
      createEl("b", "", titleText),
      createEl("button", "close-btn", "X", closeModal),
    );
    panel.append(header);

    buildContent(panel, renderModal);

    if (isFirstRender) {
      [...panel.children].forEach(
        (child, i) => (child.style.animationDelay = i * 35 + "ms"),
      );
    }
    isFirstRender = 0;
    modalEl.replaceChildren(panel);
  };

  renderModal();
}

/* 8-bit sounds */
const playBeep = (freq, duration, type = "square", vol = 0.08, rampEndFreq) => {
  if (!currentSkin.sn) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator(),
      gainNode = audioCtx.createGain(),
      now = audioCtx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    if (rampEndFreq)
      osc.frequency.exponentialRampToValueAtTime(rampEndFreq, now + duration);

    gainNode.gain.setValueAtTime(vol * currentSkin.vo * 2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start();
    osc.stop(now + duration);
  } catch (e) {}
};

const playMoveSound = (moveObj) => {
  moveObj.captured
    ? playBeep(200, 0.2, "sawtooth", 0.1, 55)
    : playBeep(
        moveObj.flags.includes("k") || moveObj.flags.includes("q") ? 330 : 260,
        0.09,
        "square",
        0.07,
        400,
      );
  if (chessApp.in_check()) setTimeout(() => playBeep(880, 0.15), 90);
};

document.addEventListener("click", (e) => {
  if (e.target.closest("button")) playBeep(520, 0.04, "square", 0.04);
});

const saveGameState = () => {
  try {
    isGameOver
      ? localStorage.removeItem("bcg")
      : (localStorage.bcg = JSON.stringify({
          pgn: chessApp.pgn(),
          c: playerColor,
          m: playMode,
          el: (performance.now() - gameStartTime) | 0,
        }));
  } catch (e) {}
};

function resumeGame() {
  let savedData;
  try {
    savedData = JSON.parse(localStorage.bcg);
  } catch (e) {}
  if (!savedData) return startGame();

  playMode = savedData.m;
  playerColor = savedData.c;
  isGameOver = 0;
  chessApp.load_pgn(savedData.pgn);

  resetBoard3D();
  gameStartTime = performance.now() - savedData.el;

  const lastHistory = chessApp.history({ verbose: true }).pop();
  lastMove = lastHistory ? [lastHistory.from, lastHistory.to] : [];

  selectedSq = null;
  legalMoves = [];

  updateGameStatus();
  updateHighlights();
  setCamAngle(playerColor == "b" && playMode != "local" ? Math.PI : 0);

  if (playMode == "bot" && chessApp.turn() != playerColor && !isGameOver)
    requestBotMove();
}

const createSegmentCtrl = (
  items,
  activeIdx,
  onSelect,
  customClass = "segment-group",
) => {
  const container = createEl("div", customClass);
  items.forEach((label, idx) =>
    container.append(
      createEl(
        "button",
        "item-btn" + (idx == activeIdx ? " active" : ""),
        label,
        () => onSelect(idx),
      ),
    ),
  );
  return container;
};

const createLabel = (title, value) => {
  const container = createEl("div", "label-box");
  container.append(createEl("span", "", title), createEl("b", "", value));
  return container;
};

const createRangeCtrl = (min, max, step, val, onChange) => {
  const input = createEl("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = val;
  input.classList.add("input-range");
  input.oninput = () => onChange(+input.value);
  input.onchange = saveSkin;
  return input;
};

const createColorCtrl = (val, onChange) => {
  const input = createEl("input");
  input.type = "color";
  input.value = val;
  input.classList.add("input-range");
  input.addEventListener("input", (e) => onChange(e.target.value));
  input.addEventListener("change", () => saveSkin());
  return input;
};

const createSwatchCtrl = (colA, colB, onClick, titleText) => {
  const btn = createEl("button", "swatch-btn", "", onClick);
  btn.style.background = `linear-gradient(135deg,${colA} 50%,${colB} 50%)`;
  btn.title = titleText;
  return btn;
};

const getLevelName = () =>
  botLevel + " · " + LEVEL_LABELS[Math.min(6, ((botLevel - 1) / 3) | 0)];

function startGame() {
  playerColor =
    playMode == "local"
      ? "w"
      : chosenColor == "r"
        ? "wb"[(Math.random() * 2) | 0]
        : chosenColor;
  startNewGame();
}

function openBotModal() {
  openModal("BOT", (panel, reRender) => {
    panel.append(
      createSegmentCtrl(
        ["BOT", "2 JOUEURS"],
        playMode == "bot" ? 0 : 1,
        (idx) => {
          playMode = currentSkin.mode = idx ? "local" : "bot";
          saveSkin();
          reRender();
        },
      ),
    );
    if (playMode == "bot") {
      const lbl = createLabel(
        currentSkin.ad ? "NIVEAU (ADAPTATIF)" : "NIVEAU",
        getLevelName(),
      );
      panel.append(
        lbl,
        createRangeCtrl(1, 21, 1, botLevel, (val) => {
          botLevel = currentSkin.lv = val;
          lbl.lastChild.textContent = getLevelName();
        }),
        createSegmentCtrl(["FIXE", "ADAPTATIF"], currentSkin.ad | 0, (idx) => {
          currentSkin.ad = idx;
          saveSkin();
          reRender();
        }),
        createLabel("JE JOUE", ""),
        createSegmentCtrl(
          ["BLANCS", "NOIRS", "HASARD"],
          "wbr".indexOf(chosenColor),
          (idx) => {
            chosenColor = currentSkin.col = "wbr"[idx];
            saveSkin();
            reRender();
          },
        ),
      );
    }
    panel.append(
      createEl("button", "btn-primary", "JOUER", () => {
        closeModal();
        startGame();
      }),
    );
  });
}

function openViewModal() {
  openModal("VUE", (panel, reRender) => {
    const lblSpeed = createLabel("VITESSE", "x" + currentSkin.sp);
    panel.append(
      createEl("button", "btn-primary", "RÉINITIALISER LA VUE", () => {
        camPolar = 0.95;
        camZoom = 1;
        setCamAngle(playerColor == "b" && playMode != "local" ? Math.PI : 0);
        needsRender = 1;
      }),
      createLabel("DRAG & DROP", currentSkin.dd ? "ON" : "OFF"),
      createSegmentCtrl(["OFF", "ON"], currentSkin.dd, (idx) => {
        currentSkin.dd = idx;
        saveSkin();
        reRender();
      }),
      lblSpeed,
      createRangeCtrl(0.5, 3, 0.25, currentSkin.sp, (val) => {
        currentSkin.sp = val;
        lblSpeed.lastChild.textContent = "x" + val;
      }),
    );
  });
}

function openSkinModal() {
  openModal("SKIN", (panel, reRender) => {
    const categories = ["p", "b", "bg"],
      activeSettings = currentSkin[currentSkinTab],
      applyChanges = () => {
        applySkinSettings();
        saveSkin();
      },
      isBgTab = currentSkinTab == "bg",
      gridContainer = createEl("div", "grid-group"),
      colorContainer = createEl("div", "color-box");

    panel.append(
      createSegmentCtrl(
        ["PIÈCES", "PLATEAU", "FOND"],
        categories.indexOf(currentSkinTab),
        (idx) => {
          currentSkinTab = categories[idx];
          reRender();
        },
      ),
    );

    if (!isBgTab) {
      panel.append(
        createLabel("FORME", SHAPE_DATA[activeSettings.sh][0]),
        createSegmentCtrl(
          SHAPE_DATA.map((x) => x[0]),
          activeSettings.sh,
          (idx) => {
            activeSettings.sh = idx;
            applyChanges();
            if (currentSkinTab == "p") resetBoard3D();
            reRender();
          },
          "grid-group",
        ),
        createLabel("MATIÈRE", MAT_DATA[activeSettings.mt][0]),
        createSegmentCtrl(
          MAT_DATA.map((x) => x[0]),
          activeSettings.mt,
          (idx) => {
            activeSettings.mt = idx;
            applyChanges();
            reRender();
          },
          "grid-group",
        ),
      );
    }

    panel.append(createLabel(isBgTab ? "PRESETS" : "COULEURS", ""));
    (isBgTab ? BG_PRESETS : PIECE_PRESETS).forEach((preset) =>
      gridContainer.append(
        createSwatchCtrl(
          preset[1],
          preset[2],
          () => {
            activeSettings.a = preset[1];
            activeSettings.b = preset[2];
            applyChanges();
            reRender();
          },
          preset[0],
        ),
      ),
    );

    colorContainer.append(
      createColorCtrl(activeSettings.a, (val) => {
        activeSettings.a = val;
        applySkinSettings();
      }),
      createColorCtrl(activeSettings.b, (val) => {
        activeSettings.b = val;
        applySkinSettings();
      }),
    );

    if (!isBgTab && activeSettings.g) {
      colorContainer.append(
        createColorCtrl(activeSettings.c || activeSettings.b, (val) => {
          activeSettings.c = val;
          applySkinSettings();
        }),
      );
    }

    panel.append(
      gridContainer,
      createLabel("TES COULEURS", ""),
      colorContainer,
    );

    if (!isBgTab) {
      panel.append(
        createSegmentCtrl(["UNI", "DÉGRADÉ"], activeSettings.g | 0, (idx) => {
          activeSettings.g = idx;
          applyChanges();
          reRender();
        }),
      );
    }

    const customPalettes = currentSkin.cu[currentSkinTab],
      customGrid = createEl("div", "grid-group");

    customPalettes.forEach((pal) =>
      customGrid.append(
        createSwatchCtrl(
          pal[0],
          pal[1],
          () => {
            activeSettings.a = pal[0];
            activeSettings.b = pal[1];
            applyChanges();
            reRender();
          },
          "perso",
        ),
      ),
    );

    panel.append(
      createLabel("MES PALETTES", customPalettes.length + "/10"),
      customGrid,
      createSegmentCtrl(["SAUVER", "EFFACER"], -1, (idx) => {
        idx
          ? (customPalettes.length = 0)
          : customPalettes.length < 10 &&
            customPalettes.push([activeSettings.a, activeSettings.b]);
        saveSkin();
        reRender();
      }),
    );
  });
}

const createToggles = (panel, reRender, toggleList) => {
  const container = createEl("div", "grid-half");
  toggleList.forEach(([label, key, callback]) =>
    container.append(
      createEl(
        "button",
        "item-btn" + (currentSkin[key] ? " active" : ""),
        label + " · " + (currentSkin[key] ? "ON" : "OFF"),
        () => {
          currentSkin[key] = currentSkin[key] ? 0 : 1;
          saveSkin();
          if (callback) callback();
          reRender();
        },
      ),
    ),
  );
  panel.append(container);
};

function applyFxSettings() {
  renderer.shadowMap.enabled = !!currentSkin.sh;
  groundPlane.visible = !!currentSkin.sh;
  document.body.classList.toggle("crt-mode", !!currentSkin.crt);
  qs("#statusContainer").style.display = currentSkin.hs ? "none" : "";
  applySkinSettings();
  handleResize();
}

const randomHexColor = (lightness) =>
  "#" +
  new THREE.Color()
    .setHSL(Math.random(), 0.5 + Math.random() * 0.4, lightness)
    .getHexString();

let optionsTab = 0;

function openOptionsModal() {
  openModal("OPTIONS", (panel, reRender) => {
    panel.append(
      createSegmentCtrl(["JEU", "AFFICHAGE", "OUTILS"], optionsTab, (idx) => {
        optionsTab = idx;
        reRender();
      }),
    );

    if (optionsTab == 0) {
      createToggles(panel, reRender, [
        ["COUPS POSSIBLES", "dt"],
        ["DERNIER COUP", "lm"],
        ["PROMOTION AU CHOIX", "pr"],
        ["PLATEAU TOURNANT", "fl"],
        ["SONS", "sn"],
        ["MUSIQUE DE FOND", "bgm", updateMusicState],
      ]);
      panel.append(
        createLabel("PISTE MUSICALE", "1 à 4"),
        createSegmentCtrl(
          [
            "Final Boss Ascent",
            "A Calculated Turn",
            "A Quiet Gambit",
            "Pawn's Last Ascent",
          ],
          currentSkin.musicIdx || 0,
          (idx) => {
            currentSkin.musicIdx = idx;
            saveSkin();
            updateMusicState();
            reRender();
          },
          "segment-group",
        ),
        createLabel("VOLUME", ""),
        createRangeCtrl(
          0,
          1,
          0.1,
          currentSkin.vo,
          (val) => (currentSkin.vo = val),
        ),
        createLabel("HANDICAP BOT", "PROCHAINE PARTIE"),
        createSegmentCtrl(
          ["AUCUN", "SANS DAME", "SANS TOURS", "SANS 3 PIONS"],
          currentSkin.hc | 0,
          (idx) => {
            currentSkin.hc = idx;
            saveSkin();
            reRender();
          },
          "grid-half",
        ),
      );
    } else if (optionsTab == 1) {
      createToggles(panel, reRender, [
        ["CONTOUR PIÈCES", "ol", resetBoard3D],
        ["EFFETS", "fx"],
        ["OMBRES", "sh", applyFxSettings],
        ["ROTATION AUTO", "rt"],
        ["FILTRE CRT", "crt", applyFxSettings],
        ["MODE ZEN", "hs", applyFxSettings],
      ]);
      panel.append(
        createLabel("CONTRASTE", ""),
        createRangeCtrl(0, 1, 0.05, currentSkin.ct, (val) => {
          currentSkin.ct = val;
          applySkinSettings();
        }),
        createLabel("RÉSOLUTION", ""),
        createSegmentCtrl(
          ["BAS", "NORMAL", "HAUT"],
          [1, 1.5, 2].indexOf(currentSkin.q),
          (idx) => {
            currentSkin.q = [1, 1.5, 2][idx];
            saveSkin();
            handleResize();
            reRender();
          },
        ),
      );
    } else {
      const copyBtn = createEl("button", "btn-primary", "COPIER LE PGN", () => {
        try {
          navigator.clipboard.writeText(chessApp.pgn());
          copyBtn.textContent = "COPIÉ !";
        } catch (e) {}
      });
      panel.append(
        createEl("button", "btn-primary", "INDICE", requestHint),
        copyBtn,
        createEl("button", "btn-primary", "NOUVELLE PARTIE", () => {
          closeModal();
          startNewGame();
        }),
        createEl("button", "btn-primary", "SKIN ALÉATOIRE", () => {
          const pProps = currentSkin.p,
            bProps = currentSkin.b;
          pProps.sh = (Math.random() * SHAPE_DATA.length) | 0;
          pProps.mt = (Math.random() * MAT_DATA.length) | 0;
          pProps.a = randomHexColor(0.85);
          pProps.b = randomHexColor(0.2);
          bProps.sh = (Math.random() * SHAPE_DATA.length) | 0;
          bProps.mt = (Math.random() * MAT_DATA.length) | 0;
          bProps.a = randomHexColor(0.65);
          bProps.b = randomHexColor(0.3);
          currentSkin.bg.a = randomHexColor(0.35);
          currentSkin.bg.b = randomHexColor(0.06);
          applySkinSettings();
          resetBoard3D();
          saveSkin();
        }),
        createEl("button", "item-btn", "TOUT RÉINITIALISER", () => {
          try {
            localStorage.clear();
          } catch (e) {}
          location.reload();
        }),
      );
    }
  });
}

function requestHint() {
  if (isGameOver || isBusy || !isMyTurn()) return;
  closeModal();
  isBusy = 1;
  chessWorker.onmessage = (e) => {
    isBusy = 0;
    if (e.data) {
      selectedSq = e.data.from;
      legalMoves = [e.data.to];
      updateHighlights();
    }
  };
  chessWorker.postMessage({ fen: chessApp.fen(), L: 16 });
}

function openGameOverModal(messageText) {
  [392, 494, 587, 784].forEach((freq, idx) =>
    setTimeout(() => playBeep(freq, 0.2), idx * 120),
  );
  openModal("FIN DE PARTIE", (panel) => {
    panel.append(
      createEl("div", "big-text", messageText.toUpperCase()),
      createLabel("TEMPS", formatTimer()),
      createLabel("COUPS", Math.ceil(chessApp.history().length / 2)),
      createEl("button", "btn-primary", "REJOUER", () => {
        hideBottomNewGameButton();
        closeModal();
        startNewGame();
      }),
      createEl("button", "item-btn", "VOIR LE PLATEAU", () => {
        closeModal();
        showBottomNewGameButton();
      }),
    );
  });
}

let bottomNewGameBtn = null;

function showBottomNewGameButton() {
  if (!bottomNewGameBtn) {
    bottomNewGameBtn = createEl(
      "button",
      "btn-primary",
      "NOUVELLE PARTIE",
      () => {
        hideBottomNewGameButton();
        startNewGame();
      },
    );
    bottomNewGameBtn.style.position = "fixed";
    bottomNewGameBtn.style.bottom = "85px";
    bottomNewGameBtn.style.left = "50%";
    bottomNewGameBtn.style.transform = "translateX(-50%)";
    bottomNewGameBtn.style.zIndex = "100";
    bottomNewGameBtn.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.6)";
    document.body.append(bottomNewGameBtn);
  }
  bottomNewGameBtn.style.display = "block";
}

function hideBottomNewGameButton() {
  if (bottomNewGameBtn) {
    bottomNewGameBtn.style.display = "none";
  }
}

qs("#btnUndo").onclick = undoLastMove;
qs("#btnBot").onclick = openBotModal;
qs("#btnView").onclick = openViewModal;
qs("#btnSkin").onclick = openSkinModal;
qs("#btnMore").onclick = openOptionsModal;

const hideTitleScreen = (callback) => {
  isTitleScreen = 0;
  document.body.classList.remove("title-active");
  qs("#titleScreen").classList.add("fade-out");
  setTimeout(() => (qs("#titleScreen").hidden = true), 400);
  updateMusicState();
  callback();
};

qs("#btnPlay").onclick = () => hideTitleScreen(startGame);
qs("#btnContinue").onclick = () => hideTitleScreen(resumeGame);
try {
  if (localStorage.bcg) qs("#btnContinue").hidden = false;
} catch (e) {}

/* ---- Controls & main loop ---- */
const raycaster = new THREE.Raycaster(),
  pointerCoords = new THREE.Vector2(),
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  dragIntersect = new THREE.Vector3();
let draggedPiece = null;

function updateRaycaster(e) {
  const rect = canvasEl.getBoundingClientRect();
  pointerCoords.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointerCoords, camera);
}

const getMeshOwner = (meshObj) => {
  while (meshObj && !meshObj.userData.sq) meshObj = meshObj.parent;
  return meshObj;
};

function performPicking(e) {
  updateRaycaster(e);
  const hits = raycaster.intersectObjects(
    [...boardSqMeshes, ...Object.values(activePieces)],
    true,
  );
  const owner = hits[0] && getMeshOwner(hits[0].object);
  if (owner) onSquareClick(owner.userData.sq);
}

canvasEl.onpointerdown = (e) => {
  pointerDown = { x: e.clientX, y: e.clientY, moved: 0 };
  canvasEl.setPointerCapture(e.pointerId);

  if (currentSkin.dd && !isGameOver && !isBusy && !isModalOpen && isMyTurn()) {
    updateRaycaster(e);
    const hits = raycaster.intersectObjects(Object.values(activePieces), true);
    const owner = hits[0] && getMeshOwner(hits[0].object);

    if (owner && chessApp.get(owner.userData.sq).color == chessApp.turn()) {
      if (selectedSq != owner.userData.sq) onSquareClick(owner.userData.sq);
      const retIdx = returnAnims.findIndex((anim) => anim.g === owner);
      if (retIdx !== -1) returnAnims.splice(retIdx, 1);

      draggedPiece = { g: owner, s: owner.userData.sq };
      pointerDown.moved = 1;
    }
  }
};

canvasEl.onpointermove = (e) => {
  if (!pointerDown) return;
  if (draggedPiece) {
    updateRaycaster(e);
    if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
      draggedPiece.g.position.set(dragIntersect.x, 0.5, dragIntersect.z);
    }
    needsRender = 1;
    return;
  }

  const deltaX = e.clientX - pointerDown.x,
    deltaY = e.clientY - pointerDown.y;

  if (Math.abs(deltaX) + Math.abs(deltaY) > 6) pointerDown.moved = 1;

  if (pointerDown.moved) {
    camAzimuth -= deltaX * 0.0065;
    camPolar = Math.min(1.35, Math.max(0.25, camPolar - deltaY * 0.005));
    pointerDown.x = e.clientX;
    pointerDown.y = e.clientY;
    targetAzimuth = null;
    needsRender = 1;
  }
};

canvasEl.onpointerup = (e) => {
  if (draggedPiece) {
    updateRaycaster(e);
    let targetSq = null;
    if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
      const fileIndex = Math.round(dragIntersect.x + 3.5),
        rankIndex = Math.round(3.5 - dragIntersect.z);
      if (fileIndex >= 0 && fileIndex < 8 && rankIndex >= 0 && rankIndex < 8) {
        targetSq = "abcdefgh"[fileIndex] + (rankIndex + 1);
      }
    }
    const pieceData = draggedPiece;
    draggedPiece = null;

    if (targetSq && legalMoves.includes(targetSq)) {
      handleMove(pieceData.s, targetSq);
    } else {
      returnAnims.push({
        g: pieceData.g,
        f: pieceData.g.position.clone(),
        to: getPos(pieceData.s),
        t: 0,
      });
    }
    needsRender = 1;
  } else if (pointerDown && !pointerDown.moved) {
    performPicking(e);
  }
  pointerDown = null;
};

canvasEl.onwheel = (e) => {
  camZoom = Math.min(1.6, Math.max(0.5, camZoom * (1 + e.deltaY * 0.001)));
  needsRender = 1;
};

function renderScene() {
  const aspect = innerWidth / innerHeight,
    distance = Math.max(15, 16.5 / Math.min(aspect, 1.1)) * camZoom,
    sinPolar = Math.sin(camPolar);

  camera.position.set(
    distance * sinPolar * Math.sin(camAzimuth),
    distance * Math.cos(camPolar),
    distance * sinPolar * Math.cos(camAzimuth),
  );

  if (cameraShake) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
  }

  camera.lookAt(0, -0.1, 0);
  renderer.render(scene, camera);
  needsRender = 0;
}

function handleResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentSkin.q));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderScene();
}

addEventListener("resize", handleResize);
handleResize();

let lastTime = 0;

(function animationLoop(timestamp) {
  requestAnimationFrame(animationLoop);
  const deltaTime = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (
    (isTitleScreen || (currentSkin.rt && !pointerDown && !isModalOpen)) &&
    targetAzimuth == null
  ) {
    camAzimuth += deltaTime * 0.12;
    needsRender = 1;
  }

  if (targetAzimuth != null) {
    camAzimuth += (targetAzimuth - camAzimuth) * (1 - Math.exp(-deltaTime * 7));
    needsRender = 1;
    if (Math.abs(targetAzimuth - camAzimuth) < 0.003) {
      camAzimuth = targetAzimuth;
      targetAzimuth = null;
    }
  }

  for (let i = moveAnims.length; i--; ) {
    const anim = moveAnims[i],
      progress = (anim.t = Math.min(
        1,
        anim.t + (deltaTime * currentSkin.sp) / 0.45,
      )),
      ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    anim.g.position.lerpVectors(anim.f, anim.to, ease);
    const sineEase = Math.sin(progress * Math.PI),
      baseScale = anim.g.userData.bs;

    anim.g.position.y = sineEase * 0.42;
    anim.g.scale.set(
      baseScale.x * (1 - 0.07 * sineEase),
      baseScale.y * (1 + 0.16 * sineEase),
      baseScale.z * (1 - 0.07 * sineEase),
    );

    if (progress == 1) {
      anim.g.userData.an = 0;
      anim.g.scale.copy(baseScale);
      landAnims.push({ g: anim.g, t: 0 });
      moveAnims.splice(i, 1);
    }
    needsRender = 1;
  }

  for (let i = returnAnims.length; i--; ) {
    const anim = returnAnims[i],
      progress = (anim.t = Math.min(
        1,
        anim.t + (deltaTime * currentSkin.sp) / 0.35,
      )),
      ease =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    anim.g.position.lerpVectors(anim.f, anim.to, ease);

    if (progress == 1) {
      anim.g.position.copy(anim.to);
      returnAnims.splice(i, 1);
    }
    needsRender = 1;
  }

  for (let i = fadeAnims.length; i--; ) {
    const anim = fadeAnims[i],
      progress = (anim.t = Math.min(
        1,
        anim.t + (deltaTime * currentSkin.sp) / 0.35,
      ));

    anim.g.scale.copy(anim.s).multiplyScalar(1 - progress);
    anim.g.position.y = progress * 0.5;

    if (progress == 1) {
      scene.remove(anim.g);
      fadeAnims.splice(i, 1);
    }
    needsRender = 1;
  }

  for (let i = landAnims.length; i--; ) {
    const anim = landAnims[i],
      baseScale = anim.g.userData.bs,
      progress = (anim.t = Math.min(
        1,
        anim.t + (deltaTime * currentSkin.sp) / 0.32,
      )),
      bounce = Math.sin(progress * Math.PI) * (1 - progress);

    anim.g.scale.set(
      baseScale.x * (1 + 0.12 * bounce),
      baseScale.y * (1 - 0.22 * bounce),
      baseScale.z * (1 + 0.12 * bounce),
    );

    if (progress == 1) landAnims.splice(i, 1);
    needsRender = 1;
  }

  for (let i = particlePool.length; i--; ) {
    const particle = particlePool[i],
      data = particle.userData;

    if (data.l <= 0) continue;

    data.v.y -= 9 * deltaTime;
    particle.position.addScaledVector(data.v, deltaTime);
    particle.rotation.x += deltaTime * 6;
    particle.rotation.y += deltaTime * 5;
    particle.scale.setScalar(Math.max(0, data.l));

    if ((data.l -= deltaTime * 1.6) <= 0) {
      particle.visible = false;
      data.l = 0;
    }
    needsRender = 1;
  }

  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - deltaTime * 0.45);
    needsRender = 1;
  }
  if (selectedSq) {
    highlightMeshes[selectedSq].material.opacity =
      0.5 + 0.2 * Math.sin(timestamp / 150);
    needsRender = 1;
  }
  if (legalMoves.length) {
    dotMat.opacity = 0.38 + 0.14 * Math.sin(timestamp / 200);
    needsRender = 1;
  }

  for (const sq in activePieces) {
    const group = activePieces[sq];
    if (group.userData.an || (draggedPiece && draggedPiece.g === group))
      continue;
    const targetY =
      sq == selectedSq ? 0.18 + 0.05 * Math.sin(timestamp / 140) : 0;
    if (Math.abs(group.position.y - targetY) > 0.003) {
      group.position.y +=
        (targetY - group.position.y) * (1 - Math.exp(-deltaTime * 18));
      needsRender = 1;
    }
  }

  if (isDiscoMode) {
    needsRender = 1;

    const TAU = Math.PI * 2;
    const DURATION = 96;
    const ACT_DURATION = DURATION / 20;

    const time = Math.max(0, (timestamp - discoStartTime) / 1000);
    const cycle = time % DURATION;
    const phase = Math.min(19, Math.floor(cycle / ACT_DURATION));
    const t = cycle - phase * ACT_DURATION;

    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const smooth = (v) => {
      v = clamp(v);
      return v * v * (3 - 2 * v);
    };
    const signPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

    const colors =
      scene.userData.discoShowColors ||
      (scene.userData.discoShowColors = [
        0xff27c8, 0x21f6ff, 0xffed38, 0x9855ff, 0x34ff83, 0xff5638, 0xff65a3,
        0xffffff,
      ]);

    const beat = (1 + Math.sin(time * TAU * 2.1)) * 0.5;
    const kick = Math.pow(Math.max(0, Math.sin(time * TAU * 2.1)), 8);
    if (
      !scene.userData.discoShowActive ||
      scene.userData.discoShowSession !== discoStartTime
    ) {
      scene.userData.discoShowActive = true;
      scene.userData.discoShowSession = discoStartTime;
      scene.userData.discoShowOriginalBackground =
        scene.background && scene.background.clone
          ? scene.background.clone()
          : scene.background;
      scene.userData.discoShowFxPhase = -1;
      scene.userData.discoShowLastParticleAt = timestamp;
    }

    if (!(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(0x101018);
    }

    scene.background.setHSL(
      ((205 + time * 23 + phase * 19) % 360) / 360,
      0.94,
      0.055 + beat * 0.055,
    );

    const squares = Object.keys(activePieces).sort();
    const pieceCount = Math.max(1, squares.length);

    for (let i = 0; i < squares.length; i++) {
      const group = activePieces[squares[i]];

      if (group.userData.discoShowIndexSession !== discoStartTime) {
        group.userData.discoShowIndex = i;
        group.userData.discoShowIndexSession = discoStartTime;
      }
    }

    if (scene.userData.discoShowFxPhase !== phase) {
      scene.userData.discoShowFxPhase = phase;

      const burstSquares =
        phase === 19
          ? ["c3", "f3", "c6", "f6", "d4", "e4", "d5", "e5"]
          : ["d4", "e4", "d5", "e5"];

      for (const sq of burstSquares) {
        spawnParticles(getPos(sq), colors[phase % colors.length]);
      }

      scene.userData.discoShowLastParticleAt = timestamp;
    }

    const transition = smooth(t / 0.62);

    for (const sq in activePieces) {
      const group = activePieces[sq];

      if (group.userData.an) continue;

      const piece = chessApp.get(sq);
      if (!piece) continue;

      const baseScale = group.userData.bs;
      const isBlack = piece.color === "b";
      const baseRotY = isBlack ? Math.PI : 0;

      const file = sq.charCodeAt(0) - 97;
      const rank = Number(sq[1]) - 1;

      const index = group.userData.discoShowIndex ?? 0;
      const u = pieceCount > 1 ? index / (pieceCount - 1) : 0.5;

      const gx = (file - 3.5) * 0.5;
      const gz = (rank - 3.5) * 0.5;

      const fromKey = "discoShowFrom";

      if (
        !group.userData[fromKey] ||
        group.userData.discoShowPosePhase !== phase ||
        group.userData.discoShowPoseSession !== discoStartTime
      ) {
        group.userData[fromKey] = {
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
          rx: group.rotation.x,
          ry: group.rotation.y,
          rz: group.rotation.z,
          sx: group.scale.x,
          sy: group.scale.y,
          sz: group.scale.z,
        };

        group.userData.discoShowPosePhase = phase;
        group.userData.discoShowPoseSession = discoStartTime;
      }

      const from = group.userData[fromKey];

      let x = gx;
      let y = 0.12;
      let z = gz;

      let rx = 0;
      let ry = baseRotY;
      let rz = 0;

      let sx = 1;
      let sy = 1;
      let sz = 1;

      const side = isBlack ? -1 : 1;
      const wave = Math.sin(time * 3.1 - index * 0.41);
      const jump = Math.max(0, Math.sin(time * 4.2 - index * 0.27));

      if (phase === 0) {
        const pulse = Math.sin(t * 3.2 - (file + rank) * 0.48);

        x = gx + Math.sin(t * 2.4 + rank) * 0.07;
        z = gz + Math.cos(t * 2.4 + file) * 0.07;
        y = 0.12 + Math.max(0, pulse) * (0.22 + kick * 0.18);

        ry = baseRotY + Math.sin(t * 2 + index * 0.15) * 0.24;
        rx = pulse * 0.08;
        rz = Math.cos(t * 2.5 + file) * 0.08;

        sx = 1 + beat * 0.04;
        sy = 1 + kick * 0.18;
        sz = sx;
      } else if (phase === 1) {
        const a = u * TAU * 1.5 + t * 2.5;

        x = Math.sin(a) * 2.7;
        z = (u - 0.5) * 5.3;
        y = 0.16 + Math.max(0, Math.sin(a * 2 + t)) * 0.65;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.cos(a * 2) * 0.35;
        rz = Math.sin(a * 1.5) * 0.28;

        sx = 1 + kick * 0.12;
        sy = 1 + jump * 0.22;
        sz = sx;
      } else if (phase === 2) {
        const ring = index % 4;
        const slot = Math.floor(index / 4);
        const runnerCount = Math.max(1, Math.ceil(pieceCount / 4));

        const a =
          (slot / runnerCount) * TAU +
          t * (1.4 + ring * 0.26) * (ring % 2 ? -1 : 1);

        const radius = 0.55 + ring * 0.72;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.2 + ring * 0.12 + Math.max(0, Math.sin(a * 2 - t * 2)) * 0.4;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 2) * 0.18;
        rz = Math.cos(a * 2) * 0.15;

        sx = 1 + kick * 0.15;
        sy = 1 + kick * 0.25;
        sz = sx;
      } else if (phase === 3) {
        const a = u * TAU * 3.2 + t * 2.15;
        const radius = 0.25 + u * 2.8;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.18 + (0.5 + 0.5 * Math.sin(a * 1.5 + t)) * 0.8;

        ry = baseRotY + a;
        rx = Math.sin(a * 2) * 0.32;
        rz = Math.cos(a * 1.5) * 0.25;

        sx = 1 + Math.sin(a * 2) * 0.08;
        sy = 1 + kick * 0.22;
        sz = sx;
      } else if (phase === 4) {
        const checker = (file + rank) % 2 === 0 ? 1 : -1;

        const expansion = 1 + checker * (0.08 + beat * 0.12) + kick * 0.12;

        const pogo = Math.max(0, Math.sin(t * 5.5 + checker * Math.PI * 0.5));

        x = gx * expansion;
        z = gz * expansion;
        y = 0.12 + Math.pow(pogo, 2) * (0.8 + kick * 0.8);

        ry = baseRotY + checker * t * 2.8;
        rx = checker * Math.sin(t * 4) * 0.55;
        rz = checker * Math.cos(t * 4) * 0.42;

        sx = 1 - kick * 0.14;
        sy = 1 + kick * 0.55;
        sz = sx;
      } else if (phase === 5) {
        const lane = index % 2 === 0 ? 1 : -1;
        const q = 2.7 * Math.sin(u * TAU * 2.5 + t * 2.6);

        x = q;
        z = lane * q;
        y = 0.18 + Math.max(0, Math.cos(u * TAU * 2.5 + t * 2.6)) * 0.55;

        ry = baseRotY + t * 2.2 * lane;
        rx = Math.sin(t * 4 + index) * 0.3;
        rz = (lane * Math.PI) / 4;

        sx = 1 + kick * 0.14;
        sy = 1 + kick * 0.28;
        sz = sx;
      } else if (phase === 6) {
        const tierCount = Math.max(2, Math.ceil(pieceCount / 8));
        const tier = Math.floor(index / 8);
        const arm = index % 8;

        const radius = 0.5 + (tier / (tierCount - 1)) * 2.2;
        const a = (arm * TAU) / 8 + t * (tier % 2 ? -2.0 : 2.0);

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.2 + Math.max(0, Math.sin(a * 2 - t * 3)) * 0.45;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a) * 0.24;
        rz = Math.cos(a) * 0.22;

        sx = 1 + kick * 0.18;
        sy = 1 + kick * 0.34;
        sz = sx;
      } else if (phase === 7) {
        const a = u * TAU + t * 1.6;

        x = 2.65 * Math.sin(a);
        z = 2.1 * Math.sin(a) * Math.cos(a);
        y = 0.2 + Math.abs(Math.sin(a * 2 + t)) * 0.72;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 2) * 0.35;
        rz = Math.cos(a * 2) * 0.26;

        sx = 1 + Math.sin(a * 2) * 0.08;
        sy = 1 + kick * 0.24;
        sz = sx;
      } else if (phase === 8) {
        const lane = index % 8;
        const runner = Math.floor(index / 8);
        const runnerCount = Math.max(1, Math.ceil(pieceCount / 8));

        const a =
          (runner / runnerCount) * TAU +
          t * (isBlack ? 2.0 : -1.65) +
          lane * 0.06;

        const radius = 0.65 + lane * 0.28;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.15 + Math.max(0, Math.sin(a * 3)) * 0.24;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 3) * 0.22;
        rz = Math.cos(a * 2) * 0.12;

        sx = 1 + kick * 0.12;
        sy = 1 + kick * 0.3;
        sz = sx;
      } else if (phase === 9) {
        const a = u * TAU + t * 0.95;

        x = 0.15 * 16 * Math.pow(Math.sin(a), 3);

        z =
          -0.13 *
          (13 * Math.cos(a) -
            5 * Math.cos(2 * a) -
            2 * Math.cos(3 * a) -
            Math.cos(4 * a));

        y = 0.2 + Math.abs(Math.sin(a * 2 + t)) * 0.55;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 2) * 0.3;
        rz = Math.cos(a * 3) * 0.2;

        sx = 1 + kick * 0.16;
        sy = 1 + kick * 0.32;
        sz = sx;
      } else if (phase === 10) {
        const a = u * TAU + t * 0.9;
        const radius = 1.35 + 1.2 * Math.cos(8 * a);

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.2 + Math.abs(Math.sin(a * 4 - t)) * 0.85;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 4) * 0.36;
        rz = Math.cos(a * 8) * 0.28;

        sx = 1 + kick * 0.2;
        sy = 1 + Math.sin(a * 8 + t) * 0.12;
        sz = sx;
      } else if (phase === 11) {
        const strand = index % 2 ? Math.PI : 0;
        const strandCount = Math.max(1, Math.ceil(pieceCount / 2));
        const strandU = Math.floor(index / 2) / Math.max(1, strandCount - 1);

        const a = strandU * TAU * 2.25 + t * 2.3 + strand;

        x = Math.cos(a) * 1.45;
        z = (strandU - 0.5) * 5.2;
        y = 1.05 + Math.sin(a) * 0.82;

        ry = baseRotY + a;
        rx = Math.cos(a) * 0.38;
        rz = Math.sin(a) * 0.28;

        sx = 1 + Math.sin(a * 2) * 0.1;
        sy = 1 + kick * 0.18;
        sz = sx;
      } else if (phase === 12) {
        const fall = t * 3.0 - (file + rank) * 0.7;
        const domino = Math.max(0, Math.sin(fall));

        x = gx + Math.sin(fall) * 0.25;
        z = gz + Math.cos(fall) * 0.2;
        y = 0.12 + Math.pow(domino, 4) * (1.35 + kick * 0.5);

        ry = baseRotY + Math.sin(fall) * 0.2;
        rx = -Math.max(0, Math.cos(fall)) * 0.65;
        rz = Math.sin(fall) * 0.18;

        sx = 1 - domino * 0.08;
        sy = 1 + domino * 0.35;
        sz = sx;
      } else if (phase === 13) {
        const layerCount = Math.max(1, Math.ceil(pieceCount / 8));
        const layer = Math.floor(index / 8);
        const level = layerCount > 1 ? layer / (layerCount - 1) : 0.5;

        const a = ((index % 8) * TAU) / 8 + t * (layer % 2 ? -1.8 : 1.8);

        const radius = 0.48 + Math.abs(level - 0.5) * 4.15;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.25 + level * 2.0;

        ry = baseRotY + a;
        rx = Math.sin(a * 2) * 0.28;
        rz = Math.cos(a * 2) * 0.2;

        sx = 1 + kick * 0.15;
        sy = 1 + Math.sin(a * 2) * 0.1;
        sz = sx;
      } else if (phase === 14) {
        const a = u * TAU * 2.0 + t * 1.8;
        const b = u * TAU * 3.0 - t * 1.4;

        x = 2.55 * Math.sin(a);
        z = 2.15 * Math.sin(b);
        y = 0.28 + (0.5 + 0.5 * Math.cos(a + b)) * 1.35;

        ry = baseRotY + a + b;
        rx = Math.sin(a * 2) * 0.45;
        rz = Math.cos(b * 2) * 0.35;

        sx = 1 + kick * 0.17;
        sy = 1 + jump * 0.3;
        sz = sx;
      } else if (phase === 15) {
        const a = u * TAU * 4.5 - t * 3.0;
        const radius = 0.3 + u * 2.55;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.18 + u * 2.0 + Math.max(0, Math.sin(a * 2)) * 0.22;

        ry = baseRotY + a;
        rx = Math.cos(a) * 0.42;
        rz = Math.sin(a) * 0.32;

        sx = 1 + kick * 0.2;
        sy = 1 + kick * 0.28;
        sz = sx;
      } else if (phase === 16) {
        const a = u * TAU + t * 0.85;
        const radius = 1.3 + 0.95 * (0.5 + 0.5 * Math.cos(8 * a));

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.24 + Math.abs(Math.sin(a * 4 - t * 1.8)) * 0.72;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 4) * 0.38;
        rz = Math.cos(a * 8) * 0.28;

        sx = 1 + kick * 0.18;
        sy = 1 + Math.sin(a * 8 + t) * 0.13;
        sz = sx;
      } else if (phase === 17) {
        const a = u * TAU + t * (isBlack ? 2.1 : -1.75);
        const c = Math.cos(a);
        const s = Math.sin(a);

        x = 2.65 * signPow(c, 0.55);
        z = 2.25 * signPow(s, 0.55);
        y = 0.16 + Math.pow(Math.max(0, Math.sin(a * 4)), 4) * 0.8;

        ry = baseRotY + a + Math.PI / 2;
        rx = Math.sin(a * 4) * 0.3;
        rz = Math.cos(a * 4) * 0.22;

        sx = 1 + kick * 0.16;
        sy = 1 + kick * 0.35;
        sz = sx;
      } else if (phase === 18) {
        const ix = ((index % 4) - 1.5) * 0.82;
        const iz = ((Math.floor(index / 4) % 4) - 1.5) * 0.82;

        const layers = Math.max(1, Math.ceil(pieceCount / 16));
        const iy =
          (Math.floor(index / 16) - (layers - 1) / 2) *
          (layers === 2 ? 1.15 : 0.8);

        const ax = t * 1.45;
        const ay = -t * 1.9;

        const y1 = iy * Math.cos(ax) - iz * Math.sin(ax);
        const z1 = iy * Math.sin(ax) + iz * Math.cos(ax);

        x = ix * Math.cos(ay) + z1 * Math.sin(ay);
        z = -ix * Math.sin(ay) + z1 * Math.cos(ay);
        y = 1.45 + y1;

        ry = baseRotY + ay;
        rx = ax;
        rz = Math.sin(t * 2) * 0.2;

        sx = 1 + kick * 0.16;
        sy = 1 + kick * 0.16;
        sz = 1 + kick * 0.16;
      } else {
        const a = u * TAU * 4.8 + t * 3.3;
        const radius = 0.25 + u * 2.85;

        x = Math.cos(a) * radius;
        z = Math.sin(a) * radius;
        y = 0.2 + u * 2.2 + Math.max(0, Math.sin(a * 1.7)) * 0.5;

        ry = baseRotY + a;
        rx = Math.sin(a * 2) * 0.65;
        rz = Math.cos(a * 2) * 0.45;

        sx = 1 + kick * 0.3;
        sy = 1 + kick * 0.65;
        sz = 1 + kick * 0.3;

        const settle = smooth((t - 3.15) / 1.65);

        x = x * (1 - settle) + gx * settle;
        z = z * (1 - settle) + gz * settle;
        y = y * (1 - settle) + 0.12 * settle;

        rx *= 1 - settle;
        ry = baseRotY + (ry - baseRotY) * (1 - settle);
        rz *= 1 - settle;

        sx = sx * (1 - settle) + settle;
        sy = sy * (1 - settle) + settle;
        sz = sz * (1 - settle) + settle;
      }

      group.position.set(
        from.x + (x - from.x) * transition,
        from.y + (y - from.y) * transition,
        from.z + (z - from.z) * transition,
      );

      group.rotation.set(
        from.rx + (rx - from.rx) * transition,
        from.ry + (ry - from.ry) * transition,
        from.rz + (rz - from.rz) * transition,
      );

      group.scale.set(
        from.sx + (baseScale.x * sx - from.sx) * transition,
        from.sy + (baseScale.y * sy - from.sy) * transition,
        from.sz + (baseScale.z * sz - from.sz) * transition,
      );

      if (!group.userData.discoShowSetup) {
        const meshes = [];
        const materials = [];

        group.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;

          const original = obj.material;
          const sourceMaterials = Array.isArray(original)
            ? original
            : [original];

          const clones = sourceMaterials.map((mat) => mat.clone());

          obj.material = Array.isArray(original) ? clones : clones[0];

          meshes.push({
            mesh: obj,
            original,
            cloned: Array.isArray(original) ? clones : clones[0],
          });

          for (const material of clones) {
            materials.push({
              material,
              color: material.color ? material.color.clone() : null,
              emissive: material.emissive ? material.emissive.clone() : null,
              emissiveIntensity: material.emissiveIntensity ?? 1,
            });
          }
        });

        group.userData.discoShowSetup = true;
        group.userData.discoShowMeshes = meshes;
        group.userData.discoShowMaterials = materials;
        group.userData.discoShowTint = new THREE.Color();
      }

      const tint = group.userData.discoShowTint;

      const hue =
        (time * 92 +
          index * 13.7 +
          phase * 31 +
          Math.sin(time * 4 + index * 0.23) * 24) %
        360;

      tint.setHSL(((hue + 360) % 360) / 360, 1, 0.52 + beat * 0.1);

      for (const entry of group.userData.discoShowMaterials) {
        const material = entry.material;

        if (material.color && entry.color) {
          material.color.copy(entry.color).lerp(tint, 0.82);
        }

        if (material.emissive && entry.emissive) {
          material.emissive.copy(entry.emissive).lerp(tint, 0.95);
          material.emissiveIntensity =
            entry.emissiveIntensity + 0.4 + beat * 1.5;
        }
      }
    }

    const particleInterval =
      phase >= 19 ? 170 : phase >= 15 ? 270 : phase >= 9 ? 390 : 580;

    if (
      timestamp - scene.userData.discoShowLastParticleAt >=
      particleInterval
    ) {
      scene.userData.discoShowLastParticleAt = timestamp;

      const particleIndex = Math.floor(time * (phase >= 19 ? 8 : 4.5));

      const sq = SQUARES_LIST[particleIndex % SQUARES_LIST.length];

      spawnParticles(
        getPos(sq),
        colors[(particleIndex + phase) % colors.length],
      );
    }
  }

  if (!isDiscoMode && scene.userData.discoShowActive) {
    const EXIT_DURATION = 2.5;

    if (discoExitStart === null) {
      discoExitStart = timestamp;

      discoExitFrom = {};

      for (const sq in activePieces) {
        const group = activePieces[sq];

        discoExitFrom[sq] = {
          position: group.position.clone(),
          rotation: group.rotation.clone(),
          scale: group.scale.clone(),
        };
      }

      discoExitBackground = scene.background.clone();

      discoExitMaterials = {};

      for (const sq in activePieces) {
        const group = activePieces[sq];

        discoExitMaterials[sq] =
          group.userData.discoShowMaterials?.map((entry) => ({
            entry,
            color: entry.material.color?.clone() ?? null,
            emissive: entry.material.emissive?.clone() ?? null,
            intensity: entry.material.emissiveIntensity ?? 1,
          })) ?? [];
      }
    }

    const progress = Math.min(
      1,
      (timestamp - discoExitStart) / (EXIT_DURATION * 1000),
    );

    const ease = progress * progress * (3 - 2 * progress);

    needsRender = 1;

    const originalBackground = scene.userData.discoShowOriginalBackground;

    if (
      originalBackground &&
      originalBackground.isTexture &&
      originalBackground.image
    ) {
      const image = originalBackground.image;

      if (!discoExitCanvas) {
        discoExitCanvas = document.createElement("canvas");
        discoExitCanvas.width = image.width || 96;
        discoExitCanvas.height = image.height || 54;
        discoExitContext = discoExitCanvas.getContext("2d");

        discoExitTexture = setNearestFilter(
          new THREE.CanvasTexture(discoExitCanvas),
        );
      }

      const ctx = discoExitContext;
      const width = discoExitCanvas.width;
      const height = discoExitCanvas.height;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      ctx.globalAlpha = 1 - ease;
      ctx.fillStyle = "#" + discoExitBackground.getHexString();
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 1;

      discoExitTexture.needsUpdate = true;
      scene.background = discoExitTexture;
    } else {
      if (!(scene.background instanceof THREE.Color)) {
        scene.background = new THREE.Color(0x101018);
      }

      const targetColor =
        originalBackground instanceof THREE.Color
          ? originalBackground
          : new THREE.Color(0x101018);

      scene.background.copy(discoExitBackground).lerp(targetColor, ease);
    }

    for (const sq in activePieces) {
      const group = activePieces[sq];
      const piece = chessApp.get(sq);
      const start = discoExitFrom[sq];

      if (!start || !piece || group.userData.an) continue;

      const target = getPos(sq);
      const baseRotY = piece.color === "b" ? Math.PI : 0;

      group.position.lerpVectors(start.position, target, ease);

      group.rotation.set(
        start.rotation.x * (1 - ease),
        start.rotation.y + (baseRotY - start.rotation.y) * ease,
        start.rotation.z * (1 - ease),
      );

      group.scale.lerpVectors(start.scale, group.userData.bs, ease);

      const entries = discoExitMaterials[sq] ?? [];

      for (const saved of entries) {
        const mat = saved.entry.material;

        if (mat.color && saved.color) {
          mat.color.lerpColors(saved.color, saved.entry.color, ease);
        }

        if (mat.emissive && saved.emissive) {
          mat.emissive.lerpColors(saved.emissive, saved.entry.emissive, ease);

          mat.emissiveIntensity =
            saved.intensity +
            (saved.entry.emissiveIntensity - saved.intensity) * ease;
        }
      }
    }

    if (progress >= 1) {
      scene.userData.discoShowActive = false;

      const originalBackground = scene.userData.discoShowOriginalBackground;

      scene.background =
        originalBackground && originalBackground.clone
          ? originalBackground.clone()
          : originalBackground;

      if (discoExitTexture) discoExitTexture.dispose();

      discoExitCanvas = null;
      discoExitContext = null;
      discoExitTexture = null;

      for (const sq in activePieces) {
        const group = activePieces[sq];
        const meshes = group.userData.discoShowMeshes || [];

        for (const entry of meshes) {
          entry.mesh.material = entry.original;

          const clones = Array.isArray(entry.cloned)
            ? entry.cloned
            : [entry.cloned];

          for (const material of clones) {
            material.dispose();
          }
        }

        if (!group.userData.an && chessApp.get(sq)) {
          const piece = chessApp.get(sq);

          group.position.copy(getPos(sq));
          group.rotation.set(0, piece.color === "b" ? Math.PI : 0, 0);
          group.scale.copy(group.userData.bs);
        }

        delete group.userData.discoShowSetup;
        delete group.userData.discoShowMeshes;
        delete group.userData.discoShowMaterials;
        delete group.userData.discoShowTint;
        delete group.userData.discoShowFrom;
        delete group.userData.discoShowPosePhase;
        delete group.userData.discoShowPoseSession;
        delete group.userData.discoShowIndex;
        delete group.userData.discoShowIndexSession;
      }

      delete scene.userData.discoShowFxPhase;
      delete scene.userData.discoShowLastParticleAt;
      delete scene.userData.discoShowOriginalBackground;
      delete scene.userData.discoShowSession;

      discoExitStart = null;
      discoExitFrom = null;
      discoExitBackground = null;
      discoExitMaterials = null;

      needsRender = 1;
    }
  }

  if (needsRender) renderScene();
})(0);

function updateMusicState() {
  if (!currentSkin.bgm || isTitleScreen || isDiscoMode) {
    bgMusic.pause();
  } else {
    const targetSrc = MUSIC_TRACKS[currentSkin.musicIdx || 0];
    if (!bgMusic.src.includes(targetSrc)) {
      bgMusic.src = targetSrc;
    }
    bgMusic.play().catch(() => {});
  }
}

// ---- Easter Egg : Konami Code (up, up, down, down, left, right, left, right) ----
const konamiSequence = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
];
let konamiPosition = 0;

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    key === konamiSequence[konamiPosition] ||
    e.code.toLowerCase() === konamiSequence[konamiPosition]
  ) {
    konamiPosition++;
    if (konamiPosition === konamiSequence.length) {
      toggleDiscoMode();
      konamiPosition = 0;
    }
  } else {
    konamiPosition = 0;
  }
});

let discoStartTime = 0;

function toggleDiscoMode() {
  isDiscoMode = !isDiscoMode;

  if (isDiscoMode) {
    discoExitStart = null;
    discoExitFrom = null;
    discoExitBackground = null;
    discoExitMaterials = null;

    if (discoExitTexture) discoExitTexture.dispose();
    discoExitCanvas = null;
    discoExitContext = null;
    discoExitTexture = null;
    discoStartTime = performance.now();
    bgMusic.pause();
    discoMusic.currentTime = 0;
    discoMusic.play().catch(() => {});

    clearTimeout(discoTimeout);
    discoTimeout = setTimeout(() => {
      if (isDiscoMode) toggleDiscoMode();
    }, 96000);

    cameraShake = 0.4;
    showDiscoBanner("🎉 SHOW TIME : RONDE, TRIANGLE, CHENILLE & BATTLE ! 🎉");
  } else {
    clearTimeout(discoTimeout);
    discoMusic.pause();

    if (discoStartTime) {
      gameStartTime += performance.now() - discoStartTime;
      discoStartTime = 0;
    }

    updateMusicState();
    showDiscoBanner("💤 Retour au calme.");
    needsRender = 1;
  }
}

function showDiscoBanner(text) {
  const statusEl = qs("#statusText");
  const oldText = statusEl.textContent;
  statusEl.textContent = text;
  setTimeout(() => {
    if (!isGameOver) statusEl.textContent = oldText;
  }, 3500);
}

// Easter egg mobile : quick clics on the logo

let logoClickCount = 0;
let logoClickTimer = null;

const logoImg = qs("#logoImg");
if (logoImg) {
  logoImg.addEventListener("click", () => {
    logoClickCount++;
    clearTimeout(logoClickTimer);

    logoClickTimer = setTimeout(() => {
      logoClickCount = 0;
    }, 1500);

    if (logoClickCount >= 6) {
      toggleDiscoMode();
      logoClickCount = 0;
    }
  });
}

document.body.classList.add("title-active");
gameStartTime = performance.now();
applyFxSettings();
resetBoard3D();
updateGameStatus();
requestAnimationFrame(() => canvasEl.classList.add("ready"));
