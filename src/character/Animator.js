import * as THREE from 'three';
import { RIG } from './rig.js';
import { POSES, makePose, resetPose, lerpPose, copyPose } from './poses.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const tmp = new THREE.Vector3();

/**
 * ポーズの再生係。
 *  - play(name, fade): 今の姿勢から fade 秒かけて次のモーションへなめらかに切り替える
 *  - phase: 歩き・走りの周期位置（コントローラが移動距離に合わせて進める）
 *  - airU : ジャンプ中の縦速度（+1 上昇 → -1 落下）
 *  - 足が地面に着くように、毎フレーム靴底の位置から腰の高さを決める（めり込み・浮き防止）
 */
export class Animator {
  constructor({ group, joints, soles, scale }) {
    this.group = group;
    this.joints = joints;
    this.soles = soles;
    this.scale = scale;

    this.name = 'stand';
    this.time = Math.random() * 10; // キャラごとに呼吸のタイミングをずらす
    this.phase = 0;
    this.airU = 0;
    this.debug = null; // { name, phase, airU, time } を入れるとその姿勢で固定（確認用）

    this.pose = makePose();     // 表示中の姿勢
    this.target = makePose();   // 再生中モーションの姿勢
    this.from = makePose();     // 切り替え開始時の姿勢
    this.fade = 1;              // 0 → 1
    this.fadeTime = 0;

    this.evaluate(this.name, this.pose);
    this.apply(this.pose);
  }

  play(name, fade = 0.15) {
    if (name === this.name) return;
    this.name = name;
    copyPose(this.from, this.pose);
    this.fade = fade > 0 ? 0 : 1;
    this.fadeTime = fade;
  }

  evaluate(name, out) {
    resetPose(out);
    POSES[name](this, out);
    return out;
  }

  update(dt) {
    this.time += dt;
    if (this.debug) {
      const d = this.debug;
      const saved = [this.phase, this.airU, this.time];
      this.phase = d.phase ?? 0;
      this.airU = d.airU ?? 0;
      this.time = d.time ?? 0;
      this.evaluate(d.name, this.pose);
      [this.phase, this.airU, this.time] = saved;
      this.apply(this.pose);
      return;
    }
    this.evaluate(this.name, this.target);
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeTime);
      const k = this.fade * this.fade * (3 - 2 * this.fade);
      lerpPose(this.pose, this.from, this.target, k);
    } else {
      copyPose(this.pose, this.target);
    }
    this.apply(this.pose);
  }

  apply(p) {
    const j = this.joints;

    j.hips.rotation.set(p.hipsPitch, p.hipsYaw, p.hipsRoll);
    j.waist.rotation.set(p.waistPitch, p.waistYaw, p.waistRoll);
    j.neck.rotation.set(p.neckPitch, p.neckYaw, p.neckRoll);

    // side: 左 = +1, 右 = -1
    this.applyLimbs(p, 'l', 1, j.lShoulder, j.lElbow, j.lHip, j.lKnee, j.lAnkle);
    this.applyLimbs(p, 'r', -1, j.rShoulder, j.rElbow, j.rHip, j.rKnee, j.rAnkle);

    // ---- 接地: 一番低い靴底が地面（ルートの高さ）に来るよう腰を上下させる ----
    j.hips.position.set(p.hipsX, RIG.hipY, 0);
    let hipY = RIG.hipY + p.hipsFree;
    if (p.ground > 0) {
      this.group.updateWorldMatrix(true, true);
      let minY = Infinity;
      for (const s of this.soles) {
        tmp.copy(s.point).applyMatrix4(s.ankle.matrixWorld);
        if (tmp.y < minY) minY = tmp.y;
      }
      this.group.getWorldPosition(tmp);
      const soleY = (minY - tmp.y) / this.scale; // リグ単位での一番低い靴底の高さ
      const groundedY = RIG.hipY - soleY;
      hipY += (groundedY - hipY) * p.ground;
    }
    j.hips.position.y = hipY + p.lift;
  }

  applyLimbs(p, k, side, shoulder, elbow, hip, knee, ankle) {
    shoulder.rotation.set(-p[k + 'ShoulderSwing'], -side * p[k + 'ShoulderTwist'], side * p[k + 'ShoulderOut']);
    elbow.rotation.x = -p[k + 'Elbow'];
    hip.rotation.set(-p[k + 'HipSwing'], side * p[k + 'HipTwist'], side * p[k + 'HipOut']);
    knee.rotation.x = p[k + 'Knee'];
    // 足首: 接地中(Flat=1)はスネの傾きを打ち消して靴底を水平に保つ
    const shinPitch = p.hipsPitch - p[k + 'HipSwing'] + p[k + 'Knee'];
    ankle.rotation.x = clamp(-shinPitch * p[k + 'Flat'] - p[k + 'Ankle'], -1.1, 1.1);
  }
}
