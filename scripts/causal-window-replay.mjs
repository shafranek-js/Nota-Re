/**
 * Research-only CAUSAL WAV replay. Each inference sees ONLY samples ending
 * at the current acquisition frontier; no microphone/browser or grading.
 * Virtual finish times include sequential CPU service time, not true device latency.
 */
export const DEFAULT_CAUSAL_WINDOW = Object.freeze({ windowMs: 2000, hopMs: 1000 });

function validPositiveMs(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 10000;
}

export async function replayCausalWindows({ samples, sampleRate, infer, windowMs = 2000, hopMs = 1000 }) {
  if (!(samples instanceof Float32Array) || !samples.length ||
      !Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      typeof infer !== 'function' || !validPositiveMs(windowMs) ||
      !validPositiveMs(hopMs) || hopMs > windowMs ||
      windowMs * sampleRate % 1000 !== 0 || hopMs * sampleRate % 1000 !== 0) {
    throw new Error('Invalid causal replay samples, rate, or window/hop configuration');
  }
  const windowSamples = windowMs * sampleRate / 1000;
  const hopSamples = hopMs * sampleRate / 1000;
  if (samples.length < windowSamples) throw new Error('Source WAV is shorter than causal analysis window');
  const windows = [];
  const detected = [];
  let previousEndSample = 0;
  let previousVirtualFinishMs = 0;
  for (let endSample = windowSamples; endSample <= samples.length; endSample += hopSamples) {
    const startSample = endSample - windowSamples;
    const startMs = startSample / sampleRate * 1000;
    const endMs = endSample / sampleRate * 1000;
    const ownershipStartMs = previousEndSample / sampleRate * 1000;
    // Copy exactly the acquired past context: callbacks cannot access future samples.
    const chunk = samples.slice(startSample, endSample);
    const answer = await infer({
      samples: chunk, sampleRate, startMs, endMs, ownershipStartMs
    });
    if (!answer || !Array.isArray(answer.detected) ||
        !Number.isFinite(answer.processingMs) || answer.processingMs < 0) {
      throw new Error('Invalid causal inference result or measured CPU time');
    }
    const virtualStartMs = Math.max(endMs, previousVirtualFinishMs);
    const virtualFinishMs = virtualStartMs + answer.processingMs;
    const accepted = [];
    for (const event of answer.detected) {
      if (!event || !Number.isSafeInteger(event.midi) ||
          event.midi < 21 || event.midi > 108 ||
          !Number.isFinite(event.onsetMs) ||
          event.onsetMs < 0 || event.onsetMs > windowMs ||
          (event.confidence !== undefined && (!Number.isFinite(event.confidence) ||
            event.confidence < 0 || event.confidence > 1))) {
        throw new Error('Invalid estimated onset from causal inference window');
      }
      const globalOnsetMs = startMs + event.onsetMs;
      // A window owns ONLY audio newly acquired since the previous inference.
      // This avoids repeated detections on overlapping context without
      // artificially matching a score or suppressing a genuine retrigger.
      if (globalOnsetMs >= ownershipStartMs - 1e-6 &&
          globalOnsetMs < endMs - 1e-6) {
        const emitted = {
          midi: event.midi, onsetMs: globalOnsetMs, emittedAtMs: virtualFinishMs,
          ...(event.confidence === undefined ? {} : { confidence: event.confidence })
        };
        accepted.push(emitted);
        detected.push(emitted);
      }
    }
    windows.push({
      windowStartMs: startMs, acquiredThroughMs: endMs,
      ownershipStartMs, processingMs: answer.processingMs,
      virtualCpuStartMs: virtualStartMs, virtualCpuFinishMs: virtualFinishMs,
      accumulatedBacklogMs: virtualFinishMs - endMs,
      rawEstimatedAttacks: answer.detected.length,
      acceptedAttacks: accepted.length
    });
    previousEndSample = endSample;
    previousVirtualFinishMs = virtualFinishMs;
  }
  const coveredThroughMs = previousEndSample / sampleRate * 1000;
  const totalDurationMs = samples.length / sampleRate * 1000;
  return {
    config: { windowMs, hopMs, sampleRate },
    totalDurationMs, coveredThroughMs,
    unprocessedTailMs: totalDurationMs - coveredThroughMs,
    windows, detected,
    totalInferenceMs: windows.reduce((sum, x) => sum + x.processingMs, 0),
    maxBacklogMs: Math.max(...windows.map(x => x.accumulatedBacklogMs)),
    // This is a replay under zero capture/OS scheduling overhead and one serial
    // CPU worker. It is a feasibility estimate, not actual attack emission delay.
    latencyMeaning: 'synthetic sequential offline replay: window acquisition end + measured CPU time; NOT measured microphone or UI latency'
  };
}
