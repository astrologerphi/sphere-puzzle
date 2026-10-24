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

@fragment
fn fs(input: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
    let dir = normalize(input.localDir);
    let s = project(dir);
    let count = u32(piece.center.w);

    var winding = 0;
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
    }
    if (winding == 0) {
        discard;
    }

    let selected = piece.basisU.w;

    var n = normalize(input.worldPos);
    if (!frontFacing) {
        n = -n;
    }
    let v = normalize(cam.eye.xyz - input.worldPos);
    let l = normalize(cam.light.xyz);
    let diffuse = 0.45 + 0.55 * max(dot(n, l), 0.0);
    let halfVec = normalize(l + v);
    let spec = pow(max(dot(n, halfVec), 0.0), 48.0) * 0.25;

    // plain lit emerald; the selected piece is simply brighter
    let base = mix(vec3f(0.02, 0.20, 0.13), vec3f(0.06, 0.48, 0.32), selected);
    let color = base * diffuse + vec3f(spec);

    return vec4f(color, 1.0);
}
