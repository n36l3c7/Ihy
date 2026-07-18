/** Shared handle to the Web Audio analyser created by usePlayerAudio,
 *  consumed by the visualizer. Null until playback is initialised. */
export const audioGraph: { analyser: AnalyserNode | null } = { analyser: null };
