import { MercatorCoordinate, type CustomLayerInterface, type Map as MaplibreMap } from 'maplibre-gl';
import * as THREE from 'three';
import { CAR_MODEL_LENGTH_M, carLengthForZoom, carModelMatrix } from '../../lib/car3d';
import type { Coordinates } from '../../types';

export const CAR_LAYER_ID = 'ev-car-3d';

export interface CarPose {
  position: Coordinates;
  heading: number;
}

const BODY_COLOR = 0xfacc15;

/** Side profile (z forward, y up) extruded across the car width, centred on x = 0. */
function extrudeProfile(points: [number, number][], width: number, bevel = 0.05): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  // Shape X → car forward (z), extrusion axis → car width (x).
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/** Low-poly car, ~4.4 m long, authored with x → right, y → up, z → forward. */
function buildCar(): THREE.Group {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: BODY_COLOR, shininess: 70, specular: 0x555555, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0x18222c, shininess: 120, specular: 0x8899aa, side: THREE.DoubleSide });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });
  const metal = new THREE.MeshPhongMaterial({ color: 0xc8c8c8, shininess: 90 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x151515 });

  // Body below the belt line: bumpers, sloped hood and trunk.
  const body = new THREE.Mesh(
    extrudeProfile(
      [
        [-2.2, 0.3],
        [2.2, 0.3],
        [2.22, 0.58],
        [2.05, 0.78],
        [1.15, 0.93],
        [-1.75, 0.96],
        [-2.2, 0.86],
      ],
      1.78,
    ),
    paint,
  );
  car.add(body);

  // Glass greenhouse: sloped windshield, side windows, rear window.
  const cabin = new THREE.Mesh(
    extrudeProfile(
      [
        [1.15, 0.92],
        [0.32, 1.4],
        [-1.05, 1.4],
        [-1.78, 0.95],
        [-1.78, 0.92],
      ],
      1.52,
      0.03,
    ),
    glass,
  );
  car.add(cabin);

  // Roof panel and A/C pillars in body colour.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.42), paint);
  roof.position.set(0, 1.43, -0.36);
  car.add(roof);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.12), paint);
    pillar.position.set(side * 0.74, 1.16, -0.25);
    car.add(pillar);
  }

  // Wheels with rims.
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16);
  rim.rotateZ(Math.PI / 2);
  for (const x of [-0.84, 0.84]) {
    for (const z of [-1.38, 1.38]) {
      const wheel = new THREE.Mesh(tyre, rubber);
      wheel.position.set(x, 0.34, z);
      car.add(wheel);
      const cap = new THREE.Mesh(rim, metal);
      cap.position.set(x + Math.sign(x) * 0.13, 0.34, z);
      car.add(cap);
    }
  }

  // Grille, headlights and taillights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.04), dark);
  grille.position.set(0, 0.48, 2.23);
  car.add(grille);
  const headlight = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  const taillight = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.11, 0.05), headlight);
    head.position.set(side * 0.58, 0.64, 2.19);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), taillight);
    tail.position.set(side * 0.6, 0.8, -2.21);
    car.add(tail);
  }

  // Ground halo marking the position.
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 40),
    new THREE.MeshBasicMaterial({ color: BODY_COLOR, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  halo.rotateX(-Math.PI / 2);
  halo.position.y = 0.02;
  car.add(halo);

  return car;
}

/**
 * MapLibre custom layer drawing a Three.js car at the driver's position.
 * `getPose` is read every frame, so React only needs to call `map.triggerRepaint()`.
 */
export function createCar3dLayer(getPose: () => CarPose | null): CustomLayerInterface {
  let map: MaplibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const car = buildCar();
  const model = new THREE.Matrix4();
  const projection = new THREE.Matrix4();

  scene.add(car);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-5, 4, -6);
  scene.add(fill);

  return {
    id: CAR_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    onRemove() {
      renderer?.dispose();
    },
    render(_gl, options) {
      const pose = getPose();
      if (!pose) return;
      const { lng, lat } = pose.position;
      // Same exaggerated terrain height MapLibre uses for its own layers.
      const ground = map.queryTerrainElevation([lng, lat]) ?? 0;
      const origin = MercatorCoordinate.fromLngLat([lng, lat], ground);
      const lengthM = carLengthForZoom(map.getZoom(), lat);
      const scale = origin.meterInMercatorCoordinateUnits() * (lengthM / CAR_MODEL_LENGTH_M);

      model.fromArray(carModelMatrix(pose.heading, [origin.x, origin.y, origin.z], scale));
      projection.fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]);
      camera.projectionMatrix = projection.multiply(model);

      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
