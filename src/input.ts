import { DEG, vec3, type Vec3 } from './core/math.js';
import type { ShapeEditor } from './puzzle/editor.js';
import type { Piece } from './puzzle/piece.js';
import type { PuzzleStore } from './puzzle/store.js';
import type { OrbitCamera } from './render/camera.js';
import { FILL_LIFT } from './render/renderer.js';

const TAP_MOVE = 2 * DEG;
const TAP_SPIN = 3 * DEG;
const HOLD_DELAY_MS = 220;
const MOVE_SPEED = 42 * DEG;
const SPIN_SPEED = 70 * DEG;
const CLICK_TOLERANCE_PX = 5;
const RADIUS_PER_WHEEL_PX = 0.0015;

type Action = 'longitude' | 'latitude' | 'spin';

interface HeldKey {
    action: Action;
    sign: number;
    since: number;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Mouse and keyboard handling for the sphere panel. */
export class InputController {
    private readonly held = new Map<string, HeldKey>();
    private pointerId: number | null = null;
    private lastX = 0;
    private lastY = 0;
    private lastMoveTime = 0;
    private travel = 0;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly camera: OrbitCamera,
        private readonly store: PuzzleStore,
        private readonly editor: ShapeEditor
    ) {
        canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
        canvas.addEventListener('pointermove', e => this.onPointerMove(e));
        canvas.addEventListener('pointerup', e => this.onPointerUp(e));
        canvas.addEventListener('pointercancel', e => this.onPointerUp(e));
        canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('keydown', e => this.onKeyDown(e));
        window.addEventListener('keyup', e => this.held.delete(e.key));
        window.addEventListener('blur', () => this.held.clear());
        store.subscribe(() => {
            if (!store.selected) this.held.clear();
        });
    }

    /** Continuous movement while arrow keys are held down. */
    update(dt: number, now: number): void {
        const piece = this.store.selected;
        if (!piece) return;
        for (const key of this.held.values()) {
            if (now - key.since < HOLD_DELAY_MS) continue;
            const speed = key.action === 'spin' ? SPIN_SPEED : MOVE_SPEED;
            this.apply(piece, key.action, key.sign * speed * dt);
        }
    }

    private apply(piece: Piece, action: Action, angle: number): void {
        if (action === 'longitude') this.store.moveLongitude(piece, angle);
        else if (action === 'latitude') this.store.moveLatitude(piece, angle);
        else this.store.spin(piece, angle);
    }

    private isTypingTarget(target: EventTarget | null): boolean {
        return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (this.editor.isDialogOpen || this.isTypingTarget(event.target)) return;
        const piece = this.store.selected;

        if (event.key === 'Escape' && piece) {
            this.store.select(null);
            return;
        }
        if (event.key === 'Delete' && piece) {
            this.editor.remove(piece);
            return;
        }
        if (!piece || !ARROWS.has(event.key)) return;

        event.preventDefault();
        if (event.repeat) return;

        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const positive = event.key === 'ArrowRight' || event.key === 'ArrowUp';
        let action: Action;
        let sign: number;
        if (horizontal && event.shiftKey) {
            // shift + right spins clockwise as seen from outside the sphere
            action = 'spin';
            sign = positive ? -1 : 1;
        } else if (horizontal) {
            action = 'longitude';
            sign = (positive ? 1 : -1) * this.screenRightSign(piece);
        } else {
            action = 'latitude';
            sign = positive ? 1 : -1;
        }

        this.apply(piece, action, sign * (action === 'spin' ? TAP_SPIN : TAP_MOVE));
        this.held.set(event.key, { action, sign, since: performance.now() });
    }

    /**
     * +1 when increasing longitude moves the piece rightward on screen, -1 otherwise.
     * Decided once per key press so holding a key never reverses direction at the limb.
     */
    private screenRightSign(piece: Piece): number {
        const center = piece.worldCenter();
        const eastward = vec3.cross([0, 1, 0], center);
        return vec3.dot(eastward, this.camera.right) < -1e-3 ? -1 : 1;
    }

    private onPointerDown(event: PointerEvent): void {
        if (event.button !== 0 || this.pointerId !== null) return;
        this.pointerId = event.pointerId;
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.classList.add('is-dragging');
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.lastMoveTime = performance.now();
        this.travel = 0;
        this.camera.beginDrag();
    }

    private onPointerMove(event: PointerEvent): void {
        if (event.pointerId !== this.pointerId) return;
        const dx = event.clientX - this.lastX;
        const dy = event.clientY - this.lastY;
        const now = performance.now();
        this.travel += Math.abs(dx) + Math.abs(dy);
        this.camera.drag(dx, dy, (now - this.lastMoveTime) / 1000);
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.lastMoveTime = now;
    }

    private onPointerUp(event: PointerEvent): void {
        if (event.pointerId !== this.pointerId) return;
        this.pointerId = null;
        this.canvas.classList.remove('is-dragging');
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        this.camera.endDrag(performance.now() - this.lastMoveTime);
        if (event.type === 'pointerup' && this.travel < CLICK_TOLERANCE_PX) {
            const hit = this.pick(event.clientX, event.clientY);
            this.store.select(hit ? hit.id : null);
        }
    }

    private onWheel(event: WheelEvent): void {
        event.preventDefault();
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
        const delta = event.deltaY * scale;
        const piece = this.store.selected;
        if (piece) this.store.setRadius(piece, piece.targetR - delta * RADIUS_PER_WHEEL_PX);
        else this.camera.zoom(delta);
    }

    /** Ray-cast against every piece's shell; the base sphere's far wall occludes what lies behind it. */
    private pick(clientX: number, clientY: number): Piece | null {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
        const { origin, dir } = this.camera.ray(ndcX, ndcY);

        const wall = intersectSphere(origin, dir, 1);
        const limit = wall ? wall[1] : Infinity;

        let best: Piece | null = null;
        let bestT = Infinity;
        for (const piece of this.store.pieces) {
            const hits = intersectSphere(origin, dir, piece.r * FILL_LIFT);
            if (!hits) continue;
            for (const t of hits) {
                if (t <= 0 || t > limit || t >= bestT) continue;
                const p = vec3.add(origin, vec3.scale(dir, t));
                if (piece.containsLocal(piece.toLocal(vec3.normalize(p)))) {
                    best = piece;
                    bestT = t;
                    break;
                }
            }
        }
        return best;
    }
}

function intersectSphere(origin: Vec3, dir: Vec3, radius: number): [number, number] | null {
    const b = vec3.dot(origin, dir);
    const c = vec3.dot(origin, origin) - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    return [-b - root, -b + root];
}
