import { mat4, type Vec3 } from '../core/math.js';
import type { Piece } from '../puzzle/piece.js';
import backgroundWgsl from '../shaders/background.wgsl';
import commonWgsl from '../shaders/common.wgsl';
import curveWgsl from '../shaders/curve.wgsl';
import globeWgsl from '../shaders/globe.wgsl';
import lineWgsl from '../shaders/line.wgsl';
import pieceWgsl from '../shaders/piece.wgsl';
import spriteWgsl from '../shaders/sprite.wgsl';
import { CurveBatch, LineBatch, SpriteBatch } from './batches.js';
import type { OrbitCamera } from './camera.js';

const SAMPLE_COUNT = 4;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
const CAMERA_BYTES = 256;
const PIECE_UNIFORM_BYTES = 128;
/** Camera floats that vary with time only (elapsed seconds, loop hours); the cached backdrop ignores them. */
const TIME_FLOATS = new Set([51, 55]);
/** Pieces float just above their nominal radius so they never z-fight with the glass shell. */
export const FILL_LIFT = 1.006;
export const LINE_LIFT = 1.012;

const PREMULTIPLIED: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

interface PieceResources {
    uniform: GPUBuffer;
    outline: GPUBuffer;
    vertices: GPUBuffer;
    indices: GPUBuffer;
    /** Triangles fully inside the outline come first, followed by those crossing it. */
    insideCount: number;
    edgeCount: number;
    bindGroup: GPUBindGroup;
}

export interface FrameState {
    camera: OrbitCamera;
    pieces: readonly Piece[];
    selectedIds: ReadonlySet<number>;
    lines: LineBatch;
    curves: CurveBatch;
    sprites: SpriteBatch;
    seconds: number;
    loopHours: number;
    light: Vec3;
}

export class WebGPUUnavailableError extends Error {}

export class Renderer {
    private readonly cameraBuffer: GPUBuffer;
    private readonly cameraBindGroup: GPUBindGroup;
    private readonly pieceLayout: GPUBindGroupLayout;
    private readonly curveLayout: GPUBindGroupLayout;
    private readonly backdropLayout: GPUBindGroupLayout;
    private readonly pipelines: {
        background: GPURenderPipeline;
        globeBack: GPURenderPipeline;
        backdrop: GPURenderPipeline;
        globeFront: GPURenderPipeline;
        pieceInside: GPURenderPipeline;
        pieceEdge: GPURenderPipeline;
        line: GPURenderPipeline;
        curve: GPURenderPipeline;
        sprite: GPURenderPipeline;
    };
    private readonly pieceResources = new Map<number, PieceResources>();
    private lineBuffer: GPUBuffer | null = null;
    private spriteBuffer: GPUBuffer | null = null;
    private curvePointBuffer: GPUBuffer | null = null;
    private curveRangeBuffer: GPUBuffer | null = null;
    private curveBindGroup: GPUBindGroup | null = null;
    private colorTarget: GPUTexture | null = null;
    private depthTarget: GPUTexture | null = null;
    /** Background + inner globe wall, re-rendered only when the view changes. */
    private backdropTarget: GPUTexture | null = null;
    private backdropBindGroup: GPUBindGroup | null = null;
    private readonly backdropCamera = new Float32Array(CAMERA_BYTES / 4);
    private backdropValid = false;
    private readonly cameraData = new Float32Array(CAMERA_BYTES / 4);
    private readonly pieceData = new Float32Array(PIECE_UNIFORM_BYTES / 4);

    static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
        if (!('gpu' in navigator)) throw new WebGPUUnavailableError('navigator.gpu is not available');
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new WebGPUUnavailableError('No WebGPU adapter found');
        const device = await adapter.requestDevice();
        const context = canvas.getContext('webgpu');
        if (!context) throw new WebGPUUnavailableError('Unable to create a WebGPU canvas context');
        return new Renderer(canvas, device, context);
    }

    private constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly device: GPUDevice,
        private readonly context: GPUCanvasContext
    ) {
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: 'opaque' });

        device.lost.then(info => console.error('WebGPU device lost:', info.message));
        device.addEventListener('uncapturederror', event =>
            console.error('WebGPU error:', (event as GPUUncapturedErrorEvent).error.message)
        );

        const cameraLayout = device.createBindGroupLayout({
            label: 'camera',
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
        });
        this.pieceLayout = device.createBindGroupLayout({
            label: 'piece',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
            ],
        });

        this.curveLayout = device.createBindGroupLayout({
            label: 'curve',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
            ],
        });

        this.cameraBuffer = device.createBuffer({
            label: 'camera',
            size: CAMERA_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.cameraBindGroup = device.createBindGroup({
            layout: cameraLayout,
            entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
        });

        const module = (label: string, code: string) =>
            device.createShaderModule({ label, code: `${commonWgsl}\n${code}` });
        const backgroundModule = module('background', backgroundWgsl);
        const globeModule = module('globe', globeWgsl);
        const pieceModule = module('piece', pieceWgsl);
        const lineModule = module('line', lineWgsl);
        const curveModule = module('curve', curveWgsl);
        const spriteModule = module('sprite', spriteWgsl);

        this.backdropLayout = device.createBindGroupLayout({
            label: 'backdrop',
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
            ],
        });

        const cameraOnly = device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] });
        const withBackdrop = device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.backdropLayout] });
        const withPiece = device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.pieceLayout] });
        const withCurves = device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.curveLayout] });
        const multisample: GPUMultisampleState = { count: SAMPLE_COUNT };

        const depth = (write: boolean, compare: GPUCompareFunction): GPUDepthStencilState => ({
            format: DEPTH_FORMAT,
            depthWriteEnabled: write,
            depthCompare: compare,
        });

        const instanceLayout = (floats: number): GPUVertexBufferLayout => ({
            arrayStride: floats * 4,
            stepMode: 'instance',
            attributes: Array.from({ length: floats / 4 }, (_, i) => ({
                shaderLocation: i,
                offset: i * 16,
                format: 'float32x4' as GPUVertexFormat,
            })),
        });

        const piecePipeline = (entryPoint: string) =>
            device.createRenderPipeline({
                label: `piece-${entryPoint}`,
                layout: withPiece,
                vertex: {
                    module: pieceModule,
                    entryPoint: 'vs',
                    buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
                },
                fragment: { module: pieceModule, entryPoint, targets: [{ format }] },
                primitive: { topology: 'triangle-list', cullMode: 'none' },
                depthStencil: depth(true, 'less'),
                multisample,
            });

        this.pipelines = {
            // backdrop cache: single-sampled, no depth
            background: device.createRenderPipeline({
                label: 'background',
                layout: cameraOnly,
                vertex: { module: backgroundModule, entryPoint: 'vs' },
                fragment: { module: backgroundModule, entryPoint: 'fs', targets: [{ format }] },
            }),
            globeBack: device.createRenderPipeline({
                label: 'globe-back',
                layout: cameraOnly,
                vertex: { module: globeModule, entryPoint: 'vs' },
                fragment: { module: globeModule, entryPoint: 'fs_back', targets: [{ format }] },
            }),
            backdrop: device.createRenderPipeline({
                label: 'backdrop',
                layout: withBackdrop,
                vertex: { module: globeModule, entryPoint: 'vs' },
                fragment: { module: globeModule, entryPoint: 'fs_backdrop', targets: [{ format }] },
                depthStencil: depth(true, 'always'),
                multisample,
            }),
            pieceInside: piecePipeline('fs_inside'),
            pieceEdge: piecePipeline('fs_edge'),
            globeFront: device.createRenderPipeline({
                label: 'globe-front',
                layout: cameraOnly,
                vertex: { module: globeModule, entryPoint: 'vs' },
                fragment: { module: globeModule, entryPoint: 'fs_front', targets: [{ format, blend: PREMULTIPLIED }] },
                depthStencil: depth(false, 'less-equal'),
                multisample,
            }),
            line: device.createRenderPipeline({
                label: 'line',
                layout: cameraOnly,
                vertex: { module: lineModule, entryPoint: 'vs', buffers: [instanceLayout(LineBatch.FLOATS)] },
                fragment: { module: lineModule, entryPoint: 'fs', targets: [{ format, blend: PREMULTIPLIED }] },
                depthStencil: depth(false, 'less-equal'),
                multisample,
            }),
            curve: device.createRenderPipeline({
                label: 'curve',
                layout: withCurves,
                vertex: { module: curveModule, entryPoint: 'vs' },
                fragment: { module: curveModule, entryPoint: 'fs', targets: [{ format, blend: PREMULTIPLIED }] },
                primitive: { topology: 'triangle-strip' },
                depthStencil: depth(false, 'less-equal'),
                multisample,
            }),
            sprite: device.createRenderPipeline({
                label: 'sprite',
                layout: cameraOnly,
                vertex: { module: spriteModule, entryPoint: 'vs', buffers: [instanceLayout(SpriteBatch.FLOATS)] },
                fragment: { module: spriteModule, entryPoint: 'fs', targets: [{ format, blend: PREMULTIPLIED }] },
                depthStencil: depth(false, 'less-equal'),
                multisample,
            }),
        };
    }

    private ensureTargets(): void {
        const { width, height } = this.canvas;
        if (this.colorTarget && this.colorTarget.width === width && this.colorTarget.height === height) return;
        this.colorTarget?.destroy();
        this.depthTarget?.destroy();
        this.backdropTarget?.destroy();
        const size = { width: Math.max(1, width), height: Math.max(1, height) };
        this.colorTarget = this.device.createTexture({
            size,
            sampleCount: SAMPLE_COUNT,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTarget = this.device.createTexture({
            size,
            sampleCount: SAMPLE_COUNT,
            format: DEPTH_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.backdropTarget = this.device.createTexture({
            size,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.backdropBindGroup = this.device.createBindGroup({
            layout: this.backdropLayout,
            entries: [{ binding: 0, resource: this.backdropTarget.createView() }],
        });
        this.backdropValid = false;
    }

    /** True when the cached backdrop was rendered with the current camera (time aside). */
    private backdropIsCurrent(): boolean {
        if (!this.backdropValid) return false;
        const a = this.cameraData;
        const b = this.backdropCamera;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i] && !TIME_FLOATS.has(i)) return false;
        }
        return true;
    }

    /** Create GPU resources for new pieces and release those of removed ones. */
    syncPieces(pieces: readonly Piece[]): void {
        const alive = new Set(pieces.map(p => p.id));
        for (const [id, res] of this.pieceResources) {
            if (alive.has(id)) continue;
            res.uniform.destroy();
            res.outline.destroy();
            res.vertices.destroy();
            res.indices.destroy();
            this.pieceResources.delete(id);
        }
        for (const piece of pieces) {
            if (!this.pieceResources.has(piece.id)) this.pieceResources.set(piece.id, this.createPieceResources(piece));
        }
    }

    private createPieceResources(piece: Piece): PieceResources {
        const device = this.device;
        const { vertices, indices, insideCount } = buildCapMesh(piece);

        const vertexBuffer = device.createBuffer({
            label: `piece-${piece.id}-vertices`,
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, vertices);

        const indexBuffer = device.createBuffer({
            label: `piece-${piece.id}-indices`,
            size: Math.max(4, indices.byteLength),
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);

        const outline = device.createBuffer({
            label: `piece-${piece.id}-outline`,
            size: Math.max(16, piece.stereo.byteLength),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(outline, 0, piece.stereo);

        const uniform = device.createBuffer({
            label: `piece-${piece.id}-uniform`,
            size: PIECE_UNIFORM_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroup = device.createBindGroup({
            layout: this.pieceLayout,
            entries: [
                { binding: 0, resource: { buffer: uniform } },
                { binding: 1, resource: { buffer: outline } },
            ],
        });

        return {
            uniform,
            outline,
            vertices: vertexBuffer,
            indices: indexBuffer,
            insideCount,
            edgeCount: indices.length - insideCount,
            bindGroup,
        };
    }

    private uploadInstances(
        batch: LineBatch | SpriteBatch,
        current: GPUBuffer | null,
        label: string
    ): GPUBuffer | null {
        if (batch.count === 0) return current;
        let buffer = current;
        if (!buffer || buffer.size < batch.byteLength) {
            buffer?.destroy();
            buffer = this.device.createBuffer({
                label,
                size: Math.max(batch.data.byteLength, 1024),
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        this.device.queue.writeBuffer(buffer, 0, batch.data.buffer, batch.data.byteOffset, batch.byteLength);
        return buffer;
    }

    /** Upload curve points and ranges, growing the storage buffers (and their bind group) when needed. */
    private uploadCurves(curves: CurveBatch): void {
        if (curves.count === 0) return;
        const pointBytes = curves.pointCount * CurveBatch.POINT_FLOATS * 4;
        const rangeBytes = curves.count * 16;
        const grow = (current: GPUBuffer | null, bytes: number, label: string) => {
            if (current && current.size >= bytes) return current;
            current?.destroy();
            this.curveBindGroup = null;
            return this.device.createBuffer({
                label,
                size: Math.max(bytes * 2, 4096),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        };
        this.curvePointBuffer = grow(this.curvePointBuffer, pointBytes, 'curve-points');
        this.curveRangeBuffer = grow(this.curveRangeBuffer, rangeBytes, 'curve-ranges');
        this.curveBindGroup ??= this.device.createBindGroup({
            layout: this.curveLayout,
            entries: [
                { binding: 0, resource: { buffer: this.curvePointBuffer } },
                { binding: 1, resource: { buffer: this.curveRangeBuffer } },
            ],
        });
        const queue = this.device.queue;
        queue.writeBuffer(this.curvePointBuffer, 0, curves.points.buffer, curves.points.byteOffset, pointBytes);
        queue.writeBuffer(this.curveRangeBuffer, 0, curves.curves.buffer, curves.curves.byteOffset, rangeBytes);
    }

    render(frame: FrameState): void {
        this.syncPieces(frame.pieces);
        this.ensureTargets();
        const { camera } = frame;
        const queue = this.device.queue;

        const c = this.cameraData;
        c.set(camera.viewProjection, 0);
        c.set(camera.inverseViewProjection, 16);
        c.set(camera.view, 32);
        c.set([...camera.eye, frame.seconds], 48);
        c.set([this.canvas.width, this.canvas.height, window.devicePixelRatio || 1, frame.loopHours], 52);
        c.set([...frame.light, 0], 56);
        queue.writeBuffer(this.cameraBuffer, 0, c);

        for (const piece of frame.pieces) {
            const res = this.pieceResources.get(piece.id);
            if (!res) continue;
            const u = this.pieceData;
            u.set(mat4.fromQuatScale(piece.orientation, piece.r * FILL_LIFT), 0);
            u.set([...piece.center, piece.path.length], 16);
            u.set([...piece.basisU, frame.selectedIds.has(piece.id) ? 1 : 0], 20);
            u.set([...piece.basisV, 0], 24);
            u.set([piece.r, 0, 0, 0], 28);
            queue.writeBuffer(res.uniform, 0, u);
        }

        this.lineBuffer = this.uploadInstances(frame.lines, this.lineBuffer, 'lines');
        this.spriteBuffer = this.uploadInstances(frame.sprites, this.spriteBuffer, 'sprites');
        this.uploadCurves(frame.curves);

        const encoder = this.device.createCommandEncoder();

        if (!this.backdropIsCurrent()) {
            const backdropPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.backdropTarget!.createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 1 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            });
            backdropPass.setBindGroup(0, this.cameraBindGroup);
            backdropPass.setPipeline(this.pipelines.background);
            backdropPass.draw(3);
            backdropPass.setPipeline(this.pipelines.globeBack);
            backdropPass.draw(3);
            backdropPass.end();
            this.backdropCamera.set(c);
            this.backdropValid = true;
        }

        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.colorTarget!.createView(),
                    resolveTarget: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'discard',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTarget!.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            },
        });

        pass.setBindGroup(0, this.cameraBindGroup);

        pass.setPipeline(this.pipelines.backdrop);
        pass.setBindGroup(1, this.backdropBindGroup!);
        pass.draw(3);

        for (const edge of [false, true]) {
            pass.setPipeline(edge ? this.pipelines.pieceEdge : this.pipelines.pieceInside);
            for (const piece of frame.pieces) {
                const res = this.pieceResources.get(piece.id);
                const count = edge ? res?.edgeCount : res?.insideCount;
                if (!res || !count) continue;
                pass.setBindGroup(1, res.bindGroup);
                pass.setVertexBuffer(0, res.vertices);
                pass.setIndexBuffer(res.indices, 'uint32');
                pass.drawIndexed(count, 1, edge ? res.insideCount : 0);
            }
        }

        pass.setPipeline(this.pipelines.globeFront);
        pass.draw(3);

        if (frame.lines.count > 0 && this.lineBuffer) {
            pass.setPipeline(this.pipelines.line);
            pass.setVertexBuffer(0, this.lineBuffer);
            pass.draw(6, frame.lines.count);
        }
        if (frame.curves.count > 0 && this.curveBindGroup) {
            pass.setPipeline(this.pipelines.curve);
            pass.setBindGroup(1, this.curveBindGroup);
            for (let i = 0; i < frame.curves.count; i++) pass.draw((frame.curves.pointsIn(i) + 1) * 2, 1, 0, i);
        }
        if (frame.sprites.count > 0 && this.spriteBuffer) {
            pass.setPipeline(this.pipelines.sprite);
            pass.setVertexBuffer(0, this.spriteBuffer);
            pass.draw(6, frame.sprites.count);
        }

        pass.end();
        queue.submit([encoder.finish()]);
    }
}

/**
 * Unit-direction cap mesh around the piece center, large enough to contain its outline.
 * Triangles are classified once on the CPU so the per-pixel winding test only runs near the outline:
 * fully inside triangles come first (`insideCount` indices), crossing ones follow, outside ones are dropped.
 */
function buildCapMesh(piece: Piece): { vertices: Float32Array; indices: Uint32Array; insideCount: number } {
    const rings = Math.min(72, Math.max(8, Math.ceil(piece.capAngle / (2.5 * (Math.PI / 180)))));
    const segments = 96;
    const c = piece.center;
    const u = piece.basisU;
    const v = piece.basisV;
    const vertexCount = (rings + 1) * (segments + 1);
    const vertices = new Float32Array(vertexCount * 3);
    const stereo = new Float64Array(vertexCount * 2);
    const inside = new Uint8Array(vertexCount);
    const nearAntipode = new Uint8Array(vertexCount);
    let o = 0;
    for (let i = 0; i <= rings; i++) {
        const alpha = (piece.capAngle * i) / rings;
        const ca = Math.cos(alpha);
        const sa = Math.sin(alpha);
        for (let j = 0; j <= segments; j++) {
            const beta = (j / segments) * Math.PI * 2;
            const cb = Math.cos(beta) * sa;
            const sb = Math.sin(beta) * sa;
            const dir: Vec3 = [
                c[0] * ca + u[0] * cb + v[0] * sb,
                c[1] * ca + u[1] * cb + v[1] * sb,
                c[2] * ca + u[2] * cb + v[2] * sb,
            ];
            const n = o / 3;
            vertices.set(dir, o);
            o += 3;
            const [x, y] = piece.project(dir);
            stereo[n * 2] = x;
            stereo[n * 2 + 1] = y;
            inside[n] = piece.containsLocal(dir) ? 1 : 0;
            nearAntipode[n] = ca < -0.9 ? 1 : 0;
        }
    }

    // bounding boxes of the outline segments in the stereographic plane
    const outline = piece.stereo;
    const segmentCount = outline.length / 2;
    const boxes = new Float64Array(segmentCount * 4);
    for (let i = 0; i < segmentCount; i++) {
        const j = (i + 1) % segmentCount;
        const ax = outline[i * 2]!,
            ay = outline[i * 2 + 1]!,
            bx = outline[j * 2]!,
            by = outline[j * 2 + 1]!;
        boxes.set([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], i * 4);
    }
    const crossesOutline = (a: number, b: number, d: number): boolean => {
        if (nearAntipode[a] || nearAntipode[b] || nearAntipode[d]) return true;
        const xs = [stereo[a * 2]!, stereo[b * 2]!, stereo[d * 2]!];
        const ys = [stereo[a * 2 + 1]!, stereo[b * 2 + 1]!, stereo[d * 2 + 1]!];
        let minX = Math.min(...xs),
            maxX = Math.max(...xs),
            minY = Math.min(...ys),
            maxY = Math.max(...ys);
        // projected triangle edges are circular arcs, so pad the box generously
        const pad = Math.max(maxX - minX, maxY - minY) * 0.25 + 1e-6;
        minX -= pad;
        maxX += pad;
        minY -= pad;
        maxY += pad;
        for (let i = 0; i < segmentCount; i++) {
            const k = i * 4;
            if (boxes[k]! <= maxX && boxes[k + 2]! >= minX && boxes[k + 1]! <= maxY && boxes[k + 3]! >= minY)
                return true;
        }
        return false;
    };

    const insideTris: number[] = [];
    const edgeTris: number[] = [];
    const classify = (a: number, b: number, d: number) => {
        if (crossesOutline(a, b, d)) edgeTris.push(a, b, d);
        else if (inside[a]) insideTris.push(a, b, d);
    };
    const row = segments + 1;
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segments; j++) {
            const a = i * row + j;
            const b = a + row;
            classify(a, b, a + 1);
            classify(a + 1, b, b + 1);
        }
    }
    const indices = new Uint32Array(insideTris.length + edgeTris.length);
    indices.set(insideTris, 0);
    indices.set(edgeTris, insideTris.length);
    return { vertices, indices, insideCount: insideTris.length };
}
