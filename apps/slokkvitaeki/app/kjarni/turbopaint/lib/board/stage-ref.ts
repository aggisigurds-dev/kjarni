import type Konva from "konva";

let stage: Konva.Stage | null = null;

export function registerStage(next: Konva.Stage | null) {
  stage = next;
}

export function getRegisteredStage() {
  return stage;
}
