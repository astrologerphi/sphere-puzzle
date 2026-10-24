import type { Shape, Vertex } from './shapes.js';

export const MIN_R = 0.5;
export const MAX_R = 2;
export const DEFAULT_R = 1;

export type ValidationResult = { ok: true; shape: Shape; notes: string[] } | { ok: false; error: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Parse user-supplied JSON into a Shape, applying the add-shape rules:
 * 1. r is clamped into [0.5, 2] and defaults to 1 when missing.
 * 2. the shape must contain a vertex at time 0 and at time 12.
 */
export function parseShapeJson(text: string): ValidationResult {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (error) {
        return { ok: false, error: `Invalid JSON — ${(error as Error).message}` };
    }
    if (!isPlainObject(data)) {
        return { ok: false, error: 'The shape must be a JSON object like { "r": 1, "0": { "theta": …, "phi": … } }.' };
    }

    const notes: string[] = [];
    const vertices = new Map<number, Vertex>();
    let r = DEFAULT_R;

    for (const [key, value] of Object.entries(data)) {
        if (key === 'r') {
            if (!isFiniteNumber(value)) return { ok: false, error: '"r" must be a finite number.' };
            if (value < MIN_R) {
                r = MIN_R;
                notes.push(`r = ${value} is below ${MIN_R}; changed to ${MIN_R}.`);
            } else if (value > MAX_R) {
                r = MAX_R;
                notes.push(`r = ${value} is above ${MAX_R}; changed to ${MAX_R}.`);
            } else {
                r = value;
            }
            continue;
        }

        const time = key.trim() === '' ? NaN : Number(key);
        if (!Number.isFinite(time)) {
            return { ok: false, error: `Unexpected key "${key}". Keys must be "r" or a time between 0 and 24.` };
        }
        if (time < 0 || time > 24) {
            return { ok: false, error: `Time "${key}" is out of range; times must satisfy 0 ≤ time ≤ 24.` };
        }
        if (vertices.has(time)) {
            return { ok: false, error: `Time ${time} is defined more than once.` };
        }
        if (!isPlainObject(value) || !isFiniteNumber(value.theta) || !isFiniteNumber(value.phi)) {
            return { ok: false, error: `Vertex at time "${key}" must be an object with numeric "theta" and "phi".` };
        }
        vertices.set(time, { theta: value.theta, phi: value.phi });
    }

    if (!('r' in data)) notes.push(`r is missing; using the default r = ${DEFAULT_R}.`);

    const missing = [0, 12].filter(t => !vertices.has(t));
    if (missing.length > 0) {
        return {
            ok: false,
            error: `A shape needs a vertex at time 0 and at time 12 (missing: ${missing.join(', ')}).`,
        };
    }

    const shape = { r } as Shape;
    for (const [time, vertex] of vertices) shape[time] = vertex;
    return { ok: true, shape, notes };
}
