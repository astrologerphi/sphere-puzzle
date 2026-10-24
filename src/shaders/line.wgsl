// Screen-space thick lines with round caps, soft glow and optional dashes.
// Each instance is one segment, expanded to a quad in the vertex shader.

struct Instance {
    // xyz: start, w: core width in px
    @location(0) a: vec4f,
    // xyz: end, w: glow radius in px
    @location(1) b: vec4f,
    @location(2) colorA: vec4f,
    @location(3) colorB: vec4f,
    // x: dash period px (0 = solid), y: draw end cap (0 / 1), z: glow strength
    @location(4) params: vec4f,
};

struct VsOut {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) ends: vec4f,
    @location(1) @interpolate(flat) colorA: vec4f,
    @location(2) @interpolate(flat) colorB: vec4f,
    @location(3) @interpolate(flat) params: vec4f,
    @location(4) @interpolate(flat) sizes: vec2f,
};

fn toPixels(clip: vec4f) -> vec2f {
    let ndc = clip.xy / clip.w;
    return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * cam.viewport.xy;
}

@vertex
fn vs(@builtin(vertex_index) index: u32, inst: Instance) -> VsOut {
    var corners = array<vec2f, 6>(
        vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0),
        vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );
    let corner = corners[index];

    let clipA = cam.viewProj * vec4f(inst.a.xyz, 1.0);
    let clipB = cam.viewProj * vec4f(inst.b.xyz, 1.0);
    let pxA = toPixels(clipA);
    let pxB = toPixels(clipB);

    let delta = pxB - pxA;
    let len = length(delta);
    var dir = vec2f(1.0, 0.0);
    if (len > 1e-4) {
        dir = delta / len;
    }
    let nrm = vec2f(-dir.y, dir.x);
    let extent = inst.a.w * 0.5 + inst.b.w * 2.5 + 1.5;

    let px = mix(pxA, pxB, corner.x) + dir * (corner.x * 2.0 - 1.0) * extent + nrm * corner.y * extent;
    let clip = mix(clipA, clipB, corner.x);
    let ndc = vec2f(px.x / cam.viewport.x * 2.0 - 1.0, 1.0 - px.y / cam.viewport.y * 2.0);

    var out: VsOut;
    out.position = vec4f(ndc * clip.w, clip.z, clip.w);
    out.ends = vec4f(pxA, pxB);
    out.colorA = inst.colorA;
    out.colorB = inst.colorB;
    out.params = inst.params;
    out.sizes = vec2f(inst.a.w, inst.b.w);
    return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4f {
    let frag = input.position.xy;
    let a = input.ends.xy;
    let b = input.ends.zw;
    let ab = b - a;
    let len2 = dot(ab, ab);
    var t = 0.0;
    if (len2 > 1e-6) {
        t = dot(frag - a, ab) / len2;
    }
    // joints are covered by the next segment's start cap, so skip our end cap unless asked for it
    if (input.params.y < 0.5 && t > 1.0 && len2 > 1e-6) {
        discard;
    }
    let tc = clamp(t, 0.0, 1.0);
    let d = length(frag - (a + ab * tc));

    let halfWidth = input.sizes.x * 0.5;
    let glowRadius = max(input.sizes.y, 1e-3);
    let core = 1.0 - smoothstep(halfWidth - 0.6, halfWidth + 0.6, d);
    let strength = input.params.z;
    let glow = (exp(-(d * d) / (glowRadius * glowRadius)) * 0.75 + exp(-d / (glowRadius * 2.0)) * 0.18) * strength;

    var mask = 1.0;
    if (input.params.x > 0.0) {
        let along = tc * sqrt(len2) / input.params.x;
        mask = smoothstep(0.0, 0.08, fract(along)) * (1.0 - smoothstep(0.5, 0.58, fract(along)));
    }

    let color = mix(input.colorA, input.colorB, tc);
    let coreAlpha = core * color.a * mask;
    // premultiplied: the core is alpha-blended, the glow is additive
    let rgb = color.rgb * (coreAlpha + glow * color.a * mask);
    return vec4f(rgb, coreAlpha);
}
