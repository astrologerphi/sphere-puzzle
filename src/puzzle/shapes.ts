/**
 * a "shape" is a piece of the sphere.
 * each "shape" is defined as a Record of multiple "time"s and their corresponding vertices.
 *
 * the vertices are represented in spherical coordinates (r, theta, phi):
 * the radial distance, r, along the line connecting the point to a fixed point called the origin, equals to 1 by default;
 * the polar angle, θ, between this radial line and a given polar axis;
 * the azimuthal angle, φ, which is the angle of rotation of the radial line around the polar axis.
 *
 * the range of "time" is 0 <= time <= 24
 * a shape has multiple lines connecting the vertices at different "time"s using spherical linear interpolation (Slerp).
 * each vertex is connected to the corresponding vertex at the next "time".
 * the last vertex is connected to the first vertex to form a closed loop.
 *
 * each shape is guaranteed to including a "0 time" and a "12 time"
 * define the time from 0 to 12 as "day time"
 * define the time from 12 to 24 as "night time"
 *
 * the "day time" lines are yellow and the "night time" lines are blue.
 * the fill color of the shape is opaque deep green
 *
 * a white shiny "star" moves periodically along the lines.
 * for example,
 * starting at time `0 / 24 * LOOP_DURATION (milliseconds)` from `{ r: 1, theta: -0.174533, phi: 0.872665 }`,
 * moving smoothly to `{ r: 1, theta: -0.872665, phi: 0.872665 }`,
 * ending at time `2 / 24 * LOOP_DURATION`.
 *
 * each shape has an "center point" calculated at runtime.
 * the coordinate origin and the "center point" determines the "center ray" of the shape.
 * the center ray is invisible by default and there will be an option to adjust its visibility.
 */

type Vertex = { r: number; theta: number; phi: number };
type CenterRay = { theta: number; phi: number };
type Shape = Record<number, Vertex> & { center: CenterRay };

export const LOOP_DURATION = 3000;
export const DEFAULT_SHAPES: Record<string, Shape> = {
    shape1: {
        0: { r: 1, theta: -0.174533, phi: 0.872665 },
        2: { r: 1, theta: -0.872665, phi: 0.872665 },
        3: { r: 1, theta: -0.872665, phi: -2.199115 },
        4: { r: 1, theta: 0, phi: -2.199115 },
        5: { r: 1, theta: -0.698132, phi: 0.872665 },
        8: { r: 1, theta: -0.174533, phi: 0.872665 },
        9: { r: 1, theta: -0.872665, phi: 0.872665 },
        12: { r: 1, theta: -0.872665, phi: -2.199115 },
        23: { r: 1, theta: 0, phi: -2.199115 },
        center: { theta: 0, phi: 0 },
    },
    shape2: {
        0: { r: 1, theta: -0.174533, phi: 0.872665 },
        4: { r: 1, theta: -0.872665, phi: 0.872665 },
        8: { r: 1, theta: -0.872665, phi: -2.199115 },
        12: { r: 1, theta: 0, phi: -2.199115 },
        15: { r: 1, theta: 0, phi: -2.199115 },
        21: { r: 1, theta: -0.698132, phi: 0.872665 },
        15.08: { r: 1, theta: -0.750492, phi: 2.792527 },
        15.33: { r: 1, theta: -0.750492, phi: 2.792527 },
        22.5: { r: 1, theta: -0.174533, phi: 0.872665 },
        center: { theta: 0, phi: 0 },
    },
};
