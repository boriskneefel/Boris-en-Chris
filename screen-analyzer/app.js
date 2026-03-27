/**
 * app.js - Application controller
 *
 * What this adds on top of v1.0:
 *   - Tesseract.js OCR → clusters get real names from screen text
 *   - Claude API → AI generates human-readable work instructions
 *   - Graceful fallbacks when OCR/AI is unavailable
 */

'use strict';

const analyzer = new ScreenAnalyzer();
const exporter = new DataExporter();

// ─── State ───────────────────────────────────────────────────────────────────

let stream       = null;
let sampleTimer  = null;
let uiTimer      = null;
let isAnalyzing  = false;
let sessionStart = null;
let lastClusterCount = 0;

// OCR
let ocrWorkerReady = false;
let ocrWorkerPromise = null;
const ocrQueue = [];
let ocrBusy    = false;

// Thumbnail canvas (off-screen, 160×90)
const thumbCanvas = document.createElement('canvas');
thumbCanvas.width  = 160;
thumbCanvas.height = 90;
const thumbCtx = thumbCanvas.getContext('2d');

// ─── DOM refs ─────────────────────────────────────────────────────────────────

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
const elOcrStatus    = document.getElementById('ocrStatus');
const activityDot    = document.getElementById('activityDot');
const activityText   = document.getElementById('activityText');

const secPatterns    = document.getElementById('patternsSection');
const secAutomation  = document.getElementById('automationSection');
const secInstructions= document.getElementById('instructionsSection');

// API key
const apiKeyInput    = document.getElementById('apiKeyInput');
const btnSaveKey     = document.getElementById('btnSaveKey');
const apiKeyStatus   = document.getElementById('apiKeyStatus');

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
    // Load saved API key
    const saved = sessionStorage.getItem('claudeApiKey');
    if (saved) {
        apiKeyInput.value = '••••••••••••••••';
        apiKeyStatus.textContent = '✓ API-sleutel opgeslagen voor deze sessie';
        apiKeyStatus.className   = 'key-status key-ok';
    }

    // Browser support
    if (!navigator.mediaDevices?.getDisplayMedia) {
        notify('⚠️ Je browser ondersteunt geen schermdeling. Gebruik Chrome 72+, Edge 79+, of Firefox 66+.', 'error');
        btnStart.disabled = true;
    }

    // Check Tesseract availability
    if (typeof Tesseract === 'undefined') {
        elOcrStatus.textContent = 'OCR niet beschikbaar (geen internet bij laden)';
        elOcrStatus.className   = 'ocr-status ocr-unavailable';
    }
})();

// ─── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// ─── API Key ──────────────────────────────────────────────────────────────────

btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key || key.startsWith('•')) {
        notify('Voer een geldige Claude API-sleutel in (begint met sk-ant-).', 'info');
        return;
    }
    if (!key.startsWith('sk-ant-')) {
        notify('Dit lijkt geen geldige Anthropic API-sleutel. Sleutels beginnen met sk-ant-.', 'info');
        return;
    }
    sessionStorage.setItem('claudeApiKey', key);
    apiKeyInput.value    = '••••••••••••••••';
    apiKeyStatus.textContent = '✓ Opgeslagen — AI-instructies zijn nu beschikbaar';
    apiKeyStatus.className   = 'key-status key-ok';
    notify('API-sleutel opgeslagen. Klik "Genereer met AI" in het tabblad Werkinstructies.', 'info');
});

// Allow clearing the key
apiKeyInput.addEventListener('focus', () => {
    if (apiKeyInput.value === '••••••••••••••••') apiKeyInput.value = '';
});

// ─── OCR ──────────────────────────────────────────────────────────────────────

function getOCRWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    if (typeof Tesseract === 'undefined') return Promise.reject(new Error('Tesseract niet geladen'));

    elOcrStatus.textContent = 'OCR laden…';
    elOcrStatus.className   = 'ocr-status ocr-loading';

    ocrWorkerPromise = Tesseract.createWorker('nld+eng', 1, { logger: () => {} })
        .then(w => {
            ocrWorkerReady = true;
            elOcrStatus.textContent = 'OCR gereed';
            elOcrStatus.className   = 'ocr-status ocr-ready';
            return w;
        })
        .catch(e => {
            ocrWorkerPromise = null;
            elOcrStatus.textContent = 'OCR fout: ' + e.message;
            elOcrStatus.className   = 'ocr-status ocr-unavailable';
            throw e;
        });
    return ocrWorkerPromise;
}

function enqueueOCR(clusterId, thumbnail) {
    ocrQueue.push({ clusterId, thumbnail });
    if (!ocrBusy) processOCRQueue();
}

async function processOCRQueue() {
    if (!ocrQueue.length) { ocrBusy = false; return; }
    ocrBusy = true;

    const { clusterId, thumbnail } = ocrQueue.shift();

    try {
        elOcrStatus.textContent = `OCR bezig (${ocrQueue.length} in wachtrij)…`;
        elOcrStatus.className   = 'ocr-status ocr-loading';

        const worker = await getOCRWorker();
        const result = await worker.recognize(thumbnail);
        const raw    = result.data.text || '';
        const title  = extractBestTitle(raw);

        analyzer.updateClusterInfo(clusterId, raw, title);
        updateUI();

        elOcrStatus.textContent = ocrQueue.length
            ? `OCR bezig (${ocrQueue.length} resterend)…`
            : 'OCR gereed';
        elOcrStatus.className = ocrQueue.length ? 'ocr-status ocr-loading' : 'ocr-status ocr-ready';
    } catch (e) {
        console.warn('OCR mislukt voor cluster', clusterId, e);
    }

    processOCRQueue();
}

/** Extract the most meaningful short title from raw OCR output */
function extractBestTitle(text) {
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= 4 && l.length <= 70)
        .filter(l => (l.match(/[a-zA-ZÀ-ÿ]/g) || []).length >= 3) // at least 3 letters
        .filter(l => !/^[\d\s\-\.\/\\|_=]+$/.test(l));             // not just symbols

    // Prefer lines that look like app names or page headings
    const priority = lines.find(l =>
        /inbox|mail|gmail|outlook|google|excel|word|teams|zoom|chrome|edge|firefox|open|dashboard|home/i.test(l)
    );
    return (priority || lines[0] || null)?.substring(0, 50) || null;
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function callClaudeAPI(prompt) {
    const apiKey = sessionStorage.getItem('claudeApiKey');
    if (!apiKey) throw new Error('Geen API-sleutel opgegeven. Voer je Claude API-sleutel in.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key':    apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-allow-browser': 'true'
        },
        body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 1800,
            messages:   [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${response.status}`;
        if (response.status === 401) throw new Error('Ongeldige API-sleutel. Controleer je sleutel onder AI Instellingen.');
        if (response.status === 429) throw new Error('API-limiet bereikt. Wacht even en probeer opnieuw.');
        throw new Error(msg);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function buildAIPrompt(pattern) {
    const clusters = analyzer.getClusters();
    const avgSec   = (pattern.avgDuration / 1000).toFixed(0);

    const steps = pattern.clusterSeq.map((id, i) => {
        const c     = clusters[id];
        const name  = c?.detectedTitle || c?.label || `Scherm ${id + 1}`;
        const ocr   = c?.ocrText
            ? `\n   Zichtbare tekst op scherm:\n   "${cleanOCRForPrompt(c.ocrText)}"`
            : '';
        return `Stap ${i + 1}: ${name}${ocr}`;
    }).join('\n\n');

    return `Je bent een expert in het schrijven van werkinstructies voor kantoor- en logistieke processen.

Via schermopname-analyse is de volgende terugkerende workflow gedetecteerd:

ANALYSE RESULTAAT:
- Aantal keer waargenomen: ${pattern.occurrenceCount}×
- Gemiddelde duur per cyclus: ${avgSec} seconden
- Automatiseringspotentieel: ${pattern.automationLevel}

SCHERMSTATEN IN VOLGORDE (met gelezen scherminhoudd):
${steps}

OPDRACHT:
Schrijf een heldere, professionele werkinstructie in het Nederlands.

VEREISTEN:
1. Begin met een beschrijvende titel (max 60 tekens) die aangeeft wat dit proces doet
2. Schrijf een korte introductie: wat is dit proces en waarom doe je het?
3. Beschrijf elke stap concreet: WAT doe je, WAAR precies, en indien duidelijk: WAAROM
4. Als je uit de scherminhoudd specifieke applicaties, documenten, formulieren of velden herkent → benoem ze bij naam
5. Schrijf alsof je het uitlegt aan een nieuwe collega die het systeem nog niet kent
6. Gebruik genummerde stappen
7. Geef ⚠️ aan bij stappen die niet goed af te leiden zijn uit de schermopname
8. Gebruik GEEN technisch jargon zoals "schermstatus", "cluster" of "segment"
9. Sluit af met een korte tip of aandachtspunt

Schrijf de instructie direct, zonder inleiding of uitleg over wat je doet.`;
}

function cleanOCRForPrompt(text) {
    return text
        .replace(/\n+/g, ' | ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 400);
}

// ─── Generate instruction (called from UI) ────────────────────────────────────

window.generateInstructionFor = async function(patternId) {
    const pattern = analyzer.getPatterns().find(p => p.id === patternId);
    if (!pattern) return;

    const btn = document.querySelector(`.btn-generate[data-id="${patternId}"]`);
    if (btn) { btn.textContent = '⏳ Genereren…'; btn.disabled = true; }

    try {
        const prompt      = await buildAIPrompt(pattern);
        const instruction = await callClaudeAPI(prompt);
        analyzer.setPatternAIInstruction(patternId, instruction);
        renderInstructions();
        // Switch to instructions tab
        document.querySelector('.tab[data-tab="instructions"]')?.click();
    } catch (e) {
        notify(`AI-fout: ${e.message}`, 'error');
        if (btn) { btn.textContent = '✨ Probeer opnieuw'; btn.disabled = false; }
    }
    if (btn) { btn.textContent = '↺ Opnieuw genereren'; btn.disabled = false; }
};

// ─── Start analysis ───────────────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: 5 },
            audio: false
        });
        video.srcObject      = stream;
        video.style.display  = 'block';
        noPreview.style.display = 'none';
        stream.getVideoTracks()[0].addEventListener('ended', onStreamEnded);
        video.addEventListener('loadedmetadata', beginAnalysis, { once: true });
    } catch (err) {
        handleCaptureError(err);
    }
});

function beginAnalysis() {
    analyzer.reset();
    isAnalyzing      = true;
    sessionStart     = Date.now();
    lastClusterCount = 0;

    btnStart.disabled = true;
    btnStop.disabled  = false;
    selInterval.disabled  = true;
    selThreshold.disabled = true;

    setStatus('active', 'Analyse actief');
    activityDot.className    = 'dot dot-recording';
    activityText.textContent = 'Analyseert schermveranderingen…';

    // Pre-load OCR worker in background
    if (typeof Tesseract !== 'undefined') getOCRWorker().catch(() => {});

    const interval = parseInt(selInterval.value, 10);
    sampleTimer = setInterval(sampleFrame, interval);
    uiTimer     = setInterval(updateUI, 1000);
    setTimeout(sampleFrame, 400);
}

// ─── Stop analysis ────────────────────────────────────────────────────────────

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

    btnStart.disabled = false;
    btnStop.disabled  = true;
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
        notify('Schermdeling gestopt door browser of gebruiker.', 'info');
    }
}

// ─── Frame sampling ───────────────────────────────────────────────────────────

function sampleFrame() {
    if (!video.srcObject || video.readyState < 2) return;

    hashCtx.drawImage(video, 0, 0, 16, 16);
    thumbCtx.drawImage(video, 0, 0, 160, 90);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.55);

    const threshold = parseInt(selThreshold.value, 10);
    const result    = analyzer.addFrame(hashCanvas, thumbnail, Date.now(), threshold);

    // Detect newly created clusters → enqueue OCR
    const currentClusters = analyzer.getClusters();
    if (currentClusters.length > lastClusterCount) {
        const newCluster = currentClusters[currentClusters.length - 1];
        if (newCluster.thumbnail && typeof Tesseract !== 'undefined') {
            enqueueOCR(newCluster.id, newCluster.thumbnail);
        }
        lastClusterCount = currentClusters.length;
    }

    if (result.isChange) {
        activityDot.classList.add('dot-flash');
        activityText.textContent = `Schermwisseling (${result.changeAmount.toFixed(1)}% verschil)`;
        setTimeout(() => {
            activityDot.classList.remove('dot-flash');
            activityText.textContent = 'Analyseert schermveranderingen…';
        }, 700);
    }
}

// ─── UI updates ───────────────────────────────────────────────────────────────

function updateUI() {
    const stats = analyzer.getStats();
    elDuration.textContent = sessionStart ? fmtDuration(Date.now() - sessionStart) : '00:00:00';
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
    const s = analyzer.getStats();
    btnExportJSON.disabled = s.segmentCount === 0;
    btnExportMD.disabled   = s.patternCount === 0;
    btnExportTXT.disabled  = s.patternCount === 0;
}

// ─── Render: Patterns ─────────────────────────────────────────────────────────

function renderPatterns() {
    const patterns  = analyzer.getPatterns();
    const clusters  = analyzer.getClusters();

    if (!patterns.length) {
        secPatterns.innerHTML = emptyState(
            'Nog geen patronen gedetecteerd.',
            'Voer dezelfde handelingen meerdere keren herhaalbaar uit. Minimaal 2–3 herhalingen zijn nodig.'
        );
        return;
    }

    secPatterns.innerHTML = patterns.map(p => {
        const chips = p.clusterSeq.map(id => {
            const c     = clusters[id];
            const label = c?.detectedTitle || c?.label || `Scherm ${id + 1}`;
            const thumb = c?.thumbnail
                ? `<img src="${c.thumbnail}" class="chip-thumb" alt="${label}">`
                : '';
            const ocrDone = c?.detectedTitle ? ' chip-ocr-done' : '';
            return `<span class="state-chip${ocrDone}">${thumb}${label}</span>`;
        }).join('<span class="arrow">→</span>');

        return `
        <div class="pattern-card">
            <div class="pattern-header">
                <span class="pattern-id">${p.id}</span>
                <div style="display:flex;gap:8px;align-items:center">
                    ${p.aiInstruction ? '<span class="badge-ai">✨ AI</span>' : ''}
                    <span class="badge badge-${p.automationLevel}">${capFirst(p.automationLevel)} potentieel</span>
                </div>
            </div>
            <div class="pattern-stats">
                <div class="stat"><span class="stat-value">${p.occurrenceCount}×</span><span class="stat-label">Waargenomen</span></div>
                <div class="stat"><span class="stat-value">${fmtSec(p.avgDuration)}</span><span class="stat-label">Gem. duur</span></div>
                <div class="stat"><span class="stat-value">${p.clusterSeq.length}</span><span class="stat-label">Stappen</span></div>
                <div class="stat"><span class="stat-value">${p.automationScore}</span><span class="stat-label">Score /100</span></div>
                <div class="stat"><span class="stat-value">${fmtTime(p.firstSeen)}</span><span class="stat-label">Eerste keer</span></div>
                <div class="stat"><span class="stat-value">${fmtTime(p.lastSeen)}</span><span class="stat-label">Laatste keer</span></div>
            </div>
            <div class="pattern-description">${p.description}</div>
            <div class="pattern-sequence">${chips}</div>
            <div class="pattern-actions">
                <button class="btn-generate btn-sm" data-id="${p.id}"
                    onclick="generateInstructionFor('${p.id}')">
                    ${p.aiInstruction ? '↺ Opnieuw genereren met AI' : '✨ Genereer werkinstructie met AI'}
                </button>
            </div>
        </div>`;
    }).join('');
}

// ─── Render: Automation ───────────────────────────────────────────────────────

function renderAutomation() {
    const patterns = analyzer.getPatterns();
    if (!patterns.length) {
        secAutomation.innerHTML = emptyState('Nog geen automatiseringskansen geanalyseerd.');
        return;
    }

    const groups = { hoog: [], middel: [], laag: [] };
    for (const p of patterns) groups[p.automationLevel].push(p);

    const titles = {
        hoog:   '🟢 Hoog automatiseringspotentieel',
        middel: '🟡 Middel automatiseringspotentieel',
        laag:   '🟠 Laag automatiseringspotentieel'
    };

    let html = '';
    for (const [level, pats] of Object.entries(groups)) {
        if (!pats.length) continue;
        html += `<div class="automation-group">
            <h3 class="group-title group-${level}">${titles[level]}</h3>
            ${pats.map(p => {
                const totalMin  = (p.avgDuration * p.occurrenceCount / 60000).toFixed(1);
                const clusters  = analyzer.getClusters();
                const stepNames = p.clusterSeq
                    .map(id => clusters[id]?.detectedTitle || clusters[id]?.label || `Scherm ${id+1}`)
                    .join(' → ');
                return `
                <div class="automation-card">
                    <div class="automation-header">
                        <strong>${p.id}</strong>
                        <span class="badge badge-${p.automationLevel}">${p.automationLevel}</span>
                    </div>
                    <p class="auto-desc">${p.description}</p>
                    <div class="auto-flow">${stepNames}</div>
                    <div class="automation-metrics">
                        <span>📊 ${p.occurrenceCount}× gezien</span>
                        <span>⏱️ ~${totalMin} min. totaal besteed</span>
                        <span>📋 ${p.clusterSeq.length} stappen</span>
                        <span>🎯 Score: ${p.automationScore}/100</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }
    secAutomation.innerHTML = html;
}

// ─── Render: Instructions ─────────────────────────────────────────────────────

function renderInstructions() {
    const patterns = analyzer.getPatterns();
    if (!patterns.length) {
        secInstructions.innerHTML = emptyState(
            'Nog geen werkinstructies.',
            'Zodra patronen herkend zijn, klik je op "Genereer werkinstructie met AI" voor een volledige, leesbare instructie.'
        );
        return;
    }

    const hasApiKey = !!sessionStorage.getItem('claudeApiKey');

    secInstructions.innerHTML = patterns.map(p => {
        const hasAI = !!p.aiInstruction;

        let content;
        if (hasAI) {
            // Render AI output as readable paragraphs
            content = `<div class="ai-instruction-output">
                ${p.aiInstruction
                    .split('\n')
                    .map(line => {
                        const escaped = escapeHtml(line);
                        if (!escaped.trim()) return '<br>';
                        if (/^\d+\./.test(line.trim())) return `<p class="instr-step">${escaped}</p>`;
                        if (line.startsWith('#'))       return `<p class="instr-heading">${escaped.replace(/^#+\s*/, '')}</p>`;
                        if (line.startsWith('⚠️'))      return `<p class="instr-warning">${escaped}</p>`;
                        if (line.startsWith('💡') || line.startsWith('ℹ️')) return `<p class="instr-tip">${escaped}</p>`;
                        return `<p>${escaped}</p>`;
                    })
                    .join('')}
            </div>`;
        } else {
            const hint = hasApiKey
                ? 'Klik hieronder op "Genereer met AI" voor een uitgebreide instructie.'
                : 'Voer een Claude API-sleutel in onder "AI Instellingen" voor een uitgebreide instructie.';
            content = `<div class="fallback-instruction">
                <p class="fallback-hint">📋 ${hint}</p>
                <pre class="instruction-text">${escapeHtml(p.workInstruction)}</pre>
            </div>`;
        }

        return `
        <div class="instruction-card">
            <div class="instruction-header">
                <div>
                    <strong>${p.id}</strong>
                    ${hasAI ? '<span class="badge-ai">✨ AI gegenereerd</span>' : ''}
                </div>
                <button class="btn-generate btn-sm" data-id="${p.id}"
                    onclick="generateInstructionFor('${p.id}')">
                    ${hasAI ? '↺ Opnieuw genereren' : '✨ Genereer met AI'}
                </button>
            </div>
            ${content}
        </div>`;
    }).join('');
}

// ─── Export ───────────────────────────────────────────────────────────────────

btnExportJSON.addEventListener('click', () => exporter.exportJSON(analyzer.exportData()));
btnExportMD.addEventListener('click',   () => exporter.exportMarkdown(analyzer.getPatterns(), analyzer.getStats()));
btnExportTXT.addEventListener('click',  () => exporter.exportTXT(analyzer.getPatterns(), analyzer.getStats()));

// ─── Error handling ───────────────────────────────────────────────────────────

function handleCaptureError(err) {
    const msgs = {
        NotAllowedError:       'Schermdeling geweigerd. Geef toestemming in de browser.',
        PermissionDeniedError: 'Schermdeling geweigerd. Geef toestemming in de browser.',
        NotFoundError:         'Geen schermbron gevonden.',
        AbortError:            'Schermdeling geannuleerd.'
    };
    notify(msgs[err.name] || `Fout: ${err.message}`, 'error');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(state, text) {
    elStatus.textContent = text;
    elStatus.className   = `value status-${state}`;
}

function notify(message, type = 'info') {
    const old = document.getElementById('notification');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'notification';
    el.className = `notification notification-${type}`;
    el.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById('app').prepend(el);
    if (type !== 'error') setTimeout(() => el?.remove(), 7000);
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

function fmtSec(ms)  { return `${(ms / 1000).toFixed(1)}s`; }
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString('nl-NL') : '--'; }
function pad(n)      { return String(n).padStart(2, '0'); }
function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
