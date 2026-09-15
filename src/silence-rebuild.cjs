// The host owns source geometry; the panel yields between native insertion batches.
async function rebuildSequence(call, plan, cancelled, progress) {
  const hostTimings = [], fallbacks = [], recent = [];
  const initialBatchSize = plan.batchSize === undefined ? 24 : plan.batchSize;
  let batchSize = initialBatchSize, retryPayload = '';
  const request = async (action, payload = '') => {
    const started = Date.now();
    const raw = await call(action, payload);
    hostTimings.push({ action, elapsedMs: Date.now() - started });
    if (raw.startsWith('ERR:')) throw new Error(raw.slice(4));
    const result = JSON.parse(raw);
    if (!result || typeof result !== 'object') throw new Error('Invalid rebuild response');
    return result;
  };
  try {
    if (cancelled()) throw new Error('Stopped before rebuilding');
    let state = await request('begin', JSON.stringify({ ...plan, batchSize }));
    while (!state.done) {
      if (!Number.isInteger(state.completed) || !Number.isInteger(state.total) || state.completed < 0 || state.completed >= state.total) throw new Error('Invalid rebuild progress');
      if (cancelled()) throw new Error('Stopped; the incomplete copy is retained and the original is unchanged');
      const sampledPairs = recent.reduce((sum, sample) => sum + sample.pairs, 0);
      const remainingMs = sampledPairs ? recent.reduce((sum, sample) => sum + sample.ms, 0) / sampledPairs * (state.total - state.completed) : null;
      progress(state.completed, state.total, batchSize, { phase: 'building', remainingMs });
      const previous = state;
      state = await request('step', retryPayload);
      retryPayload = '';
      if (state.total !== previous.total || !Number.isInteger(state.completed) || state.completed < previous.completed || state.completed > state.total ||
          (state.retryable === true && (state.done !== false || state.completed >= state.total))) throw new Error('Rebuild made no valid progress');
      if (state.retryable === true) {
        const next = batchSize === 24 ? 16 : batchSize === 16 ? 8 : null;
        if (!next) throw new Error('Insert failed at the smallest batch; incomplete copy retained');
        if (state.retryBatchSize !== next) throw new Error('Invalid smaller-batch retry response');
        fallbacks.push({ from: batchSize, to: next, completed: state.completed, reason: state.retryReason || 'Insert failed without changing the verified timeline' });
        batchSize = next;
        recent.length = 0;
        retryPayload = JSON.stringify({ batchSize });
      } else {
        if (state.completed <= previous.completed) throw new Error('Rebuild made no valid progress');
        recent.push({ pairs: state.completed - previous.completed, ms: hostTimings[hostTimings.length - 1].elapsedMs });
        if (recent.length > 3) recent.shift();
      }
    }
    if (cancelled()) throw new Error('Stopped before final verification');
    progress(state.completed, state.total, batchSize, { phase: 'checking', remainingMs: null });
    const result = await request('finish');
    if (!result.done || !result.sequenceId || !Array.isArray(result.mapping) || !Number.isFinite(result.duration)) throw new Error('Rebuild did not return verified source ranges');
    if (!result.name || !result.mapping.length) throw new Error('Rebuild returned no source mapping');
    let end = 0;
    for (const span of result.mapping) {
      if (!span.sourceId || !['sourceIn','sourceOut','originalStart','originalEnd','start','end'].every(key => Number.isFinite(span[key])) ||
          span.sourceIn < 0 || span.originalStart < 0 || span.start !== end || span.end <= span.start ||
          Math.abs((span.sourceOut - span.sourceIn) - (span.end - span.start)) > 1e-6 ||
          Math.abs((span.originalEnd - span.originalStart) - (span.end - span.start)) > 1e-6) throw new Error('Invalid verified source mapping');
      end = span.end;
    }
    if (Math.abs(end - result.duration) > 1e-6) throw new Error('Source mapping duration differs from sequence');
    return { ...result, batchSize, initialBatchSize, fallbacks, hostTimings };
  } catch (error) {
    try { await request('cancel'); } catch (cleanup) { error.message += '; cleanup: ' + cleanup.message; }
    throw error;
  }
}

// Evidence only: never stamp this as an independently transcribed/render-verified transcript.
// A word crossing a cut is retained as a flagged fragment, not silently treated as a complete word.
function mapRetainedWords(words, mapping) {
  const out = [];
  for (const span of mapping) for (const word of words) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;
    const start = Math.max(word.start, span.originalStart), end = Math.min(word.end, span.originalEnd);
    if (end <= start) continue;
    out.push({ ...word, originalStart: word.start, originalEnd: word.end,
      start: span.start + start - span.originalStart, end: span.start + end - span.originalStart,
      sourceId: span.sourceId, sourceStart: span.sourceIn + start - span.originalStart,
      sourceEnd: span.sourceIn + end - span.originalStart,
      partial: start > word.start || end < word.end });
  }
  return out;
}
module.exports = { rebuildSequence, mapRetainedWords };
