// Closed polylines rendered as a single continuous triangle strip with screen-space miter joins.
// Unlike line.wgsl (independent segments with glow), consecutive segments share their join
// vertices, so the stroke is one seamless, evenly anti-aliased curve.

struct CurvePoint {
    // xyz: world position, w: stroke width in px
    pos: vec4f,
    color: vec4f,
};

@group(1) @binding(0) var<storage, read> points: array<CurvePoint>;
// x: first point, y: point count
@group(1) @binding(1) var<storage, read> curves: array<vec4u>;

struct VsOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) across: f32,
    @location(2) @interpolate(flat) halfWidth: f32,
};

fn toPixels(clip: vec4f) -> vec2f {
    let ndc = clip.xy / clip.w;
    return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * cam.viewport.xy;
}

fn pixelsOf(p: vec3f) -> vec2f {
    return toPixels(cam.viewProj * vec4f(p, 1.0));
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) curveIndex: u32) -> VsOut {
    let curve = curves[curveIndex];
    let first = curve.x;
    let count = curve.y;
    let i = (vid / 2u) % count;
    let side = f32(vid % 2u) * 2.0 - 1.0;

    let p = points[first + i];
    let clip = cam.viewProj * vec4f(p.pos.xyz, 1.0);
    let here = toPixels(clip);
    let d0 = here - pixelsOf(points[first + (i + count - 1u) % count].pos.xyz);
    let d1 = pixelsOf(points[first + (i + 1u) % count].pos.xyz) - here;

    // unit tangents of the incoming and outgoing segments (tolerating repeated points)
    var t0 = vec2f(0.0);
    var t1 = vec2f(0.0);
    if (length(d0) > 1e-4) {
        t0 = normalize(d0);
    }
    if (length(d1) > 1e-4) {
        t1 = normalize(d1);
    }
    if (length(d0) <= 1e-4) {
        t0 = t1;
    }
    if (length(d1) <= 1e-4) {
        t1 = t0;
    }
    var tangent = t0 + t1;
    if (length(tangent) < 1e-4) {
        tangent = t1;
    }
    if (length(tangent) < 1e-4) {
        tangent = vec2f(1.0, 0.0);
    }
    tangent = normalize(tangent);
    let normal = vec2f(-tangent.y, tangent.x);

    // miter: stretch the offset so both adjacent segments keep their full width (limit 2x)
    let halfWidth = p.pos.w * 0.5;
    let extent = halfWidth + 1.0;
    let miter = max(abs(dot(normal, vec2f(-t1.y, t1.x))), 0.5);
    let offsetPx = here + normal * side * extent / miter;
    let ndc = vec2f(offsetPx.x / cam.viewport.x * 2.0 - 1.0, 1.0 - offsetPx.y / cam.viewport.y * 2.0);

    var out: VsOut;
    out.position = vec4f(ndc * clip.w, clip.z, clip.w);
    out.color = p.color;
    out.across = side * extent;
    out.halfWidth = halfWidth;
    return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4f {
    let coverage = 1.0 - smoothstep(input.halfWidth - 0.5, input.halfWidth + 0.5, abs(input.across));
    let alpha = coverage * input.color.a;
    return vec4f(input.color.rgb * alpha, alpha);
}
