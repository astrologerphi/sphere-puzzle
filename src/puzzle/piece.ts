import {
    DEG,
    angleBetween,
    clamp,
    quat,
    slerpDir,
    sphericalToCartesian,
    vec3,
    type Quat,
    type Vec3,
} from '../core/math.js';
import type { Shape } from './shapes.js';

/** Hours in a full loop; [0, 12) is day time, [12, 24) is night time. */
export const DAY_LENGTH = 24;
const ARC_STEP = 2 * DEG;
const CAP_MARGIN = 4 * DEG;

export interface Edge {
    t0: number;
    t1: number;
    a: Vec3;
    b: Vec3;
    day: boolean;
}

/** Fraction that the display state moves toward the target state per second (exponential smoothing). */
const SMOOTHING = 16;

/**
 * A puzzle piece built from a Shape. All geometry is kept in the shape's original (local) frame;
 * the current placement is `orientation` (rotation) and `r` (radial distance).
 */
export class Piece {
    readonly edges: Edge[] = [];
    /** Closed polyline (unit directions) tracing the slerp edges; segment i joins path[i] and path[i + 1]. */
    readonly path: Vec3[] = [];
    /** Whether segment i of `path` belongs to a day-time edge. */
    readonly pathDay: boolean[] = [];
    readonly vertices: Vec3[];
    readonly center: Vec3;
    /** Length of the arc-weighted outline sum behind `center`; weights this piece in a group's center. */
    readonly centerWeight: number;
    readonly basisU: Vec3;
    readonly basisV: Vec3;
    /** `path` stereographically projected from the antipode of `center` (x, y pairs). */
    readonly stereo: Float32Array;
    /** Angular radius of the smallest cap around `center` containing the piece, plus a margin. */
    readonly capAngle: number;

    orientation: Quat = quat.identity();
    targetOrientation: Quat = quat.identity();
    r: number;
    targetR: number;

    constructor(
        readonly id: number,
        readonly name: string,
        readonly shape: Shape
    ) {
        this.r = this.targetR = shape.r;

        const entries = Object.keys(shape)
            .filter(key => key !== 'r')
            .map(key => ({ time: Number(key), vertex: shape[Number(key)]! }))
            .sort((a, b) => a.time - b.time);

        this.vertices = entries.map(e => sphericalToCartesian(e.vertex.theta, e.vertex.phi));

        for (let i = 0; i < entries.length; i++) {
            const next = (i + 1) % entries.length;
            const t0 = entries[i]!.time;
            const t1 = next === 0 ? entries[0]!.time + DAY_LENGTH : entries[next]!.time;
            const a = this.vertices[i]!;
            const b = this.vertices[next]!;
            const day = t0 < DAY_LENGTH / 2;
            this.edges.push({ t0, t1, a, b, day });

            const steps = Math.max(1, Math.ceil(angleBetween(a, b) / ARC_STEP));
            for (let k = 0; k < steps; k++) {
                this.path.push(slerpDir(a, b, k / steps));
                this.pathDay.push(day);
            }
        }

        [this.center, this.centerWeight] = this.computeCenter();
        this.basisU = vec3.perpendicular(this.center);
        this.basisV = vec3.cross(this.center, this.basisU);

        this.stereo = new Float32Array(this.path.length * 2);
        let maxAngle = 0;
        this.path.forEach((p, i) => {
            const [x, y] = this.project(p);
            this.stereo[i * 2] = x;
            this.stereo[i * 2 + 1] = y;
            maxAngle = Math.max(maxAngle, angleBetween(p, this.center));
        });
        this.capAngle = clamp(maxAngle + CAP_MARGIN, 6 * DEG, Math.PI);
    }

    /** Arc-length weighted mean direction of the outline, and the length of that weighted sum. */
    private computeCenter(): [Vec3, number] {
        let sum: Vec3 = [0, 0, 0];
        const n = this.path.length;
        for (let i = 0; i < n; i++) {
            const a = this.path[i]!;
            const b = this.path[(i + 1) % n]!;
            const len = angleBetween(a, b);
            sum = vec3.add(sum, vec3.scale(vec3.normalize(vec3.add(a, b)), len));
        }
        const weight = vec3.length(sum);
        if (weight < 1e-6) {
            sum = this.vertices.reduce<Vec3>((acc, v) => vec3.add(acc, v), [0, 0, 0]);
        }
        return [vec3.length(sum) < 1e-6 ? this.vertices[0]! : vec3.normalize(sum), Math.max(weight, 1e-3)];
    }

    /** Stereographic projection (from -center) of a local unit direction. */
    project(p: Vec3): [number, number] {
        const denom = Math.max(1 + vec3.dot(p, this.center), 1e-5);
        return [vec3.dot(p, this.basisU) / denom, vec3.dot(p, this.basisV) / denom];
    }

    /** Non-zero winding test of a local direction against the outline (mirrors piece.wgsl). */
    containsLocal(dir: Vec3): boolean {
        const [px, py] = this.project(vec3.normalize(dir));
        const s = this.stereo;
        const n = this.path.length;
        let winding = 0;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = s[i * 2]!,
                ay = s[i * 2 + 1]!;
            const bx = s[j * 2]!,
                by = s[j * 2 + 1]!;
            const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
            if (ay <= py) {
                if (by > py && side > 0) winding++;
            } else if (by <= py && side < 0) {
                winding--;
            }
        }
        return winding !== 0;
    }

    /** Local position of the star at loop time `hours` (0 ≤ hours < 24). */
    starAt(hours: number): { dir: Vec3; day: boolean } {
        const t = ((hours % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
        for (const edge of this.edges) {
            if (t >= edge.t0 && t < edge.t1) {
                const span = edge.t1 - edge.t0;
                return { dir: slerpDir(edge.a, edge.b, span > 0 ? (t - edge.t0) / span : 0), day: edge.day };
            }
        }
        const first = this.edges[0]!;
        return { dir: first.a, day: first.day };
    }

    /** World-space center direction for the given (default: target) orientation. */
    worldCenter(orientation: Quat = this.targetOrientation): Vec3 {
        return quat.rotate(orientation, this.center);
    }

    toWorld(dir: Vec3, radius = this.r): Vec3 {
        return vec3.scale(quat.rotate(this.orientation, dir), radius);
    }

    toLocal(dir: Vec3): Vec3 {
        return quat.rotate(quat.conjugate(this.orientation), dir);
    }

    /** Pre-multiply a world-space rotation onto the target orientation. */
    applyRotation(rotation: Quat): void {
        this.targetOrientation = quat.normalize(quat.multiply(rotation, this.targetOrientation));
    }

    /** Ease the displayed state toward the target state. Returns true while still moving. */
    animate(dt: number): boolean {
        const k = 1 - Math.exp(-SMOOTHING * dt);
        this.orientation = quat.slerp(this.orientation, this.targetOrientation, k);
        this.r += (this.targetR - this.r) * k;
        const d = Math.abs(
            this.orientation[0] * this.targetOrientation[0] +
                this.orientation[1] * this.targetOrientation[1] +
                this.orientation[2] * this.targetOrientation[2] +
                this.orientation[3] * this.targetOrientation[3]
        );
        return d < 0.9999999 || Math.abs(this.targetR - this.r) > 1e-4;
    }
}

/**
 * Center direction of several pieces treated as one shape: the arc-length weighted mean of their
 * combined outlines. For a single piece this is exactly `worldCenter()`.
 */
export function groupCenter(pieces: readonly Piece[]): Vec3 {
    let sum: Vec3 = [0, 0, 0];
    for (const piece of pieces) sum = vec3.add(sum, vec3.scale(piece.worldCenter(), piece.centerWeight));
    return vec3.length(sum) < 1e-6 ? pieces[0]!.worldCenter() : vec3.normalize(sum);
}
