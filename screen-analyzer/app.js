/**
 * app.js - Application controller
 *
 * Responsibilities:
 *   - Screen capture lifecycle (getDisplayMedia)
 *   - Periodic frame sampling
 *   - UI rendering and live updates
 *   - Export wiring
 *   - Error handling
 *
 * EXTENSION POINT (multi-session):
 *   On stop, save analyzer.exportData() to localStorage/IndexedDB.
 *   On start, load previous sessions for cross-session pattern comparison.
 */

'use strict';

// ─── Globals ────────────────────────────────────────────────────────────────

const analyzer = new ScreenAnalyzer();
const exporter = new DataExporter();

let stream         = null;
let sampleTimer    = null;
let uiTimer        = null;
let isAnalyzing    = false;
let sessionStart   = null;

// Off-screen canvas for thumbnails (160×90)
const thumbCanvas = document.createElement('canvas');
thumbCanvas.width  = 160;
thumbCanvas.height = 90;
const thumbCtx = thumbCanvas.getContext('2d');

// ─── DOM refs ───────────────────────────────────────────────────────────────

const video          = document.getElementById('previewVideo');
const noPreview      = document.getElementById('noPreview');
const hashCanvas     = document.getElementById('hashCanvas');
const hashCtx        = hashCanvas.getContext('2d', { willReadFrequently: true });

const btnStart       = document.getElementById('btnStart');
const btnStop        = document.getElementById('btnStop');
const btnExportJSON  = document.getElementById('btnExportJSON');
const btnExportMD    = document.getElementById('btnExportMD');
const btnExportTXT   = document.getElementById('btnExportTXT');
const selInterval    = document.getElementById('sampleInterval');
const selThreshold   = document.getElementById('changeThreshold');

const elStatus       = document.getElementById('statusText');
const elDuration     = document.getElementById('sessionDuration');
const elFrames       = document.getElementById('frameCount');
const elSegments     = document.getElementById('segmentCount');
const elClusters     = document.getElementById('clusterCount');
const elPatterns     = document.getElementById('patternCount');
const activityDot    = document.getElementById('activityDot');
const activityText   = document.getElementById('activityText');

const secPatterns    = document.getElementById('patternsSection');
const secAutomation  = document.getElementById('automationSection');
const secInstructions= document.getElementById('instructionsSection');

// ─── Browser support check ──────────────────────────────────────────────────

(function checkSupport() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        notify('⚠️ Je browser ondersteunt geen schermdeling. Gebruik Chrome 72+, Edge 79+, of Firefox 66+.', 'error');
        btnStart.disabled = true;
    }
})();

// ─── Tabs ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// ─── Start ───────────────────────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: 5 },
            audio: false
        });

        video.srcObject = stream;
        video.style.display = 'block';
        noPreview.style.display = 'none';

        // User stops sharing from browser UI
        stream.getVideoTracks()[0].addEventListener('ended', onStreamEnded);

        video.addEventListener('loadedmetadata', beginAnalysis, { once: true });

    } catch (err) {
        handleCaptureError(err);
    }
});

function beginAnalysis() {
    analyzer.reset();
    isAnalyzing  = true;
    sessionStart = Date.now();

    btnStart.disabled  = true;
    btnStop.disabled   = false;
    selInterval.disabled  = true;
    selThreshold.disabled = true;

    setStatus('active', 'Analyse actief');
    activityDot.className = 'dot dot-recording';
    activityText.textContent = 'Analyseert schermveranderingen…';

    const interval = parseInt(selInterval.value, 10);
    sampleTimer = setInterval(sampleFrame, interval);
    uiTimer     = setInterval(updateUI, 1000);

    // Capture first frame immediately after a short delay
    setTimeout(sampleFrame, 400);
}

// ─── Stop ────────────────────────────────────────────────────────────────────

btnStop.addEventListener('click', stopAnalysis);

function stopAnalysis() {
    if (!isAnalyzing) return;
    isAnalyzing = false;

    clearInterval(sampleTimer); sampleTimer = null;
    clearInterval(uiTimer);     uiTimer     = null;

    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }

    video.srcObject      = null;
    video.style.display  = 'none';
    noPreview.style.display = 'flex';

    analyzer.closeCurrentSegment(Date.now());

    btnStart.disabled  = false;
    btnStop.disabled   = true;
    selInterval.disabled  = false;
    selThreshold.disabled = false;

    setStatus('stopped', 'Analyse gestopt');
    activityDot.className    = 'dot dot-idle';
    activityText.textContent = 'Analyse beëindigd';

    updateUI();
    updateExportButtons();
}

function onStreamEnded() {
    if (isAnalyzing) {
        stopAnalysis();
        notify('Schermdeling is gestopt (door browser of gebruiker).', 'info');
    }
}

// ─── Frame sampling ──────────────────────────────────────────────────────────

function sampleFrame() {
    if (!video.srcObject || video.readyState < 2) return;

    // Draw to 16×16 hash canvas
    hashCtx.drawImage(video, 0, 0, 16, 16);

    // Capture thumbnail
    thumbCtx.drawImage(video, 0, 0, 160, 90);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.55);

    const threshold = parseInt(selThreshold.value, 10);
    const result    = analyzer.addFrame(hashCanvas, thumbnail, Date.now(), threshold);

    if (result.isChange) {
        activityDot.classList.add('dot-flash');
        activityText.textContent = `Schermwisseling gedetecteerd (${result.changeAmount.toFixed(1)}% verschil)`;
        setTimeout(() => {
            activityDot.classList.remove('dot-flash');
            activityText.textContent = 'Analyseert schermveranderingen…';
        }, 700);
    }
}

// ─── UI updates ──────────────────────────────────────────────────────────────

function updateUI() {
    const stats = analyzer.getStats();
    const now   = Date.now();

    elDuration.textContent = sessionStart ? fmtDuration(now - sessionStart) : '00:00:00';
    elFrames.textContent   = stats.frameCount;
    elSegments.textContent = stats.segmentCount;
    elClusters.textContent = stats.clusterCount;
    elPatterns.textContent = stats.patternCount;

    renderPatterns();
    renderAutomation();
    renderInstructions();
    updateExportButtons();
}

function updateExportButtons() {
    const stats   = analyzer.getStats();
    const hasData = stats.segmentCount > 0;
    btnExportJSON.disabled = !hasData;
    btnExportMD.disabled   = stats.patternCount === 0;
    btnExportTXT.disabled  = stats.patternCount === 0;
}

// ─── Render: Patterns ────────────────────────────────────────────────────────

function renderPatterns() {
    const patterns = analyzer.getPatterns();

    if (!patterns.length) {
        secPatterns.innerHTML = emptyState(
            'Nog geen patronen gedetecteerd.',
            'Voer dezelfde handelingen meerdere keren uit. Minimaal 2–3 herhalingen zijn nodig voor patroonherkenning.'
        );
        return;
    }

    secPatterns.innerHTML = patterns.map(p => {
        const clusters  = analyzer.getClusters();
        const chipHtml  = p.clusterSeq.map(id => {
            const c = clusters[id];
            const label = c ? c.label : `Status ${id + 1}`;
            const thumb = c?.thumbnail
                ? `<img src="${c.thumbnail}" class="chip-thumb" alt="${label}">`
                : '';
            return `<span class="state-chip">${thumb}${label}</span>`;
        }).join('<span class="arrow">→</span>');

        return `
        <div class="pattern-card">
            <div class="pattern-header">
                <span class="pattern-id">${p.id}</span>
                <span class="badge badge-${p.automationLevel}">${capFirst(p.automationLevel)} potentieel</span>
            </div>
            <div class="pattern-stats">
                <div class="stat">
                    <span class="stat-value">${p.occurrenceCount}×</span>
                    <span class="stat-label">Waargenomen</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${fmtSec(p.avgDuration)}</span>
                    <span class="stat-label">Gem. duur</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${p.clusterSeq.length}</span>
                    <span class="stat-label">Stappen</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${p.automationScore}</span>
                    <span class="stat-label">Score /100</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${fmtTime(p.firstSeen)}</span>
                    <span class="stat-label">Eerste keer</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${fmtTime(p.lastSeen)}</span>
                    <span class="stat-label">Laatste keer</span>
                </div>
            </div>
            <div class="pattern-description">${p.description}</div>
            <div class="pattern-sequence">${chipHtml}</div>
        </div>`;
    }).join('');
}

// ─── Render: Automation ──────────────────────────────────────────────────────

function renderAutomation() {
    const patterns = analyzer.getPatterns();

    if (!patterns.length) {
        secAutomation.innerHTML = emptyState('Nog geen automatiseringskansen geanalyseerd.');
        return;
    }

    const groups = { hoog: [], middel: [], laag: [] };
    for (const p of patterns) groups[p.automationLevel].push(p);

    let html = '';

    for (const [level, pats] of Object.entries(groups)) {
        if (!pats.length) continue;
        const titles = { hoog: '🟢 Hoog potentieel', middel: '🟡 Middel potentieel', laag: '🟠 Laag potentieel' };
        html += `<div class="automation-group">
            <h3 class="group-title group-${level}">${titles[level]}</h3>
            ${pats.map(p => {
                const totalMin = (p.avgDuration * p.occurrenceCount / 60000).toFixed(1);
                return `
                <div class="automation-card">
                    <div class="automation-header">
                        <strong>${p.id}</strong>
                        <span class="badge badge-${p.automationLevel}">${p.automationLevel}</span>
                    </div>
                    <p class="auto-desc">${p.description}</p>
                    <div class="automation-metrics">
                        <span>📊 ${p.occurrenceCount}× gezien</span>
                        <span>⏱️ ~${totalMin} min. totaal</span>
                        <span>📋 ${p.clusterSeq.length} stappen</span>
                        <span>🎯 Score: ${p.automationScore}/100</span>
                        <span>📏 ${fmtSec(p.minDuration)}–${fmtSec(p.maxDuration)} (spreiding)</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    secAutomation.innerHTML = html;
}

// ─── Render: Instructions ────────────────────────────────────────────────────

function renderInstructions() {
    const patterns = analyzer.getPatterns();

    if (!patterns.length) {
        secInstructions.innerHTML = emptyState('Nog geen werkinstructies gegenereerd.');
        return;
    }

    secInstructions.innerHTML = patterns.map(p => `
        <div class="instruction-card">
            <div class="instruction-header">
                <strong>${p.id}</strong>
                <span class="badge badge-${p.automationLevel}">${capFirst(p.automationLevel)} potentieel</span>
            </div>
            <pre class="instruction-text">${escapeHtml(p.workInstruction)}</pre>
        </div>
    `).join('');
}

// ─── Export buttons ──────────────────────────────────────────────────────────

btnExportJSON.addEventListener('click', () => exporter.exportJSON(analyzer.exportData()));
btnExportMD.addEventListener('click',   () => exporter.exportMarkdown(analyzer.getPatterns(), analyzer.getStats()));
btnExportTXT.addEventListener('click',  () => exporter.exportTXT(analyzer.getPatterns(), analyzer.getStats()));

// ─── Error handling ──────────────────────────────────────────────────────────

function handleCaptureError(err) {
    const msgs = {
        NotAllowedError:       'Schermdeling geweigerd. Geef toestemming in de browser.',
        PermissionDeniedError: 'Schermdeling geweigerd. Geef toestemming in de browser.',
        NotFoundError:         'Geen schermbron gevonden. Probeer opnieuw.',
        AbortError:            'Schermdeling geannuleerd.'
    };
    const msg = msgs[err.name] || `Fout bij schermdeling: ${err.message}`;
    notify(msg, 'error');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(state, text) {
    elStatus.textContent = text;
    elStatus.className   = `value status-${state}`;
}

function notify(message, type = 'info') {
    const old = document.getElementById('notification');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id        = 'notification';
    el.className = `notification notification-${type}`;
    el.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById('app').prepend(el);

    if (type !== 'error') setTimeout(() => el?.remove(), 6000);
}

function emptyState(main, hint = '') {
    return `<div class="empty-state"><p>${main}</p>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
}

function fmtDuration(ms) {
    const s  = Math.max(0, Math.floor(ms / 1000));
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(sc)}`;
}

function fmtSec(ms) {
    return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts) {
    if (!ts) return '--';
    return new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pad(n) { return String(n).padStart(2, '0'); }

function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
