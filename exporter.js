/**
 * exporter.js - Export module for analysis results.
 * Supports: JSON (full data), Markdown, and plain TXT.
 */

class DataExporter {

    exportJSON(data) {
        this._download(
            JSON.stringify(data, null, 2),
            `schermanalyse-${this._ts()}.json`,
            'application/json'
        );
    }

    exportMarkdown(patterns, stats) {
        if (!patterns.length) { alert('Geen patronen beschikbaar voor export.'); return; }

        const lines = [
            '# Schermanalyse – Werkinstructies',
            '',
            patterns.some(p => p.aiInstruction) ? '_Bevat AI-gegenereerde werkinstructies (Claude)_' : '_Bevat voorlopige instructies — gebruik "Genereer met AI" voor uitgebreidere versies_',
            '',
            `**Geëxporteerd:** ${new Date().toLocaleString('nl-NL')}`,
            `**Frames geanalyseerd:** ${stats.frameCount}`,
            `**Segmenten:** ${stats.segmentCount}`,
            `**Unieke schermstates:** ${stats.clusterCount}`,
            `**Patronen herkend:** ${stats.patternCount}`,
            '',
            '---',
            '',
            '> **Let op:** Exacte muisklikken en toetsaanslagen zijn niet betrouwbaar af te leiden',
            '> uit visuele patroonanalyse. Instructies zijn gebaseerd op gedetecteerde schermveranderingen.',
            '',
            '---',
            ''
        ];

        for (const p of patterns) {
            const avgSec = (p.avgDuration / 1000).toFixed(1);
            lines.push(`## ${p.id}`);
            lines.push('');
            lines.push(`| Kenmerk | Waarde |`);
            lines.push(`|---|---|`);
            lines.push(`| Automatiseringspotentieel | **${p.automationLevel}** (score: ${p.automationScore}/100) |`);
            lines.push(`| Aantal keer gezien | ${p.occurrenceCount}× |`);
            lines.push(`| Gemiddelde duur | ${avgSec} seconden |`);
            lines.push(`| Min – Max duur | ${(p.minDuration/1000).toFixed(1)}s – ${(p.maxDuration/1000).toFixed(1)}s |`);
            lines.push(`| Eerste waarneming | ${new Date(p.firstSeen).toLocaleString('nl-NL')} |`);
            lines.push(`| Laatste waarneming | ${new Date(p.lastSeen).toLocaleString('nl-NL')} |`);
            lines.push('');
            lines.push(`**Beschrijving:** ${p.description}`);
            lines.push('');
            lines.push('**Schermvolgorde:**');
            lines.push('');
            lines.push(p.clusterSeq.map((_, i) => {
                const c = p; // label via description already
                return `${i + 1}. Stap ${i + 1}`;
            }).join('\n'));
            lines.push('');
            lines.push('### Werkinstructie');
            lines.push('');
            const instruction = p.aiInstruction || p.workInstruction;
            if (p.aiInstruction) {
                lines.push(p.aiInstruction);
            } else {
                lines.push('```');
                lines.push(instruction);
                lines.push('```');
            }
            lines.push('');
            lines.push('---');
            lines.push('');
        }

        this._download(lines.join('\n'), `werkinstructies-${this._ts()}.md`, 'text/markdown');
    }

    exportTXT(patterns, stats) {
        if (!patterns.length) { alert('Geen patronen beschikbaar voor export.'); return; }

        const SEP  = '='.repeat(60);
        const sep2 = '-'.repeat(40);

        const lines = [
            'SCHERMANALYSE – WERKINSTRUCTIES',
            SEP,
            `Geëxporteerd     : ${new Date().toLocaleString('nl-NL')}`,
            `Frames           : ${stats.frameCount}`,
            `Segmenten        : ${stats.segmentCount}`,
            `Schermstates     : ${stats.clusterCount}`,
            `Patronen         : ${stats.patternCount}`,
            SEP,
            '',
            'LET OP: Exacte muisklikken en toetsaanslagen zijn niet betrouwbaar',
            'af te leiden uit visuele patroonanalyse. Controleer instructies',
            'handmatig voor gebruik in productie.',
            '',
            SEP,
            ''
        ];

        for (const p of patterns) {
            const avgSec = (p.avgDuration / 1000).toFixed(1);
            lines.push(p.id.toUpperCase());
            lines.push(sep2);
            lines.push(`Automatiseringspotentieel : ${p.automationLevel} (score: ${p.automationScore}/100)`);
            lines.push(`Aantal keer gezien        : ${p.occurrenceCount}×`);
            lines.push(`Gemiddelde duur           : ${avgSec} seconden`);
            lines.push(`Min – Max duur            : ${(p.minDuration/1000).toFixed(1)}s – ${(p.maxDuration/1000).toFixed(1)}s`);
            lines.push(`Eerste waarneming         : ${new Date(p.firstSeen).toLocaleString('nl-NL')}`);
            lines.push(`Laatste waarneming        : ${new Date(p.lastSeen).toLocaleString('nl-NL')}`);
            lines.push('');
            lines.push('Beschrijving:');
            lines.push(`  ${p.description}`);
            lines.push('');
            lines.push('Werkinstructie:');
            p.workInstruction.split('\n').forEach(l => lines.push(`  ${l}`));
            lines.push('');
            lines.push(SEP);
            lines.push('');
        }

        this._download(lines.join('\n'), `werkinstructies-${this._ts()}.txt`, 'text/plain');
    }

    _ts() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    _download(content, filename, mime) {
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
