import * as THREE from 'three';

// 減衰バネ: 蹴る(kick)と揺れてから 0 に戻る値
class Spring {
  constructor(stiffness, damping) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
  }
  update(dt) {
    // 大きな dt でも発散しないよう小刻みに積分
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
  }
}

const basePos = new THREE.Vector3();
const baseQuat = new THREE.Quaternion();
const offset = new THREE.Vector3();
const rollQuat = new THREE.Quaternion();
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/**
 * 攻撃の手応えを出すカメラ演出。追従カメラが決めた位置に「上乗せ」するだけなので、
 * 描画の直前に apply()、描画の直後に restore() を呼ぶ（追従カメラ側の状態は汚さない）。
 *
 *  - kick(x, y, z)  : 斬る方向へカメラを一瞬振る（カメラから見た右・上・手前）
 *  - roll(amount)   : 画面を傾ける
 *  - zoom(amount)   : 視野角を一瞬変える（+ で広がる = 勢い、- で寄る = 命中の重さ）
 *  - shake(amount)  : 画面揺れを足す（0〜1）
 */
export class CameraFx {
  // getDistance: カメラと注視点の距離を返す関数（揺れ幅の基準）
  constructor(camera, getDistance) {
    this.camera = camera;
    this.getDistance = getDistance;
    this.baseFov = camera.fov;
    this.px = new Spring(260, 22);
    this.py = new Spring(260, 22);
    this.pz = new Spring(200, 20);
    this.rollS = new Spring(220, 20);
    this.fovS = new Spring(180, 19);
    this.trauma = 0;
    this.time = 0;
  }

  kick(x, y, z = 0) { this.px.v += x; this.py.v += y; this.pz.v += z; }
  roll(amount) { this.rollS.v += amount; }
  zoom(amount) { this.fovS.v += amount; }
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  update(dt) {
    this.time += dt;
    for (const s of [this.px, this.py, this.pz, this.rollS, this.fovS]) s.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
  }

  apply() {
    const cam = this.camera;
    basePos.copy(cam.position);
    baseQuat.copy(cam.quaternion);
    // 揺れ幅はカメラと注視点の距離に比例させる（ズームしても同じ見え方）
    const dist = this.getDistance();
    const t = this.time;
    const sh = this.trauma * this.trauma;
    const nx = Math.sin(t * 91.7) * 0.6 + Math.sin(t * 53.3 + 1.3) * 0.4;
    const ny = Math.sin(t * 83.1 + 2.1) * 0.6 + Math.sin(t * 47.9 + 0.4) * 0.4;
    const nr = Math.sin(t * 71.3 + 4.2);

    offset.set(
      (this.px.x + nx * sh * 0.035) * dist,
      (this.py.x + ny * sh * 0.035) * dist,
      this.pz.x * dist,
    ).applyQuaternion(cam.quaternion);
    cam.position.add(offset);
    rollQuat.setFromAxisAngle(AXIS_Z, this.rollS.x + nr * sh * 0.035);
    cam.quaternion.multiply(rollQuat);
    cam.fov = this.baseFov + this.fovS.x;
    cam.updateProjectionMatrix();
  }

  restore() {
    this.camera.position.copy(basePos);
    this.camera.quaternion.copy(baseQuat);
  }
}
