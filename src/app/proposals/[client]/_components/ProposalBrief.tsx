"use client";

import { type RefObject, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/ui/Logo";
import { poseAt } from "@/features/shots/motion";
import { cutAt, planReel, type Reel } from "@/features/shots/reel";
import type { CameraPath, Shot } from "@/features/shots/schema";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { sendEvent } from "@/features/tracking/client";
import { TRADESMARK_CONTACT_EMAIL, type ProposalData, type ShotRow } from "./proposal-data";
import "./ProposalBrief.css";

/**
 * The client proposal page, picked from the Brief prototype (docs/proposal-page-audit.md): a document you read, with
 * the film in its place. Plaster page, the grid doing the work, and two canvases with one job each: the opening flight (plays once, holds on its last frame) and the reel beside the shot
 * list (mounts when scrolled into view). Asphalt only for the opening and the close; Cone only on Book a call and
 * the hairline that marks the shot on screen.
 *
 * The two canvases take turns: ModelViewer's GLB comes from useGLTF's cache as one three.js scene, and an object can
 * only have one parent, so two mounted viewers would leave the first one empty. Whichever section is on screen holds
 * the model; the other shows its Asphalt ground.
 */
export function ProposalBrief({ data, track }: { data: ProposalData; track: boolean }) {
  const { pitch, bookCall } = data;
  const reduced = useReducedMotion();
  const openRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [owner, setOwner] = useState<"open" | "reel">("open");
  // Once the reel has taken the model, coming back to the opening shows the flight's last frame, not the flight.
  const [teaserSpent, setTeaserSpent] = useState(false);

  useEffect(() => {
    const open = openRef.current;
    const frame = frameRef.current;
    if (!open || !frame) return;
    const seen = { open: true, reel: false };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const visible = e.intersectionRatio >= 0.35;
          if (e.target === open) seen.open = visible;
          else seen.reel = visible;
        }
        // The opening wins a tie, so the first paint (when the layout may still be settling) keeps the flight.
        if (seen.open) setOwner("open");
        else if (seen.reel) {
          setOwner("reel");
          setTeaserSpent(true);
        }
      },
      { threshold: [0, 0.35, 0.6] },
    );
    io.observe(open);
    io.observe(frame);
    return () => io.disconnect();
  }, []);

  return (
    <main className="proposal tm-ground-plaster">
      <Opening data={data} reduced={reduced || teaserSpent} sectionRef={openRef} live={owner === "open"} />

      {pitch ? (
        <>
          <ProjectSection data={data} />
          <FilmSection data={data} reduced={reduced} frameRef={frameRef} live={owner === "reel"} />
          <section className="tm-wrap proposal-across">
            <div className="tm-grid">
              <p className="tm-h-long tm-h--xs proposal-across-line">{pitch.acrossProject}</p>
            </div>
          </section>
        </>
      ) : null}

      <section className="tm-ground-asphalt proposal-close" aria-labelledby="proposal-close-title">
        <div className="tm-wrap">
          <div className="tm-grid">
            <div className="proposal-close-copy">
              <h2 id="proposal-close-title" className="tm-h tm-h--l">
                Plan the shoot
              </h2>
              <BookCall
                href={bookCall.href}
                label={bookCall.label}
                onClick={track ? () => sendEvent({ clientId: data.client.id, type: "click", payload: { target: "book-call" } }) : undefined}
              />
            </div>
          </div>
          <footer className="tm-grid proposal-foot">
            <Wordmark className="proposal-logo" title="Tradesmark" />
            <a className="tm-text--m proposal-mail" href={`mailto:${TRADESMARK_CONTACT_EMAIL}`}>
              {TRADESMARK_CONTACT_EMAIL}
            </a>
          </footer>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ opening */

function Opening({
  data,
  reduced,
  sectionRef,
  live,
}: {
  data: ProposalData;
  /** No flight: the camera sits where the flight ends (reduced motion, or the flight has already been seen). */
  reduced: boolean;
  sectionRef: RefObject<HTMLElement | null>;
  /** This canvas holds the model. */
  live: boolean;
}) {
  const { client, project, model, pitch, teaser } = data;
  const path = useMemo<CameraPath>(
    () => (reduced ? { fov: teaser.fov, keyframes: [{ ...teaser.keyframes[teaser.keyframes.length - 1], t: 0 }] } : teaser),
    [reduced, teaser],
  );
  return (
    <section ref={sectionRef} className="tm-ground-asphalt proposal-open">
      {live ? <ModelViewer model={model} path={path} loop={false} interactive={false} className="proposal-viewer" /> : null}
      <div className="tm-wrap proposal-open-overlay">
        <Wordmark className="proposal-logo" title="Tradesmark" />
        <div className="tm-grid">
          <div className="proposal-open-copy">
            <p className="tm-label proposal-rise">{client.companyDisplay}</p>
            {pitch ? (
              <p className="tm-h tm-h--m proposal-rise">{pitch.teaserLine}</p>
            ) : (
              <h1 className="tm-h tm-h--m proposal-rise">{project.name}</h1>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ project */

function ProjectSection({ data }: { data: ProposalData }) {
  const { project, pitch } = data;
  if (!pitch) return null;
  // Only real fields; anything empty is skipped rather than shown as a blank row.
  const facts = (
    [
      ["Address", project.address],
      ["Building", project.buildingType],
      ["Scope", project.scopeType],
      ["Timeline", project.timeline],
      ["Height", project.heightM > 0 ? `${project.heightM} m` : ""],
    ] as const
  ).filter(([, value]) => value.trim() !== "");

  return (
    <section className="tm-wrap proposal-project">
      <div className="tm-grid">
        <div className="proposal-main">
          <h1 className="tm-h tm-h--l">{project.name}</h1>
          <p className="tm-lead proposal-lead">{pitch.headline}</p>
          <div className="proposal-prose">
            <p className="tm-body">{pitch.problem}</p>
            <p className="tm-body">{pitch.solution}</p>
          </div>
        </div>
        {facts.length > 0 ? (
          <dl className="proposal-facts">
            {facts.map(([label, value]) => (
              <div key={label} className="proposal-fact">
                <dt className="tm-label tm-muted">{label}</dt>
                <dd className="tm-text--m">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ film */

/** One run of the camera: the reel from a shot onward, or (for a shot the reel had to drop) that shot alone. */
type Take = { shotId: string | null; n: number };

function FilmSection({
  data,
  reduced,
  frameRef,
  live,
}: {
  data: ProposalData;
  reduced: boolean;
  frameRef: RefObject<HTMLDivElement | null>;
  /** This canvas holds the model: mounted the first time the frame is on screen, so the reel starts when seen. */
  live: boolean;
}) {
  const { model, shots, shotRows, obstacles } = data;
  const reel = useMemo(() => planReel(shots, model.boundingBox, { obstacles }), [shots, model.boundingBox, obstacles]);

  // List the shots in the order the reel flies them; any it had to drop go last and play on their own.
  const rows = useMemo(() => {
    const inReel = reel.cuts.map((c) => c.shot.id);
    const byId = new Map(shotRows.map((r) => [r.id, r]));
    return [
      ...inReel.flatMap((id) => byId.get(id) ?? []),
      ...shotRows.filter((r) => !inReel.includes(r.id)),
    ];
  }, [reel, shotRows]);

  const [take, setTake] = useState<Take>({ shotId: null, n: 0 });
  const [clock, setClock] = useState<{ n: number; activeId: string } | null>(null);

  const plan = useMemo(() => planTake(take, reel, shots, reduced), [take, reel, shots, reduced]);

  // Follow the camera's clock for the marked row and the caption; start over from the top when a run ends.
  useEffect(() => {
    if (!live || reduced || !plan) return;
    const started = performance.now();
    const tick = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= plan.duration) {
        setTake((t) => ({ shotId: null, n: t.n + 1 }));
        return;
      }
      const activeId = plan.soloId ?? cutAt(reel, plan.start + easeTime(elapsed, plan.duration))?.shot.id ?? plan.firstId;
      setClock((c) => (c && c.n === take.n && c.activeId === activeId ? c : { n: take.n, activeId }));
    }, 100);
    return () => window.clearInterval(tick);
  }, [live, reduced, plan, reel, take.n]);

  if (!plan || rows.length === 0) return null;
  const activeId = clock && clock.n === take.n ? clock.activeId : plan.firstId;
  const activeIndex = Math.max(0, rows.findIndex((r) => r.id === activeId));
  // A fresh object per take, so the viewer restarts even when the path itself repeats (the reel looping).
  const path = { ...plan.path, take: take.n };

  return (
    <section className="tm-wrap proposal-film" aria-labelledby="proposal-film-title">
      <div className="tm-grid proposal-film-grid">
        <h2 id="proposal-film-title" className="tm-h tm-h--m proposal-film-title">
          Shot plan
        </h2>

        <div className="proposal-stage">
          <div ref={frameRef} className="proposal-frame" role="img" aria-label={`Shot ${activeIndex + 1}: ${rows[activeIndex].name}`}>
            {live ? <ModelViewer model={data.model} path={path} loop={false} interactive={false} className="proposal-viewer" /> : null}
            <div className="proposal-frame-cover" aria-hidden="true" />
          </div>
          <div className="proposal-captions">
            {rows.map((row, i) => (
              <div key={row.id} className="proposal-caption" data-active={i === activeIndex ? "" : undefined} aria-hidden={i !== activeIndex}>
                <p className="tm-label tm-num tm-muted">
                  {pad(i + 1)} / {pad(rows.length)}
                </p>
                <p className="tm-body">{row.caption ?? row.name}</p>
              </div>
            ))}
          </div>
        </div>

        <ol className="proposal-shots">
          {rows.map((row, i) => (
            <ShotItem
              key={row.id}
              row={row}
              number={i + 1}
              active={i === activeIndex}
              onPlay={() => setTake((t) => ({ shotId: row.id, n: t.n + 1 }))}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function ShotItem({ row, number, active, onPlay }: { row: ShotRow; number: number; active: boolean; onPlay: () => void }) {
  const spec = [row.platform, row.lens, row.timeOfDay, row.constructionPhase].filter((s) => s.trim() !== "").join(" · ");
  return (
    <li className="proposal-shot" data-active={active ? "" : undefined}>
      <button type="button" className="proposal-shot-btn" aria-current={active ? "true" : undefined} onClick={onPlay}>
        <span className="tm-label tm-num">{pad(number)}</span>
        <span className="proposal-shot-text">
          <span className="tm-text--m proposal-shot-name">{row.name}</span>
          <span className="tm-label tm-muted">{spec}</span>
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ the button */

/** The brand button (components.css `tm-btn`: 1 px frame, rolling label, arrow cell), in Cone. */
function BookCall({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <a className="tm-btnlink proposal-cta" href={href} onClick={onClick}>
      <span className="tm-btn proposal-btn">
        <span className="tm-btn__label">
          <span className="tm-roll">{label}</span>
          <span className="tm-roll" aria-hidden="true">
            {label}
          </span>
        </span>
        <span className="tm-btn__icon" aria-hidden="true">
          <span className="tm-btn__cell">
            <Arrow />
          </span>
          <span className="tm-btn__cell tm-btn__cell--in">
            <Arrow />
          </span>
        </span>
      </span>
    </a>
  );
}

function Arrow() {
  return (
    <svg className="tm-arrow" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6.6 1.4 11.2 6l-4.6 4.6-.9-.9 3-3.05H.8v-1.3h7.9l-3-3.05z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ helpers */

type Plan = {
  path: CameraPath;
  /** Seconds into the reel where this run starts (the clock's offset). */
  start: number;
  /** Length of this run, in seconds. Zero for a still. */
  duration: number;
  /** Set when a dropped shot plays on its own. */
  soloId: string | null;
  /** The shot on screen at the start of the run. */
  firstId: string;
};

/** What the camera plays for a take: the reel from a shot onward, a dropped shot alone, or (reduced motion) a still. */
function planTake(take: Take, reel: Reel, shots: Shot[], reduced: boolean): Plan | null {
  if (!reel.path || reel.cuts.length === 0) return null;
  const fov = reel.path.fov; // constant across takes, so the viewer never rebuilds its camera
  const cut = take.shotId ? reel.cuts.find((c) => c.shot.id === take.shotId) : reel.cuts[0];
  const shot = cut?.shot ?? shots.find((s) => s.id === take.shotId);
  if (!shot) return null;

  if (reduced) {
    // A still from the middle of the shot.
    const pose = poseAt(shot.camera, (shot.camera.keyframes.at(-1)?.t ?? 0) / 2);
    return { path: { fov, keyframes: [{ t: 0, ...pose }] }, start: 0, duration: 0, soloId: null, firstId: shot.id };
  }
  if (!cut) {
    const keyframes = shot.camera.keyframes.map((k) => ({ ...k, fov: k.fov ?? shot.camera.fov }));
    return { path: { fov, keyframes }, start: 0, duration: keyframes.at(-1)?.t ?? 0, soloId: shot.id, firstId: shot.id };
  }
  // The reel from this cut's first keyframe onward, re-timed to start at 0.
  const kept = reel.path.keyframes.filter((k) => k.t >= cut.start - 0.002);
  const base = kept[0]?.t ?? 0;
  const keyframes = kept.map((k) => ({ ...k, t: k.t - base }));
  return { path: { fov, keyframes }, start: base, duration: keyframes.at(-1)?.t ?? 0, soloId: null, firstId: shot.id };
}

/**
 * The viewer's time remap (motion.ts `easeTime`, not exported): the path eases in and out over at most 1.5 s at its
 * ends. Mirrored here so the marked row follows what is on screen, not the raw clock.
 */
function easeTime(t: number, duration: number): number {
  const ramp = Math.min(1.5, duration / 4);
  if (ramp <= 0) return t;
  const v = duration / (duration - ramp);
  if (t < ramp) return (v * t * t) / (2 * ramp);
  if (t > duration - ramp) return duration - (v * (duration - t) ** 2) / (2 * ramp);
  return v * (t - ramp / 2);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}
