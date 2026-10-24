import type { Quat } from '../core/math.js';
import type { CameraView, OrbitCamera } from '../render/camera.js';
import { DEFAULT_SHAPES } from './shapes.js';
import type { PuzzleStore } from './store.js';
import { parseShapeJson } from './validate.js';

const STORAGE_KEY = 'sphere-puzzle:v1';
const VERSION = 1;
const SAVE_DELAY_MS = 250;
const CAMERA_POLL_MS = 1000;

interface SavedPiece {
    name: string;
    shape: unknown;
    orientation: Quat;
    r: number;
}

interface SavedState {
    version: number;
    pieces: SavedPiece[];
    showCenterRays: boolean;
    camera?: CameraView;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function readStorage(): unknown {
    try {
        const text = localStorage.getItem(STORAGE_KEY);
        return text === null ? null : JSON.parse(text);
    } catch (error) {
        console.warn('Ignoring unreadable saved puzzle state:', error);
        return null;
    }
}

function parseCamera(value: unknown): CameraView | null {
    if (!isRecord(value)) return null;
    const { yaw, pitch, distance } = value;
    return isFiniteNumber(yaw) && isFiniteNumber(pitch) && isFiniteNumber(distance) ? { yaw, pitch, distance } : null;
}

/**
 * Load the saved puzzle into the store (falling back to the default shapes when nothing valid
 * is saved), then keep localStorage in sync with every change.
 */
export function setupPersistence(store: PuzzleStore, camera: OrbitCamera): void {
    const saved = readStorage();
    let restored = false;

    if (isRecord(saved) && saved.version === VERSION && Array.isArray(saved.pieces)) {
        restored = true;
        for (const entry of saved.pieces as unknown[]) {
            if (!isRecord(entry) || typeof entry.name !== 'string') continue;
            // saved shapes go through the same checks as user input, so corrupt entries are skipped
            const result = parseShapeJson(JSON.stringify(entry.shape ?? null));
            const { orientation, r } = entry;
            if (!result.ok || !Array.isArray(orientation) || orientation.length !== 4) continue;
            if (!orientation.every(isFiniteNumber) || !isFiniteNumber(r)) continue;
            store.add(entry.name, result.shape, { orientation: orientation as Quat, r });
        }
        if (saved.showCenterRays === true) store.setShowCenterRays(true);
        const view = parseCamera(saved.camera);
        if (view) camera.restoreView(view);
    }
    if (!restored) {
        for (const [name, shape] of Object.entries(DEFAULT_SHAPES)) store.add(name, shape);
    }

    let lastWritten = '';
    const save = () => {
        const state: SavedState = {
            version: VERSION,
            pieces: store.pieces.map(piece => ({
                name: piece.name,
                shape: piece.shape,
                orientation: piece.targetOrientation,
                r: piece.targetR,
            })),
            showCenterRays: store.showCenterRays,
            camera: camera.viewState,
        };
        const text = JSON.stringify(state);
        if (text === lastWritten) return;
        try {
            localStorage.setItem(STORAGE_KEY, text);
            lastWritten = text;
        } catch (error) {
            console.warn('Could not save puzzle state:', error);
        }
    };

    let timer = 0;
    store.subscribe(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(save, SAVE_DELAY_MS);
    });
    // the camera has no change events; poll it cheaply (save() skips identical states)
    window.setInterval(save, CAMERA_POLL_MS);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') save();
    });
    save();
}
