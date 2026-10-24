// Deep-space backdrop: nebula clouds and twinkling stars that rotate with the camera.

struct VsOut {
    @builtin(position) position: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VsOut {
    var out: VsOut;
    out.position = fullscreenPosition(index);
    return out;
}

fn starLayer(dir: vec3f, scale: f32, threshold: f32, time: f32) -> vec3f {
    let p = dir * scale;
    let cell = floor(p);
    var color = vec3f(0.0);
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let c = cell + vec3f(f32(x), f32(y), f32(z));
                let h = hash33(c);
                if (h.x < threshold) {
                    continue;
                }
                let starPos = normalize(c + h);
                let d = length(dir - starPos) * scale;
                let size = mix(0.035, 0.11, h.y * h.y);
                let twinkle = 0.65 + 0.35 * sin(time * (1.0 + h.z * 3.0) + h.y * TAU);
                let core = exp(-d * d / (size * size * 0.18));
                let halo = exp(-d / (size * 1.6)) * 0.14;
                let tint = mix(vec3f(0.65, 0.78, 1.0), vec3f(1.0, 0.86, 0.68), h.z);
                color += tint * (core + halo) * twinkle;
            }
        }
    }
    return color;
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let ndc = fragToNdc(fragCoord.xy);
    let dir = worldRay(ndc);
    let time = cam.eye.w;

    // vertical gradient: indigo at the top, deep teal-black at the bottom
    let up = dir.y * 0.5 + 0.5;
    var color = mix(vec3f(0.010, 0.016, 0.035), vec3f(0.028, 0.020, 0.070), up);

    // nebula
    let q = dir * 1.6 + vec3f(0.0, 0.0, time * 0.004);
    let n1 = fbm(q + fbm(q * 1.7) * 1.3);
    let n2 = fbm(q * 2.3 + vec3f(5.2, 1.3, 2.8));
    let violet = vec3f(0.36, 0.13, 0.55);
    let teal = vec3f(0.05, 0.36, 0.42);
    let ember = vec3f(0.55, 0.24, 0.12);
    let band = exp(-pow(dot(dir, normalize(vec3f(0.35, 0.9, -0.25))) * 2.2, 2.0));
    color += violet * pow(n1, 3.0) * 0.55 * (0.4 + band);
    color += teal * pow(n2, 3.5) * 0.45 * (0.3 + band);
    color += ember * pow(n1 * n2, 4.0) * 1.4 * band;

    // stars
    let dpr = cam.viewport.z;
    color += starLayer(dir, 90.0, 0.86, time) * 0.9;
    color += starLayer(dir, 210.0, 0.80, time * 1.3) * 0.55;

    // vignette
    let v = 1.0 - dot(ndc * vec2f(0.55, 0.7), ndc * vec2f(0.55, 0.7));
    color *= mix(0.55, 1.0, clamp(v, 0.0, 1.0));

    // subtle grain to prevent banding
    let grain = (hash31(vec3f(fragCoord.xy, time * 60.0)) - 0.5) * 0.012 * dpr;
    return vec4f(color + grain, 1.0);
}
