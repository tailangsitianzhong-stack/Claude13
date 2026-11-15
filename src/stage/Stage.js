import * as THREE from 'three';
import { STAGE_CONFIG } from './config.js';

// 再現性のある乱数（シードが同じなら同じ壁になる）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 格闘ゲームの土台ステージ。
 * - 草原の床（単色）
 * - 外周を囲う、石ブロックが重なり合った乱雑な壁
 * - 外側はのっぺりした海
 * 返り値の `bounds` は壁の内側（キャラが動ける範囲, XZ）。
 */
export function createStage(options = {}) {
  const cfg = { ...STAGE_CONFIG, ...options, colors: { ...STAGE_CONFIG.colors, ...options.colors } };
  const rand = mulberry32(cfg.seed);
  const r = (min, max) => min + rand() * (max - min);
  const half = cfg.floorSize / 2;

  const group = new THREE.Group();
  group.name = 'Stage';

  // ---------- 草原の床 ----------
  const sideMat = new THREE.MeshStandardMaterial({ color: cfg.colors.dirt, roughness: 0.9 });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.floorSize, cfg.floorThickness, cfg.floorSize),
    [
      sideMat, sideMat,
      new THREE.MeshStandardMaterial({ color: cfg.colors.grass, roughness: 0.85 }), // 上面
      sideMat, sideMat, sideMat,
    ],
  );
  floor.position.y = -cfg.floorThickness / 2; // 上面を y=0 に
  floor.receiveShadow = true;
  floor.name = 'GrassFloor';
  group.add(floor);

  // ---------- 石ブロックの乱雑な壁 ----------
  // 外周に沿って、大きさ・向き・傾きがバラバラな石ブロックを重ねて積む
  const stones = [];
  const wallMid = half - cfg.wallThickness / 2; // 壁帯の中心線
  const perimeter = 8 * wallMid;
  const step = 1.3;
  for (let d = 0; d < perimeter; d += step) {
    // 周回距離 d → 四角形の外周上の点 (x, z) と向き
    const sideIdx = Math.floor(d / (2 * wallMid));
    const t = (d % (2 * wallMid)) - wallMid;
    const [x, z, angle] = [
      [t, -wallMid, 0],
      [wallMid, t, Math.PI / 2],
      [-t, wallMid, 0],
      [-wallMid, -t, Math.PI / 2],
    ][sideIdx];

    let y = -0.3; // 少し床にめり込ませる
    while (y < cfg.wallHeight) {
      const sx = r(1.4, 3.2);
      const sy = r(0.9, 2.0);
      const sz = r(1.2, cfg.wallThickness);
      const off = r(-0.6, 0.6); // 壁の厚み方向のズレ
      stones.push({
        pos: new THREE.Vector3(
          x + (angle === 0 ? r(-0.4, 0.4) : off),
          y + sy / 2,
          z + (angle === 0 ? off : r(-0.4, 0.4)),
        ),
        rot: new THREE.Euler(r(-0.2, 0.2), angle + r(-0.35, 0.35), r(-0.2, 0.2)),
        scale: new THREE.Vector3(sx, sy, sz),
      });
      y += sy * r(0.55, 0.8); // 下の石と重なるように積む
    }
  }

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, stones.length);
  walls.name = 'StoneWalls';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const base = new THREE.Color(cfg.colors.stone);
  const c = new THREE.Color();
  stones.forEach((s, k) => {
    m.compose(s.pos, q.setFromEuler(s.rot), s.scale);
    walls.setMatrixAt(k, m);
    walls.setColorAt(k, c.copy(base).multiplyScalar(r(0.75, 1.1))); // 石ごとの濃淡
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // ---------- 海（のっぺり単色） ----------
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: cfg.colors.sea, roughness: 0.4 }),
  );
  sea.position.y = cfg.seaLevel;
  sea.receiveShadow = true;
  sea.name = 'Sea';
  group.add(sea);

  const inner = half - cfg.wallThickness - 0.5; // 石の張り出し分の余裕を引く
  return {
    group,
    update() {},
    config: cfg,
    bounds: { minX: -inner, maxX: inner, minZ: -inner, maxZ: inner, floorY: 0 },
  };
}
