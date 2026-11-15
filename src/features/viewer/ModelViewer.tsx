"use client";

import { ContactShadows, Edges, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, Suspense, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { ModelInfo } from "@/features/model/schema";
import type { CameraPath } from "@/features/shots/schema";
import { boxCenter, fitDistance, pathDuration, presetViews, VIEW_FOV } from "./camera-paths";

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

  const takeControl = () => setUserControl(true);
  const goTo = (name: string) => {
    takeControl();
    setGoal({ ...views[name], id: (goal?.id ?? 0) + 1 });
  };

  // The outer div takes the caller's layout (e.g. "absolute inset-0"); the inner one anchors the overlays.
  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden">
        <Canvas camera={{ fov: path.fov, near: 0.5, far: 20000 }} dpr={[1, 2]} className="!absolute inset-0">
          <color attach="background" args={["#0d1015"]} />
          <fog attach="fog" args={["#0d1015", span * 2.5, span * 7]} />
          <hemisphereLight args={["#e4ecf7", "#3a404a", 1.3]} />
          <directionalLight position={[center[0] + span, span * 1.2, center[2] + span * 0.6]} intensity={1.6} />
          {/* Fill from the north-west, so the side away from the sun still reads */}
          <directionalLight position={[center[0] - span, span * 0.8, center[2] - span]} intensity={0.9} />
          <Ground box={box} span={span} />
          <Suspense fallback={<Massing box={box} />}>
            {model.url ? <BuiltModel url={model.url} /> : <Massing box={box} />}
          </Suspense>
          <ContactShadows position={[0, 0.02, 0]} scale={span * 1.6} far={box.max[1]} blur={2.5} opacity={0.55} resolution={1024} />
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

function BuiltModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
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
  const frames = useMemo(
    () =>
      path.keyframes.map((k) => ({
        t: k.t,
        position: new Vector3(...k.position),
        target: new Vector3(...k.target),
      })),
    [path],
  );
  const scratch = useMemo(() => ({ position: new Vector3(), target: new Vector3() }), []);

  useFrame(({ camera, clock }) => {
    if (paused || finished.current) return; // the viewer is orbiting by hand, or the path has ended
    if (start.current === null) start.current = clock.getElapsedTime();
    const elapsed = clock.getElapsedTime() - start.current;
    const t = duration === 0 ? 0 : loop ? elapsed % duration : Math.min(elapsed, duration);

    let next = frames.findIndex((f) => f.t >= t);
    if (next === -1) next = frames.length - 1;
    const a = frames[Math.max(next - 1, 0)];
    const b = frames[next];
    const span = b.t - a.t;
    const raw = span === 0 ? 1 : (t - a.t) / span;
    const eased = MathUtils.smootherstep(raw, 0, 1);

    scratch.position.lerpVectors(a.position, b.position, eased);
    scratch.target.lerpVectors(a.target, b.target, eased);
    camera.position.copy(scratch.position);
    camera.lookAt(scratch.target);
    // Keep the orbit pivot on the path's target, so grabbing the model mid-flight orbits around what was in view.
    if (controls) controls.target.copy(scratch.target);
    if (camera instanceof PerspectiveCamera && camera.fov !== path.fov) {
      camera.fov = path.fov;
      camera.updateProjectionMatrix();
    }
    if (!loop && elapsed >= duration) {
      finished.current = true;
      onDone(); // hand over to the slow auto-rotate
    }
  });

  return null;
}
