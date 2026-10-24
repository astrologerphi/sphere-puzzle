import type { Vec3 } from '../core/math.js';

export type RGBA = [number, number, number, number];

/** Growable Float32 staging array for per-instance GPU data. */
class InstanceBatch {
    data: Float32Array;
    count = 0;

    constructor(
        readonly floatsPerInstance: number,
        capacity = 256
    ) {
        this.data = new Float32Array(capacity * floatsPerInstance);
    }

    clear(): void {
        this.count = 0;
    }

    protected reserve(): number {
        const offset = this.count * this.floatsPerInstance;
        if (offset + this.floatsPerInstance > this.data.length) {
            const grown = new Float32Array(this.data.length * 2);
            grown.set(this.data);
            this.data = grown;
        }
        this.count++;
        return offset;
    }

    get byteLength(): number {
        return this.count * this.floatsPerInstance * 4;
    }
}

export interface LineStyle {
    width: number;
    glow: number;
    colorA: RGBA;
    colorB?: RGBA;
    dash?: number;
    endCap?: boolean;
    glowStrength?: number;
}

/** Matches the instance layout in line.wgsl (5 x vec4f). */
export class LineBatch extends InstanceBatch {
    static readonly FLOATS = 20;

    constructor() {
        super(LineBatch.FLOATS, 1024);
    }

    push(a: Vec3, b: Vec3, style: LineStyle): void {
        const o = this.reserve();
        const d = this.data;
        const colorB = style.colorB ?? style.colorA;
        d[o] = a[0];
        d[o + 1] = a[1];
        d[o + 2] = a[2];
        d[o + 3] = style.width;
        d[o + 4] = b[0];
        d[o + 5] = b[1];
        d[o + 6] = b[2];
        d[o + 7] = style.glow;
        d.set(style.colorA, o + 8);
        d.set(colorB, o + 12);
        d[o + 16] = style.dash ?? 0;
        d[o + 17] = style.endCap ? 1 : 0;
        d[o + 18] = style.glowStrength ?? 1;
        d[o + 19] = 0;
    }
}

export const SpriteKind = { Star: 0, Dot: 1 } as const;
export type SpriteKind = (typeof SpriteKind)[keyof typeof SpriteKind];

/** Matches the instance layout in sprite.wgsl (3 x vec4f). */
export class SpriteBatch extends InstanceBatch {
    static readonly FLOATS = 12;

    constructor() {
        super(SpriteBatch.FLOATS, 128);
    }

    push(position: Vec3, size: number, color: RGBA, kind: SpriteKind, rotation = 0, intensity = 1): void {
        const o = this.reserve();
        const d = this.data;
        d[o] = position[0];
        d[o + 1] = position[1];
        d[o + 2] = position[2];
        d[o + 3] = size;
        d.set(color, o + 4);
        d[o + 8] = kind;
        d[o + 9] = rotation;
        d[o + 10] = intensity;
        d[o + 11] = 0;
    }
}
