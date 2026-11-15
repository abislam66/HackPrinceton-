/** Viewer looks. The model's own materials are fixed in the GLB; a style only changes the scene around it. See model-builder/STYLE.md. */
export type ViewerStyle = "night" | "daylight";

export type Look = {
  background: string;
  fog: string;
  sky: string;
  ground: string;
  keyLight: string;
  keyIntensity: number;
  fillLight: string;
  fillIntensity: number;
  hemiIntensity: number;
  groundPlane: string;
  gridCell: string;
  gridSection: string;
  massingEdge: string;
  shadowOpacity: number;
};

export const VIEWER_STYLES: Record<ViewerStyle, Look> = {
  night: {
    background: "#0d1015",
    fog: "#0d1015",
    sky: "#e4ecf7",
    ground: "#3a404a",
    keyLight: "#ffffff",
    keyIntensity: 1.6,
    fillLight: "#ffffff",
    fillIntensity: 0.9,
    hemiIntensity: 1.3,
    groundPlane: "#161a20",
    gridCell: "#262c35",
    gridSection: "#323a46",
    massingEdge: "#e8edf2",
    shadowOpacity: 0.55,
  },
  daylight: {
    background: "#dfe7ef",
    fog: "#dfe7ef",
    sky: "#ffffff",
    ground: "#b8b2a8",
    keyLight: "#fff3e0",
    keyIntensity: 2.2,
    fillLight: "#cfdcea",
    fillIntensity: 0.7,
    hemiIntensity: 1.5,
    groundPlane: "#c9ccd0",
    gridCell: "#b4bcc6",
    gridSection: "#9aa4b0",
    massingEdge: "#3a404a",
    shadowOpacity: 0.35,
  },
};
