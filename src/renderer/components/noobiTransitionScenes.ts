import cozyWorkshopGif from '../assets/noobi-transition-scenes/noobi-cozy-workshop.gif';
import crystalLabGif from '../assets/noobi-transition-scenes/noobi-crystal-lab.gif';
import forestCampGif from '../assets/noobi-transition-scenes/noobi-forest-camp.gif';
import potionGardenGif from '../assets/noobi-transition-scenes/noobi-potion-garden.gif';
import rooftopStudioGif from '../assets/noobi-transition-scenes/noobi-rooftop-studio.gif';
import seasideArcadeGif from '../assets/noobi-transition-scenes/noobi-seaside-arcade.gif';
import skyDockGif from '../assets/noobi-transition-scenes/noobi-sky-dock.gif';
import snowCabinGif from '../assets/noobi-transition-scenes/noobi-snow-cabin.gif';
import starObservatoryGif from '../assets/noobi-transition-scenes/noobi-star-observatory.gif';

export const NOOBI_TRANSITION_SCENES = [
  cozyWorkshopGif,
  crystalLabGif,
  forestCampGif,
  skyDockGif,
  seasideArcadeGif,
  snowCabinGif,
  starObservatoryGif,
  potionGardenGif,
  rooftopStudioGif,
] as const;

export const NOOBI_TRANSITION_SCENE_COUNT = NOOBI_TRANSITION_SCENES.length;

export function noobiTransitionSceneIndex(runId: number): number {
  if (!Number.isFinite(runId) || runId <= 1) return 0;
  return (Math.floor(runId) - 1) % NOOBI_TRANSITION_SCENE_COUNT;
}

export function noobiTransitionSceneForRun(runId: number): string {
  return NOOBI_TRANSITION_SCENES[noobiTransitionSceneIndex(runId)];
}
