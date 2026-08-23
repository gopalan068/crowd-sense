/**
 * frontend/src/components/PostEventReportDocument.jsx
 * Polished, formal administrative post-incident report document renderer.
 *
 * Designed to look like an official district-level post-event audit filing.
 * Includes standout accountability KPI summary tiles, custom zero-dependency
 * Markdown/table renderer, simulated-reference callout badges, print-to-PDF
 * export styling, and an underlying system data audit drawer.
 */
import React, { useState } from 'react'

/**
 * Custom zero-dependency Markdown to JSX Renderer
 * Formats headings, tables, blockquotes, simulated tags, lists, and code blocks.
 */
function MarkdownRenderer({ content = '' }) {
  if (!content) return null

  // Split content by lines for structured block processing
  const lines = content.split('\n')
  const blocks = []
  let tableRows = []
  let inTable = false

  const flushTable = () => {
    if (tableRows.length > 0) {
      const headerRow = tableRows[0]
      const bodyRows = tableRows.slice(2) // Skip separator row

      blocks.push(
        <div key={`table-${blocks.length}`} className="my-5 overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs">
          <table className="w-full text-left text-xs border-collapse bg-white dark:bg-slate-900 font-mono-num">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                {headerRow.map((cell, cIdx) => (
                  <th key={cIdx} className="px-3.5 py-2.5 font-bold uppercase tracking-wider">
                    {formatInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 text-slate-700 dark:text-slate-300">
                      {formatInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      tableRows = []
    }
    inTable = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    if (!trimmed) {
      continue
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      blocks.push(<hr key={`hr-${i}`} className="my-6 border-t-2 border-slate-200 dark:border-slate-800" />)
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const bqText = trimmed.replace(/^>\s*/, '')
      const isWarning = bqText.includes('⚠️') || bqText.includes('LOCAL DETERMINISTIC')
      const isSimulated = bqText.includes('[SIMULATED') || bqText.includes('Mandatory Accuracy Caveat')

      blocks.push(
        <div
          key={`bq-${i}`}
          className={`my-3 p-3.5 rounded-lg border text-xs leading-relaxed ${
            isWarning
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              : isSimulated
              ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
          }`}
        >
          {formatInline(bqText)}
        </div>
      )
      continue
    }

    // Headers
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-8 mb-3 pb-2 border-b-2 border-slate-300 dark:border-slate-700 flex items-center gap-2">
          {formatInline(trimmed.replace(/^#\s*/, ''))}
        </h1>
      )
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-6 mb-2">
          {formatInline(trimmed.replace(/^##\s*/, ''))}
        </h2>
      )
      continue
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide mt-4 mb-2">
          {formatInline(trimmed.replace(/^###\s*/, ''))}
        </h3>
      )
      continue
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(
        <div key={`li-${i}`} className="flex items-start gap-2 my-1.5 ml-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="text-sky-500 font-bold mt-0.5">•</span>
          <span>{formatInline(trimmed.replace(/^[-*]\s*/, ''))}</span>
        </div>
      )
      continue
    }

    // Numbered list items
    if (/^\d+\.\s/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/)
      blocks.push(
        <div key={`num-${i}`} className="flex items-start gap-2 my-1.5 ml-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="font-bold text-sky-600 dark:text-sky-400 font-mono-num">{numMatch[1]}.</span>
          <span>{formatInline(numMatch[2])}</span>
        </div>
      )
      continue
    }

    // Regular paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
        {formatInline(trimmed)}
      </p>
    )
  }

  if (inTable) {
    flushTable()
  }

  return <div className="report-markdown-body space-y-1">{blocks}</div>
}

/**
 * Format inline bold, code, and simulated tags
 */
function formatInline(text = '') {
  if (typeof text !== 'string') return text

  // Split by bold (**text**), code (`text`), and [SIMULATED...] tags
  const parts = []
  let remainder = text

  // Replace special tags with badges
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[SIMULATED REFERENCE[^\]]*\]|\[SIMULATED[^\]]*\])/g
  let match
  let lastIdx = 0

  while ((match = regex.exec(remainder)) !== null) {
    if (match.index > lastIdx) {
      parts.push(remainder.substring(lastIdx, match.index))
    }
    const token = match[0]

    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${match.index}`} className="font-bold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={`c-${match.index}`} className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-mono-num text-[11px]">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('[SIMULATED')) {
      parts.push(
        <span key={`sim-${match.index}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 mx-1">
          ⚙️ {token.slice(1, -1)}
        </span>
      )
    }
    lastIdx = regex.lastIndex
  }

  if (lastIdx < remainder.length) {
    parts.push(remainder.substring(lastIdx))
  }

  return parts.length > 0 ? parts : text
}

export default function PostEventReportDocument({ report, onRegenerate }) {
  const [showJsonDrawer, setShowJsonDrawer] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!report) {
    return (
      <div className="p-12 text-center border rounded-xl" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--color-muted)' }}>
          No post-event report has been generated yet.
        </p>
      </div>
    )
  }

  const {
    report_id,
    created_at,
    generation_source,
    model_name,
    markdown_content,
    input_data,
    summary_metrics = {},
  } = report

  const isFallback = generation_source === 'local_fallback' || report.is_fallback

  const handlePrint = () => {
    window.print()
  }

  const handleCopyMarkdown = () => {
    if (markdown_content) {
      navigator.clipboard.writeText(markdown_content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Action & Utility Bar (Hidden during Print) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-slate-900 text-slate-100 border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white text-lg font-black shadow-xs">
            📄
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Post-Event Safety &amp; Accountability Report</span>
              <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                {report_id}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Generated: {new Date(created_at).toLocaleString()} · Model: {model_name || 'llama-3.3-70b-versatile'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJsonDrawer(!showJsonDrawer)}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            title="Inspect underlying system JSON data passed to the synthesis engine"
          >
            <span>{showJsonDrawer ? '✕ Close Data' : '🔍 View Underlying JSON Data'}</span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <span>{copied ? '✓ Copied' : '📋 Copy Markdown'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-md transition-all flex items-center gap-2"
          >
            <span>🖨️ Export as PDF / Print</span>
          </button>
        </div>
      </div>

      {/* Underlying Raw JSON Data Drawer (Audit & Reproducibility Pitch Tool) */}
      {showJsonDrawer && (
        <div className="print:hidden p-5 rounded-xl border border-sky-500/40 bg-slate-950 text-slate-100 shadow-xl space-y-3 font-mono-num text-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <span className="font-bold text-sky-400 uppercase">Input Payload Audit Trail</span>
              <p className="text-[11px] text-slate-400">Exact structured JSON aggregated from SQLite and sent to Gemini / local synthesis.</p>
            </div>
            <button
              onClick={() => setShowJsonDrawer(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded"
            >
              Close
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-slate-900 text-emerald-400 max-h-96 overflow-y-auto text-[11px] leading-relaxed">
            {JSON.stringify(input_data || {}, null, 2)}
          </pre>
        </div>
      )}

      {/* ── Document Shell (Clean Editorial & Print-Optimized Layout) ──── */}
      <div
        id="printable-report-document"
        className="printable-report p-8 md:p-12 rounded-2xl border bg-white dark:bg-slate-900 shadow-xl space-y-8 font-sans transition-colors"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {/* Document Administrative Letterhead */}
        <div className="border-b-2 pb-6 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-2xl font-black shadow-md border border-slate-700">
                🛡️
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-600 dark:text-sky-400 font-mono-num">
                  CrowdSense Safety Intelligence Framework
                </span>
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Post-Incident Crowd Safety &amp; Accountability Report
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  Technical Evaluation &amp; Operational Post-Event Audit Record
                </p>
              </div>
            </div>

            {/* Verification & Generation Source Badge */}
            <div className="flex flex-col items-end gap-1.5 font-mono-num text-xs">
              {isFallback ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold text-[11px]">
                  <span>⚠️ LOCAL DETERMINISTIC SYNTHESIS (Offline Fallback)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 font-bold text-[11px]">
                  <span>🤖 AI SYNTHESIZED via Gemini LLM ({model_name})</span>
                </div>
              )}
              <span className="text-[11px] text-slate-500">Filing ID: {report_id}</span>
            </div>
          </div>

          {/* Report Metadata Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-xs font-mono-num text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Assessment Target</span>
              <strong className="text-slate-800 dark:text-slate-200">{input_data?.report_metadata?.venue_name || 'Demo Venue'}</strong>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Report Scope</span>
              <strong className="text-slate-800 dark:text-slate-200 uppercase">{input_data?.report_metadata?.scope || 'ALL ZONES'}</strong>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Generated Timestamp</span>
              <strong className="text-slate-800 dark:text-slate-200">{new Date(created_at).toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Verification Status</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-bold">✓ SQLite Audit Verified</strong>
            </div>
          </div>
        </div>

        {/* ── Standout Accountability KPI Cards (Pitch Differentiator) ──── */}
        <div className="space-y-2">
          <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500 font-mono-num block">
            Executive Accountability Benchmarks
          </span>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono-num">
            {/* KPI 1: Avg Time to Acknowledge */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 block">
                Avg Time-to-Acknowledge
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-sky-600 dark:text-sky-400">
                  {summary_metrics.avg_acknowledge_sec !== null && summary_metrics.avg_acknowledge_sec !== undefined
                    ? `${summary_metrics.avg_acknowledge_sec}s`
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">per alert</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Duty officer decision speed</p>
            </div>

            {/* KPI 2: Auto-Escalations */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 block">
                Auto-Escalations (Timeout)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {summary_metrics.auto_escalations || 0}
                </span>
                <span className="text-[10px] text-slate-500">alerts escalated</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Unacknowledged SLA breaches</p>
            </div>

            {/* KPI 3: Panic Bypasses */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 block">
                Panic Fast-Path Bypasses
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-red-600 dark:text-red-400">
                  {summary_metrics.panic_bypasses || 0}
                </span>
                <span className="text-[10px] text-slate-500">zero-delay alerts</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Stampede signature triggers</p>
            </div>

            {/* KPI 4: Peak Concurrent Occupancy */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 block">
                Peak Concurrent Occupancy
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {summary_metrics.total_est_peak_occupancy || 0}
                </span>
                <span className="text-[10px] text-slate-500">persons</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                *Peak concurrent occupancy, not total unique footfall
              </p>
            </div>
          </div>
        </div>

        {/* ── Main Structured Report Body ──── */}
        <div className="pt-4">
          <MarkdownRenderer content={markdown_content} />
        </div>

        {/* Document Footer */}
        <div className="pt-8 border-t-2 text-xs font-mono-num text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <strong className="text-slate-700 dark:text-slate-300">CrowdSense Incident &amp; Accountability Engine</strong>
            <p className="text-[11px]">All metrics derived from immutable SQLite audit logs &amp; optical flow CV telemetry.</p>
          </div>
          <div className="text-right">
            <span className="text-[11px] block">Page 1 of 1 · Official Demonstration Filing</span>
            <span className="text-[10px] text-slate-400">Record Hash: {report_id}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
