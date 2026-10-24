import { DEG, clamp, quat, vec3, type Quat, type Vec3 } from '../core/math.js';
import { Piece } from './piece.js';
import type { Shape } from './shapes.js';
import { MAX_R, MIN_R } from './validate.js';

/** 'structure': pieces added/removed, selection or options changed. 'transform': a piece moved. */
export type ChangeKind = 'structure' | 'transform';
type Listener = (kind: ChangeKind) => void;

const MIN_POLAR = 0.5 * DEG;
const Y_AXIS: Vec3 = [0, 1, 0];

/** Observable puzzle state shared by the shape list, the input controller and the renderer. */
export class PuzzleStore {
    private nextId = 1;
    private listeners = new Set<Listener>();
    readonly pieces: Piece[] = [];
    selectedId: number | null = null;
    showCenterRays = false;

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(kind: ChangeKind = 'structure'): void {
        for (const listener of this.listeners) listener(kind);
    }

    get selected(): Piece | null {
        return this.pieces.find(p => p.id === this.selectedId) ?? null;
    }

    uniqueName(base: string): string {
        const trimmed = base.trim() || `shape${this.pieces.length + 1}`;
        const names = new Set(this.pieces.map(p => p.name));
        if (!names.has(trimmed)) return trimmed;
        let i = 2;
        while (names.has(`${trimmed}-${i}`)) i++;
        return `${trimmed}-${i}`;
    }

    /** Add a piece; `placement` restores a saved orientation and radial distance without animating. */
    add(name: string, shape: Shape, placement?: { orientation: Quat; r: number }): Piece {
        const piece = new Piece(this.nextId++, this.uniqueName(name), shape);
        if (placement) {
            piece.orientation = piece.targetOrientation = quat.normalize(placement.orientation);
            piece.r = piece.targetR = clamp(placement.r, MIN_R, MAX_R);
        }
        this.pieces.push(piece);
        this.emit();
        return piece;
    }

    remove(id: number): void {
        const index = this.pieces.findIndex(p => p.id === id);
        if (index < 0) return;
        this.pieces.splice(index, 1);
        if (this.selectedId === id) this.selectedId = null;
        this.emit();
    }

    select(id: number | null): void {
        if (this.selectedId === id) return;
        this.selectedId = id;
        this.emit();
    }

    toggleSelect(id: number): void {
        this.select(this.selectedId === id ? null : id);
    }

    setShowCenterRays(show: boolean): void {
        this.showCenterRays = show;
        this.emit();
    }

    /** Move along the latitude circle (changes longitude). Positive = eastward (increasing φ). */
    moveLongitude(piece: Piece, angle: number): void {
        piece.applyRotation(quat.fromAxisAngle(Y_AXIS, angle));
        this.emit('transform');
    }

    /** Move along the meridian (changes latitude). Positive = toward the north pole. Clamped at the poles. */
    moveLatitude(piece: Piece, angle: number): void {
        const c = piece.worldCenter();
        const polar = Math.acos(clamp(c[1], -1, 1));
        const nextPolar = clamp(polar - angle, MIN_POLAR, Math.PI - MIN_POLAR);
        const delta = polar - nextPolar;
        if (Math.abs(delta) < 1e-9) return;
        let axis = vec3.cross(c, Y_AXIS);
        if (vec3.length(axis) < 1e-9) axis = [1, 0, 0];
        piece.applyRotation(quat.fromAxisAngle(axis, delta));
        this.emit('transform');
    }

    /** Spin the piece around its own center ray. Positive = counter-clockwise seen from outside. */
    spin(piece: Piece, angle: number): void {
        piece.applyRotation(quat.fromAxisAngle(piece.worldCenter(), angle));
        this.emit('transform');
    }

    setRadius(piece: Piece, r: number): void {
        piece.targetR = clamp(r, MIN_R, MAX_R);
        this.emit('transform');
    }
}
