export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = Float32Array;

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const vec3 = {
    add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a: Vec3, b: Vec3): Vec3 => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ],
    length: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
    normalize: (a: Vec3): Vec3 => {
        const len = Math.hypot(a[0], a[1], a[2]);
        return len > 1e-12 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
    },
    /** Any unit vector perpendicular to the unit vector `a`. */
    perpendicular: (a: Vec3): Vec3 => {
        const helper: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        return vec3.normalize(vec3.cross(helper, a));
    },
};

export const quat = {
    identity: (): Quat => [0, 0, 0, 1],
    fromAxisAngle: (axis: Vec3, angle: number): Quat => {
        const n = vec3.normalize(axis);
        const s = Math.sin(angle / 2);
        return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
    },
    multiply: (a: Quat, b: Quat): Quat => [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ],
    conjugate: (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]],
    normalize: (q: Quat): Quat => {
        const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
    },
    rotate: (q: Quat, v: Vec3): Vec3 => {
        const [qx, qy, qz, qw] = q;
        const tx = 2 * (qy * v[2] - qz * v[1]);
        const ty = 2 * (qz * v[0] - qx * v[2]);
        const tz = 2 * (qx * v[1] - qy * v[0]);
        return [
            v[0] + qw * tx + (qy * tz - qz * ty),
            v[1] + qw * ty + (qz * tx - qx * tz),
            v[2] + qw * tz + (qx * ty - qy * tx),
        ];
    },
    slerp: (a: Quat, b: Quat, t: number): Quat => {
        let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        let bb: Quat = b;
        if (d < 0) {
            d = -d;
            bb = [-b[0], -b[1], -b[2], -b[3]];
        }
        if (d > 0.9995) {
            return quat.normalize([
                a[0] + (bb[0] - a[0]) * t,
                a[1] + (bb[1] - a[1]) * t,
                a[2] + (bb[2] - a[2]) * t,
                a[3] + (bb[3] - a[3]) * t,
            ]);
        }
        const omega = Math.acos(d);
        const s = Math.sin(omega);
        const wa = Math.sin((1 - t) * omega) / s;
        const wb = Math.sin(t * omega) / s;
        return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
    },
};

/** Spherical linear interpolation between two unit vectors. */
export function slerpDir(a: Vec3, b: Vec3, t: number): Vec3 {
    const d = clamp(vec3.dot(a, b), -1, 1);
    if (d > 0.999999) {
        return vec3.normalize(vec3.add(vec3.scale(a, 1 - t), vec3.scale(b, t)));
    }
    if (d < -0.999999) {
        // antipodal endpoints: any great circle works, pick a deterministic one
        return quat.rotate(quat.fromAxisAngle(vec3.perpendicular(a), Math.PI * t), a);
    }
    const omega = Math.acos(d);
    const s = Math.sin(omega);
    const wa = Math.sin((1 - t) * omega) / s;
    const wb = Math.sin(t * omega) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(clamp(vec3.dot(a, b), -1, 1));

/**
 * (theta = polar angle measured from +Y, phi = azimuth) to a cartesian unit vector.
 * Increasing phi rotates counter-clockwise when viewed from +Y.
 */
export function sphericalToCartesian(theta: number, phi: number): Vec3 {
    const s = Math.sin(theta);
    return [s * Math.cos(phi), Math.cos(theta), -s * Math.sin(phi)];
}

export function cartesianToSpherical(v: Vec3): { theta: number; phi: number } {
    const n = vec3.normalize(v);
    return { theta: Math.acos(clamp(n[1], -1, 1)), phi: Math.atan2(-n[2], n[0]) };
}

/** Column-major 4x4 matrices targeting WebGPU clip space (z in [0, 1]). */
export const mat4 = {
    perspective: (fovY: number, aspect: number, near: number, far: number): Mat4 => {
        const f = 1 / Math.tan(fovY / 2);
        const m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[10] = far / (near - far);
        m[11] = -1;
        m[14] = (far * near) / (near - far);
        return m;
    },
    lookAt: (eye: Vec3, target: Vec3, up: Vec3): Mat4 => {
        const z = vec3.normalize(vec3.sub(eye, target));
        const x = vec3.normalize(vec3.cross(up, z));
        const y = vec3.cross(z, x);
        const m = new Float32Array(16);
        m[0] = x[0];
        m[1] = y[0];
        m[2] = z[0];
        m[4] = x[1];
        m[5] = y[1];
        m[6] = z[1];
        m[8] = x[2];
        m[9] = y[2];
        m[10] = z[2];
        m[12] = -vec3.dot(x, eye);
        m[13] = -vec3.dot(y, eye);
        m[14] = -vec3.dot(z, eye);
        m[15] = 1;
        return m;
    },
    multiply: (a: Mat4, b: Mat4): Mat4 => {
        const out = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
                out[c * 4 + r] = sum;
            }
        }
        return out;
    },
    invert: (src: Mat4): Mat4 => {
        // Gauss-Jordan elimination with partial pivoting
        const m = Array.from(src);
        const inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        const at = (arr: number[], r: number, c: number) => arr[c * 4 + r]!;
        const set = (arr: number[], r: number, c: number, v: number) => {
            arr[c * 4 + r] = v;
        };
        for (let col = 0; col < 4; col++) {
            let pivot = col;
            for (let r = col + 1; r < 4; r++) {
                if (Math.abs(at(m, r, col)) > Math.abs(at(m, pivot, col))) pivot = r;
            }
            if (pivot !== col) {
                for (let c = 0; c < 4; c++) {
                    const t1 = at(m, col, c);
                    set(m, col, c, at(m, pivot, c));
                    set(m, pivot, c, t1);
                    const t2 = at(inv, col, c);
                    set(inv, col, c, at(inv, pivot, c));
                    set(inv, pivot, c, t2);
                }
            }
            const p = at(m, col, col) || 1e-12;
            for (let c = 0; c < 4; c++) {
                set(m, col, c, at(m, col, c) / p);
                set(inv, col, c, at(inv, col, c) / p);
            }
            for (let r = 0; r < 4; r++) {
                if (r === col) continue;
                const f = at(m, r, col);
                if (f === 0) continue;
                for (let c = 0; c < 4; c++) {
                    set(m, r, c, at(m, r, c) - f * at(m, col, c));
                    set(inv, r, c, at(inv, r, c) - f * at(inv, col, c));
                }
            }
        }
        return new Float32Array(inv);
    },
    transformPoint: (m: Mat4, p: Vec3): [number, number, number, number] => {
        const [x, y, z] = p;
        return [
            m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
            m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
        ];
    },
    /** Rotation (from a unit quaternion) followed by a uniform scale. */
    fromQuatScale: (q: Quat, s: number): Mat4 => {
        const [x, y, z, w] = q;
        const m = new Float32Array(16);
        m[0] = (1 - 2 * (y * y + z * z)) * s;
        m[1] = 2 * (x * y + z * w) * s;
        m[2] = 2 * (x * z - y * w) * s;
        m[4] = 2 * (x * y - z * w) * s;
        m[5] = (1 - 2 * (x * x + z * z)) * s;
        m[6] = 2 * (y * z + x * w) * s;
        m[8] = 2 * (x * z + y * w) * s;
        m[9] = 2 * (y * z - x * w) * s;
        m[10] = (1 - 2 * (x * x + y * y)) * s;
        m[15] = 1;
        return m;
    },
};
