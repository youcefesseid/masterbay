// A tiny filter-graph builder.
//
// FFmpeg's -filter_complex is a flat list of semicolon-separated chains wired together by
// [labels]. Assembling that by hand is fine for one branch and miserable for several, and
// this tool now needs several: a blurred backdrop, halation, and any future effect that
// has to composite a frame with a processed copy of itself.
//
// So: append linear filters, or fork/rejoin, and let the builder keep the labels unique.
// A wrong or duplicated label produces an FFmpeg error that names a numbered filter rather
// than the effect you were adding, which is a genuinely painful thing to debug.

export class GraphBuilder {
  constructor(inputLabel = '0:v') {
    this.chains = [];
    this.current = inputLabel;
    this.pending = [];
    this.n = 0;
  }

  label(hint) {
    this.n += 1;
    return `mb_${hint}${this.n}`;
  }

  /** Queue linear filters. They are only flushed when a fork or the end forces it. */
  linear(filters) {
    for (const f of [].concat(filters)) if (f) this.pending.push(f);
    return this;
  }

  /** Emit everything queued so far as one chain, ending at a fresh label. */
  flush(hint = 'n') {
    if (!this.pending.length) return this.current;
    const out = this.label(hint);
    this.chains.push(`[${this.current}]${this.pending.join(',')}[${out}]`);
    this.pending = [];
    this.current = out;
    return out;
  }

  /**
   * Fork the stream into named branches and recombine them.
   *
   * `branches` is an ordered array of filter arrays; `combine` is the filter that consumes
   * all branch outputs in that order (overlay, blend, and so on). Order is significant —
   * `blend` treats its first input as the top layer, so swapping them inverts the effect.
   */
  fork(branches, combine, hint = 'fk') {
    const src = this.flush(hint);
    const splitOut = branches.map(() => this.label(hint));
    this.chains.push(`[${src}]split=${branches.length}[${splitOut.join('][')}]`);

    const done = [];
    branches.forEach((filters, i) => {
      const list = filters.filter(Boolean);
      if (!list.length) { done.push(splitOut[i]); return; }
      const out = this.label(hint);
      this.chains.push(`[${splitOut[i]}]${list.join(',')}[${out}]`);
      done.push(out);
    });

    const joined = this.label(hint);
    this.chains.push(`[${done.join('][')}]${combine}[${joined}]`);
    this.current = joined;
    return this;
  }

  /** Close the graph at a named output. */
  finish(outLabel = 'vout') {
    if (this.pending.length) {
      this.chains.push(`[${this.current}]${this.pending.join(',')}[${outLabel}]`);
      this.pending = [];
    } else if (this.current !== outLabel) {
      // Nothing was applied at all. `null` is the pass-through video filter — a graph
      // still has to exist because the -map refers to [vout] by name.
      this.chains.push(`[${this.current}]null[${outLabel}]`);
    }
    this.current = outLabel;
    return this;
  }

  toString(pretty = false) {
    return this.chains.join(pretty ? ';\n' : ';');
  }
}
