import { DEG, clamp, mat4, vec3, type Mat4, type Vec3 } from '../core/math.js';

export const MIN_DISTANCE = 3.2;
export const MAX_DISTANCE = 14;
const MAX_PITCH = 88 * DEG;
const ROTATE_SPEED = 0.0065;

/** Orbit camera around the origin with smoothing and drag inertia. */
export class OrbitCamera {
    readonly fovY = 38 * DEG;
    aspect = 1;

    private yaw = 0.55;
    private pitch = 0.38;
    private distance = 5.6;
    private targetYaw = this.yaw;
    private targetPitch = this.pitch;
    private targetDistance = this.distance;
    private velocityYaw = 0;
    private velocityPitch = 0;
    private dragging = false;

    eye: Vec3 = [0, 0, 1];
    view: Mat4 = new Float32Array(16);
    projection: Mat4 = new Float32Array(16);
    viewProjection: Mat4 = new Float32Array(16);
    inverseViewProjection: Mat4 = new Float32Array(16);

    constructor() {
        this.update(0);
    }

    beginDrag(): void {
        this.dragging = true;
        this.velocityYaw = this.velocityPitch = 0;
    }

    drag(dxPx: number, dyPx: number, dt: number): void {
        const dYaw = -dxPx * ROTATE_SPEED;
        const dPitch = dyPx * ROTATE_SPEED;
        this.targetYaw += dYaw;
        this.targetPitch = clamp(this.targetPitch + dPitch, -MAX_PITCH, MAX_PITCH);
        if (dt > 0) {
            const blend = 0.35;
            this.velocityYaw = this.velocityYaw * (1 - blend) + (dYaw / dt) * blend;
            this.velocityPitch = this.velocityPitch * (1 - blend) + (dPitch / dt) * blend;
        }
    }

    endDrag(idleMs: number): void {
        this.dragging = false;
        if (idleMs > 80) this.velocityYaw = this.velocityPitch = 0;
    }

    zoom(deltaY: number): void {
        this.targetDistance = clamp(this.targetDistance * Math.exp(deltaY * 0.0012), MIN_DISTANCE, MAX_DISTANCE);
    }

    reset(): void {
        this.targetYaw = 0.55;
        this.targetPitch = 0.38;
        this.targetDistance = 5.6;
        this.velocityYaw = this.velocityPitch = 0;
    }

    update(dt: number): void {
        if (!this.dragging && dt > 0) {
            this.targetYaw += this.velocityYaw * dt;
            this.targetPitch = clamp(this.targetPitch + this.velocityPitch * dt, -MAX_PITCH, MAX_PITCH);
            const decay = Math.exp(-4 * dt);
            this.velocityYaw *= decay;
            this.velocityPitch *= decay;
        }
        const k = dt > 0 ? 1 - Math.exp(-14 * dt) : 1;
        this.yaw += (this.targetYaw - this.yaw) * k;
        this.pitch += (this.targetPitch - this.pitch) * k;
        this.distance += (this.targetDistance - this.distance) * k;

        const cp = Math.cos(this.pitch);
        this.eye = [
            this.distance * cp * Math.sin(this.yaw),
            this.distance * Math.sin(this.pitch),
            this.distance * cp * Math.cos(this.yaw),
        ];
        this.view = mat4.lookAt(this.eye, [0, 0, 0], [0, 1, 0]);
        this.projection = mat4.perspective(this.fovY, this.aspect, 0.05, 100);
        this.viewProjection = mat4.multiply(this.projection, this.view);
        this.inverseViewProjection = mat4.invert(this.viewProjection);
    }

    /** Camera right vector in world space. */
    get right(): Vec3 {
        return [this.view[0]!, this.view[4]!, this.view[8]!];
    }

    /** World-space ray through a point given in normalized device coordinates. */
    ray(ndcX: number, ndcY: number): { origin: Vec3; dir: Vec3 } {
        const near = mat4.transformPoint(this.inverseViewProjection, [ndcX, ndcY, 0]);
        const far = mat4.transformPoint(this.inverseViewProjection, [ndcX, ndcY, 1]);
        const a: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
        const b: Vec3 = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
        return { origin: a, dir: vec3.normalize(vec3.sub(b, a)) };
    }
}
