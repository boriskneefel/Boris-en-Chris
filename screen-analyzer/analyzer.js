/**
 * analyzer.js - Screen Pattern Analysis Engine
 *
 * Handles: frame hashing, segmentation, clustering, sequence pattern detection,
 * automation scoring, and work instruction generation.
 *
 * EXTENSION POINTS:
 *   - OCR: pass ocrText into addFrame(), store on segments/clusters
 *   - Local AI: call window.ai or Ollama with exportData() for richer descriptions
 *   - Multi-session: persist exportData() to IndexedDB and compare across sessions
 */

class ScreenAnalyzer {
    constructor() {
        // Tuning constants
        this.HASH_BITS       = 256;      // 16x16 average hash
        this.CLUSTER_THRESH  = 35;       // Max hamming distance to be "same" cluster (out of 256)
        this.MIN_SEG_MS      = 800;      // Minimum segment duration in ms
        this.MAX_PAT_LEN     = 6;        // Max sequence length to check
        this.MAX_SEQ_ANALYSE = 500;      // Max recent sequence entries for pattern search

        this._init();
    }

    _init() {
        this.frames    = [];   // [{timestamp, changeAmount}]
        this.segments  = [];   // [{id, startTime, endTime, duration, hash, clusterId}]
        this.clusters  = [];   // [{id, label, representativeHash, segmentIds, ...}]
        this.sequence  = [];   // [{clusterId, timestamp, duration, segmentId}]
        this.patterns  = [];   // Detected recurring patterns

        this._segStart   = null;  // Timestamp of current open segment
        this._segHashes  = [];    // Hashes accumulated in current segment
        this._lastHash   = null;
        this._frameCount = 0;
        this._sessionStart = null;
    }

    reset() { this._init(); }

    // ─── Hashing ──────────────────────────────────────────────────────────────

    /**
     * Compute 256-bit average hash from a 16x16 canvas.
     * Returns Uint8Array of 0s and 1s.
     */
    computeHash(canvas) {
        const ctx  = canvas.getContext('2d', { willReadFrequently: true });
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const n    = canvas.width * canvas.height;
        const gray = new Float32Array(n);
        let sum = 0;

        for (let i = 0; i < n; i++) {
            const v = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
            gray[i] = v;
            sum += v;
        }

        const mean = sum / n;
        const hash = new Uint8Array(n);
        for (let i = 0; i < n; i++) hash[i] = gray[i] >= mean ? 1 : 0;
        return hash;
    }

    hammingDistance(h1, h2) {
        let d = 0;
        for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
        return d;
    }

    _repHash(hashes) {
        if (!hashes || hashes.length === 0) return new Uint8Array(this.HASH_BITS);
        if (hashes.length === 1) return new Uint8Array(hashes[0]);
        const result = new Uint8Array(this.HASH_BITS);
        const half   = hashes.length / 2;
        for (let i = 0; i < this.HASH_BITS; i++) {
            let ones = 0;
            for (const h of hashes) ones += h[i];
            result[i] = ones >= half ? 1 : 0;
        }
        return result;
    }

    // ─── Frame ingestion ──────────────────────────────────────────────────────

    /**
     * Process one video frame.
     * @param {HTMLCanvasElement} hashCanvas    16x16 canvas already drawn with current frame
     * @param {string|null}       thumbnail     data URL (160x90 JPEG) for UI display
     * @param {number}            timestamp     Date.now()
     * @param {number}            thresholdPct  change detection threshold 0-100
     */
    addFrame(hashCanvas, thumbnail, timestamp, thresholdPct) {
        if (!this._sessionStart) this._sessionStart = timestamp;

        const hash = this.computeHash(hashCanvas);
        this._frameCount++;

        let changeAmount = 0;
        let isChange     = false;

        if (this._lastHash) {
            const dist = this.hammingDistance(hash, this._lastHash);
            changeAmount = (dist / this.HASH_BITS) * 100;
            isChange     = changeAmount > thresholdPct;
        } else {
            isChange = true;
        }

        if (isChange) {
            // Close the currently open segment (if long enough)
            if (this._segStart !== null) {
                const dur = timestamp - this._segStart;
                if (dur >= this.MIN_SEG_MS) {
                    this._closeSegment(timestamp, dur);
                }
            }
            // Start a new segment
            this._segStart  = timestamp;
            this._segHashes = [hash];
        } else if (this._segStart !== null) {
            this._segHashes.push(hash);
        } else {
            // First frame, no change yet — start segment
            this._segStart  = timestamp;
            this._segHashes = [hash];
        }

        this._lastHash = hash;
        this.frames.push({ timestamp, changeAmount });

        // Assign cluster to the segment that was just closed
        if (isChange && this.segments.length > 0) {
            const seg = this.segments[this.segments.length - 1];
            if (seg.clusterId === null) {
                this._assignCluster(seg, thumbnail);
                this._findPatterns();
            }
        }

        return { isChange, changeAmount };
    }

    /** Force-close the currently open segment (call on Stop). */
    closeCurrentSegment(timestamp) {
        if (this._segStart !== null && this._segHashes.length > 0) {
            const dur = timestamp - this._segStart;
            if (dur >= this.MIN_SEG_MS) {
                this._closeSegment(timestamp, dur);
                const seg = this.segments[this.segments.length - 1];
                if (seg.clusterId === null) {
                    this._assignCluster(seg, null);
                    this._findPatterns();
                }
            }
        }
        this._segStart  = null;
        this._segHashes = [];
    }

    // ─── Segmentation ─────────────────────────────────────────────────────────

    _closeSegment(endTime, duration) {
        this.segments.push({
            id:         this.segments.length,
            startTime:  this._segStart,
            endTime,
            duration,
            hash:       this._repHash(this._segHashes),
            frameCount: this._segHashes.length,
            clusterId:  null
        });
    }

    // ─── Clustering ───────────────────────────────────────────────────────────

    _assignCluster(segment, thumbnail) {
        let best = null, bestDist = Infinity;

        for (const c of this.clusters) {
            const d = this.hammingDistance(segment.hash, c.representativeHash);
            if (d < this.CLUSTER_THRESH && d < bestDist) {
                bestDist = d;
                best     = c;
            }
        }

        if (best) {
            segment.clusterId = best.id;
            best.segmentIds.push(segment.id);
            best.totalDuration += segment.duration;
            best.lastSeen       = segment.endTime;
            best.occurrenceCount++;
            // Update representative hash using last 10 segments
            best.representativeHash = this._repHash(
                best.segmentIds.slice(-10).map(id => this.segments[id].hash)
            );
        } else {
            const c = {
                id:                  this.clusters.length,
                label:               `Schermstatus ${this.clusters.length + 1}`,
                representativeHash:  new Uint8Array(segment.hash),
                segmentIds:          [segment.id],
                totalDuration:       segment.duration,
                firstSeen:           segment.startTime,
                lastSeen:            segment.endTime,
                occurrenceCount:     1,
                thumbnail:           thumbnail || null
            };
            segment.clusterId = c.id;
            this.clusters.push(c);
        }

        this.sequence.push({
            clusterId:  segment.clusterId,
            timestamp:  segment.startTime,
            duration:   segment.duration,
            segmentId:  segment.id
        });
    }

    // ─── Pattern Detection ────────────────────────────────────────────────────

    _findPatterns() {
        if (this.sequence.length < 4) return;

        const recent   = this.sequence.slice(-this.MAX_SEQ_ANALYSE);
        const ids      = recent.map(s => s.clusterId);
        const patMap   = new Map();

        for (let pLen = 2; pLen <= Math.min(this.MAX_PAT_LEN, Math.floor(ids.length / 2)); pLen++) {
            for (let i = 0; i <= ids.length - pLen; i++) {
                const key   = ids.slice(i, i + pLen).join(',');
                if (!patMap.has(key)) patMap.set(key, { clusterSeq: ids.slice(i, i + pLen), occ: [] });

                const entry   = patMap.get(key);
                const lastOcc = entry.occ[entry.occ.length - 1];

                if (!lastOcc || i >= lastOcc.endIdx) {
                    const slice    = recent.slice(i, i + pLen);
                    const duration = slice.reduce((s, e) => s + e.duration, 0);
                    entry.occ.push({
                        startIdx:  i,
                        endIdx:    i + pLen,
                        startTime: slice[0].timestamp,
                        duration
                    });
                }
            }
        }

        const candidates = [];
        for (const [, data] of patMap) {
            if (data.occ.length < 2) continue;

            const durations  = data.occ.map(o => o.duration);
            const avgDur     = durations.reduce((a, b) => a + b, 0) / durations.length;
            const variance   = this._variance(durations);
            const score      = this._score(data.occ.length, data.clusterSeq.length, variance, avgDur);

            candidates.push({
                clusterSeq:      data.clusterSeq,
                occurrenceCount: data.occ.length,
                occurrences:     data.occ,
                avgDuration:     avgDur,
                minDuration:     Math.min(...durations),
                maxDuration:     Math.max(...durations),
                durationVariance:variance,
                firstSeen:       data.occ[0].startTime,
                lastSeen:        data.occ[data.occ.length - 1].startTime,
                automationScore: score.score,
                automationLevel: score.level
            });
        }

        const lvl = { hoog: 3, middel: 2, laag: 1 };
        candidates.sort((a, b) => {
            const ld = lvl[b.automationLevel] - lvl[a.automationLevel];
            if (ld !== 0) return ld;
            if (b.automationScore !== a.automationScore) return b.automationScore - a.automationScore;
            if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
            return b.clusterSeq.length - a.clusterSeq.length;
        });

        const deduped = this._dedupe(candidates);

        this.patterns = deduped.slice(0, 10).map((p, i) => ({
            id:              `Patroon ${i + 1}`,
            ...p,
            description:     this._describe(p.clusterSeq, p.occurrenceCount, p.avgDuration),
            workInstruction: this._genInstruction(p.clusterSeq, p.automationLevel)
        }));
    }

    _dedupe(sorted) {
        const result = [];
        for (const p of sorted) {
            let dominated = false;
            for (const stronger of result) {
                if (
                    stronger.clusterSeq.length >= p.clusterSeq.length &&
                    stronger.occurrenceCount   >= p.occurrenceCount * 0.7 &&
                    this._seqContains(stronger.clusterSeq, p.clusterSeq)
                ) { dominated = true; break; }
            }
            if (!dominated) result.push(p);
        }
        return result;
    }

    _seqContains(longer, shorter) {
        const s = shorter.join(',');
        for (let i = 0; i <= longer.length - shorter.length; i++) {
            if (longer.slice(i, i + shorter.length).join(',') === s) return true;
        }
        return false;
    }

    // ─── Scoring ──────────────────────────────────────────────────────────────

    _score(freq, seqLen, variance, avgDur) {
        let s = 0;

        // Frequency (0–40)
        if      (freq >= 8) s += 40;
        else if (freq >= 5) s += 30;
        else if (freq >= 3) s += 20;
        else                s += 10;

        // Sequence length (0–30)
        if      (seqLen >= 5) s += 30;
        else if (seqLen >= 3) s += 20;
        else                  s += 10;

        // Duration consistency — lower coefficient of variation = better (0–30)
        const cv = avgDur > 0 ? Math.sqrt(variance) / avgDur : 1;
        if      (cv < 0.2) s += 30;
        else if (cv < 0.4) s += 20;
        else if (cv < 0.6) s += 10;

        return { score: s, level: s >= 70 ? 'hoog' : s >= 40 ? 'middel' : 'laag' };
    }

    _variance(vals) {
        if (vals.length <= 1) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
    }

    // ─── Descriptions & Instructions ──────────────────────────────────────────

    _label(id) {
        const c = this.clusters[id];
        return c ? c.label : `Status ${id + 1}`;
    }

    _describe(seq, freq, avgMs) {
        const labels = seq.map(id => `"${this._label(id)}"`);
        const avgSec = (avgMs / 1000).toFixed(1);
        const unique = new Set(seq).size;

        if (unique === 1)
            return `Terugkerend verblijf op ${labels[0]} (gem. ${avgSec}s). Mogelijk een wacht- of controlestap.`;
        if (seq.length === 2)
            return `Herhaalde schakeling: ${labels[0]} ↔ ${labels[1]}. Mogelijke navigatiehandeling (gem. ${avgSec}s per cyclus).`;
        return `Vaste reeks van ${seq.length} stappen: ${labels.join(' → ')}. Terugkerende workflow (gem. ${avgSec}s).`;
    }

    _genInstruction(seq, level) {
        const warning = level === 'laag'
            ? '⚠️  VOORLOPIGE INSTRUCTIE – Gebaseerd op beperkte observaties. Controleer handmatig voor gebruik.\n\n'
            : '';
        const note = 'ℹ️  Exacte muisklikken en toetsaanslagen zijn niet betrouwbaar af te leiden\n   uit visuele patroonanalyse. Stappen zijn gebaseerd op schermveranderingen.\n\n';
        const steps = seq.map((id, i) => `  Stap ${i + 1}: Navigeer naar / activeer "${this._label(id)}"`).join('\n');
        return `${warning}${note}${steps}`;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    getStats() {
        return {
            frameCount:    this._frameCount,
            segmentCount:  this.segments.length,
            clusterCount:  this.clusters.length,
            patternCount:  this.patterns.length,
            sessionDuration: this._sessionStart ? Date.now() - this._sessionStart : 0
        };
    }

    getPatterns()  { return this.patterns; }
    getClusters()  { return this.clusters; }

    exportData() {
        return {
            meta: {
                exportedAt:      new Date().toISOString(),
                tool:            'Schermanalyse Tool v1.0',
                sessionDuration: this._sessionStart ? Date.now() - this._sessionStart : 0
            },
            stats: this.getStats(),
            patterns: this.patterns.map(p => ({
                id:              p.id,
                occurrenceCount: p.occurrenceCount,
                avgDurationMs:   Math.round(p.avgDuration),
                minDurationMs:   Math.round(p.minDuration),
                maxDurationMs:   Math.round(p.maxDuration),
                automationLevel: p.automationLevel,
                automationScore: p.automationScore,
                firstSeen:       new Date(p.firstSeen).toISOString(),
                lastSeen:        new Date(p.lastSeen).toISOString(),
                description:     p.description,
                clusterLabels:   p.clusterSeq.map(id => this._label(id)),
                workInstruction: p.workInstruction
            })),
            clusters: this.clusters.map(c => ({
                id:              c.id,
                label:           c.label,
                occurrenceCount: c.occurrenceCount,
                totalDurationMs: Math.round(c.totalDuration),
                avgDurationMs:   c.occurrenceCount > 0
                    ? Math.round(c.totalDuration / c.occurrenceCount) : 0,
                firstSeen:       new Date(c.firstSeen).toISOString(),
                lastSeen:        new Date(c.lastSeen).toISOString()
            }))
        };
    }
}
