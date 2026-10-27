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

export type Vertex = { theta: number; phi: number };
export type CenterRay = { theta: number; phi: number };
export type Shape = Record<number, Vertex> & { r: number };

export const LOOP_DURATION = 3000;
export const DEFAULT_SHAPES: Record<string, Shape> = {
    "default, Divine Tower of Liurnia, Divine Tower of West Altus": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: 0,
            phi: -2.199115
        },
        "15": {
            theta: 0,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665

        }

    },
    "m00_00_0000": {
        r: 1,
        "0": {
            theta: -0.418879,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: -0.418879,
            phi: -2.199115
        },
        "15": {
            theta: -0.750492,
            phi: 2.792527
        },
        "21": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.750492,
            phi: 2.792527
        }

    },
    "Catacombs": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: 0,
            phi: -2.199115
        },
        "15": {
            theta: 0,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "15.08": {
            theta: -0.750492,
            phi: 2.792527
        },
        "15.33": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }

    },
    "Divine Tower of Caelid": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: 0,
            phi: -2.199115
        },
        "15": {
            theta: 0.174533,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },
    "Leyndell, Royal Capital": {
        r: 1,
        "0": {
            theta: -0.506145,
            phi: 1.919862
        },
        "4": {
            theta: -0.523599,
            phi: 1.570796
        },
        "8": {
            theta: -0.523599,
            phi: -0.872665
        },
        "12": {
            theta: -0.349066,
            phi: -1.919862
        },
        "15": {
            theta: -0.349066,
            phi: 1.623156
        },
        "21": {
            theta: -0.436332,
            phi: 1.623156
        },
        "22.5": {
            theta: -0.436332,
            phi: 1.623156
        }
    },
    "m00_00_0148_weatheroutdoor": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: 0,
            phi: -2.199115
        },
        "15": {
            theta: -0.261799,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },
    "Isolated Divine Tower": {
        r: 1,
        "0": {
            theta: -0.349066,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: -0.174533,
            phi: -2.199115
        },
        "15": {
            theta: -0.174533,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },
    "m00_00_0150_weatheroutdoor": {
        r: 1,
        "0": {
            theta: -0.261799,
            phi: 0.959931
        },
        "4": {
            theta: -0.436332,
            phi: 0.872665
        },
        "8": {
            theta: -0.785398,
            phi: -0.436332
        },
        "12": {
            theta: -0.174533,
            phi: -1.745329
        },
        "15": {
            theta: -0.750492,
            phi: 2.792527
        },
        "21": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.174533,
            phi: 2.792527
        }
    },
    "Stormveil Castle": {
        r: 1,
        "0": {
            theta: -0.698132,
            phi: 0.698132
        },
        "4": {
            theta: -0.698132,
            phi: 0.436332
        },
        "8": {
            theta: -0.785398,
            phi: -2.530727
        },
        "12": {
            theta: -0.436332,
            phi: -2.879793
        },
        "15": {
            theta: -0.750492,
            phi: 2.792527
        },
        "21": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.750492,
            phi: 2.792527
        }
    },
    "Chapel of Anticipation": {
        r: 1,
        "0": {
            theta: -0.610865,
            phi: 0.698132
        },
        "4": {
            theta: -0.785398,
            phi: 0.174533
        },
        "8": {
            theta: -0.575959,
            phi: -2.530727
        },
        "12": {
            theta: -0.418879,
            phi: -2.879793
        },
        "15": {
            theta: -0.785398,
            phi: 1.396263
        },
        "21": {
            theta: -0.785398,
            phi: 1.396263
        },
        "22.5": {
            theta: -0.785398,
            phi: 1.396263
        }
    },
    "Academy of Raya Lucaria": {
        r: 1,
        "0": {
            theta: -0.401426,
            phi: 1.099557
        },
        "4": {
            theta: -0.785398,
            phi: 0.785398
        },
        "8": {
            theta: -0.610865,
            phi: -2.199115
        },
        "12": {
            theta: -0.314159,
            phi: -1.919862
        },
        "15": {
            theta: -0.436332,
            phi: 1.623156
        },
        "21": {
            theta: -0.436332,
            phi: 1.623156
        },
        "22.5": {
            theta: -0.436332,
            phi: 1.623156
        }
    },
    "Miuqella's Haligtree": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 1.396263
        },
        "4": {
            theta: -0.872665,
            phi: 0.523599
        },
        "8": {
            theta: -1.047198,
            phi: -0.523599
        },
        "12": {
            theta: -0.174533,
            phi: -1.570796
        },
        "15": {
            theta: -0.349066,
            phi: -2.268928
        },
        "21": {
            theta: -0.698132,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.087266,
            phi: 1.745329
        }
    },
    "Volcano Manor": {
        r: 1,
        "0": {
            theta: -0.925025,
            phi: 1.099557
        },
        "4": {
            theta: -0.785398,
            phi: 0.349066
        },
        "8": {
            theta: -0.698132,
            phi: -1.570796
        },
        "12": {
            theta: -0.523599,
            phi: -1.658063
        },
        "15": {
            theta: -0.872665,
            phi: -1.22173
        },
        "21": {
            theta: -0.872665,
            phi: -1.22173
        },
        "22.5": {
            theta: -0.872665,
            phi: -1.22173
        }
    },
    "Shadow Keep (DLC)": {
        r: 1,
        "0": {
            theta: -0.737103,
            phi: 0.785398
        },
        "4": {
            theta: -0.698132,
            phi: 0.436332
        },
        "8": {
            theta: -0.785398,
            phi: -2.530727
        },
        "12": {
            theta: -0.436332,
            phi: -2.879793
        },
        "15": {
            theta: -0.841823,
            phi: 2.70177
        },
        "21": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.750492,
            phi: 2.792527
        }
    },
    "Gaols (DLC)": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.872665,
            phi: 0.872665
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: 0,
            phi: -2.199115
        },
        "15": {
            theta: -0.750492,
            phi: 2.792527
        },
        "21": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.750492,
            phi: 2.792527
        }
    },
    "m43_00_0900": {
        r: 1,
        "0": {
            theta: -0.194779,
            phi: 0.816814
        },
        "4": {
            theta: -0.349066,
            phi: 0.837758
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: -0.436332,
            phi: -2.199115
        },
        "15": {
            theta: 0,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },
    "m60_00_0300": {
        r: 1,
        "0": {
            theta: -0.174533,
            phi: 0.872665
        },
        "4": {
            theta: -0.174533,
            phi: 0.872665
        },
        "8": {
            theta: -0.174533,
            phi: 0.872665
        },
        "12": {
            theta: -0.174533,
            phi: 0.872665
        },
        "15": {
            theta: -0.174533,
            phi: 0.872665
        },
        "21": {
            theta: -0.174533,
            phi: 0.872665
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },
    "m61_00_0000": {
        r: 1,
        "0": {
            theta: -0.194779,
            phi: 0.816814
        },
        "4": {
            theta: -0.349066,
            phi: 0.837758
        },
        "8": {
            theta: -0.872665,
            phi: -2.199115
        },
        "12": {
            theta: -0.436332,
            phi: -2.199115
        },
        "15": {
            theta: 0,
            phi: -2.199115
        },
        "21": {
            theta: -0.698132,
            phi: 0.872665
        },
        "15.08": {
            theta: -0.750492,
            phi: 2.792527
        },
        "15.33": {
            theta: -0.750492,
            phi: 2.792527
        },
        "22.5": {
            theta: -0.174533,
            phi: 0.872665
        }
    },

};

for (const shapeKey in DEFAULT_SHAPES) {
    const shape = DEFAULT_SHAPES[shapeKey];
    for (const vertexKey in shape) {
        if (vertexKey === "r") continue;
        // @ts-ignore
        const vertex: Vertex = shape[vertexKey];
        const _theta = vertex.theta;
        const _phi = vertex.phi;
        vertex.theta = - Math.PI / 2 - _theta;
        vertex.phi = Math.PI / 2 - _phi;
    }
}