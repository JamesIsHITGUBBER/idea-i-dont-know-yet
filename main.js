import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js";

const canvas = document.getElementById("gameCanvas");
const speedValue = document.getElementById("speedValue");
const headingValue = document.getElementById("headingValue");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce8f4);
scene.fog = new THREE.Fog(0xdce8f4, 120, 1800);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);

scene.add(new THREE.AmbientLight(0xe7f2fb, 1.3));
scene.add(new THREE.HemisphereLight(0xffffff, 0xb6cbdf, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(-180, 320, 120);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshStandardMaterial({ color: 0xc9dae8, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(4000, 80, 0x91a9bf, 0xb9cad9);
grid.position.y = 0.05;
grid.material.transparent = true;
grid.material.opacity = 0.42;
scene.add(grid);

const TRACK_WIDTH = 58;
const WALL_HEIGHT = 18;
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

function buildTrackSections() {
  const mainSection = [];
  const underpassSection = [];

  addStraight(mainSection, new THREE.Vector3(-1420, 0.03, -120), new THREE.Vector3(-1080, 0.03, -120), 72);
  addTurn(mainSection, 250, Math.PI / 2, 0.03, 0.03, 54);
  addStraight(mainSection, mainSection[mainSection.length - 1], new THREE.Vector3(-840, 0.03, 260), 36);
  addTurn(mainSection, 240, -Math.PI / 2, 0.03, 40, 52);
  addStraight(mainSection, mainSection[mainSection.length - 1], new THREE.Vector3(120, 40, 470), 104);
  addTurn(mainSection, 320, -Math.PI / 2, 40, 52, 64);
  addStraight(mainSection, mainSection[mainSection.length - 1], new THREE.Vector3(520, 52, 900), 44);
  addSpiral(mainSection, new THREE.Vector3(620, 0.03, 980), 230, 170, Math.PI, Math.PI * 3.3, 52, 128, 188);
  addTurn(mainSection, 340, -Math.PI / 2, 128, 96, 60);
  addStraight(mainSection, mainSection[mainSection.length - 1], new THREE.Vector3(1720, 96, 1640), 96);

  addStraight(underpassSection, new THREE.Vector3(380, 0.03, 980), new THREE.Vector3(860, 0.03, 980), 52);

  trackSectionMeta.push(
    {
      wallStartInset: 0,
      wallEndInset: 0,
    },
    {
      wallStartInset: 0,
      wallEndInset: 0,
    },
  );

  return [mainSection, underpassSection];
}

trackSections.push(...buildTrackSections());

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

const laneStripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f7fb, roughness: 0.7, flatShading: true });
for (const section of trackSections) {
  for (let index = 0; index < section.length - 10; index += 14) {
    addOrientedSegment3D({
      start: section[index],
      end: section[Math.min(section.length - 1, index + 7)],
      thickness: 1.2,
      height: 0.08,
      material: laneStripeMaterial,
      yOffset: 0.04,
    });
  }
}

const wallGroup = new THREE.Group();
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.92, flatShading: true });

function addWallVisualSegment(start, end) {
  addOrientedSegment3D({
    start,
    end,
    thickness: WALL_THICKNESS,
    height: WALL_HEIGHT,
    material: wallMaterial,
    target: wallGroup,
  });
}

function addWallRun(samples, startInset = 0, endInset = 0) {
  const startIndex = Math.max(0, startInset);
  const endIndex = Math.max(startIndex, samples.length - 1 - Math.max(0, endInset));

  for (let index = startIndex; index < endIndex; index += 1) {
    addWallCollider(samples[index], samples[index + 1]);
    addWallVisualSegment(samples[index], samples[index + 1]);
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

const decoMaterial = new THREE.MeshStandardMaterial({ color: 0xb6cadf, roughness: 1, flatShading: true });
for (let index = 0; index < 24; index += 1) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(20 + Math.random() * 26, 0), decoMaterial);
  rock.position.set(
    -1500 + Math.random() * 3000,
    18 + Math.random() * 24,
    -1500 + Math.random() * 3000,
  );
  rock.scale.set(1, 0.35 + Math.random() * 1.2, 1);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  scene.add(rock);
}

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

const MAX_SPEED_MPH = 180;
const MAX_FORWARD_SPEED = 360;
const MAX_REVERSE_SPEED = -90;
const SPEED_TO_MPH = MAX_SPEED_MPH / MAX_FORWARD_SPEED;
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
  return Math.abs(normal.dot(right)) * CAR_HALF_WIDTH + Math.abs(normal.dot(forward)) * CAR_HALF_LENGTH;
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

function resetCar() {
  const spawnSection = trackSections[0];
  const spawnIndex = 4;
  const spawnPoint = spawnSection[spawnIndex];
  const spawnNext = spawnSection[spawnIndex + 2];
  state.x = spawnPoint.x;
  state.z = spawnPoint.z;
  state.angle = Math.atan2(spawnNext.z - spawnPoint.z, spawnNext.x - spawnPoint.x);
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

  state.speed += accelerate * acceleration * deltaTime;
  state.speed -= reverse * reverseForce * deltaTime;

  if (!accelerate && !reverse) {
    state.speed *= Math.pow(drifting ? 0.989 : 0.9925, deltaTime * 60);
  }

  state.speed = Math.max(MAX_REVERSE_SPEED, Math.min(MAX_FORWARD_SPEED, state.speed));

  const steerAuthority = state.airborne ? 0.22 : 1;
  const turnStrength = (drifting ? 4.2 : 2.25) * (speedRatio + 0.18) * steerAuthority;
  state.angle += steer * turnStrength * deltaTime * (state.speed >= 0 ? 1 : -1);

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

  state.rearSlip = THREE.MathUtils.lerp(state.rearSlip, Math.abs(steer) * speedRatio * (drifting ? 1.35 : 0.28), 0.12);
  state.drifting = drifting && steer !== 0 && state.speed > 25;

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
  car.rotation.z = THREE.MathUtils.clamp(steer * (state.airborne ? -0.012 : drifting ? -0.06 : -0.035), -0.06, 0.06);

  const steerVisual = THREE.MathUtils.degToRad(-20) * steer * (drifting ? 1.15 : 1);
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

let lastTime = performance.now();
function loop(now) {
  const deltaTime = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
  lastTime = now;

  updateCar(deltaTime);
  updateCamera(deltaTime);
  updateSkidMarks(deltaTime);

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
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

resize();
resetCar();
requestAnimationFrame(loop);
