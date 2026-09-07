/**
 * frontend/src/components/StructuredNarrativeViewer.jsx
 *
 * Clean, executive-grade renderer for CrowdSense AI Narrative Summaries.
 * Organizes raw narrative prose into distinct, well-spaced section cards
 * with clear headings and typography — without visual inline badges or chips.
 */

import React, { useState } from 'react'

/**
 * Parses markdown inline formatting (bold and italics) into clean React elements.
 * Strictly avoids inline chips, badge pills, or emoji tags inside text.
 */
export function formatInlineText(text) {
  if (!text) return ''

  // Split bold (**...**) and italic (*...*) tokens cleanly
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  const parts = text.split(pattern)

  return parts.map((part, i) => {
    if (!part) return null

    // Bold formatting (e.g. **Zone 3 (Temple Square & Chariot Basin)**, **Baseline**)
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2)
      return (
        <strong key={i} style={{ color: 'var(--color-text)', fontWeight: 700 }}>
          {inner}
        </strong>
      )
    }

    // Italic formatting (e.g. *Overcapacity Arrival*)
    if (part.startsWith('*') && part.endsWith('*')) {
      const inner = part.slice(1, -1)
      return (
        <em key={i} style={{ fontStyle: 'italic', color: 'var(--color-text)' }}>
          {inner}
        </em>
      )
    }

    return part
  })
}

/**
 * Main StructuredNarrativeViewer Component
 */
export default function StructuredNarrativeViewer({
  narration,
  source,
  model,
  venueName,
}) {
  const [copied, setCopied] = useState(false)

  if (!narration) return null

  // Split narrative by Markdown headings (###) or section markers
  const sections = []
  const rawSections = narration.split(/\n(?=###|\*\*Executive|\*\*Subzone|\*\*Actionable)/g)

  for (const raw of rawSections) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    let title = ''
    let body = trimmed
    let themeColor = 'var(--color-border)'

    // Parse heading if present
    const headingMatch = trimmed.match(/^(?:###|\*\*)\s*(.+?)(?:\*\*|\n|$)/)
    if (headingMatch) {
      title = headingMatch[1].replace(/[*#]/g, '').trim()
      body = trimmed.replace(/^(?:###|\*\*)\s*.+?(?:\*\*|\n)+/, '').trim()
    }

    const titleLower = title.toLowerCase()

    if (titleLower.includes('executive') || titleLower.includes('posture') || titleLower.includes('overview')) {
      themeColor = '#0284c7'
      if (!title) title = 'Executive Summary & Overall Risk Posture'
    } else if (titleLower.includes('subzone') || titleLower.includes('bottleneck') || titleLower.includes('propagation')) {
      themeColor = '#f59e0b'
      if (!title) title = 'Subzone Bottlenecks Analysis'
    } else if (titleLower.includes('mitigation') || titleLower.includes('intervention') || titleLower.includes('action')) {
      themeColor = '#10b981'
      if (!title) title = 'Actionable Mitigations & Layout Interventions'
    } else if (titleLower.includes('advisory') || titleLower.includes('review') || titleLower.includes('conclu')) {
      themeColor = '#8b5cf6'
      if (!title) title = 'Safety Advisory & Expert Review'
    } else if (!title) {
      title = 'Analysis Narrative'
    }

    sections.push({ title, themeColor, body })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(narration)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Header Bar with Source Badge & Quick Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        paddingBottom: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 600,
            background: source === 'gemini_llm' ? 'rgba(59,130,246,0.1)' : source === 'groq_llm' ? 'rgba(249,115,22,0.1)' : 'rgba(107,114,128,0.1)',
            color: source === 'gemini_llm' ? '#0284c7' : source === 'groq_llm' ? '#ea580c' : 'var(--color-muted)',
            border: `1px solid ${source === 'gemini_llm' ? 'rgba(59,130,246,0.25)' : source === 'groq_llm' ? 'rgba(249,115,22,0.25)' : 'var(--color-border)'}`,
          }}>
            {source === 'gemini_llm' && `Google Gemini (${model || 'gemini-3.7-flash'})`}
            {source === 'deterministic_fallback' && `Deterministic Local Synthesis`}
            {source !== 'gemini_llm' && source !== 'deterministic_fallback' && `AI Synthesis (${model || source})`}
          </div>

          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            Organized by 8 operational subzones
          </span>
        </div>

        <button
          onClick={handleCopy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 600,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : 'Copy Text'}
        </button>
      </div>

      {/* Rendered Structured Section Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map((sec, idx) => {
          // Split paragraphs or bullet points inside each section
          const rawParagraphs = sec.body.split(/\n\s*\n/)

          return (
            <div
              key={idx}
              style={{
                borderRadius: 8,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderLeft: `3px solid ${sec.themeColor}`,
                overflow: 'hidden',
              }}
            >
              {/* Card Section Header */}
              <div style={{
                padding: '9px 14px',
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
              }}>
                <h4 style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  letterSpacing: '0.02em',
                }}>
                  {sec.title}
                </h4>
              </div>

              {/* Card Content */}
              <div style={{
                padding: '12px 14px',
                fontSize: 13,
                lineHeight: 1.75,
                color: 'var(--color-text)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {rawParagraphs.map((para, pIdx) => {
                  const trimmedPara = para.trim()
                  if (!trimmedPara) return null

                  // Check if paragraph contains bullet items
                  if (trimmedPara.includes('\n- ') || trimmedPara.startsWith('- ') || trimmedPara.includes('\n* ') || trimmedPara.startsWith('* ')) {
                    const lines = trimmedPara.split(/\n/)
                    return (
                      <ul key={pIdx} style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {lines.map((line, lIdx) => {
                          const cleanLine = line.replace(/^[-*]\s+/, '').trim()
                          if (!cleanLine) return null
                          return (
                            <li key={lIdx} style={{ lineHeight: 1.7 }}>
                              {formatInlineText(cleanLine)}
                            </li>
                          )
                        })}
                      </ul>
                    )
                  }

                  return (
                    <p key={pIdx} style={{ margin: 0 }}>
                      {formatInlineText(trimmedPara)}
                    </p>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Grounding & Integrity Footer */}
      <div style={{
        fontSize: 10.5,
        color: 'var(--color-muted)',
        fontStyle: 'italic',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 6,
      }}>
        <span>
          Grounding Notice: Based strictly on deterministic simulation findings. Authoritative figures are in the tables above.
        </span>
        <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>
          {venueName || 'Venue Layout'}
        </span>
      </div>
    </div>
  )
}
