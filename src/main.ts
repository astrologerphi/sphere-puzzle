import { DEG, cartesianToSpherical } from './core/math.js';
import { InputController } from './input.js';
import { ShapeEditor, byId, type Notify } from './puzzle/editor.js';
import { DAY_LENGTH } from './puzzle/piece.js';
import { setupPersistence } from './puzzle/persistence.js';

import { LOOP_DURATION } from './puzzle/shapes.js';
import { PuzzleStore } from './puzzle/store.js';
import { MAX_R, MIN_R } from './puzzle/validate.js';
import { CurveBatch, LineBatch, SpriteBatch } from './render/batches.js';
import { OrbitCamera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { buildScene, cameraLight } from './render/scene.js';

const MAX_DPR = 2;
/** High refresh displays (120/144/165 Hz) would otherwise redraw the scene far more often than needed. */
const FRAME_INTERVAL = 1000 / 60;

function createToast(): Notify {
    const el = byId<HTMLElement>('toast');
    let timer = 0;
    return (message, tone = 'info') => {
        el.textContent = message;
        el.dataset.tone = tone;
        el.classList.remove('is-visible');
        void el.offsetWidth; // restart the entrance transition
        el.classList.add('is-visible');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => el.classList.remove('is-visible'), tone === 'info' ? 2600 : 4800);
    };
}

function bindHud(store: PuzzleStore): void {
    const panel = byId<HTMLElement>('sphere-panel');
    const readout = byId<HTMLElement>('readout');
    const name = byId<HTMLElement>('readout-name');
    const theta = byId<HTMLElement>('readout-theta');
    const phi = byId<HTMLElement>('readout-phi');
    const radius = byId<HTMLElement>('readout-r');
    const meter = byId<HTMLProgressElement>('readout-meter');
    meter.max = MAX_R - MIN_R;

    const refresh = () => {
        const piece = store.selected;
        panel.dataset.mode = piece ? 'piece' : 'scene';
        readout.hidden = !piece;
        if (!piece) return;
        const s = cartesianToSpherical(piece.worldCenter());
        name.textContent = piece.name;
        theta.textContent = `${(s.theta / DEG).toFixed(1)}°`;
        phi.textContent = `${(s.phi / DEG).toFixed(1)}°`;
        radius.textContent = piece.targetR.toFixed(2);
        meter.value = piece.targetR - MIN_R;
    };
    store.subscribe(refresh);
    refresh();
}

function createClock(): (hours: number) => void {
    const panel = byId<HTMLElement>('sphere-panel');
    const time = byId<HTMLElement>('clock-time');
    const phase = byId<HTMLElement>('clock-phase');
    let lastText = '';
    return hours => {
        const h = Math.floor(hours);
        const m = Math.floor((hours - h) * 60);
        const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (text !== lastText) {
            time.textContent = text;
            lastText = text;
        }
        const label = hours < DAY_LENGTH / 2 ? 'day' : 'night';
        if (panel.dataset.phase !== label) {
            panel.dataset.phase = label;
            phase.textContent = label;
        }
    };
}

async function main(): Promise<void> {
    const store = new PuzzleStore();
    const camera = new OrbitCamera();
    setupPersistence(store, camera);

    const notify = createToast();
    const editor = new ShapeEditor(store, notify);
    const canvas = byId<HTMLCanvasElement>('scene-canvas');
    const input = new InputController(canvas, camera, store, editor);
    bindHud(store);
    const updateClock = createClock();
    byId('reset-view-btn').addEventListener('click', () => camera.reset());

    let renderer: Renderer;
    try {
        renderer = await Renderer.create(canvas);
    } catch (error) {
        byId('gpu-error').hidden = false;
        byId('gpu-error-detail').textContent = (error as Error).message;
        console.error(error);
        return;
    }

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        camera.aspect = width / height;
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    const lines = new LineBatch();
    const curves = new CurveBatch();
    const sprites = new SpriteBatch();
    const start = performance.now();
    let last = start;
    let nextFrame = start;

    const frame = (now: number) => {
        requestAnimationFrame(frame);
        // small tolerance so a 60 Hz display, whose vsync jitters around the interval, never skips frames
        if (now < nextFrame - 2) return;
        nextFrame += FRAME_INTERVAL;
        if (nextFrame < now) nextFrame = now + FRAME_INTERVAL;
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const seconds = (now - start) / 1000;
        const loopHours = (((now - start) % LOOP_DURATION) / LOOP_DURATION) * DAY_LENGTH;

        camera.update(dt);

        input.update(dt, now);
        for (const piece of store.pieces) piece.animate(dt);

        buildScene(store.pieces, lines, curves, sprites, {
            selectedId: store.selectedId,
            showCenterRays: store.showCenterRays,
            loopHours,
            seconds,
            dpr: canvas.width / Math.max(canvas.clientWidth, 1),
        });
        renderer.render({
            camera,
            pieces: store.pieces,
            selectedId: store.selectedId,
            lines,
            curves,
            sprites,
            seconds,
            loopHours,
            light: cameraLight(camera.eye, camera.right),
        });
        updateClock(loopHours);
    };
    requestAnimationFrame(frame);
}

main().catch(error => console.error(error));
