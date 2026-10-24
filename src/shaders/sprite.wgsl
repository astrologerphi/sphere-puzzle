// Camera-facing sprites: sparkling stars (kind 0) and soft glowing dots (kind 1).

struct Instance {
    // xyz: world position, w: size in px
    @location(0) posSize: vec4f,
    @location(1) color: vec4f,
    // x: kind, y: rotation (radians), z: intensity
    @location(2) params: vec4f,
};

struct VsOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) @interpolate(flat) color: vec4f,
    @location(2) @interpolate(flat) params: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32, inst: Instance) -> VsOut {
    var corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );
    let corner = corners[index];
    let clip = cam.viewProj * vec4f(inst.posSize.xyz, 1.0);
    let offset = corner * inst.posSize.w / cam.viewport.xy * 2.0;

    var out: VsOut;
    out.position = clip + vec4f(offset * clip.w, 0.0, 0.0);
    out.uv = corner;
    out.color = inst.color;
    out.params = inst.params;
    return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4f {
    let r = length(input.uv);
    let fade = 1.0 - smoothstep(0.75, 1.0, r);
    let intensity = input.params.z;
    var value = 0.0;
    var core = 0.0;

    if (input.params.x < 0.5) {
        let c = cos(input.params.y);
        let s = sin(input.params.y);
        let q = vec2f(c * input.uv.x - s * input.uv.y, s * input.uv.x + c * input.uv.y);
        let d = vec2f((q.x + q.y) * 0.7071, (q.x - q.y) * 0.7071);
        core = exp(-r * r * 90.0);
        let halo = exp(-r * 7.0) * 0.55;
        let spikes = exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 3.2) + exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 3.2);
        let diag = (exp(-abs(d.x) * 90.0) * exp(-abs(d.y) * 7.0) + exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 7.0)) * 0.45;
        value = core * 2.0 + halo + spikes * 0.9 + diag;
    } else {
        core = exp(-r * r * 14.0);
        value = core + exp(-r * 4.0) * 0.25;
    }

    value *= fade * intensity;
    let rgb = input.color.rgb * value * input.color.a;
    return vec4f(rgb, clamp(core * fade * input.color.a * 0.6, 0.0, 1.0));
}
