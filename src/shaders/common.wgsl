// Shared declarations, prepended to every other shader module.

struct Camera {
    viewProj: mat4x4f,
    invViewProj: mat4x4f,
    view: mat4x4f,
    // xyz: eye position, w: elapsed seconds
    eye: vec4f,
    // x: width px, y: height px, z: device pixel ratio, w: loop time in hours [0, 24)
    viewport: vec4f,
    // xyz: world-space key light direction (towards light)
    light: vec4f,
};

@group(0) @binding(0) var<uniform> cam: Camera;

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

// Fullscreen triangle covering the viewport.
fn fullscreenPosition(index: u32) -> vec4f {
    let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

// World-space ray direction for a point in normalized device coordinates.
fn worldRay(ndc: vec2f) -> vec3f {
    let nearH = cam.invViewProj * vec4f(ndc, 0.0, 1.0);
    let farH = cam.invViewProj * vec4f(ndc, 1.0, 1.0);
    return normalize(farH.xyz / farH.w - nearH.xyz / nearH.w);
}

fn fragToNdc(fragCoord: vec2f) -> vec2f {
    let uv = fragCoord / cam.viewport.xy;
    return vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
}

fn depthOf(worldPos: vec3f) -> f32 {
    let clip = cam.viewProj * vec4f(worldPos, 1.0);
    return clip.z / clip.w;
}

fn hash31(p: vec3f) -> f32 {
    var q = fract(p * 0.1031);
    q += dot(q, q.zyx + 31.32);
    return fract((q.x + q.y) * q.z);
}

fn hash33(p: vec3f) -> vec3f {
    var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yxx) * q.zyx);
}

fn valueNoise(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash31(i), hash31(i + vec3f(1, 0, 0)), u.x),
            mix(hash31(i + vec3f(0, 1, 0)), hash31(i + vec3f(1, 1, 0)), u.x), u.y),
        mix(mix(hash31(i + vec3f(0, 0, 1)), hash31(i + vec3f(1, 0, 1)), u.x),
            mix(hash31(i + vec3f(0, 1, 1)), hash31(i + vec3f(1, 1, 1)), u.x), u.y),
        u.z);
}

fn fbm(p: vec3f) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var q = p;
    for (var i = 0; i < 5; i++) {
        sum += amp * valueNoise(q);
        q = q * 2.03 + vec3f(1.7, 9.2, 4.1);
        amp *= 0.5;
    }
    return sum;
}

// Polar angle (from +Y) and azimuth, matching sphericalToCartesian() in math.ts.
fn toSpherical(p: vec3f) -> vec2f {
    return vec2f(acos(clamp(p.y, -1.0, 1.0)), atan2(-p.z, p.x));
}
