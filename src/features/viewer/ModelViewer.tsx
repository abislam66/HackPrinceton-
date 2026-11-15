"use client";

import { ContactShadows, Edges, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, Suspense, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box3, DirectionalLight, PerspectiveCamera, Sphere, Vector3 } from "three";
import { GROUND_TOON } from "@/features/model/scene";
import type { ModelInfo } from "@/features/model/schema";
import { poseAt } from "@/features/shots/motion";
import type { CameraPath } from "@/features/shots/schema";
import { boxCenter, fitDistance, pathDuration, presetViews, VIEW_FOV } from "./camera-paths";
import { applyHouseLook, toonMaterial } from "./house-look";

/** The building viewer's house stage (building-viewer/scaffold.html): its background, sun direction and ground. */
const HOUSE_BACKGROUND = "#DC5527";
const HOUSE_SUN = new Vector3(0.55, 0.75, 0.35).normalize();
/** Covers the neighbours and streets, which reach 220 m from the building (geo.ts). */
const HOUSE_GROUND_RADIUS = 260;

type Props = {
  model: ModelInfo;
  /** The camera move to play. Changing it restarts playback. */
  path: CameraPath;
  /** Loop the path. When false, the camera slowly circles the model after the path ends. */
  loop?: boolean;
  /** Orbit, zoom, pan and view buttons. Grabbing the model stops the camera path; Replay restarts it. */
  interactive?: boolean;
  className?: string;
};

type Box = ModelInfo["boundingBox"];
type Goal = { position: [number, number, number]; target: [number, number, number]; id: number };

/** The shared 3D view. The proposal teaser and the shot preview both play camera paths through it. */
export function ModelViewer({ model, path, loop = true, interactive = true, className }: Props) {
  const [userControl, setUserControl] = useState(false);
  const [replay, setReplay] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pathDone, setPathDone] = useState(false);
  const dial = useRef<HTMLDivElement>(null);
  // Set the dial's rotation directly every frame, without re-rendering React.
  const turnDial = (heading: number) => {
    if (dial.current) dial.current.style.transform = `rotate(${-heading}rad)`;
  };
  const box = model.boundingBox;
  const center = boxCenter(box);
  const span = fitDistance(box, VIEW_FOV);
  const views = useMemo(() => presetViews(box), [box]);
  // Every built model (the model builder's or a generated one) gets the building viewer's look. The gray-box
  // stand-in, shown before any model exists, keeps the dark studio stage.
  const house = Boolean(model.url);

  const takeControl = () => setUserControl(true);
  const goTo = (name: string) => {
    takeControl();
    setGoal({ ...views[name], id: (goal?.id ?? 0) + 1 });
  };

  // The outer div takes the caller's layout (e.g. "absolute inset-0"); the inner one anchors the overlays.
  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden">
        <Canvas
          key={house ? "house" : "studio"}
          shadows={house ? "percentage" : false}
          camera={{ fov: path.fov, near: 0.5, far: 20000 }}
          dpr={[1, 2]}
          className="!absolute inset-0"
        >
          {house && model.url ? (
            <>
              <color attach="background" args={[HOUSE_BACKGROUND]} />
              {/* Outside Suspense, so the stand-in is lit while the GLB loads */}
              <HouseSun box={box} />
              <HouseGround />
              <Suspense fallback={<Massing box={box} />}>
                <HouseModel url={model.url} />
              </Suspense>
            </>
          ) : (
            <>
              <color attach="background" args={["#0d1015"]} />
              <fog attach="fog" args={["#0d1015", span * 2.5, span * 7]} />
              <hemisphereLight args={["#e4ecf7", "#3a404a", 1.3]} />
              <directionalLight position={[center[0] + span, span * 1.2, center[2] + span * 0.6]} intensity={1.6} />
              {/* Fill from the north-west, so the side away from the sun still reads */}
              <directionalLight position={[center[0] - span, span * 0.8, center[2] - span]} intensity={0.9} />
              <Ground box={box} span={span} />
              <Massing box={box} />
              <ContactShadows position={[0, 0.02, 0]} scale={span * 1.6} far={box.max[1]} blur={2.5} opacity={0.55} resolution={1024} />
            </>
          )}
          {interactive && <CompassDriver onHeading={turnDial} />}
          {interactive && (
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              target={center}
              minDistance={span * 0.12}
              maxDistance={span * 3}
              maxPolarAngle={Math.PI / 2 - 0.03} // stay above the ground
              autoRotate={!userControl && pathDone}
              autoRotateSpeed={0.6}
              onStart={takeControl}
            />
          )}
          <CameraRig
            key={`${JSON.stringify(path)}-${replay}`}
            path={path}
            loop={loop}
            paused={userControl}
            onDone={() => setPathDone(true)}
          />
          {goal && <CameraTween key={goal.id} goal={goal} />}
        </Canvas>

        {interactive && (
          <>
            <CompassDial dial={dial} />
            <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1 sm:right-4 sm:top-4">
              {Object.keys(views).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => goTo(name)}
                  className="rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-zinc-100 backdrop-blur hover:bg-black/80"
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setUserControl(false);
                  setPathDone(false);
                  setGoal(null);
                  setReplay((n) => n + 1);
                }}
                className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-white"
              >
                Replay
              </button>
            </div>
            <p className="pointer-events-none absolute right-3 bottom-3 hidden rounded-md bg-black/45 px-2 py-1 text-[11px] text-zinc-300 sm:right-4 sm:bottom-4 sm:block">
              Drag to orbit · scroll to zoom · right-drag to pan
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A built model in the building viewer's look: toon materials and outlines on the GLB, lit by the house sun alone
 * (the toon split needs the shaded side to be dark).
 */
function HouseModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  useMemo(() => applyHouseLook(scene), [scene]);
  return <primitive object={scene} />;
}

/** Neighbours come from within 220 m of the building (geo.ts), so the sun's shadow covers that much around it. */
const NEIGHBOUR_REACH_M = 240;

/** The house sun: fixed direction, its shadow fitted to the building and the ring of neighbours around it. */
function HouseSun({ box }: { box: Box }) {
  const sun = useMemo(() => {
    const light = new DirectionalLight(0xffffff, Math.PI);
    const sphere = new Box3(new Vector3(...box.min), new Vector3(...box.max)).getBoundingSphere(new Sphere());
    sphere.center.y = 0;
    const r = Math.max(sphere.radius, NEIGHBOUR_REACH_M);
    light.position.copy(sphere.center).addScaledVector(HOUSE_SUN, r * 2);
    light.target.position.copy(sphere.center);
    light.castShadow = true;
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = Math.min(0.35, r / 900);
    const cam = light.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.1;
    cam.far = r * 4;
    cam.updateProjectionMatrix();
    return light;
  }, [box]);
  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  );
}

/** The house ground: a toon disc in the locked ground colours, catching the sun's shadows. */
function HouseGround() {
  const material = useMemo(() => toonMaterial(GROUND_TOON), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow material={material}>
      <circleGeometry args={[HOUSE_GROUND_RADIUS, 96]} />
    </mesh>
  );
}

/** Gray-box stand-in shown until the model builder has produced a GLB. */
function Massing({ box }: { box: Box }) {
  const size: [number, number, number] = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  return (
    <mesh position={boxCenter(box)}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#8b939e" />
      <Edges color="#e8edf2" />
    </mesh>
  );
}

/** A dark ground with a faint 10 m grid, for a sense of scale. */
function Ground({ box, span }: { box: Box; span: number }) {
  const [cx, , cz] = boxCenter(box);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]}>
        <planeGeometry args={[span * 14, span * 14]} />
        <meshStandardMaterial color="#161a20" />
      </mesh>
      <Grid
        position={[cx, 0.01, cz]}
        args={[span * 4, span * 4]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#262c35"
        sectionSize={50}
        sectionThickness={0.9}
        sectionColor="#323a46"
        fadeDistance={span * 2.2}
        fadeStrength={1.5}
        infiniteGrid
      />
    </>
  );
}

/** Turns the compass dial so its N always points to model north (-Z) as seen from the camera. */
function CompassDriver({ onHeading }: { onHeading: (radians: number) => void }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const scratch = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const target = controls?.target ?? scratch.set(0, 0, 0);
    // Heading of the camera's view on the ground; 0 when looking north.
    onHeading(Math.atan2(target.x - camera.position.x, -(target.z - camera.position.z)));
  });
  return null;
}

/** A small compass in the corner, so viewers know which side of the building they are looking at. */
function CompassDial({ dial }: { dial: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 size-12 rounded-full border border-white/15 bg-black/45 backdrop-blur sm:left-4 sm:top-4">
      <div ref={dial} className="absolute inset-0">
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[10px] font-bold text-red-400">N</span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-zinc-400">S</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400">E</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400">W</span>
        <span className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-full rounded bg-red-400/80" />
      </div>
    </div>
  );
}

/** Glides the camera and orbit pivot to a preset view over about a second. */
function CameraTween({ goal }: { goal: Goal }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const to = useMemo(() => ({ position: new Vector3(...goal.position), target: new Vector3(...goal.target) }), [goal]);
  const done = useRef(false);
  useFrame(({ camera }, delta) => {
    if (done.current) return;
    const k = 1 - Math.exp(-delta * 4); // frame-rate independent easing
    camera.position.lerp(to.position, k);
    if (controls) {
      controls.target.lerp(to.target, k);
      controls.update();
    } else {
      camera.lookAt(to.target);
    }
    if (camera.position.distanceTo(to.position) < 0.05) done.current = true;
  });
  return null;
}

function CameraRig({
  path,
  loop,
  paused,
  onDone,
}: {
  path: CameraPath;
  loop: boolean;
  paused: boolean;
  onDone: () => void;
}) {
  const duration = pathDuration(path);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const start = useRef<number | null>(null); // clock time when this playback began, so Replay starts at t = 0
  const finished = useRef(false);
  const scratch = useMemo(() => ({ position: new Vector3(), target: new Vector3() }), []);

  useFrame(({ camera, clock }) => {
    if (paused || finished.current) return; // the viewer is orbiting by hand, or the path has ended
    if (start.current === null) start.current = clock.getElapsedTime();
    const elapsed = clock.getElapsedTime() - start.current;
    const t = duration === 0 ? 0 : loop ? elapsed % duration : Math.min(elapsed, duration);

    // A smooth spline through the keyframes, easing only at the ends of the path (no stop at each keyframe).
    const pose = poseAt(path, t);
    scratch.position.set(...pose.position);
    scratch.target.set(...pose.target);
    camera.position.copy(scratch.position);
    camera.lookAt(scratch.target);
    // Keep the orbit pivot on the path's target, so grabbing the model mid-flight orbits around what was in view.
    if (controls) controls.target.copy(scratch.target);
    if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - pose.fov) > 0.01) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    if (!loop && elapsed >= duration) {
      finished.current = true;
      onDone(); // hand over to the slow auto-rotate
    }
  });

  return null;
}
