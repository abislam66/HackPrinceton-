import { describe, expect, it } from "vitest";
import { Group, Mesh, BoxGeometry, LineSegments, MeshStandardMaterial } from "three";
import { toonParams } from "@/features/model/scene";
import { applyHouseLook, toonMaterial, vec } from "./house-look";

describe("house look", () => {
  it("passes hex colours to the shader as raw channels, like the scaffold (no sRGB-to-linear conversion)", () => {
    const v = vec("#D9D3C7");
    expect(v.x).toBeCloseTo(0xd9 / 255, 6);
    expect(v.y).toBeCloseTo(0xd3 / 255, 6);
    expect(v.z).toBeCloseTo(0xc7 / 255, 6);
  });

  it("restyles a generated model once: toon materials from extras, shadows, outlines unless nolines", () => {
    const glass = new MeshStandardMaterial({ name: "glass" });
    glass.userData.toon = toonParams({ type: "curtain", light: "#7E9CAB", shade: "#4A6070" });
    const fins = new MeshStandardMaterial({ name: "fins" });
    fins.userData.toon = toonParams({ type: "toon", light: "#E8B730", shade: "#A88420", nolines: true });
    const legacy = new MeshStandardMaterial({ color: "#8899aa" }); // a GLB from before: no extras
    const root = new Group();
    const meshes = [glass, fins, legacy].map((m) => new Mesh(new BoxGeometry(1, 1, 1), m));
    root.add(...meshes);

    applyHouseLook(root);
    applyHouseLook(root); // idempotent: the loader caches the scene

    expect(meshes.every((m) => m.castShadow && m.receiveShadow)).toBe(true);
    expect(meshes.map((m) => m.children.filter((c) => c instanceof LineSegments).length)).toEqual([1, 0, 1]);
    expect(meshes[0].material).not.toBe(glass);
    expect((meshes[2].material as { userData: { houseLook?: boolean } }).userData.houseLook).toBe(true);
  });

  it("builds one toon material per source material", () => {
    expect(toonMaterial(toonParams({ type: "toon", light: "#ffffff", shade: "#000000" })).userData.nolines).toBe(false);
  });
});
