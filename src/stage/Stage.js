import * as THREE from 'three';
import { STAGE_CONFIG } from './config.js';
import {
  mulberry32, grassTexture, dirtSideTexture, dirtTexture, stoneTexture, waterTexture,
} from './textures.js';

/**
 * 格闘ゲームの土台ステージ。
 * - 草原の床（島）
 * - その外周を石ブロックのみで囲う壁
 * - 外側は海
 * 返り値の `bounds` は壁の内側（キャラが動ける範囲, XZ）で、後で当たり判定に使う。
 */
export function createStage(options = {}) {
  const cfg = { ...STAGE_CONFIG, ...options };
  const B = cfg.blockSize;
  const N = cfg.floorBlocks;
  const half = (N * B) / 2;
  const rand = mulberry32(cfg.seed);

  const group = new THREE.Group();
  group.name = 'Stage';

  // ---------- 草原の床 ----------
  const floorH = cfg.floorThickness * B;
  const grassTop = grassTexture(cfg.seed + 1);
  grassTop.repeat.set(N, N);
  const side = dirtSideTexture(cfg.seed + 2);
  side.repeat.set(N, cfg.floorThickness);
  side.offset.y = 0;
  const bottom = dirtTexture(cfg.seed + 3);
  bottom.repeat.set(N, N);

  const sideMat = new THREE.MeshLambertMaterial({ map: side });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(N * B, floorH, N * B),
    [
      sideMat, sideMat,                                   // +X, -X
      new THREE.MeshLambertMaterial({ map: grassTop }),   // +Y (上面)
      new THREE.MeshLambertMaterial({ map: bottom }),     // -Y
      sideMat, sideMat,                                   // +Z, -Z
    ],
  );
  floor.position.y = -floorH / 2; // 上面を y=0 に
  floor.receiveShadow = true;
  floor.name = 'GrassFloor';
  group.add(floor);

  // ---------- 石ブロックの壁 ----------
  const cells = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === 0 || j === 0 || i === N - 1 || j === N - 1) cells.push([i, j]);
    }
  }
  const positions = [];
  for (const [i, j] of cells) {
    for (let h = 0; h < cfg.wallHeight; h++) positions.push([i, h, j]);
    // 胸壁: 1つおきに1段高く（四隅は必ず高く）
    const corner = (i === 0 || i === N - 1) && (j === 0 || j === N - 1);
    if (cfg.battlements && (corner || (i + j) % 2 === 0)) positions.push([i, cfg.wallHeight, j]);
  }

  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture(cfg.seed + 4) });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(B, B, B), stoneMat, positions.length);
  walls.name = 'StoneWalls';
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  positions.forEach(([i, h, j], k) => {
    m.makeTranslation(-half + B / 2 + i * B, B / 2 + h * B, -half + B / 2 + j * B);
    walls.setMatrixAt(k, m);
    // ロブロックス風にブロックごとに少しだけ明るさを変える
    const v = 0.85 + rand() * 0.2;
    walls.setColorAt(k, c.setRGB(v, v, v));
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // ---------- 海 ----------
  const seaTex = waterTexture(cfg.seed + 5);
  const tiles = cfg.seaSize / B;
  seaTex.repeat.set(tiles, tiles);
  const segs = 80;
  const seaGeo = new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize, segs, segs);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(
    seaGeo,
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.9, flatShading: true }),
  );
  sea.position.y = cfg.seaLevel;
  sea.receiveShadow = true;
  sea.name = 'Sea';
  group.add(sea);

  const seaPos = seaGeo.attributes.position;
  const baseX = Float32Array.from({ length: seaPos.count }, (_, k) => seaPos.getX(k));
  const baseZ = Float32Array.from({ length: seaPos.count }, (_, k) => seaPos.getZ(k));

  // 海の底（島の下が透けて見えすぎないように暗い面）
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1b4f7a }),
  );
  seabed.position.y = -floorH - 0.01;
  group.add(seabed);

  function update(time) {
    // 低ポリの波（頂点を上下）＋テクスチャをゆっくり流す
    for (let k = 0; k < seaPos.count; k++) {
      const x = baseX[k];
      const z = baseZ[k];
      const y = Math.sin(x * 0.15 + time * 1.2) * 0.18 + Math.cos(z * 0.12 + time * 0.9) * 0.18;
      seaPos.setY(k, y);
    }
    seaPos.needsUpdate = true;
    seaGeo.computeVertexNormals();
    seaTex.offset.set(time * 0.02, time * 0.01);
  }

  const inner = half - B; // 壁の内側
  return {
    group,
    update,
    config: cfg,
    bounds: { minX: -inner, maxX: inner, minZ: -inner, maxZ: inner, floorY: 0 },
  };
}
