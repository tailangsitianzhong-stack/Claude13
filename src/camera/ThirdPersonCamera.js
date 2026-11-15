import * as THREE from 'three';

const TWO_PI = Math.PI * 2;
const angleDiff = (a, b) => { const d = a - b; return d - TWO_PI * Math.round(d / TWO_PI); };

/**
 * 三人称の追従カメラ。キャラの後方・少し上から背中越しに見る。
 *
 * 視点操作は移動操作と独立:
 *   - PC   : 右ドラッグで見回す、ホイールで距離
 *   - スマホ: スティックとボタン以外の場所をドラッグで見回す
 * しばらく視点を触っていないときだけ、進行方向（攻撃中は狙っている相手の方向）の
 * 背後へゆっくり回り込む。真後ろへ下がるときは回り込まない（画面が反転しない）。
 */
export class ThirdPersonCamera {
  constructor(camera, dom, { bounds } = {}) {
    this.camera = camera;
    this.bounds = bounds;       // カメラが石壁にめり込まないよう、この範囲内に収める
    this.yaw = 0;               // カメラがキャラのどちら側にいるか（0 = +Z 側）
    this.pitch = 0.34;          // 見下ろす角度
    this.distance = 1.65;
    this.minDistance = 0.9;
    this.maxDistance = 7;
    this.minPitch = -0.15;
    this.maxPitch = 1.25;
    this.height = 0.95;         // 注視点の高さ。頭より上にして、正面の相手が自分の体に隠れないようにする
    this.zoom = 1;              // 距離の倍率（演出で一時的に引くとき用。zoomTarget へなめらかに寄る）
    this.zoomTarget = 1;
    this.heightFollow = 0.4;    // ジャンプの高さにどれだけ付いていくか（0〜1）
    this.followRate = 11;       // 注視点がキャラを追う速さ（小さいほど遅れて付いてくる）
    this.alignDelay = 1.0;      // 視点操作をやめてから自動で回り込み始めるまでの秒数
    this.pivot = new THREE.Vector3();
    this.idle = 99;             // 最後に視点を操作してからの秒数
    this.snapped = false;
    this.bindPointer(dom);
  }

  // heading（キャラの向き）の真後ろへカメラを置く
  setBehind(heading) {
    this.yaw = heading + Math.PI;
  }

  // カメラの現在の距離（演出の揺れ幅の基準に使う）
  get currentDistance() {
    return this.camera.position.distanceTo(this.pivot);
  }

  bindPointer(dom) {
    let id = null;
    let lastX = 0;
    let lastY = 0;
    const isLook = (e) => (e.pointerType === 'mouse' ? e.button === 2 : true);
    dom.addEventListener('pointerdown', (e) => {
      if (id != null || !isLook(e)) return;
      id = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const k = e.pointerType === 'mouse' ? 0.005 : 0.007;
      this.yaw -= (e.clientX - lastX) * k;
      this.pitch = Math.min(this.maxPitch, Math.max(this.minPitch, this.pitch + (e.clientY - lastY) * k));
      lastX = e.clientX;
      lastY = e.clientY;
      this.idle = 0;
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
  }

  /**
   * @param dt     経過秒
   * @param target 追う対象の位置（キャラの足元）
   * @param align  { heading, rate } を渡すと、その向きの背後へ rate の速さで回り込む（null なら回り込まない）
   */
  update(dt, target, align) {
    this.idle += dt;
    if (align && this.idle > this.alignDelay) {
      // sin を掛けることで、真後ろ（差が180度）へ向かうときは回らず、横移動のときに一番よく回る
      const diff = angleDiff(align.heading + Math.PI, this.yaw);
      this.yaw += Math.sin(diff) * align.rate * dt;
    }

    // 注視点はキャラを少し遅れて追う（踏み込みや走りの勢いが画面に出る）。ジャンプには控えめに付いていく
    const k = this.snapped ? 1 - Math.exp(-this.followRate * dt) : 1;
    this.snapped = true;
    this.pivot.x += (target.x - this.pivot.x) * k;
    this.pivot.z += (target.z - this.pivot.z) * k;
    this.pivot.y += (target.y * this.heightFollow + this.height - this.pivot.y) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-7 * dt));
    const distance = this.distance * this.zoom;

    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    cam.position.set(
      this.pivot.x + Math.sin(this.yaw) * cp * distance,
      this.pivot.y + Math.sin(this.pitch) * distance,
      this.pivot.z + Math.cos(this.yaw) * cp * distance,
    );
    if (this.bounds) {
      const b = this.bounds;
      const m = 0.3;
      cam.position.x = Math.min(b.maxX - m, Math.max(b.minX + m, cam.position.x));
      cam.position.z = Math.min(b.maxZ - m, Math.max(b.minZ + m, cam.position.z));
    }
    cam.position.y = Math.max(0.08, cam.position.y);
    cam.lookAt(this.pivot);
  }
}
