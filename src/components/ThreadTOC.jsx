import { useMemo } from 'react'

// Extract a concise title from a message's content
function extractTitle(content, index) {
  if (!content) return `Response ${index + 1}`

  // Try first markdown heading
  const heading = content.match(/^#{1,3}\s+(.+)/m)
  if (heading) return heading[1].trim().slice(0, 60)

  // Try bolded phrase at start
  const bold = content.match(/^\*\*(.+?)\*\*/m)
  if (bold) return bold[1].trim().slice(0, 60)

  // Try first sentence
  const sentence = content.match(/^[^.!?\n]{10,80}[.!?]/)
  if (sentence) return sentence[0].trim().slice(0, 60)

  // First line
  const line = content.split('\n').find(l => l.trim().length > 10)
  return (line || `Response ${index + 1}`).trim().slice(0, 60)
}

// Detect if a message contains a notable item (decision, file, question)
function extractTags(content) {
  if (!content) return []
  const tags = []
  if (/```|`[^`]+`/.test(content)) tags.push({ type: 'code', label: 'Code' })
  if (/created|saved|written|file|\.md|\.yaml|\.json/i.test(content)) tags.push({ type: 'file', label: 'File' })
  if (/decision|approved|rejected|ruled/i.test(content)) tags.push({ type: 'decision', label: 'Decision' })
  if (/\?/.test(content) && content.split('?').length > 2) tags.push({ type: 'question', label: 'Question' })
  if (/escalat|warning|risk|flag/i.test(content)) tags.push({ type: 'flag', label: 'Flag' })
  return tags
}

const TAG_STYLES = {
  code:     { bg: 'var(--color-dual-bg)',      text: 'var(--color-dual-text)' },
  file:     { bg: 'var(--color-active-bg)',    text: 'var(--color-active-text)' },
  decision: { bg: 'var(--color-recursive-bg)', text: 'var(--color-recursive-text)' },
  question: { bg: 'var(--color-passive-bg)',   text: 'var(--color-passive-text)' },
  flag:     { bg: 'var(--color-escalation-bg)', text: 'var(--color-escalation-text)' },
}

export default function ThreadTOC({ conversation, visible, onToggle, onScrollTo }) {
  const entries = useMemo(() => {
    return conversation
      .map((msg, i) => ({ msg, i }))
      .filter(({ msg }) => msg.role === 'assistant' && msg.content)
      .map(({ msg, i }, tocIndex) => ({
        index: i,
        tocIndex,
        title: extractTitle(msg.content, tocIndex),
        tags: extractTags(msg.content),
        wordCount: msg.content.split(/\s+/).length,
      }))
  }, [conversation])

  const userTurns = conversation.filter(m => m.role === 'user').length
  const decisions = entries.filter(e => e.tags.find(t => t.type === 'decision')).length
  const files = entries.filter(e => e.tags.find(t => t.type === 'file')).length

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        title="Thread table of contents"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: visible ? 'var(--color-text)' : 'var(--color-surface)',
          color: visible ? 'var(--color-surface)' : 'var(--color-text-2)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          zIndex: 10,
        }}
      >
        <i className="ti ti-list" style={{ fontSize: 14 }}></i>
        TOC
        {entries.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            background: visible ? 'var(--color-border-strong)' : 'var(--color-border)',
            padding: '1px 5px', borderRadius: 999,
          }}>{entries.length}</span>
        )}
      </button>

      {/* Panel — floats over the conversation, capped and scrollable */}
      {visible && (
        <div style={{
          position: 'absolute',
          top: 36,
          right: 0,
          width: 260,
          maxHeight: '62vh',
          background: 'var(--color-surface-2)',
          border: '0.5px solid var(--color-border-mid)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          zIndex: 30,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
          animation: 'fade-in var(--dur-fast) var(--ease-out)',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 12px',
            borderBottom: '0.5px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Thread contents</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Stat label="Turns" value={userTurns} />
              <Stat label="Decisions" value={decisions} />
              <Stat label="Files" value={files} />
            </div>
          </div>

          {/* TOC entries */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {entries.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '8px 4px', lineHeight: 1.5 }}>
                Start a conversation. Each response will appear here as a navigable entry.
              </div>
            ) : (
              entries.map(entry => (
                <div
                  key={entry.index}
                  onClick={() => onScrollTo(entry.index)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-border)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{
                      fontSize: 10,
                      color: 'var(--color-text-3)',
                      minWidth: 16,
                      marginTop: 2,
                      fontFeatureSettings: '"tnum"',
                    }}>{entry.tocIndex + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        color: 'var(--color-text)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {entry.title}
                      </div>
                      {entry.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                          {entry.tags.map(tag => {
                            const s = TAG_STYLES[tag.type] || {}
                            return (
                              <span key={tag.type} style={{
                                fontSize: 10, fontWeight: 500,
                                padding: '1px 5px', borderRadius: 3,
                                background: s.bg, color: s.text,
                              }}>{tag.label}</span>
                            )
                          })}
                          <span style={{ fontSize: 10, color: 'var(--color-text-3)', alignSelf: 'center' }}>
                            {entry.wordCount}w
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ask Bibliographer shortcut */}
          <div style={{
            padding: '8px 10px',
            borderTop: '0.5px solid var(--color-border)',
          }}>
            <button
              onClick={() => {
                // Signals parent to switch role to bibliographer and pre-fill
                onScrollTo('bibliographer')
              }}
              style={{
                width: '100%',
                background: 'none',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 11,
                color: 'var(--color-text-2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                textAlign: 'left',
              }}
            >
              <i className="ti ti-robot" style={{ fontSize: 13 }}></i>
              Ask Bibliographer to summarize thread
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1 }}>{label}</div>
    </div>
  )
}
