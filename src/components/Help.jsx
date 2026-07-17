import { useState } from 'react'
// Beginner support set (T27). Bundled at build time via Vite `?raw` so the
// docs ship inside dist/ — `docs/` is NOT in package.json build.files, so a
// runtime filesystem read would fail in the packaged app. Baking them in also
// means Help works fully offline. README.md is deliberately NOT imported: it's a
// contributor-facing index, not buyer-facing help.
import roadmapRaw from '../../docs/help/getting-started-roadmap.md?raw'
import uiRaw from '../../docs/help/ui-glossary.md?raw'
import agenticRaw from '../../docs/help/agentic-glossary.md?raw'
import githubRaw from '../../docs/help/github-glossary.md?raw'

// Strip YAML frontmatter (--- … ---) so vault-convention metadata never renders.
function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? text.slice(m[0].length) : text
}

// Section ids match the source filename (minus `.md`) so an in-doc link like
// `[UI glossary](ui-glossary.md)` maps straight onto a tab.
const SECTIONS = [
  { id: 'getting-started-roadmap', icon: 'map-2',      label: 'Getting Started', text: stripFrontmatter(roadmapRaw) },
  { id: 'ui-glossary',             icon: 'layout',     label: 'UI Terms',        text: stripFrontmatter(uiRaw) },
  { id: 'agentic-glossary',        icon: 'robot',      label: 'Agentic Terms',   text: stripFrontmatter(agenticRaw) },
  { id: 'github-glossary',         icon: 'git-branch', label: 'Git & GitHub',    text: stripFrontmatter(githubRaw) },
]
const SECTION_IDS = new Set(SECTIONS.map(s => s.id))

// Minimal markdown renderer — headings, bold, inline code, links, and bullet/
// number lists cover the help docs. No external dependency (the app ships none)
// and no raw HTML injection: everything is built from React nodes, so doc content
// can't inject markup. Internal `*.md` links become in-app tab switches; any other
// link renders as plain styled text (a read-only, offline help surface never
// navigates out on its own).
function Markdown({ text, onNavSection }) {
  const inline = (s, keyBase) => {
    const nodes = []
    // Order matters: **bold** before *italic* so the double-star wins.
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
    let last = 0, m, i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) nodes.push(s.slice(last, m.index))
      if (m[2] != null) {
        nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>)
      } else if (m[3] != null) {
        nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>)
      } else if (m[4] != null) {
        nodes.push(<code key={`${keyBase}-c${i}`} style={{ fontFamily: 'monospace', fontSize: '0.9em', background: 'var(--color-surface-2)', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }}>{m[4]}</code>)
      } else {
        const label = m[5]
        const target = (m[6] || '').replace(/#.*$/, '')       // drop any #anchor
        const secId = target.replace(/\.md$/, '')
        if (SECTION_IDS.has(secId)) {
          nodes.push(
            <button
              key={`${keyBase}-l${i}`}
              onClick={() => onNavSection(secId)}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--color-accent)', cursor: 'pointer', textDecoration: 'underline' }}
            >{label}</button>
          )
        } else {
          nodes.push(<span key={`${keyBase}-l${i}`} style={{ color: 'var(--color-text)' }}>{label}</span>)
        }
      }
      last = m.index + m[0].length; i++
    }
    if (last < s.length) nodes.push(s.slice(last))
    return nodes
  }

  const lines = text.split('\n')
  const blocks = []
  let list = null // { ordered, items: [] }
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={`l${blocks.length}`} style={{ margin: '6px 0', paddingLeft: 22, fontSize: 14, color: 'var(--color-text-2)', lineHeight: 1.65 }}>
      {list.items.map((it, j) => <li key={j} style={{ marginBottom: 5 }}>{inline(it, `l${blocks.length}-${j}`)}</li>)}
    </Tag>)
    list = null
  }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '')
    const h = line.match(/^(#{1,4})\s+(.+)/)
    const bullet = line.match(/^\s*[-*]\s+(.+)/)
    const num = line.match(/^\s*\d+\.\s+(.+)/)
    if (h) {
      flush()
      const lvl = h[1].length
      blocks.push(<div key={idx} style={{ fontSize: lvl <= 1 ? 22 : lvl === 2 ? 16 : 14, fontWeight: 600, color: 'var(--color-text)', margin: lvl <= 1 ? '4px 0 10px' : lvl === 2 ? '20px 0 8px' : '14px 0 4px', letterSpacing: lvl <= 1 ? '-0.01em' : 0 }}>{inline(h[2], `h${idx}`)}</div>)
    } else if (bullet || num) {
      const ordered = !!num
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet || num)[1])
    } else if (line.trim() === '') {
      flush()
    } else {
      flush()
      blocks.push(<p key={idx} style={{ fontSize: 14, color: 'var(--color-text-2)', lineHeight: 1.7, margin: '8px 0' }}>{inline(line, `p${idx}`)}</p>)
    }
  })
  flush()
  return <div>{blocks}</div>
}

export default function Help() {
  const [active, setActive] = useState(SECTIONS[0].id)
  const section = SECTIONS.find(s => s.id === active) || SECTIONS[0]

  const goSection = (id) => {
    if (SECTION_IDS.has(id)) setActive(id)
  }

  return (
    <div style={{ maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-3)', letterSpacing: '0.02em' }}>
          Guides and glossaries for getting started with Nexus. New here? Start with Getting Started.
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 18px', borderBottom: '0.5px solid var(--color-border)', paddingBottom: 12 }}>
        {SECTIONS.map(s => {
          const on = s.id === active
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={on ? undefined : 'nav-btn'}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 12px',
                background: on ? 'var(--color-accent-bg)' : 'var(--color-surface)',
                border: `0.5px solid ${on ? 'var(--color-accent)' : 'var(--color-border-mid)'}`,
                borderRadius: 'var(--radius)',
                fontSize: 13,
                fontWeight: on ? 500 : 400,
                color: on ? 'var(--color-text)' : 'var(--color-text-2)',
                cursor: 'pointer',
                transition: 'background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast)',
              }}
            >
              <i className={`ti ti-${s.icon}`} style={{ fontSize: 15, color: on ? 'var(--color-accent-text)' : 'var(--color-text-3)' }}></i>
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Rendered doc */}
      <div style={{ paddingBottom: 40 }}>
        <Markdown text={section.text} onNavSection={goSection} />
      </div>
    </div>
  )
}
