import { vec3, type Vec3 } from '../core/math.js';
import type { Piece } from '../puzzle/piece.js';
import { LINE_LIFT } from './renderer.js';
import { CurveBatch, LineBatch, SpriteBatch, SpriteKind, type RGBA } from './batches.js';

const DAY: RGBA = [1.0, 0.8, 0.26, 1];
const NIGHT: RGBA = [0.34, 0.58, 1.0, 1];
const STAR: RGBA = [1, 1, 1, 1];
const RAY: RGBA = [0.78, 1.0, 0.92, 0.95];
const AXES: { dir: Vec3; color: RGBA }[] = [
    { dir: [1, 0, 0], color: [1.0, 0.38, 0.47, 1] },
    { dir: [0, 1, 0], color: [0.46, 1.0, 0.7, 1] },
    { dir: [0, 0, 1], color: [0.7, 0.55, 1.0, 1] },
];
const AXIS_LENGTH = 1.75;
const TRAIL_SAMPLES = 18;
const TRAIL_HOURS = 0.07;

const withAlpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], c[3] * a];
const mixColor = (a: RGBA, b: RGBA, t: number): RGBA => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
];

export interface SceneOptions {
    selectedId: number | null;
    showCenterRays: boolean;
    loopHours: number;
    seconds: number;
    dpr: number;
}

/** Fill the per-frame batches: axes, piece outlines, stars and center rays. */
export function buildScene(
    pieces: readonly Piece[],
    lines: LineBatch,
    curves: CurveBatch,
    sprites: SpriteBatch,
    o: SceneOptions
): void {
    lines.clear();
    curves.clear();
    sprites.clear();
    const px = (n: number) => n * o.dpr;

    for (const axis of AXES) {
        const tip = vec3.scale(axis.dir, AXIS_LENGTH);
        lines.push(vec3.scale(tip, -1), [0, 0, 0], {
            width: px(1.4),
            glow: px(4),
            colorA: withAlpha(axis.color, 0.08),
            colorB: withAlpha(axis.color, 0.45),
            glowStrength: 0.6,
        });
        lines.push([0, 0, 0], tip, {
            width: px(1.8),
            glow: px(6),
            colorA: withAlpha(axis.color, 0.55),
            colorB: axis.color,
            endCap: true,
            glowStrength: 0.9,
        });
        sprites.push(tip, px(9), axis.color, SpriteKind.Dot, 0, 1.4);
    }
    sprites.push([0, 0, 0], px(8), [0.9, 0.95, 1, 1], SpriteKind.Dot, 0, 1.2);

    for (const piece of pieces) {
        const selected = piece.id === o.selectedId;
        const radius = piece.r * LINE_LIFT;
        const world = piece.path.map(p => piece.toWorld(p, radius));
        // one continuous curve per outline; the selected piece is just brighter
        const shade = selected ? 1 : 0.68;
        curves.pushLoop(world, px(2), i => {
            const c = piece.pathDay[i] ? DAY : NIGHT;
            return [c[0] * shade, c[1] * shade, c[2] * shade, 1];
        });

        // the star and its fading trail
        for (let k = TRAIL_SAMPLES; k >= 1; k--) {
            const sample = piece.starAt(o.loopHours - k * TRAIL_HOURS);
            const fade = 1 - k / (TRAIL_SAMPLES + 1);
            const tint = mixColor(sample.day ? DAY : NIGHT, STAR, fade * 0.8);
            sprites.push(
                piece.toWorld(sample.dir, radius),
                px(3 + 7 * fade),
                withAlpha(tint, fade * fade),
                SpriteKind.Dot,
                0,
                0.9
            );
        }
        const star = piece.starAt(o.loopHours);
        const twinkle = 1 + 0.15 * Math.sin(o.seconds * 9 + piece.id);
        sprites.push(
            piece.toWorld(star.dir, radius),
            px(selected ? 30 : 24) * twinkle,
            STAR,
            SpriteKind.Star,
            o.seconds * 0.8 + piece.id,
            1.25
        );

        if (o.showCenterRays) {
            const surface = piece.toWorld(piece.center, radius);
            const tip = piece.toWorld(piece.center, radius + 0.45);
            lines.push([0, 0, 0], tip, {
                width: px(1.6),
                glow: px(5),
                colorA: withAlpha(RAY, 0.25),
                colorB: RAY,
                dash: px(9),
                endCap: true,
                glowStrength: 0.8,
            });
            sprites.push(surface, px(10), RAY, SpriteKind.Dot, 0, 1.6);
        }
    }
}

/** Key light that follows the camera: above, slightly left of the viewer. */
export function cameraLight(eye: Vec3, right: Vec3): Vec3 {
    const toEye = vec3.normalize(eye);
    return vec3.normalize(vec3.add(vec3.add(vec3.scale(toEye, 0.65), vec3.scale(right, -0.45)), [0, 0.7, 0]));
}
