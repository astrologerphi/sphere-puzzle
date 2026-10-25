import { DEG, clamp, quat, vec3, type Quat, type Vec3 } from '../core/math.js';
import { Piece, groupCenter } from './piece.js';
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
    /** Ids of the selected pieces; several selected pieces move together as one shape. */
    readonly selectedIds = new Set<number>();
    showCenterRays = false;

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(kind: ChangeKind = 'structure'): void {
        for (const listener of this.listeners) listener(kind);
    }

    /** Selected pieces in list order. */
    get selection(): Piece[] {
        return this.pieces.filter(p => this.selectedIds.has(p.id));
    }

    isSelected(id: number): boolean {
        return this.selectedIds.has(id);
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

    remove(ids: Iterable<number>): void {
        const doomed = new Set(ids);
        const before = this.pieces.length;
        for (let i = this.pieces.length - 1; i >= 0; i--) {
            if (doomed.has(this.pieces[i]!.id)) this.pieces.splice(i, 1);
        }
        for (const id of doomed) this.selectedIds.delete(id);
        if (this.pieces.length !== before) this.emit();
    }

    /** Select only this piece, or clear the selection with null. */
    select(id: number | null): void {
        if (id === null ? this.selectedIds.size === 0 : this.selectedIds.size === 1 && this.selectedIds.has(id)) return;
        this.selectedIds.clear();
        if (id !== null) this.selectedIds.add(id);
        this.emit();
    }

    /** Plain click: select only this piece, or deselect it when it is already the sole selection. */
    toggleSelect(id: number): void {
        this.select(this.selectedIds.size === 1 && this.selectedIds.has(id) ? null : id);
    }

    /** Modifier click: add the piece to the selection or take it out. */
    toggleMember(id: number): void {
        if (!this.selectedIds.delete(id)) this.selectedIds.add(id);
        this.emit();
    }

    setShowCenterRays(show: boolean): void {
        this.showCenterRays = show;
        this.emit();
    }

    /** Rotate every piece by the same world rotation, so a group moves as one rigid shape. */
    private rotate(pieces: readonly Piece[], rotation: Quat): void {
        for (const piece of pieces) piece.applyRotation(rotation);
        this.emit('transform');
    }

    /** Move along the latitude circle (changes longitude). Positive = eastward (increasing φ). */
    moveLongitude(pieces: readonly Piece[], angle: number): void {
        if (pieces.length === 0) return;
        this.rotate(pieces, quat.fromAxisAngle(Y_AXIS, angle));
    }

    /**
     * Move the (group) center along its meridian (changes latitude). Positive = toward the north pole.
     * Clamped at the poles.
     */
    moveLatitude(pieces: readonly Piece[], angle: number): void {
        if (pieces.length === 0) return;
        const c = groupCenter(pieces);
        const polar = Math.acos(clamp(c[1], -1, 1));
        const nextPolar = clamp(polar - angle, MIN_POLAR, Math.PI - MIN_POLAR);
        const delta = polar - nextPolar;
        if (Math.abs(delta) < 1e-9) return;
        let axis = vec3.cross(c, Y_AXIS);
        if (vec3.length(axis) < 1e-9) axis = [1, 0, 0];
        this.rotate(pieces, quat.fromAxisAngle(axis, delta));
    }

    /** Spin around the (group) center ray. Positive = counter-clockwise seen from outside. */
    spin(pieces: readonly Piece[], angle: number): void {
        if (pieces.length === 0) return;
        this.rotate(pieces, quat.fromAxisAngle(groupCenter(pieces), angle));
    }

    /**
     * Change the radial distance of every piece by the same amount. The change is limited so that
     * no piece leaves [MIN_R, MAX_R], which keeps a group's relative radii intact.
     */
    shiftRadius(pieces: readonly Piece[], delta: number): void {
        if (pieces.length === 0) return;
        const low = Math.min(...pieces.map(p => p.targetR));
        const high = Math.max(...pieces.map(p => p.targetR));
        const step = clamp(delta, MIN_R - low, MAX_R - high);
        if (step === 0) return;
        for (const piece of pieces) piece.targetR = clamp(piece.targetR + step, MIN_R, MAX_R);
        this.emit('transform');
    }
}
