import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js";

const canvas = document.getElementById("gameCanvas");
const speedValue = document.getElementById("speedValue");
const headingValue = document.getElementById("headingValue");
const timerValue = document.getElementById("timerValue");
const statusValue = document.getElementById("statusValue");
const menuScreen = document.getElementById("menuScreen");
const hudOverlay = document.getElementById("hudOverlay");
const homeView = document.getElementById("homeView");
const detailView = document.getElementById("detailView");
const trackCardButton = document.getElementById("trackCardButton");
const startRaceButton = document.getElementById("startRaceButton");
const backButton = document.getElementById("backButton");
const leaderboardList = document.getElementById("leaderboardList");
const saveModal = document.getElementById("saveModal");
const saveModalTitle = document.getElementById("saveModalTitle");
const saveModalBody = document.getElementById("saveModalBody");
const saveModalActions = document.getElementById("saveModalActions");
const saveForm = document.getElementById("saveForm");
const usernameInput = document.getElementById("usernameInput");
const saveYesButton = document.getElementById("saveYesButton");
const saveNoButton = document.getElementById("saveNoButton");
const saveCancelButton = document.getElementById("saveCancelButton");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3cf9b);
scene.fog = new THREE.Fog(0xf3cf9b, 160, 2100);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);

scene.add(new THREE.AmbientLight(0xffe1b5, 1.25));
scene.add(new THREE.HemisphereLight(0xfff2d6, 0xc68c44, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.05);
sun.position.set(-240, 360, 160);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshStandardMaterial({ color: 0xd8b16b, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function createPyramid(width, height, color) {
  const pyramid = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(width, width, height, 4, 1, false),
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  base.rotation.y = Math.PI / 4;
  pyramid.add(base);

  const shadowSide = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.99, width * 0.8, height * 0.98, 4, 1, false),
    new THREE.MeshStandardMaterial({ color: 0xc79b57, roughness: 1, flatShading: true }),
  );
  shadowSide.rotation.y = -Math.PI / 4;
  shadowSide.position.y = -0.02;
  pyramid.add(shadowSide);

  return pyramid;
}

const desertSet = new THREE.Group();
const pyramidPositions = [
  { x: 1680, z: -1080, scale: 1.7 },
  { x: 1920, z: -930, scale: 1.15 },
  { x: 2140, z: -720, scale: 2.1 },
  { x: -1860, z: -820, scale: 1.45 },
  { x: -2130, z: -1040, scale: 1.85 },
  { x: 1780, z: 1360, scale: 1.4 },
  { x: -1980, z: 1320, scale: 1.25 },
];

pyramidPositions.forEach((entry, index) => {
  const pyramid = createPyramid(70 * entry.scale, 110 * entry.scale, index % 2 === 0 ? 0xe0bf74 : 0xcfad63);
  pyramid.position.set(entry.x, 0, entry.z);
  pyramid.rotation.y = (index % 3) * 0.32;
  desertSet.add(pyramid);
});

scene.add(desertSet);

const TRACK_WIDTH = 74;
const WALL_HEIGHT = 17.25;
const WALL_THICKNESS = 6;
const CAR_HALF_WIDTH = 5.4;
const CAR_HALF_LENGTH = 12.4;
const CAR_BODY_HEIGHT = 4.8;
const TRACK_HALF_WIDTH = TRACK_WIDTH / 2;
const ROAD_SURFACE_MARGIN = 2;
const wallColliders = [];
const trackSections = [];
const trackSectionMeta = [];
const leftWallSections = [];
const rightWallSections = [];
const wallSectionInsets = [];
const trackDistances = [];
const SPAWN_SEGMENT_INDEX = 4;
const CAR_COLLISION_HALF_WIDTH = 4.7;
const CAR_COLLISION_HALF_LENGTH = 11.4;
const TRACK_DATA = {
  id: "desert-drifter",
  name: "Desert Drifter",
  difficulty: "1/10",
  description: "A clean desert loop with smooth turns and a simple start.",
};
const LEADERBOARD_STORAGE_KEY = "drift-racer-leaderboard";
const LAST_USERNAME_STORAGE_KEY = "drift-racer-last-username";
const DEFAULT_LEADERBOARD = [
  { username: "Ari", time: 84200 },
  { username: "Mina", time: 90320 },
  { username: "Rin", time: 95840 },
  { username: "Sage", time: 101230 },
];

function pushSectionPoint(section, point) {
  const previous = section[section.length - 1];
  if (!previous || previous.distanceTo(point) > 0.001) {
    section.push(point);
  }
}

function addStraight(section, start, end, steps) {
  for (let index = section.length === 0 ? 0 : 1; index <= steps; index += 1) {
    const t = index / steps;
    pushSectionPoint(section, start.clone().lerp(end, t));
  }
}

function addArc(section, center, radius, startAngle, endAngle, yStart, yEnd, steps) {
  for (let index = section.length === 0 ? 0 : 1; index <= steps; index += 1) {
    const t = index / steps;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    pushSectionPoint(
      section,
      new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        THREE.MathUtils.lerp(yStart, yEnd, t),
        center.z + Math.sin(angle) * radius,
      ),
    );
  }
}

function addSpiral(section, center, startRadius, endRadius, startAngle, endAngle, yStart, yEnd, steps) {
  for (let index = section.length === 0 ? 0 : 1; index <= steps; index += 1) {
    const t = index / steps;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    pushSectionPoint(
      section,
      new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        THREE.MathUtils.lerp(yStart, yEnd, t),
        center.z + Math.sin(angle) * radius,
      ),
    );
  }
}

function addTurn(section, radius, angleDelta, yStart, yEnd, steps) {
  const start = section[section.length - 1];
  const tangent = getTrackTangent(section, section.length - 1).setY(0).normalize();
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const turnSign = Math.sign(angleDelta) || 1;
  const center = start.clone().addScaledVector(right, radius * turnSign);
  const startAngle = Math.atan2(start.z - center.z, start.x - center.x);
  addArc(section, center, radius, startAngle, startAngle + angleDelta, yStart, yEnd, steps);
}

function addSmoothPath(section, controlPoints, steps) {
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal");

  for (let index = 0; index <= steps; index += 1) {
    pushSectionPoint(section, curve.getPoint(index / steps));
  }
}

function buildTrackSections() {
  const mainSection = [];
  const controlPoints = [
    new THREE.Vector3(-1760, 0.03, -240),
    new THREE.Vector3(-1560, 0.03, -240),
    new THREE.Vector3(-1360, 0.03, -240),
    new THREE.Vector3(-1140, 0.03, -280),
    new THREE.Vector3(-900, 0.03, -390),
    new THREE.Vector3(-500, 0.03, -180),
    new THREE.Vector3(-200, 0.03, -170),
    new THREE.Vector3(120, 0.03, -440),
    new THREE.Vector3(430, 0.03, -450),
    new THREE.Vector3(700, 0.03, -240),
    new THREE.Vector3(560, 0.03, -20),
    new THREE.Vector3(760, 0.03, 90),
    new THREE.Vector3(1140, 0.03, 100),
    new THREE.Vector3(1450, 0.03, -250),
    new THREE.Vector3(1710, 0.03, -230),
    new THREE.Vector3(1930, 0.03, 140),
    new THREE.Vector3(1970, 0.03, 560),
    new THREE.Vector3(1860, 0.03, 980),
    new THREE.Vector3(1500, 0.03, 1120),
    new THREE.Vector3(1020, 0.03, 1110),
    new THREE.Vector3(520, 0.03, 1070),
    new THREE.Vector3(20, 0.03, 1040),
    new THREE.Vector3(-520, 0.03, 1010),
    new THREE.Vector3(-980, 0.03, 1000),
    new THREE.Vector3(-1330, 0.03, 960),
    new THREE.Vector3(-1490, 0.03, 820),
    new THREE.Vector3(-1520, 0.03, 560),
    new THREE.Vector3(-1430, 0.03, 330),
    new THREE.Vector3(-1250, 0.03, 230),
    new THREE.Vector3(-1050, 0.03, 240),
  ];

  addSmoothPath(mainSection, controlPoints, 440);

  trackSectionMeta.push(
    {
      wallStartInset: 0,
      wallEndInset: 0,
    },
  );

  return [mainSection];
}

trackSections.push(...buildTrackSections());

function buildTrackDistances(section) {
  const distances = [0];
  for (let index = 1; index < section.length; index += 1) {
    distances.push(distances[index - 1] + section[index].distanceTo(section[index - 1]));
  }
  return distances;
}

trackDistances.push(...buildTrackDistances(trackSections[0]));

function getPlanarDirection(section, index, radius = 3) {
  const direction = new THREE.Vector2();

  for (let offset = -radius; offset <= radius; offset += 1) {
    const startIndex = THREE.MathUtils.clamp(index + offset, 0, section.length - 2);
    const endIndex = startIndex + 1;
    const start = section[startIndex];
    const end = section[endIndex];
    direction.x += end.x - start.x;
    direction.y += end.z - start.z;
  }

  if (direction.lengthSq() < 0.0001) {
    return new THREE.Vector2(1, 0);
  }

  return direction.normalize();
}

function getTrackTangent(section, index) {
  const planarDirection = getPlanarDirection(section, index, 3);
  const previous = section[Math.max(0, index - 2)];
  const next = section[Math.min(section.length - 1, index + 2)];
  const yDelta = next.y - previous.y;
  const horizontalLength = Math.max(0.001, Math.hypot(next.x - previous.x, next.z - previous.z));
  return new THREE.Vector3(planarDirection.x, yDelta / horizontalLength, planarDirection.y).normalize();
}

function getTrackOffsetRight(section, index) {
  const forward = getPlanarDirection(section, index, 4);
  return new THREE.Vector3(-forward.y, 0, forward.x).normalize();
}

function intersectOffsetLines(startA, endA, startB, endB) {
  const directionA = endA.clone().sub(startA);
  const directionB = endB.clone().sub(startB);
  const denominator = directionA.x * directionB.y - directionA.y * directionB.x;

  if (Math.abs(denominator) < 0.0001) {
    return null;
  }

  const delta = startB.clone().sub(startA);
  const t = (delta.x * directionB.y - delta.y * directionB.x) / denominator;
  return startA.clone().add(directionA.multiplyScalar(t));
}

function buildOffsetSamples(section, offsetDistance) {
  if (section.length < 2) {
    return section.map((point) => point.clone());
  }

  const segmentData = [];
  for (let index = 0; index < section.length - 1; index += 1) {
    const start = section[index];
    const end = section[index + 1];
    const planar = new THREE.Vector2(end.x - start.x, end.z - start.z);
    if (planar.lengthSq() < 0.0001) {
      continue;
    }

    planar.normalize();
    const right = new THREE.Vector2(-planar.y, planar.x);
    segmentData.push({
      start,
      end,
      right,
      offsetStart: new THREE.Vector2(start.x, start.z).addScaledVector(right, offsetDistance),
      offsetEnd: new THREE.Vector2(end.x, end.z).addScaledVector(right, offsetDistance),
    });
  }

  if (segmentData.length === 0) {
    return section.map((point) => point.clone());
  }

  const offsetSamples = [];
  for (let index = 0; index < section.length; index += 1) {
    let xz;

    if (index === 0) {
      xz = segmentData[0].offsetStart.clone();
    } else if (index === section.length - 1) {
      xz = segmentData[segmentData.length - 1].offsetEnd.clone();
    } else {
      const previousSegment = segmentData[Math.max(0, index - 1)];
      const nextSegment = segmentData[Math.min(segmentData.length - 1, index)];
      const intersection = intersectOffsetLines(
        previousSegment.offsetStart,
        previousSegment.offsetEnd,
        nextSegment.offsetStart,
        nextSegment.offsetEnd,
      );

      if (intersection) {
        const center = new THREE.Vector2(section[index].x, section[index].z);
        const maxOffset = Math.abs(offsetDistance) + TRACK_HALF_WIDTH * 0.35;
        if (intersection.distanceTo(center) <= maxOffset) {
          xz = intersection;
        }
      }

      if (!xz) {
        xz = previousSegment.offsetEnd.clone().lerp(nextSegment.offsetStart, 0.5);
      }
    }

    offsetSamples.push(new THREE.Vector3(xz.x, section[index].y, xz.y));
  }

  return offsetSamples;
}

function addOrientedSegment3D({
  start,
  end,
  thickness,
  height,
  material,
  yOffset = 0,
  target = scene,
}) {
  const flatDirection = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
  const length = flatDirection.length();
  if (length < 0.001) {
    return;
  }

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material);
  mesh.position.set(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5 + height * 0.5 + yOffset,
    (start.z + end.z) * 0.5,
  );
  mesh.rotation.y = Math.atan2(flatDirection.z, flatDirection.x);
  target.add(mesh);
}

function isOnRoad(x, z) {
  return getTrackSurfaceInfo(x, z).onTrack;
}

const roadGroup = new THREE.Group();
for (const section of trackSections) {
  const sectionMeta = trackSectionMeta[leftWallSections.length] || { wallStartInset: 0, wallEndInset: 0 };
  const roadVertices = [];
  const roadIndices = [];
  const leftEdgeSamples = buildOffsetSamples(section, -TRACK_HALF_WIDTH);
  const rightEdgeSamples = buildOffsetSamples(section, TRACK_HALF_WIDTH);
  const leftWallSamples = buildOffsetSamples(section, -(TRACK_HALF_WIDTH + WALL_THICKNESS * 0.5));
  const rightWallSamples = buildOffsetSamples(section, TRACK_HALF_WIDTH + WALL_THICKNESS * 0.5);

  for (let index = 0; index < section.length; index += 1) {
    const leftEdge = leftEdgeSamples[index];
    const rightEdge = rightEdgeSamples[index];
    roadVertices.push(leftEdge.x, leftEdge.y, leftEdge.z, rightEdge.x, rightEdge.y, rightEdge.z);

    if (index < section.length - 1) {
      const base = index * 2;
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  leftWallSections.push(leftWallSamples);
  rightWallSections.push(rightWallSamples);
  wallSectionInsets.push({ start: sectionMeta.wallStartInset || 0, end: sectionMeta.wallEndInset || 0 });

  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(roadVertices, 3));
  roadGeometry.setIndex(roadIndices);
  roadGeometry.computeVertexNormals();
  roadGroup.add(
    new THREE.Mesh(
      roadGeometry,
      new THREE.MeshStandardMaterial({ color: 0x7f909f, roughness: 0.96, metalness: 0.02 }),
    ),
  );
}
scene.add(roadGroup);

const wallGroup = new THREE.Group();
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.92, flatShading: true, side: THREE.DoubleSide });

function splitWallPieces(samples) {
  if (samples.length < 3) {
    return [samples];
  }

  const pieces = [];
  let pieceStart = 0;
  let previousMode = null;
  const turnThreshold = 0.02;

  function getMode(index) {
    const previous = samples[index - 1];
    const current = samples[index];
    const next = samples[index + 1];
    const incoming = new THREE.Vector2(current.x - previous.x, current.z - previous.z);
    const outgoing = new THREE.Vector2(next.x - current.x, next.z - current.z);

    if (incoming.lengthSq() < 0.0001 || outgoing.lengthSq() < 0.0001) {
      return previousMode || "straight";
    }

    incoming.normalize();
    outgoing.normalize();
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const dot = THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1);
    const turnAmount = Math.atan2(cross, dot);

    if (Math.abs(turnAmount) < turnThreshold) {
      return "straight";
    }

    return turnAmount > 0 ? "leftCurve" : "rightCurve";
  }

  for (let index = 1; index < samples.length - 1; index += 1) {
    const mode = getMode(index);
    if (previousMode == null) {
      previousMode = mode;
      continue;
    }

    if (mode !== previousMode) {
      pieces.push(samples.slice(pieceStart, index + 1));
      pieceStart = index;
    }

    previousMode = mode;
  }

  pieces.push(samples.slice(pieceStart));

  const mergedPieces = [];
  for (const piece of pieces) {
    if (piece.length >= 4 || mergedPieces.length === 0) {
      mergedPieces.push(piece.slice());
      continue;
    }

    const previousPiece = mergedPieces[mergedPieces.length - 1];
    previousPiece.push(...piece.slice(1));
  }

  return mergedPieces;
}

function addWallVisualRun(samples, capStart = true, capEnd = true) {
  if (samples.length < 2) {
    return;
  }

  const positions = [];
  const indices = [];

  function getWallRight(index) {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const forward = new THREE.Vector2(next.x - previous.x, next.z - previous.z);
    if (forward.lengthSq() < 0.0001) {
      return new THREE.Vector2(0, 1);
    }

    forward.normalize();
    return new THREE.Vector2(-forward.y, forward.x);
  }

  const profiles = samples.map((sample, index) => {
    const right = getWallRight(index);
    const halfThickness = WALL_THICKNESS * 0.5;
    return {
      innerBase: new THREE.Vector3(sample.x - right.x * halfThickness, sample.y, sample.z - right.y * halfThickness),
      outerBase: new THREE.Vector3(sample.x + right.x * halfThickness, sample.y, sample.z + right.y * halfThickness),
      innerTop: new THREE.Vector3(sample.x - right.x * halfThickness, sample.y + WALL_HEIGHT, sample.z - right.y * halfThickness),
      outerTop: new THREE.Vector3(sample.x + right.x * halfThickness, sample.y + WALL_HEIGHT, sample.z + right.y * halfThickness),
    };
  });

  for (const profile of profiles) {
    [profile.innerBase, profile.outerBase, profile.innerTop, profile.outerTop].forEach((vertex) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });
  }

  function addQuad(a, b, c, d) {
    indices.push(a, b, c, a, c, d);
  }

  for (let index = 0; index < profiles.length - 1; index += 1) {
    const base = index * 4;
    const nextBase = (index + 1) * 4;

    addQuad(base + 2, nextBase + 2, nextBase + 3, base + 3);
    addQuad(base + 1, nextBase + 1, nextBase + 3, base + 3);
    addQuad(base, nextBase, nextBase + 2, base + 2);
  }

  if (capStart) {
    addQuad(0, 1, 3, 2);
  }

  const endBase = (profiles.length - 1) * 4;
  if (capEnd) {
    addQuad(endBase + 2, endBase + 3, endBase + 1, endBase);
  }

  const wallGeometry = new THREE.BufferGeometry();
  wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  wallGeometry.setIndex(indices);
  wallGeometry.computeVertexNormals();
  wallGroup.add(new THREE.Mesh(wallGeometry, wallMaterial));
}

function addWallRun(samples, startInset = 0, endInset = 0) {
  const startIndex = Math.max(0, startInset);
  const endIndex = Math.max(startIndex, samples.length - 1 - Math.max(0, endInset));
  const trimmedSamples = samples.slice(startIndex, endIndex + 1);
  const pieces = splitWallPieces(trimmedSamples);

  for (let index = 0; index < pieces.length; index += 1) {
    addWallVisualRun(pieces[index], index === 0, index === pieces.length - 1);
  }

  for (let index = startIndex; index < endIndex; index += 1) {
    addWallCollider(samples[index], samples[index + 1]);
  }
}

function addWallCollider(start, end) {
  wallColliders.push({
    start: new THREE.Vector2(start.x, start.z),
    end: new THREE.Vector2(end.x, end.z),
    startHeight: start.y,
    endHeight: end.y,
  });
}

for (let index = 0; index < leftWallSections.length; index += 1) {
  const inset = wallSectionInsets[index] || { start: 0, end: 0 };
  addWallRun(leftWallSections[index], inset.start, inset.end);
}
for (let index = 0; index < rightWallSections.length; index += 1) {
  const inset = wallSectionInsets[index] || { start: 0, end: 0 };
  addWallRun(rightWallSections[index], inset.start, inset.end);
}

scene.add(wallGroup);

const car = new THREE.Group();
car.position.y = 0.18;
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xc43a3a, roughness: 0.35, flatShading: true });
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.28, flatShading: true });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2731, roughness: 0.9, flatShading: true });

const floor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 18), bodyMaterial);
floor.position.set(0, 1.28, -1.2);
floor.rotation.x = -0.035;
car.add(floor);

const sidepodLeft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 8.5), bodyMaterial);
sidepodLeft.position.set(-2.4, 1.95, -1.2);
sidepodLeft.rotation.x = -0.035;
car.add(sidepodLeft);

const sidepodRight = sidepodLeft.clone();
sidepodRight.position.x = 2.4;
car.add(sidepodRight);

const cockpit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 6), bodyMaterial);
cockpit.position.set(0, 2.6, -2.1);
cockpit.rotation.x = -0.04;
car.add(cockpit);

const airbox = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 2.1), accentMaterial);
airbox.position.set(0, 4.15, -3.25);
car.add(airbox);

const halo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.8), darkMaterial);
halo.position.set(0, 3.45, 0.2);
car.add(halo);

const nose = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.25, 8.8), bodyMaterial);
nose.position.set(0, 1.72, 7.45);
car.add(nose);

const noseShoulder = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.8), bodyMaterial);
noseShoulder.position.set(0, 1.9, 4.9);
car.add(noseShoulder);

const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 3.4), accentMaterial);
noseTip.position.set(0, 1.28, 12.2);
car.add(noseTip);

const frontBridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.48, 2.3), darkMaterial);
frontBridge.position.set(0, 1.18, 10.7);
car.add(frontBridge);

const frontWing = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 1.1), darkMaterial);
frontWing.position.set(0, 1.05, 14.2);
car.add(frontWing);

const frontWingFlap = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.32, 0.9), accentMaterial);
frontWingFlap.position.set(0, 1.32, 13.1);
car.add(frontWingFlap);

const rearWingMain = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.55, 1.2), darkMaterial);
rearWingMain.position.set(0, 5.15, -9.5);
car.add(rearWingMain);

const rearWingFlap = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.38, 0.95), accentMaterial);
rearWingFlap.position.set(0, 5.75, -8.85);
car.add(rearWingFlap);

const rearPylon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.3, 0.65), darkMaterial);
rearPylon.position.set(0, 3.8, -8.9);
car.add(rearPylon);

const frontWheelGeometry = new THREE.CylinderGeometry(1.45, 1.45, 1.35, 10);
const rearWheelGeometry = new THREE.CylinderGeometry(1.78, 1.78, 1.5, 10);
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 1, flatShading: true });
const frontWheelPivots = [];
const wheelMeshes = [];

[
  { x: -4.5, y: 1.45, z: 8.4, steer: true, rear: false },
  { x: 4.5, y: 1.45, z: 8.4, steer: true, rear: false },
  { x: -4.25, y: 1.8, z: -6.9, steer: false, rear: true },
  { x: 4.25, y: 1.8, z: -6.9, steer: false, rear: true },
].forEach(({ x, y, z, steer, rear }) => {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);

  const wheel = new THREE.Mesh(rear ? rearWheelGeometry : frontWheelGeometry, wheelMaterial);
  wheel.rotation.z = Math.PI / 2;
  pivot.add(wheel);
  car.add(pivot);

  wheelMeshes.push(wheel);
  if (steer) {
    frontWheelPivots.push(pivot);
  }
});

scene.add(car);

function createCheckeredMaterial() {
  const canvasTextureSize = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvasTextureSize;
  canvas.height = canvasTextureSize;
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasTextureSize, canvasTextureSize);

  const squareSize = canvasTextureSize / 8;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if ((row + column) % 2 === 0) {
        context.fillStyle = "#11161d";
        context.fillRect(column * squareSize, row * squareSize, squareSize, squareSize);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.repeat.set(4, 1);

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.02,
    flatShading: true,
  });
}

function createGate(color, withStartLights = false) {
  const gate = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f7fb, roughness: 0.8, flatShading: true });
  const beamMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true });
  const postGeometry = new THREE.BoxGeometry(3.4, 18, 3.4);
  const beamGeometry = new THREE.BoxGeometry(TRACK_WIDTH - 10, 2.8, 2.2);
  const leftPost = new THREE.Mesh(postGeometry, postMaterial);
  const rightPost = new THREE.Mesh(postGeometry, postMaterial);
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);

  leftPost.position.set(-TRACK_HALF_WIDTH + 5, 9, 0);
  rightPost.position.set(TRACK_HALF_WIDTH - 5, 9, 0);
  beam.position.set(0, 16, 0);

  gate.add(leftPost, rightPost, beam);

  if (withStartLights) {
    const lightGroup = new THREE.Group();
    const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x17202a, roughness: 0.85, flatShading: true });
    const lightHousing = new THREE.Mesh(new THREE.BoxGeometry(11.6, 4.8, 1.35), housingMaterial);
    const lightPlate = new THREE.Mesh(new THREE.BoxGeometry(10.2, 3.1, 0.55), housingMaterial);

    lightGroup.position.set(0, 13.7, 2.4);
    lightGroup.rotation.y = Math.PI;
    lightGroup.add(lightHousing, lightPlate);

    const bulbHousingGeometry = new THREE.CylinderGeometry(1.08, 1.08, 0.34, 20);
    const bulbOffsets = [-2.8, -1.4, 0, 1.4, 2.8];
    const bulbs = [];
    const bulbLights = [];
    bulbOffsets.forEach((offsetX) => {
      const bulbHousing = new THREE.Mesh(
        bulbHousingGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x250b0d,
          emissive: 0x3d1114,
          emissiveIntensity: 0.05,
          roughness: 0.4,
          flatShading: true,
          side: THREE.DoubleSide,
        }),
      );
      bulbHousing.rotation.x = Math.PI / 2;
      bulbHousing.position.set(offsetX, 0, 0.52);

      const bulb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.22, 16),
        new THREE.MeshStandardMaterial({
          color: 0x3c1214,
          emissive: 0x4a1216,
          emissiveIntensity: 0.08,
          roughness: 0.28,
          flatShading: true,
          side: THREE.DoubleSide,
        }),
      );
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(offsetX, 0, 0.74);
      const bulbLight = new THREE.PointLight(0xff5b3f, 0, 7, 2.2);
      bulbLight.position.set(offsetX, 0, 1.0);

      lightGroup.add(bulbHousing);
      bulbs.push(bulb);
      bulbLights.push(bulbLight);
      lightGroup.add(bulbLight);
      lightGroup.add(bulb);
    });

    gate.add(lightGroup);
    gate.userData.startLights = lightGroup;
    gate.userData.startBulbs = bulbs;
    gate.userData.startBulbLights = bulbLights;
  }

  gate.userData.beam = beam;
  scene.add(gate);
  return gate;
}

const startGate = createGate(0x3a3f49, true);
const finishGate = createGate(0x3dd78d);
finishGate.userData.beam.material = createCheckeredMaterial();

const skidMarkGroup = new THREE.Group();
scene.add(skidMarkGroup);

const keys = new Set();
const state = {
  x: 0,
  z: 0,
  angle: 0,
  speed: 0,
  height: 0.03,
  verticalSpeed: 0,
  airborne: false,
  jumpCooldown: 0,
  pitch: 0,
  groundPitch: 0,
  surfaceSectionIndex: 0,
  surfaceSegmentIndex: 0,
  rearSlip: 0,
  drifting: false,
};

const raceState = {
  phase: "staged",
  raceStart: 0,
  countdownStart: 0,
  elapsedMs: 0,
  startSegmentIndex: 10,
  finishSegmentIndex: 0,
  lastProgressDistance: 0,
  startedPastLine: false,
};

const MAX_SPEED_MPH = 180;
const MAX_FORWARD_SPEED = 360;
const MAX_REVERSE_SPEED = -90;
const SPEED_TO_MPH = MAX_SPEED_MPH / MAX_FORWARD_SPEED;
const START_LIGHT_COUNT = 5;
const START_LIGHT_INTERVAL_MS = 420;
const START_LIGHT_HOLD_MS = 540;
const SKID_MARK_LIFETIME = 4.5;
const FRONT_AXLE_POINT = new THREE.Vector3(0, 0, 8.4);
const REAR_AXLE_POINT = new THREE.Vector3(0, 0, -6.5);
const REAR_WHEEL_POINTS = [
  new THREE.Vector3(-4.2, 0.08, -6.5),
  new THREE.Vector3(4.2, 0.08, -6.5),
];

const skidState = {
  active: false,
  previousLeft: null,
  previousRight: null,
  marks: [],
};

function blendAngle(current, target, amount) {
  const delta = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + delta * amount;
}

function getVelocityVector() {
  return new THREE.Vector2(Math.cos(state.angle), Math.sin(state.angle)).multiplyScalar(state.speed);
}

function getTrackSurfaceInfo(x, z, currentHeight = null, previousSectionIndex = null, previousSegmentIndex = null) {
  const point = new THREE.Vector2(x, z);
  let bestMatch = null;

  for (let sectionIndex = 0; sectionIndex < trackSections.length; sectionIndex += 1) {
    const section = trackSections[sectionIndex];
    for (let index = 0; index < section.length - 1; index += 1) {
      const start = section[index];
      const end = section[index + 1];
      const segment = new THREE.Vector2(end.x - start.x, end.z - start.z);
      const lengthSquared = segment.lengthSq();
      if (lengthSquared === 0) {
        continue;
      }

      const t = THREE.MathUtils.clamp(
        new THREE.Vector2(point.x - start.x, point.y - start.z).dot(segment) / lengthSquared,
        0,
        1,
      );
      const closestXZ = new THREE.Vector2(
        THREE.MathUtils.lerp(start.x, end.x, t),
        THREE.MathUtils.lerp(start.z, end.z, t),
      );
      const distance = closestXZ.distanceTo(point);
      if (distance > TRACK_HALF_WIDTH + ROAD_SURFACE_MARGIN) {
        continue;
      }

      const candidateHeight = THREE.MathUtils.lerp(start.y, end.y, t);
      const heightDelta = currentHeight == null ? Math.abs(candidateHeight - 0.03) : Math.abs(candidateHeight - currentHeight);
      const continuityPenalty = previousSectionIndex == null
        ? 0
        : (sectionIndex === previousSectionIndex ? Math.min(Math.abs(index - previousSegmentIndex), 80) * 0.12 : 14);
      const score = distance + heightDelta * 3.4 + continuityPenalty;

      if (!bestMatch || score < bestMatch.score) {
        const tangent3D = end.clone().sub(start).normalize();
        const direction2D = new THREE.Vector2(tangent3D.x, tangent3D.z).normalize();
        const horizontalLength = Math.hypot(end.x - start.x, end.z - start.z) || 1;
        bestMatch = {
          score,
          sectionIndex,
          index,
          distance,
          height: candidateHeight,
          grade: (end.y - start.y) / horizontalLength,
          direction: direction2D,
        };
      }
    }
  }

  if (!bestMatch) {
    return {
      onTrack: false,
      height: 0.03,
      grade: 0,
      direction: new THREE.Vector2(1, 0),
      sectionIndex: previousSectionIndex,
      segmentIndex: previousSegmentIndex,
    };
  }

  const canAttachToTrack = currentHeight == null
    || bestMatch.height < 3
    || Math.abs(bestMatch.height - currentHeight) <= 8
    || (bestMatch.distance < TRACK_HALF_WIDTH * 0.35 && Math.abs(bestMatch.height - currentHeight) <= 14);
  if (!canAttachToTrack) {
    return {
      onTrack: false,
      height: 0.03,
      grade: 0,
      direction: new THREE.Vector2(1, 0),
      sectionIndex: previousSectionIndex,
      segmentIndex: previousSegmentIndex,
    };
  }

  return {
    onTrack: true,
    height: bestMatch.height,
    grade: bestMatch.grade,
    direction: bestMatch.direction,
    sectionIndex: bestMatch.sectionIndex,
    segmentIndex: bestMatch.index,
  };
}

function getSurfaceHeightAt(x, z, currentHeight = null, previousSectionIndex = null, previousSegmentIndex = null) {
  return getTrackSurfaceInfo(x, z, currentHeight, previousSectionIndex, previousSegmentIndex).height;
}

function getCarCollisionExtent(normal) {
  const forward = new THREE.Vector2(Math.cos(state.angle), Math.sin(state.angle));
  const right = new THREE.Vector2(-forward.y, forward.x);
  return Math.abs(normal.dot(right)) * CAR_COLLISION_HALF_WIDTH + Math.abs(normal.dot(forward)) * CAR_COLLISION_HALF_LENGTH;
}

function getJumpMeta(surfaceInfo) {
  if (!surfaceInfo || surfaceInfo.sectionIndex == null || surfaceInfo.segmentIndex == null) {
    return null;
  }

  const meta = trackSectionMeta[surfaceInfo.sectionIndex];
  if (!meta || !meta.jump) {
    return null;
  }

  if (surfaceInfo.segmentIndex < meta.jump.rampStartIndex) {
    return null;
  }

  return meta.jump;
}

function getWorldAxlePoint(localPoint) {
  const cosAngle = Math.cos(state.angle);
  const sinAngle = Math.sin(state.angle);
  return {
    x: state.x + localPoint.x * cosAngle - localPoint.z * sinAngle,
    z: state.z + localPoint.x * sinAngle + localPoint.z * cosAngle,
  };
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function formatTime(milliseconds) {
  const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const millis = totalMilliseconds % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function loadLeaderboardEntries() {
  try {
    const storedValue = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!storedValue) {
      return DEFAULT_LEADERBOARD.slice();
    }

    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) {
      return DEFAULT_LEADERBOARD.slice();
    }

    return parsed
      .filter((entry) => entry && typeof entry.username === "string" && Number.isFinite(entry.time))
      .sort((left, right) => left.time - right.time)
      .slice(0, 8);
  } catch {
    return DEFAULT_LEADERBOARD.slice();
  }
}

function saveLeaderboardEntries(entries) {
  localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
}

let leaderboardEntries = loadLeaderboardEntries();
let pendingSaveTime = null;

function renderLeaderboard() {
  leaderboardList.innerHTML = "";

  if (leaderboardEntries.length === 0) {
    const emptyRow = document.createElement("li");
    emptyRow.className = "leaderboard-empty";
    emptyRow.textContent = "No times yet. Be the first one down the desert track.";
    leaderboardList.appendChild(emptyRow);
    return;
  }

  leaderboardEntries.forEach((entry, index) => {
    const row = document.createElement("li");
    row.className = "leaderboard-entry";
    row.innerHTML = `
      <span class="leaderboard-entry__rank">${index + 1}</span>
      <span class="leaderboard-entry__name">${entry.username}</span>
      <span class="leaderboard-entry__time">${formatTime(entry.time)}</span>
    `;
    leaderboardList.appendChild(row);
  });
}

function addLeaderboardEntry(username, time) {
  leaderboardEntries = [...leaderboardEntries, { username, time }]
    .sort((left, right) => left.time - right.time)
    .slice(0, 8);
  saveLeaderboardEntries(leaderboardEntries);
  renderLeaderboard();
}

function showHomeView() {
  menuScreen.classList.remove("is-hidden");
  homeView.classList.remove("is-hidden");
  detailView.classList.add("is-hidden");
  hudOverlay.classList.remove("is-visible");
}

function showDetailView() {
  menuScreen.classList.remove("is-hidden");
  homeView.classList.add("is-hidden");
  detailView.classList.remove("is-hidden");
  renderLeaderboard();
  hudOverlay.classList.remove("is-visible");
}

function hideSaveModal() {
  saveModal.classList.add("is-hidden");
  saveModal.setAttribute("aria-hidden", "true");
  saveModalActions.classList.remove("is-hidden");
  saveForm.classList.add("is-hidden");
  saveForm.reset();
  pendingSaveTime = null;
}

function openSaveModal(time) {
  pendingSaveTime = time;
  saveModalTitle.textContent = `Add ${formatTime(time)}?`;
  saveModalBody.textContent = "Do you want to add your time to the leaderboard?";
  saveModal.classList.remove("is-hidden");
  saveModal.setAttribute("aria-hidden", "false");
  saveModalActions.classList.remove("is-hidden");
  saveForm.classList.add("is-hidden");
  usernameInput.value = localStorage.getItem(LAST_USERNAME_STORAGE_KEY) || "";
}

function showUsernameForm() {
  saveModalBody.textContent = "Enter a username to add your time.";
  saveModalActions.classList.add("is-hidden");
  saveForm.classList.remove("is-hidden");
  usernameInput.focus();
  usernameInput.select();
}

function closeRaceAndReturnToMenu() {
  resetCar();
  resetRaceState();
  hideSaveModal();
  showDetailView();
}

function getSectionForward(section, segmentIndex, windowSize = 8) {
  const previous = section[Math.max(0, segmentIndex - windowSize)];
  const next = section[Math.min(section.length - 1, segmentIndex + windowSize)];
  const forward = new THREE.Vector2(next.x - previous.x, next.z - previous.z);
  if (forward.lengthSq() < 0.0001) {
    forward.set(1, 0);
  } else {
    forward.normalize();
  }

  return forward;
}

function getCrossTrackAngle(forward) {
  const right = new THREE.Vector2(-forward.y, forward.x);
  return Math.atan2(right.y, right.x);
}

function placeGate(gate, segmentIndex, rotationOverride = null) {
  const section = trackSections[0];
  const point = section[segmentIndex];
  gate.position.copy(point);
  gate.rotation.y = rotationOverride ?? getCrossTrackAngle(getSectionForward(section, segmentIndex, 10));
}

function getSpawnForward() {
  const section = trackSections[0];
  const spawnPoint = section[SPAWN_SEGMENT_INDEX];
  const spawnNext = section[Math.min(section.length - 1, SPAWN_SEGMENT_INDEX + 2)];
  const forward = new THREE.Vector2(spawnNext.x - spawnPoint.x, spawnNext.z - spawnPoint.z);

  if (forward.lengthSq() < 0.0001) {
    forward.set(1, 0);
  } else {
    forward.normalize();
  }

  return forward;
}

function getStartSegmentIndex() {
  const spawnDistance = trackDistances[SPAWN_SEGMENT_INDEX];
  const searchStartIndex = findSegmentIndexByDistance(spawnDistance + CAR_HALF_LENGTH * 3.2);
  const searchEndIndex = findSegmentIndexByDistance(spawnDistance + CAR_HALF_LENGTH * 10);
  return findStraightSegment(searchStartIndex, searchEndIndex);
}

function getStartGateRotation() {
  return getCrossTrackAngle(getSpawnForward());
}

function getFinishGateRotation() {
  const section = trackSections[0];
  return getCrossTrackAngle(getSectionForward(section, raceState.finishSegmentIndex, 12));
}

function getTurnAmount(section, index) {
  const previous = section[Math.max(0, index - 3)];
  const current = section[index];
  const next = section[Math.min(section.length - 1, index + 3)];
  const incoming = new THREE.Vector2(current.x - previous.x, current.z - previous.z);
  const outgoing = new THREE.Vector2(next.x - current.x, next.z - current.z);

  if (incoming.lengthSq() < 0.0001 || outgoing.lengthSq() < 0.0001) {
    return Infinity;
  }

  incoming.normalize();
  outgoing.normalize();
  return Math.abs(Math.atan2(incoming.x * outgoing.y - incoming.y * outgoing.x, incoming.dot(outgoing)));
}

function findStraightSegment(startIndex, endIndex) {
  const section = trackSections[0];
  let bestIndex = THREE.MathUtils.clamp(startIndex, 0, section.length - 1);
  let bestTurnAmount = Infinity;

  for (let index = Math.max(3, startIndex); index <= Math.min(section.length - 4, endIndex); index += 1) {
    const turnAmount = getTurnAmount(section, index);
    if (turnAmount < bestTurnAmount) {
      bestTurnAmount = turnAmount;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function findStraightSegmentNearRatio(targetRatio, searchRadiusRatio) {
  const section = trackSections[0];
  const maxIndex = section.length - 1;
  const centerIndex = Math.round(maxIndex * targetRatio);
  const searchRadius = Math.max(8, Math.round(maxIndex * searchRadiusRatio));
  return findStraightSegment(centerIndex - searchRadius, centerIndex + searchRadius);
}

function findSegmentIndexByDistance(targetDistance) {
  const clampedDistance = THREE.MathUtils.clamp(targetDistance, 0, trackDistances[trackDistances.length - 1]);
  let bestIndex = 0;
  let bestDelta = Infinity;

  for (let index = 0; index < trackDistances.length; index += 1) {
    const delta = Math.abs(trackDistances[index] - clampedDistance);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function resetRaceState() {
  raceState.phase = "staged";
  raceState.raceStart = 0;
  raceState.countdownStart = 0;
  raceState.elapsedMs = 0;
  raceState.lastProgressDistance = 0;
  raceState.startedPastLine = false;
  timerValue.textContent = formatTime(0);
  statusValue.textContent = `Press Start to begin ${TRACK_DATA.name}.`;
  setStartLightStage(0);
}

function setStartLightStage(stage) {
  const bulbs = startGate.userData.startBulbs || [];
  const bulbLights = startGate.userData.startBulbLights || [];
  const isGreenFlash = stage === "green";
  const activeCount = isGreenFlash ? bulbs.length : THREE.MathUtils.clamp(stage, 0, bulbs.length);
  bulbs.forEach((bulb, index) => {
    const lit = index < activeCount;
    const color = isGreenFlash && lit ? 0x43ff78 : 0xff4d2e;
    const emissive = isGreenFlash && lit ? 0x62ff95 : 0xff6b3d;
    bulb.material.color.set(lit ? color : 0x3c1214);
    bulb.material.emissive.set(lit ? emissive : 0x4a1216);
    bulb.material.emissiveIntensity = lit ? (isGreenFlash ? 1.7 : 1.45) : 0.08;
    bulbLights[index].color.set(lit ? color : 0xff5b3f);
    bulbLights[index].intensity = lit ? (isGreenFlash ? 2.4 : 1.9) : 0;
  });
}

function beginCountdown(now) {
  raceState.phase = "countdown";
  raceState.countdownStart = now;
  raceState.elapsedMs = 0;
  raceState.lastProgressDistance = 0;
  statusValue.textContent = "Get ready.";
  setStartLightStage(0);
  menuScreen.classList.add("is-hidden");
  hudOverlay.classList.add("is-visible");
  hideSaveModal();
}

function beginRace(now) {
  raceState.phase = "racing";
  raceState.raceStart = now;
  raceState.elapsedMs = 0;
  raceState.lastProgressDistance = 0;
  statusValue.textContent = "Go.";
  setStartLightStage(0);
  menuScreen.classList.add("is-hidden");
  hudOverlay.classList.add("is-visible");
  hideSaveModal();
}

function finishRace() {
  raceState.phase = "finished";
  statusValue.textContent = `Finished in ${formatTime(raceState.elapsedMs)}. Press R to reset.`;
  openSaveModal(raceState.elapsedMs);
}

function getTrackProgressDistance(x, z) {
  const point = new THREE.Vector2(x, z);
  const section = trackSections[0];
  let bestDistance = Infinity;
  let bestProgressDistance = 0;

  for (let index = 0; index < section.length - 1; index += 1) {
    const start = section[index];
    const end = section[index + 1];
    const segment = new THREE.Vector2(end.x - start.x, end.z - start.z);
    const lengthSquared = segment.lengthSq();
    if (lengthSquared === 0) {
      continue;
    }

    const t = THREE.MathUtils.clamp(
      new THREE.Vector2(point.x - start.x, point.y - start.z).dot(segment) / lengthSquared,
      0,
      1,
    );
    const closest = new THREE.Vector2(
      THREE.MathUtils.lerp(start.x, end.x, t),
      THREE.MathUtils.lerp(start.z, end.z, t),
    );
    const distance = closest.distanceTo(point);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgressDistance = THREE.MathUtils.lerp(trackDistances[index], trackDistances[index + 1], t);
    }
  }

  return bestProgressDistance;
}

function resetCar() {
  const spawnSection = trackSections[0];
  const spawnIndex = SPAWN_SEGMENT_INDEX;
  const spawnPoint = spawnSection[spawnIndex];
  const spawnForward = getSpawnForward();
  state.x = spawnPoint.x;
  state.z = spawnPoint.z;
  state.angle = Math.atan2(spawnForward.y, spawnForward.x);
  state.speed = 0;
  state.height = spawnPoint.y;
  state.verticalSpeed = 0;
  state.airborne = false;
  state.jumpCooldown = 0;
  state.pitch = 0;
  state.groundPitch = 0;
  state.surfaceSectionIndex = 0;
  state.surfaceSegmentIndex = spawnIndex;
  state.rearSlip = 0;
  state.drifting = false;

  skidState.active = false;
  skidState.previousLeft = null;
  skidState.previousRight = null;
  skidState.marks.forEach((mark) => {
    skidMarkGroup.remove(mark.mesh);
    mark.mesh.geometry.dispose();
    mark.mesh.material.dispose();
  });
  skidState.marks = [];
}

function makeSkidMark(start, end) {
  const delta = end.clone().sub(start);
  delta.y = 0;

  const length = delta.length();
  if (length < 0.35) {
    return;
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, 0.7),
    new THREE.MeshBasicMaterial({
      color: 0x21303f,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );

  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.atan2(delta.z, delta.x);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.position.y = (start.y + end.y) * 0.5 + 0.06;

  skidMarkGroup.add(mesh);
  skidState.marks.push({ mesh, age: 0 });
}

function updateSkidMarks(deltaTime) {
  for (let index = skidState.marks.length - 1; index >= 0; index -= 1) {
    const mark = skidState.marks[index];
    mark.age += deltaTime;
    mark.mesh.material.opacity = 0.34 * Math.max(0, 1 - mark.age / SKID_MARK_LIFETIME);

    if (mark.age >= SKID_MARK_LIFETIME) {
      skidMarkGroup.remove(mark.mesh);
      mark.mesh.geometry.dispose();
      mark.mesh.material.dispose();
      skidState.marks.splice(index, 1);
    }
  }
}

function updateDriftTrail() {
  const shouldSkid = state.drifting && state.rearSlip > 0.22 && Math.abs(state.speed) > 70;
  if (!shouldSkid) {
    skidState.active = false;
    skidState.previousLeft = null;
    skidState.previousRight = null;
    return;
  }

  const leftNow = car.localToWorld(REAR_WHEEL_POINTS[0].clone());
  const rightNow = car.localToWorld(REAR_WHEEL_POINTS[1].clone());

  if (skidState.active && skidState.previousLeft && skidState.previousRight) {
    makeSkidMark(skidState.previousLeft, leftNow);
    makeSkidMark(skidState.previousRight, rightNow);
  }

  skidState.active = true;
  skidState.previousLeft = leftNow;
  skidState.previousRight = rightNow;
}

function closestPointOnSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) {
    return start.clone();
  }

  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return start.clone().add(segment.multiplyScalar(t));
}

function applyWallImpact(normal, segmentDirection) {
  const velocity = getVelocityVector();
  const impactSpeed = Math.max(0, -velocity.dot(normal));
  if (impactSpeed <= 0) {
    return;
  }

  const tangentVelocity = velocity.clone().sub(normal.clone().multiplyScalar(velocity.dot(normal)));
  const tangentSpeed = tangentVelocity.length();
  const forwardImpact = state.speed >= 0;
  const wallRide = forwardImpact && tangentSpeed > 34 && tangentSpeed > impactSpeed * 0.62;
  const currentDirection = velocity.lengthSq() > 0.0001 ? velocity.clone().normalize() : new THREE.Vector2(Math.cos(state.angle), Math.sin(state.angle));
  const tangentBase = tangentSpeed > 0.0001 ? tangentVelocity.normalize() : segmentDirection.clone().normalize();
  const tangentDirection = tangentBase.dot(currentDirection) >= 0 ? tangentBase : tangentBase.multiplyScalar(-1);

  if (wallRide) {
    const wallRideTurnAmount = 1 - THREE.MathUtils.clamp(currentDirection.dot(tangentDirection), -1, 1);
    const wallRideLoss = impactSpeed * 0.05 + wallRideTurnAmount * wallRideTurnAmount * tangentSpeed * 0.68;
    const carriedSpeed = Math.max(18, tangentSpeed - wallRideLoss);
    state.speed = carriedSpeed;
    state.angle = blendAngle(state.angle, Math.atan2(tangentDirection.y, tangentDirection.x), 0.14);
    state.rearSlip = Math.max(state.rearSlip, 0.58);
    state.drifting = true;
    return;
  }

  const scrapeSpeed = tangentSpeed * 0.22;
  if (scrapeSpeed > 10) {
    const scrapeTurnAmount = 1 - THREE.MathUtils.clamp(currentDirection.dot(tangentDirection), -1, 1);
    state.angle = blendAngle(state.angle, Math.atan2(tangentDirection.y, tangentDirection.x), 0.08);
    state.speed = Math.min(scrapeSpeed, Math.abs(state.speed) * Math.max(0.08, 0.18 - scrapeTurnAmount * 0.08));
  } else {
    state.speed = 0;
  }

  state.drifting = false;
  state.rearSlip = Math.max(state.rearSlip, 0.34);
}

function resolveWallCollision(nextX, nextZ) {
  const resolved = new THREE.Vector2(nextX, nextZ);

  for (let pass = 0; pass < 3; pass += 1) {
    let bestCollision = null;

    for (const collider of wallColliders) {
      const closest = closestPointOnSegment(resolved, collider.start, collider.end);
      const offset = resolved.clone().sub(closest);
      const segment = collider.end.clone().sub(collider.start);
      const segmentLengthSquared = segment.lengthSq() || 1;
      const segmentT = THREE.MathUtils.clamp(resolved.clone().sub(collider.start).dot(segment) / segmentLengthSquared, 0, 1);
      const wallBaseHeight = THREE.MathUtils.lerp(collider.startHeight, collider.endHeight, segmentT);
      const wallTopHeight = wallBaseHeight + WALL_HEIGHT;
      const carBottomHeight = state.height;
      const carTopHeight = state.height + CAR_BODY_HEIGHT;
      const hasVerticalOverlap = wallTopHeight >= carBottomHeight - 0.5 && wallBaseHeight <= carTopHeight;
      if (!hasVerticalOverlap) {
        continue;
      }

      let normal;
      const distance = offset.length();
      if (distance > 0.0001) {
        normal = offset.clone().multiplyScalar(1 / distance);
      } else {
        const segmentDirection = collider.end.clone().sub(collider.start).normalize();
        normal = new THREE.Vector2(-segmentDirection.y, segmentDirection.x);
        if (normal.dot(resolved.clone().sub(collider.start)) < 0) {
          normal.multiplyScalar(-1);
        }
      }

      const clearance = getCarCollisionExtent(normal) + WALL_THICKNESS * 0.5;
      if (distance >= clearance) {
        continue;
      }

      const penetration = clearance - distance;
      if (!bestCollision || penetration > bestCollision.penetration) {
        bestCollision = { collider, closest, offset, distance, penetration, normal };
      }
    }

    if (!bestCollision) {
      break;
    }

    const segmentDirection = bestCollision.collider.end.clone().sub(bestCollision.collider.start).normalize();
    const normal = bestCollision.normal;

    resolved.add(normal.clone().multiplyScalar(bestCollision.penetration + 0.001));
    applyWallImpact(normal, segmentDirection);
  }

  return { x: resolved.x, z: resolved.y };
}

function updateCar(deltaTime) {
  if (raceState.phase === "staged" || raceState.phase === "finished") {
    state.speed *= Math.pow(0.82, deltaTime * 60);
    state.rearSlip = THREE.MathUtils.lerp(state.rearSlip, 0, 0.18);
    state.drifting = false;
  }

  const accelerate = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
  const reverse = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
  const left = keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0;
  const right = keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0;
  const drifting = keys.has("Space");
  const steer = right - left;
  const previousAngle = state.angle;
  const gravity = 132;
  const maxGroundPitch = THREE.MathUtils.degToRad(16);
  const minGroundPitch = THREE.MathUtils.degToRad(-10);
  let turnSpeedCap = MAX_FORWARD_SPEED;

  state.jumpCooldown = Math.max(0, state.jumpCooldown - deltaTime);

  const acceleration = 92;
  const reverseForce = 78;
  const speedRatio = Math.min(1, Math.abs(state.speed) / MAX_FORWARD_SPEED);

  const throttleEnabled = raceState.phase === "racing";
  state.speed += (throttleEnabled ? accelerate : 0) * acceleration * deltaTime;
  state.speed -= (throttleEnabled ? reverse : 0) * reverseForce * deltaTime;

  if (!accelerate && !reverse) {
    state.speed *= Math.pow(drifting ? 0.989 : 0.9925, deltaTime * 60);
  }

  state.speed = Math.max(MAX_REVERSE_SPEED, Math.min(MAX_FORWARD_SPEED, state.speed));

  const steerAuthority = state.airborne ? 0.22 : 1;
  const steerStrength = throttleEnabled ? steer : 0;
  const turnStrength = (drifting ? 4.2 : 2.25) * (speedRatio + 0.18) * steerAuthority;
  state.angle += steerStrength * turnStrength * deltaTime * (state.speed >= 0 ? 1 : -1);

  const angleDelta = Math.abs(THREE.MathUtils.euclideanModulo(state.angle - previousAngle + Math.PI, Math.PI * 2) - Math.PI);
  const turnSharpness = THREE.MathUtils.clamp(angleDelta / 0.085, 0, 1.6);

  if (!drifting && steer !== 0 && state.speed > 0) {
    const turnSeverity = Math.abs(steer) * Math.min(turnSharpness / 1.2, 1);
    const turnPenaltyMph = 100 * turnSeverity;
    const turnPenaltySpeed = turnPenaltyMph / SPEED_TO_MPH;
    turnSpeedCap = MAX_FORWARD_SPEED - turnPenaltySpeed;

    if (state.speed > turnSpeedCap) {
      state.speed = Math.max(turnSpeedCap, state.speed - (52 + 90 * turnSharpness) * deltaTime);
    }
  }

  if (drifting && steer !== 0 && state.speed > 0) {
    state.speed *= Math.pow(0.972, deltaTime * 60);
  }

  if (state.speed > 0) {
    state.speed = Math.min(state.speed, drifting ? MAX_FORWARD_SPEED : turnSpeedCap);
  }

  state.rearSlip = THREE.MathUtils.lerp(state.rearSlip, Math.abs(steerStrength) * speedRatio * (drifting ? 1.35 : 0.28), 0.12);
  state.drifting = throttleEnabled && drifting && steerStrength !== 0 && state.speed > 25;

  const moveSteps = Math.max(1, Math.ceil(Math.abs(state.speed) * deltaTime / 2.5));
  const stepTime = deltaTime / moveSteps;

  for (let step = 0; step < moveSteps; step += 1) {
    const nextX = state.x + Math.cos(state.angle) * state.speed * stepTime;
    const nextZ = state.z + Math.sin(state.angle) * state.speed * stepTime;
    const resolvedPosition = resolveWallCollision(nextX, nextZ);

    state.x = resolvedPosition.x;
    state.z = resolvedPosition.z;
  }

  const surfaceInfo = getTrackSurfaceInfo(state.x, state.z, state.height, state.surfaceSectionIndex, state.surfaceSegmentIndex);
  const frontAxle = getWorldAxlePoint(FRONT_AXLE_POINT);
  const rearAxle = getWorldAxlePoint(REAR_AXLE_POINT);
  const frontSurfaceInfo = getTrackSurfaceInfo(frontAxle.x, frontAxle.z, state.height, state.surfaceSectionIndex, state.surfaceSegmentIndex);
  const rearSurfaceInfo = getTrackSurfaceInfo(rearAxle.x, rearAxle.z, state.height, state.surfaceSectionIndex, state.surfaceSegmentIndex);
  const rawAxlePitch = Math.atan2(frontSurfaceInfo.height - rearSurfaceInfo.height, FRONT_AXLE_POINT.z - REAR_AXLE_POINT.z);
  const groundedPitch = THREE.MathUtils.clamp(rawAxlePitch, minGroundPitch, maxGroundPitch);
  const pitchKick = rawAxlePitch - state.groundPitch;
  const jumpMeta = getJumpMeta(frontSurfaceInfo) || getJumpMeta(rearSurfaceInfo);
  const nearJumpLip = !!jumpMeta
    && ((frontSurfaceInfo.onTrack && frontSurfaceInfo.segmentIndex >= jumpMeta.lipStartIndex)
      || (rearSurfaceInfo.onTrack && rearSurfaceInfo.segmentIndex >= jumpMeta.lipEndIndex - 1));
  const hasRunOutOfJumpSurface = !frontSurfaceInfo.onTrack && !!getJumpMeta(rearSurfaceInfo);
  const canRampLaunch = !state.airborne
    && state.jumpCooldown === 0
    && !!jumpMeta
    && state.speed > jumpMeta.minSpeed
    && rawAxlePitch > jumpMeta.minPitch
    && pitchKick > jumpMeta.minPitchKick
    && (nearJumpLip || hasRunOutOfJumpSurface);

  if (canRampLaunch || (!state.airborne && (!surfaceInfo.onTrack || !frontSurfaceInfo.onTrack || !rearSurfaceInfo.onTrack || state.height > surfaceInfo.height + 0.8))) {
    const launchSpeed = canRampLaunch
      ? Math.max(
        jumpMeta.launchBoost,
        state.speed * Math.max(0.18, Math.sin(Math.max(rawAxlePitch, jumpMeta.minPitch))) * 0.78,
      )
      : state.speed * Math.max(0, Math.sin(rawAxlePitch)) * 0.4;
    state.airborne = true;
    state.verticalSpeed = Math.max(state.verticalSpeed, launchSpeed);
    state.pitch = THREE.MathUtils.clamp(rawAxlePitch * 0.76, minGroundPitch, THREE.MathUtils.degToRad(20));
    state.jumpCooldown = canRampLaunch ? 0.3 : state.jumpCooldown;
  }

  if (state.airborne) {
    state.verticalSpeed -= gravity * deltaTime;
    state.height += state.verticalSpeed * deltaTime;

    if (surfaceInfo.onTrack && state.verticalSpeed <= 0 && state.height <= surfaceInfo.height + 0.9) {
      state.airborne = false;
      state.height = surfaceInfo.height;
      state.verticalSpeed = 0;
      state.surfaceSectionIndex = surfaceInfo.sectionIndex;
      state.surfaceSegmentIndex = surfaceInfo.segmentIndex;
      state.groundPitch = groundedPitch;
    }

    if (state.height <= 0.03) {
      state.airborne = false;
      state.height = 0.03;
      state.verticalSpeed = 0;
      state.surfaceSectionIndex = surfaceInfo.sectionIndex;
      state.surfaceSegmentIndex = surfaceInfo.segmentIndex;
    }
  } else {
    state.surfaceSectionIndex = surfaceInfo.sectionIndex;
    state.surfaceSegmentIndex = surfaceInfo.segmentIndex;
    state.height = (frontSurfaceInfo.height + rearSurfaceInfo.height) * 0.5;
    state.verticalSpeed = 0;
    state.groundPitch = THREE.MathUtils.lerp(state.groundPitch, groundedPitch, 0.28);
  }

  car.position.set(state.x, state.height, state.z);
  const targetPitch = state.airborne
    ? THREE.MathUtils.clamp(state.pitch - state.verticalSpeed * 0.00055, minGroundPitch, THREE.MathUtils.degToRad(18))
    : state.groundPitch;
  state.pitch = THREE.MathUtils.lerp(state.pitch, targetPitch, state.airborne ? 0.045 : 0.16);
  car.rotation.x = state.pitch;
  car.rotation.y = Math.PI / 2 - state.angle;
  car.rotation.z = THREE.MathUtils.clamp(steerStrength * (state.airborne ? -0.012 : drifting ? -0.06 : -0.035), -0.06, 0.06);

  const steerVisual = THREE.MathUtils.degToRad(-20) * steerStrength * (drifting ? 1.15 : 1);
  frontWheelPivots.forEach((pivot) => {
    pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, steerVisual, 0.22);
  });

  const wheelSpin = (state.speed / 1.45) * deltaTime;
  wheelMeshes.forEach((wheel) => {
    wheel.rotation.x -= wheelSpin;
  });

  updateDriftTrail();
}

function updateCamera(deltaTime) {
  const forward = new THREE.Vector3(Math.cos(state.angle), 0, Math.sin(state.angle));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const carPosition = new THREE.Vector3(state.x, state.height, state.z);

  const targetPosition = carPosition
    .clone()
    .addScaledVector(forward, -34)
    .addScaledVector(right, state.speed * 0.005)
    .add(new THREE.Vector3(0, 18, 0));

  camera.position.lerp(targetPosition, 1 - Math.pow(0.0008, deltaTime));
  const lookAtTarget = carPosition.clone().add(new THREE.Vector3(0, 4.5, 0)).addScaledVector(forward, 26);
  camera.lookAt(lookAtTarget);
}

function updateRace(now) {
  if (raceState.phase === "countdown") {
    const elapsed = now - raceState.countdownStart;
    const redStage = Math.min(START_LIGHT_COUNT, Math.floor(elapsed / START_LIGHT_INTERVAL_MS) + 1);
    const redSequenceDuration = START_LIGHT_COUNT * START_LIGHT_INTERVAL_MS;

    if (elapsed < redSequenceDuration) {
      setStartLightStage(redStage);
      statusValue.textContent = "Lights.";
    } else {
      setStartLightStage("green");
      statusValue.textContent = "Go.";
    }

    if (elapsed >= redSequenceDuration + START_LIGHT_HOLD_MS) {
      beginRace(now);
    }
  }

  if (raceState.phase === "racing") {
    raceState.elapsedMs = now - raceState.raceStart;
    timerValue.textContent = formatTime(raceState.elapsedMs);

    const progressDistance = getTrackProgressDistance(state.x, state.z);
    raceState.lastProgressDistance = Math.max(raceState.lastProgressDistance, progressDistance);
    if (raceState.lastProgressDistance > trackDistances[Math.min(trackDistances.length - 1, raceState.startSegmentIndex + 24)]) {
      raceState.startedPastLine = true;
    }

    if (raceState.startedPastLine && progressDistance >= trackDistances[raceState.finishSegmentIndex] && raceState.lastProgressDistance >= trackDistances[trackDistances.length - 24]) {
      finishRace();
    }
  } else if (raceState.phase === "finished") {
    timerValue.textContent = formatTime(raceState.elapsedMs);
  }
}

let lastTime = performance.now();
function loop(now) {
  const deltaTime = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
  lastTime = now;

  updateCar(deltaTime);
  updateCamera(deltaTime);
  updateSkidMarks(deltaTime);
  updateRace(now);

  speedValue.textContent = `${Math.min(MAX_SPEED_MPH, Math.round(Math.abs(state.speed) * SPEED_TO_MPH))} mph`;
  headingValue.textContent = Math.round((THREE.MathUtils.radToDeg(state.angle) % 360 + 360) % 360).toString();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyR") {
    resetCar();
    resetRaceState();
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

trackCardButton.addEventListener("click", () => {
  showDetailView();
});

backButton.addEventListener("click", () => {
  showHomeView();
});

startRaceButton.addEventListener("click", () => {
  if (raceState.phase === "staged") {
    beginCountdown(performance.now());
  }
});

saveYesButton.addEventListener("click", () => {
  showUsernameForm();
});

saveNoButton.addEventListener("click", () => {
  closeRaceAndReturnToMenu();
});

saveCancelButton.addEventListener("click", () => {
  closeRaceAndReturnToMenu();
});

saveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();

  if (!username) {
    usernameInput.focus();
    return;
  }

  leaderboardEntries = leaderboardEntries.slice();
  addLeaderboardEntry(username, pendingSaveTime ?? raceState.elapsedMs);
  localStorage.setItem(LAST_USERNAME_STORAGE_KEY, username);
  closeRaceAndReturnToMenu();
});

resize();
resetCar();
raceState.startSegmentIndex = getStartSegmentIndex();
raceState.finishSegmentIndex = findSegmentIndexByDistance(
  trackDistances[trackDistances.length - 1] - CAR_HALF_LENGTH * 2,
);
placeGate(startGate, raceState.startSegmentIndex, getStartGateRotation());
placeGate(finishGate, raceState.finishSegmentIndex, getFinishGateRotation());
resetRaceState();
renderLeaderboard();
showHomeView();
requestAnimationFrame(loop);
