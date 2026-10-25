import { DEG } from '../core/math.js';
import { DAY_LENGTH, type Piece } from './piece.js';
import type { Shape } from './shapes.js';
import type { ChangeKind, PuzzleStore } from './store.js';
import { parseShapeJson } from './validate.js';

export type Notify = (message: string, tone?: 'info' | 'warn' | 'error') => void;

const EXAMPLE_SHAPE: Shape = {
    r: 1.3,
    0: { theta: 0.6, phi: 0.2 },
    3: { theta: 0.95, phi: 0.55 },
    6: { theta: 1.25, phi: 0.25 },
    9: { theta: 1.1, phi: -0.25 },
    12: { theta: 0.8, phi: -0.35 },
    18: { theta: 0.55, phi: -0.15 },
};

export function byId<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
}

/** The left panel: shape list, selection, removal and the "Add shape" dialog. */
export class ShapeEditor {
    private readonly list = byId<HTMLUListElement>('shape-list');
    private readonly template = byId<HTMLTemplateElement>('shape-item-template');
    private readonly rowTemplate = byId<HTMLTemplateElement>('vertex-row-template');
    private readonly emptyState = byId<HTMLElement>('empty-state');
    private readonly count = byId<HTMLElement>('shape-count');
    private readonly dialog = byId<HTMLDialogElement>('add-dialog');
    private readonly form = byId<HTMLFormElement>('add-form');
    private readonly nameInput = byId<HTMLInputElement>('shape-name-input');
    private readonly jsonInput = byId<HTMLTextAreaElement>('shape-json-input');
    private readonly error = byId<HTMLElement>('add-error');
    private readonly rayToggle = byId<HTMLInputElement>('center-ray-toggle');
    private readonly cards = new Map<number, HTMLLIElement>();

    constructor(
        private readonly store: PuzzleStore,
        private readonly notify: Notify
    ) {
        byId('add-shape-btn').addEventListener('click', () => this.openDialog());
        byId('add-cancel-btn').addEventListener('click', () => this.dialog.close());
        byId('insert-example-btn').addEventListener('click', () => {
            this.jsonInput.value = JSON.stringify(EXAMPLE_SHAPE, null, 4);
            this.clearError();
            this.jsonInput.focus();
        });
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.submit();
        });
        this.jsonInput.addEventListener('input', () => this.clearError());
        this.jsonInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.submit();
            }
        });
        this.rayToggle.addEventListener('change', () => this.store.setShowCenterRays(this.rayToggle.checked));

        store.subscribe(kind => this.onChange(kind));
        this.renderList();
    }

    get isDialogOpen(): boolean {
        return this.dialog.open;
    }

    private onChange(kind: ChangeKind): void {
        if (kind === 'structure') this.renderList();
        else this.refreshMeta();
    }

    private renderList(): void {
        const { pieces, selectedId } = this.store;
        const alive = new Set(pieces.map(p => p.id));

        for (const [id, card] of this.cards) {
            if (!alive.has(id)) {
                card.remove();
                this.cards.delete(id);
            }
        }

        pieces.forEach((piece, index) => {
            let card = this.cards.get(piece.id);
            if (!card) {
                card = this.createCard(piece);
                this.cards.set(piece.id, card);
            }
            if (this.list.children[index] !== card) this.list.insertBefore(card, this.list.children[index] ?? null);
            const selected = piece.id === selectedId;
            const wasSelected = card.classList.contains('is-selected');
            card.classList.toggle('is-selected', selected);
            card.setAttribute('aria-selected', String(selected));
            if (selected && !wasSelected) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });

        this.count.textContent = String(pieces.length);
        this.emptyState.hidden = pieces.length > 0;
        this.rayToggle.checked = this.store.showCenterRays;
        this.refreshMeta();
    }

    private refreshMeta(): void {
        for (const piece of this.store.pieces) {
            const radius = this.cards.get(piece.id)?.querySelector('[data-field="radius"]');
            const text = `r ${piece.targetR.toFixed(2)}`;
            if (radius && radius.textContent !== text) radius.textContent = text;
        }
    }

    private createCard(piece: Piece): HTMLLIElement {
        const fragment = this.template.content.cloneNode(true) as DocumentFragment;
        const card = fragment.querySelector<HTMLLIElement>('.shape-card')!;
        card.dataset.id = String(piece.id);
        card.querySelector('.shape-card__name')!.textContent = piece.name;
        card.querySelector('[data-field="vertices"]')!.textContent = `${piece.vertices.length} vertices`;
        drawPreview(card.querySelector<HTMLCanvasElement>('.shape-card__preview')!, piece);
        this.fillVertexTable(card.querySelector('tbody')!, piece);

        const details = card.querySelector<HTMLElement>('.shape-card__details')!;
        details.id = `shape-details-${piece.id}`;
        // reading the table should not toggle the selection
        details.addEventListener('click', event => event.stopPropagation());
        const expand = card.querySelector<HTMLButtonElement>('.shape-card__expand')!;
        expand.setAttribute('aria-controls', details.id);
        expand.addEventListener('click', event => {
            event.stopPropagation();
            const expanded = !card.classList.contains('is-expanded');
            card.classList.toggle('is-expanded', expanded);
            details.inert = !expanded;
            expand.setAttribute('aria-expanded', String(expanded));
            const label = expanded ? 'Hide vertices' : 'Show vertices';
            expand.setAttribute('aria-label', label);
            expand.title = label;
        });

        card.addEventListener('click', () => this.store.toggleSelect(piece.id));
        card.addEventListener('keydown', event => {
            // Enter / Space on the card's own buttons activate those buttons instead
            if (event.target !== card) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.store.toggleSelect(piece.id);
            }
        });
        const remove = card.querySelector<HTMLButtonElement>('.shape-card__remove')!;
        remove.setAttribute('aria-label', `Remove ${piece.name}`);
        remove.addEventListener('click', event => {
            event.stopPropagation();
            this.remove(piece);
        });
        return card;
    }

    /** One row per vertex in time order, as defined in the shape JSON. */
    private fillVertexTable(body: HTMLTableSectionElement, piece: Piece): void {
        const times = Object.keys(piece.shape)
            .filter(key => key !== 'r')
            .map(Number)
            .sort((a, b) => a - b);
        times.forEach((time, index) => {
            const vertex = piece.shape[time]!;
            const row = (this.rowTemplate.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement;
            const field = (name: string) => row.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
            row.dataset.phase = time < DAY_LENGTH / 2 ? 'day' : 'night';
            row.querySelector('.vertex-row__index')!.textContent = String(index + 1);
            field('clock').textContent = formatClock(time);
            row.querySelector<HTMLElement>('.vertex-row__time')!.title = `time ${time}`;
            field('theta').textContent = formatDegrees(vertex.theta);
            field('theta-rad').textContent = formatRadians(vertex.theta);
            field('phi').textContent = formatDegrees(vertex.phi);
            field('phi-rad').textContent = formatRadians(vertex.phi);
            body.append(row);
        });
    }

    /** Remove a piece, letting its card play the leave animation first. */
    remove(piece: Piece): void {
        const card = this.cards.get(piece.id);
        if (!card) return;
        if (card.classList.contains('is-leaving')) return;
        card.classList.add('is-leaving');
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            this.store.remove(piece.id);
            this.notify(`Removed ${piece.name}`);
        };
        card.addEventListener('animationend', done, { once: true });
        // fallback when animations are disabled (prefers-reduced-motion)
        window.setTimeout(done, 450);
    }

    private openDialog(): void {
        this.nameInput.value = this.store.uniqueName(`shape${this.store.pieces.length + 1}`);
        this.jsonInput.value = '';
        this.clearError();
        this.dialog.showModal();
        this.jsonInput.focus();
    }

    private clearError(): void {
        this.error.hidden = true;
        this.error.textContent = '';
    }

    private submit(): void {
        const result = parseShapeJson(this.jsonInput.value);
        if (!result.ok) {
            this.error.textContent = result.error;
            this.error.hidden = false;
            this.jsonInput.focus();
            return;
        }
        const piece = this.store.add(this.nameInput.value, result.shape);
        this.store.select(piece.id);
        this.dialog.close();
        const notes = result.notes.length > 0 ? ` — ${result.notes.join(' ')}` : '';
        this.notify(`Added ${piece.name}${notes}`, result.notes.length > 0 ? 'warn' : 'info');
    }
}

/** Shape time (hours, possibly fractional) as a 24 h clock, e.g. 15.08 -> "15:05". */
function formatClock(hours: number): string {
    const minutes = Math.round(hours * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const formatSigned = (value: number, digits: number): string => {
    const text = Math.abs(value).toFixed(digits);
    return Number(text) === 0 ? text : `${value < 0 ? '−' : ''}${text}`;
};

const formatDegrees = (radians: number): string => `${formatSigned(radians / DEG, 1)}°`;
const formatRadians = (radians: number): string => `${formatSigned(radians, 4)} rad`;

/** Mini stereographic outline of the piece, colored with the theme's CSS custom properties. */
function drawPreview(canvas: HTMLCanvasElement, piece: Piece): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;

    const s = piece.stereo;
    const n = piece.path.length;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        minX = Math.min(minX, s[i * 2]!);
        maxX = Math.max(maxX, s[i * 2]!);
        minY = Math.min(minY, s[i * 2 + 1]!);
        maxY = Math.max(maxY, s[i * 2 + 1]!);
    }
    const size = canvas.width;
    const pad = size * 0.16;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const point = (i: number): [number, number] => [
        size / 2 + (s[i * 2]! - cx) * scale,
        size / 2 - (s[i * 2 + 1]! - cy) * scale,
    ];

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const [x, y] = point(i);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color('--fill', '#0b4a32');
    ctx.fill('nonzero');

    ctx.lineWidth = size * 0.035;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const day of [true, false]) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            if (piece.pathDay[i] !== day) continue;
            const [ax, ay] = point(i);
            const [bx, by] = point((i + 1) % n);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
        }
        const stroke = day ? color('--day', '#ffcc42') : color('--night', '#579bff');
        ctx.strokeStyle = stroke;
        ctx.shadowColor = stroke;
        ctx.shadowBlur = size * 0.06;
        ctx.stroke();
    }
}
