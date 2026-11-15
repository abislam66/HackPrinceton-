"use client";

import { Edges, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { ModelInfo } from "@/features/model/schema";
import type { CameraPath } from "@/features/shots/schema";
import { pathDuration } from "./camera-paths";

type Props = {
  model: ModelInfo;
  /** The camera move to play. Changing it restarts playback. */
  path: CameraPath;
  loop?: boolean;
  /** Let the viewer orbit, zoom and pan. Grabbing the model stops the camera path; Replay restarts it. */
  interactive?: boolean;
  className?: string;
};

/** The shared 3D view. The proposal teaser and the shot preview both play camera paths through it. */
export function ModelViewer({ model, path, loop = true, interactive = true, className }: Props) {
  const [userControl, setUserControl] = useState(false);
  const [replay, setReplay] = useState(0);
  const box = model.boundingBox;
  const span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <Canvas camera={{ fov: path.fov, near: 0.5, far: 5000 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b0d10"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[80, 160, 120]} intensity={1.6} />
        <Ground box={box} />
        <Suspense fallback={<Massing box={box} />}>
          {model.url ? <BuiltModel url={model.url} /> : <Massing box={box} />}
        </Suspense>
        {interactive && (
          <OrbitControls
            makeDefault
            enableDamping
            minDistance={span * 0.15}
            maxDistance={span * 6}
            maxPolarAngle={Math.PI / 2 - 0.02} // stay above the ground
            onStart={() => setUserControl(true)}
          />
        )}
        <CameraRig key={`${JSON.stringify(path)}-${replay}`} path={path} loop={loop} paused={userControl} />
      </Canvas>
      {interactive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3 text-xs text-zinc-300">
          <span className="rounded bg-black/50 px-2 py-1">Drag to orbit · scroll to zoom · right-drag to pan</span>
          {userControl && (
            <button
              type="button"
              onClick={() => {
                setUserControl(false);
                setReplay((n) => n + 1);
              }}
              className="pointer-events-auto rounded bg-black/60 px-3 py-1 font-medium text-white hover:bg-black/80"
            >
              Replay
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BuiltModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

/** Gray-box stand-in shown until the model builder has produced a GLB. */
function Massing({ box }: { box: ModelInfo["boundingBox"] }) {
  const size: [number, number, number] = [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ];
  const center: [number, number, number] = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  return (
    <mesh position={center}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#8b939e" />
      <Edges color="#e8edf2" />
    </mesh>
  );
}

function Ground({ box }: { box: ModelInfo["boundingBox"] }) {
  const extent = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]) * 12;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[extent, extent]} />
      <meshStandardMaterial color="#1a1e24" />
    </mesh>
  );
}

function CameraRig({ path, loop, paused }: { path: CameraPath; loop: boolean; paused: boolean }) {
  const duration = pathDuration(path);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const start = useRef<number | null>(null); // clock time when this playback began, so Replay starts at t = 0
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
    if (paused) return; // the viewer is orbiting by hand
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
  });

  return null;
}
