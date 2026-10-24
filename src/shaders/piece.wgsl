// Filled sphere pieces. A spherical cap mesh around the piece center is rasterized and each
// fragment is kept only if it lies inside the outline (non-zero winding in the stereographic plane).

struct Piece {
    // rotation * radius
    model: mat4x4f,
    // xyz: local center direction, w: outline point count
    center: vec4f,
    // xyz: tangent basis u, w: selected (0 / 1)
    basisU: vec4f,
    // xyz: tangent basis v, w: hover glow (0..1)
    basisV: vec4f,
    // x: radius, y: selection age seconds
    params: vec4f,
};

@group(1) @binding(0) var<uniform> piece: Piece;
@group(1) @binding(1) var<storage, read> outline: array<vec2f>;

struct VsOut {
    @builtin(position) position: vec4f,
    @location(0) localDir: vec3f,
    @location(1) worldPos: vec3f,
};

@vertex
fn vs(@location(0) dir: vec3f) -> VsOut {
    var out: VsOut;
    let world = (piece.model * vec4f(dir, 1.0)).xyz;
    out.position = cam.viewProj * vec4f(world, 1.0);
    out.localDir = dir;
    out.worldPos = world;
    return out;
}

fn project(p: vec3f) -> vec2f {
    let denom = max(1.0 + dot(p, piece.center.xyz), 1e-5);
    return vec2f(dot(p, piece.basisU.xyz), dot(p, piece.basisV.xyz)) / denom;
}

fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {
    let ab = b - a;
    let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
    return length(p - (a + ab * t));
}

@fragment
fn fs(input: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
    let dir = normalize(input.localDir);
    let s = project(dir);
    let count = u32(piece.center.w);

    var winding = 0;
    var dist = 1e9;
    for (var i = 0u; i < count; i++) {
        let a = outline[i];
        let b = outline[(i + 1u) % count];
        let side = (b.x - a.x) * (s.y - a.y) - (s.x - a.x) * (b.y - a.y);
        if (a.y <= s.y) {
            if (b.y > s.y && side > 0.0) {
                winding += 1;
            }
        } else if (b.y <= s.y && side < 0.0) {
            winding -= 1;
        }
        dist = min(dist, segmentDistance(s, a, b));
    }
    if (winding == 0) {
        discard;
    }

    // stereographic distance -> angular distance (radians) to the outline
    let edge = dist * (1.0 + dot(dir, piece.center.xyz));
    let selected = piece.basisU.w;
    let time = cam.eye.w;

    var n = normalize(input.worldPos);
    if (!frontFacing) {
        n = -n;
    }
    let v = normalize(cam.eye.xyz - input.worldPos);
    let l = normalize(cam.light.xyz);
    let diffuse = 0.38 + 0.62 * max(dot(n, l), 0.0);
    let halfVec = normalize(l + v);
    let spec = pow(max(dot(n, halfVec), 0.0), 64.0) * 0.45;
    let rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

    // deep emerald body with jade veins following the outline (topographic contours)
    let deep = vec3f(0.012, 0.165, 0.098);
    let jade = vec3f(0.10, 0.62, 0.42);
    let flow = time * 0.9 * selected;
    let contour = pow(0.5 + 0.5 * cos(edge * 140.0 - flow * 3.0), 10.0) * smoothstep(0.30, 0.0, edge);
    let marble = fbm(dir * 9.0) - 0.5;

    var color = deep * diffuse * (1.0 + marble * 0.35);
    color += jade * contour * (0.10 + 0.16 * selected);
    color += jade * exp(-edge * 55.0) * (0.35 + 0.45 * selected);
    color += vec3f(0.25, 0.95, 0.70) * rim * (0.18 + 0.30 * selected);
    color += vec3f(0.85, 1.0, 0.92) * spec;

    // breathing highlight on the selected piece
    let pulse = 0.5 + 0.5 * sin(time * 3.2);
    color += vec3f(0.10, 0.45, 0.32) * selected * pulse * exp(-edge * 18.0) * 0.5;
    color += vec3f(0.08, 0.30, 0.22) * piece.basisV.w * 0.4;

    return vec4f(color, 1.0);
}
