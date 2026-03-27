/**
 * analyzer.js - Screen Pattern Analysis Engine
 *
 * EXTENSION POINTS (already wired):
 *   - OCR:        updateClusterInfo(id, ocrText, title)  called from app.js after Tesseract
 *   - Local AI:   setPatternAIInstruction(id, text)      called from app.js after Claude API
 *   - Multi-sess: exportData() → persist to IndexedDB and compare across sessions
 */

class ScreenAnalyzer {
    constructor() {
        this.HASH_BITS       = 256;
        this.CLUSTER_THRESH  = 35;
        this.MIN_SEG_MS      = 800;
        this.MAX_PAT_LEN     = 6;
        this.MAX_SEQ_ANALYSE = 500;
        this._init();
    }

    _init() {
        this.frames   = [];
        this.segments = [];
        this.clusters = [];
        this.sequence = [];
        this.patterns = [];

        this._segStart   = null;
        this._segHashes  = [];
        this._lastHash   = null;
        this._frameCount = 0;
        this._sessionStart = null;
    }

    reset() { this._init(); }

    // ─── Hashing ──────────────────────────────────────────────────────────────

    computeHash(canvas) {
        const ctx  = canvas.getContext('2d', { willReadFrequently: true });
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const n    = canvas.width * canvas.height;
        const gray = new Float32Array(n);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const v = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
            gray[i] = v; sum += v;
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
        if (!hashes?.length) return new Uint8Array(this.HASH_BITS);
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

    addFrame(hashCanvas, thumbnail, timestamp, thresholdPct) {
        if (!this._sessionStart) this._sessionStart = timestamp;

        const hash = this.computeHash(hashCanvas);
        this._frameCount++;

        let changeAmount = 0, isChange = false;
        if (this._lastHash) {
            const dist = this.hammingDistance(hash, this._lastHash);
            changeAmount = (dist / this.HASH_BITS) * 100;
            isChange     = changeAmount > thresholdPct;
        } else {
            isChange = true;
        }

        if (isChange) {
            if (this._segStart !== null) {
                const dur = timestamp - this._segStart;
                if (dur >= this.MIN_SEG_MS) this._closeSegment(timestamp, dur);
            }
            this._segStart  = timestamp;
            this._segHashes = [hash];
        } else if (this._segStart !== null) {
            this._segHashes.push(hash);
        } else {
            this._segStart  = timestamp;
            this._segHashes = [hash];
        }

        this._lastHash = hash;
        this.frames.push({ timestamp, changeAmount });

        if (isChange && this.segments.length > 0) {
            const seg = this.segments[this.segments.length - 1];
            if (seg.clusterId === null) {
                this._assignCluster(seg, thumbnail);
                this._findPatterns();
            }
        }

        return { isChange, changeAmount };
    }

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
        this._segStart = null; this._segHashes = [];
    }

    // ─── Segmentation ─────────────────────────────────────────────────────────

    _closeSegment(endTime, duration) {
        this.segments.push({
            id: this.segments.length,
            startTime:  this._segStart,
            endTime, duration,
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
            if (d < this.CLUSTER_THRESH && d < bestDist) { bestDist = d; best = c; }
        }

        if (best) {
            segment.clusterId = best.id;
            best.segmentIds.push(segment.id);
            best.totalDuration += segment.duration;
            best.lastSeen = segment.endTime;
            best.occurrenceCount++;
            best.representativeHash = this._repHash(
                best.segmentIds.slice(-10).map(id => this.segments[id].hash)
            );
        } else {
            const c = {
                id:                 this.clusters.length,
                label:              `Schermstatus ${this.clusters.length + 1}`,
                detectedTitle:      null,   // ← filled by OCR in app.js
                ocrText:            null,   // ← filled by OCR in app.js
                representativeHash: new Uint8Array(segment.hash),
                segmentIds:         [segment.id],
                totalDuration:      segment.duration,
                firstSeen:          segment.startTime,
                lastSeen:           segment.endTime,
                occurrenceCount:    1,
                thumbnail:          thumbnail || null
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

    // ─── OCR & AI hooks (called from app.js) ─────────────────────────────────

    /** Called by app.js after Tesseract finishes for a cluster */
    updateClusterInfo(id, ocrText, detectedTitle) {
        const c = this.clusters[id];
        if (!c) return;
        c.ocrText      = ocrText;
        c.detectedTitle = detectedTitle || c.label;
        // Rebuild pattern descriptions now that labels are better
        this._findPatterns();
    }

    /** Called by app.js after Claude API returns a rich instruction */
    setPatternAIInstruction(patternId, text) {
        const p = this.patterns.find(p => p.id === patternId);
        if (p) p.aiInstruction = text;
    }

    // ─── Pattern detection ────────────────────────────────────────────────────

    _findPatterns() {
        if (this.sequence.length < 4) return;

        const recent = this.sequence.slice(-this.MAX_SEQ_ANALYSE);
        const ids    = recent.map(s => s.clusterId);
        const patMap = new Map();

        for (let pLen = 2; pLen <= Math.min(this.MAX_PAT_LEN, Math.floor(ids.length / 2)); pLen++) {
            for (let i = 0; i <= ids.length - pLen; i++) {
                const key   = ids.slice(i, i + pLen).join(',');
                if (!patMap.has(key)) patMap.set(key, { clusterSeq: ids.slice(i, i + pLen), occ: [] });
                const entry   = patMap.get(key);
                const lastOcc = entry.occ[entry.occ.length - 1];
                if (!lastOcc || i >= lastOcc.endIdx) {
                    const slice    = recent.slice(i, i + pLen);
                    const duration = slice.reduce((s, e) => s + e.duration, 0);
                    entry.occ.push({ startIdx: i, endIdx: i + pLen, startTime: slice[0].timestamp, duration });
                }
            }
        }

        const candidates = [];
        for (const [, data] of patMap) {
            if (data.occ.length < 2) continue;
            const durations = data.occ.map(o => o.duration);
            const avgDur    = durations.reduce((a, b) => a + b, 0) / durations.length;
            const variance  = this._variance(durations);
            const score     = this._score(data.occ.length, data.clusterSeq.length, variance, avgDur);
            candidates.push({
                clusterSeq:       data.clusterSeq,
                occurrenceCount:  data.occ.length,
                occurrences:      data.occ,
                avgDuration:      avgDur,
                minDuration:      Math.min(...durations),
                maxDuration:      Math.max(...durations),
                durationVariance: variance,
                firstSeen:        data.occ[0].startTime,
                lastSeen:         data.occ[data.occ.length - 1].startTime,
                automationScore:  score.score,
                automationLevel:  score.level
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

        // Preserve existing AI instructions when rebuilding
        const existingAI = new Map(this.patterns.map(p => [p.id, p.aiInstruction]));

        this.patterns = deduped.slice(0, 10).map((p, i) => {
            const id = `Patroon ${i + 1}`;
            return {
                id,
                ...p,
                description:     this._describe(p.clusterSeq, p.occurrenceCount, p.avgDuration),
                workInstruction: this._genInstruction(p.clusterSeq, p.automationLevel),
                aiInstruction:   existingAI.get(id) || null
            };
        });
    }

    _dedupe(sorted) {
        const result = [];
        for (const p of sorted) {
            let dominated = false;
            for (const s of result) {
                if (s.clusterSeq.length >= p.clusterSeq.length &&
                    s.occurrenceCount   >= p.occurrenceCount * 0.7 &&
                    this._seqContains(s.clusterSeq, p.clusterSeq)) {
                    dominated = true; break;
                }
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
        if (freq >= 8) s += 40; else if (freq >= 5) s += 30; else if (freq >= 3) s += 20; else s += 10;
        if (seqLen >= 5) s += 30; else if (seqLen >= 3) s += 20; else s += 10;
        const cv = avgDur > 0 ? Math.sqrt(variance) / avgDur : 1;
        if (cv < 0.2) s += 30; else if (cv < 0.4) s += 20; else if (cv < 0.6) s += 10;
        return { score: s, level: s >= 70 ? 'hoog' : s >= 40 ? 'middel' : 'laag' };
    }

    _variance(vals) {
        if (vals.length <= 1) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
    }

    // ─── Labels & descriptions (use OCR title if available) ───────────────────

    _label(id) {
        const c = this.clusters[id];
        if (!c) return `Scherm ${id + 1}`;
        return c.detectedTitle || c.label;
    }

    _describe(seq, freq, avgMs) {
        const labels  = seq.map(id => `"${this._label(id)}"`);
        const avgSec  = (avgMs / 1000).toFixed(1);
        const unique  = new Set(seq).size;
        if (unique === 1)
            return `Je keert ${freq}× terug naar ${labels[0]} (gemiddeld ${avgSec}s). Waarschijnlijk een controle- of invoerstap.`;
        if (seq.length === 2)
            return `Je wisselt ${freq}× heen en weer tussen ${labels[0]} en ${labels[1]} (gem. ${avgSec}s per cyclus). Mogelijke navigatiehandeling.`;
        return `Je doorloopt ${freq}× dezelfde reeks: ${labels.join(' → ')} (gem. ${avgSec}s per cyclus).`;
    }

    _genInstruction(seq, level) {
        const warning = level === 'laag'
            ? '⚠️  Let op: dit patroon is maar een paar keer gezien. Controleer de stappen handmatig.\n\n'
            : '';
        const steps = seq.map((id, i) => {
            const label = this._label(id);
            const c     = this.clusters[id];
            const hint  = c?.ocrText ? ` (scherm toont: "${c.ocrText.split('\n')[0].trim().substring(0,40)}")` : '';
            return `Stap ${i + 1}: Open of ga naar ${label}${hint}`;
        }).join('\n');
        return `${warning}${steps}\n\nℹ️  Exacte klikken en toetsaanslagen zijn niet zichtbaar. Genereer een AI-instructie voor een volledigere beschrijving.`;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    getStats() {
        return {
            frameCount:      this._frameCount,
            segmentCount:    this.segments.length,
            clusterCount:    this.clusters.length,
            patternCount:    this.patterns.length,
            sessionDuration: this._sessionStart ? Date.now() - this._sessionStart : 0
        };
    }

    getPatterns()  { return this.patterns; }
    getClusters()  { return this.clusters; }

    exportData() {
        return {
            meta: {
                exportedAt:      new Date().toISOString(),
                tool:            'Schermanalyse Tool v1.1',
                sessionDuration: this._sessionStart ? Date.now() - this._sessionStart : 0
            },
            stats: this.getStats(),
            patterns: this.patterns.map(p => ({
                id:              p.id,
                occurrenceCount: p.occurrenceCount,
                avgDurationMs:   Math.round(p.avgDuration),
                automationLevel: p.automationLevel,
                automationScore: p.automationScore,
                firstSeen:       new Date(p.firstSeen).toISOString(),
                lastSeen:        new Date(p.lastSeen).toISOString(),
                description:     p.description,
                clusterLabels:   p.clusterSeq.map(id => this._label(id)),
                workInstruction: p.aiInstruction || p.workInstruction
            })),
            clusters: this.clusters.map(c => ({
                id:              c.id,
                label:           c.detectedTitle || c.label,
                ocrText:         c.ocrText ? c.ocrText.substring(0, 500) : null,
                occurrenceCount: c.occurrenceCount,
                totalDurationMs: Math.round(c.totalDuration),
                avgDurationMs:   c.occurrenceCount > 0 ? Math.round(c.totalDuration / c.occurrenceCount) : 0,
                firstSeen:       new Date(c.firstSeen).toISOString(),
                lastSeen:        new Date(c.lastSeen).toISOString()
            }))
        };
    }
}
