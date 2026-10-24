// The base sphere (radius 1), ray traced per pixel for a perfect silhouette.
// fs_back draws the far inner wall into the cached backdrop (only when the view changes),
// fs_backdrop blits that cache every frame and writes the wall's depth,
// fs_front draws the glass shell, rim light and atmosphere (blended, depth-tested only).

@group(1) @binding(0) var backdrop: texture_2d<f32>;

struct VsOut {
    @builtin(position) position: vec4f,
};

struct FsOut {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VsOut {
    var out: VsOut;
    out.position = fullscreenPosition(index);
    return out;
}

const GRID_STEP: f32 = PI / 12.0; // 15 degrees

// Anti-aliased line intensity for `value` crossing integer multiples, `width` in pixels.
fn gridLine(value: f32, fw: f32, width: f32) -> f32 {
    let d = abs(fract(value + 0.5) - 0.5) / max(fw, 1e-5);
    return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.75, d);
}

struct Grid {
    minor: f32,
    equator: f32,
    meridian: f32,
};

// Latitude / longitude grid on the unit sphere. Derivatives are taken in uniform control flow.
fn sphereGrid(p: vec3f, width: f32) -> Grid {
    let s = toSpherical(p);
    let lat = s.x / GRID_STEP;
    let lon = s.y / GRID_STEP;
    // second azimuth with its seam on the opposite side, to avoid derivative spikes at ±π
    let lonAlt = atan2(p.z, -p.x) / GRID_STEP;
    let fwLat = fwidth(lat);
    let fwLon = min(fwidth(lon), fwidth(lonAlt));

    var g: Grid;
    let polarFade = smoothstep(0.02, 0.22, sin(s.x));
    g.minor = max(gridLine(lat, fwLat, width), gridLine(lon, fwLon, width) * polarFade);
    g.equator = gridLine(lat - 6.0, fwLat, width * 2.2) * step(abs(lat - 6.0), 0.5);
    g.meridian = gridLine(lon, fwLon, width * 2.2) * step(abs(lon), 0.5) * polarFade;
    return g;
}

struct Hit {
    hit: bool,
    tNear: f32,
    tFar: f32,
    closest: f32, // distance of the ray from the origin at closest approach
    tClosest: f32,
};

fn intersectUnitSphere(origin: vec3f, dir: vec3f) -> Hit {
    var h: Hit;
    let b = dot(origin, dir);
    let c = dot(origin, origin) - 1.0;
    let disc = b * b - c;
    let root = sqrt(max(disc, 0.0));
    h.hit = disc > 0.0 && (-b + root) > 0.0;
    h.tNear = -b - root;
    h.tFar = -b + root;
    h.tClosest = -b;
    h.closest = sqrt(max(dot(origin, origin) - b * b, 0.0));
    return h;
}

// Far inner wall, drawn over the background into the cached backdrop texture.
@fragment
fn fs_back(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let origin = cam.eye.xyz;
    let dir = worldRay(fragToNdc(fragCoord.xy));
    let h = intersectUnitSphere(origin, dir);
    let p = normalize(origin + dir * h.tFar);
    let grid = sphereGrid(p, 1.4 * cam.viewport.z);

    if (!h.hit) {
        discard;
    }

    let inward = -p;
    let light = normalize(cam.light.xyz);
    let facing = clamp(dot(inward, -dir), 0.0, 1.0);

    // inner wall: deep sapphire with a soft cosmic swirl
    let swirl = fbm(p * 3.0);
    var color = mix(vec3f(0.012, 0.025, 0.060), vec3f(0.030, 0.070, 0.135), swirl);
    color += vec3f(0.05, 0.11, 0.20) * pow(1.0 - facing, 2.0);
    color *= 0.75 + 0.35 * max(dot(inward, light), 0.0);

    color += vec3f(0.30, 0.55, 0.95) * grid.minor * 0.32;
    color += vec3f(1.00, 0.78, 0.35) * grid.equator * 0.55;
    color += vec3f(0.55, 0.95, 0.85) * grid.meridian * 0.55;
    return vec4f(color, 1.0);
}

// Copies the cached backdrop into the frame and restores the inner wall's depth analytically.
@fragment
fn fs_backdrop(@builtin(position) fragCoord: vec4f) -> FsOut {
    let origin = cam.eye.xyz;
    let dir = worldRay(fragToNdc(fragCoord.xy));
    let h = intersectUnitSphere(origin, dir);

    var out: FsOut;
    out.color = textureLoad(backdrop, vec2i(fragCoord.xy), 0);
    out.depth = select(1.0, depthOf(origin + dir * h.tFar), h.hit);
    return out;
}

@fragment
fn fs_front(@builtin(position) fragCoord: vec4f) -> FsOut {
    let origin = cam.eye.xyz;
    let dir = worldRay(fragToNdc(fragCoord.xy));
    let h = intersectUnitSphere(origin, dir);
    let p = normalize(origin + dir * max(h.tNear, 0.0));
    let grid = sphereGrid(p, 1.1 * cam.viewport.z);

    var out: FsOut;
    if (!h.hit) {
        // atmosphere halo just outside the silhouette, purely additive
        let x = h.closest - 1.0;
        if (h.tClosest <= 0.0 || x > 0.35) {
            discard;
        }
        let glow = exp(-x * 14.0) * 0.55 + exp(-x * 4.5) * 0.12;
        out.color = vec4f(vec3f(0.30, 0.62, 1.0) * glow, 0.0);
        out.depth = depthOf(origin + dir * h.tClosest);
        return out;
    }

    let n = p;
    let v = -dir;
    let light = normalize(cam.light.xyz);
    let ndv = clamp(dot(n, v), 0.0, 1.0);
    let fresnel = pow(1.0 - ndv, 3.0);

    let halfVec = normalize(light + v);
    let spec = pow(max(dot(n, halfVec), 0.0), 120.0) * 0.9 + pow(max(dot(n, halfVec), 0.0), 12.0) * 0.06;

    var rgb = vec3f(0.08, 0.20, 0.38) * 0.10;
    var alpha = 0.06 + fresnel * 0.55;
    rgb += vec3f(0.35, 0.70, 1.0) * fresnel * 0.55;

    let gridColor = vec3f(0.55, 0.78, 1.0) * grid.minor * 0.22
        + vec3f(1.0, 0.82, 0.42) * grid.equator * 0.40
        + vec3f(0.60, 1.0, 0.88) * grid.meridian * 0.40;
    rgb += gridColor;
    alpha += (grid.minor * 0.10 + (grid.equator + grid.meridian) * 0.18);

    // premultiplied output; the specular highlight is additive
    out.color = vec4f(rgb + vec3f(spec), clamp(alpha, 0.0, 0.85));
    out.depth = depthOf(origin + dir * h.tNear);
    return out;
}
