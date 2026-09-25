// The effects folder as one namespace, for `ShatterGame` and `CanvasRenderer` only:
// `import * as Fx from "@entities/effects"` and `import type * as Fx` there.
// Nothing inside this folder may import it — the effects that reach each other
// (Singularity, Slump, JellySheet, Erosion) and DropPool keep their direct
// paths, because an effect importing the barrel closes a cycle through itself.
export * from "./Brood";
export * from "./BumperField";
export * from "./Chamber";
export * from "./Chart";
export * from "./Critter";
export * from "./Decoherence";
export * from "./Detonation";
export * from "./Entanglement";
export * from "./Erosion";
export * from "./Fence";
export * from "./Gaze";
export * from "./GravelField";
export * from "./Inside";
export * from "./JellySheet";
export * from "./LoosePupil";
export * from "./MeteorField";
export * from "./Observer";
export * from "./Oculi";
export * from "./ParticleField";
export * from "./Quake";
export * from "./ShadowCast";
export * from "./Singularity";
export * from "./Slump";
export * from "./Superposition";
export * from "./Tears";
export * from "./Tunnelling";
export * from "./Uncertainty";
export * from "./WallOffsets";
