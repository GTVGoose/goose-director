import { useState, useEffect, useRef, useCallback } from 'react'
import ThreadTOC from './ThreadTOC.jsx'

export default function Invoke({ canonDocs }) {
  const [models, setModels] = useState([])
  const [agentRoles, setAgentRoles] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [selectedDocs, setSelectedDocs] = useState([])
  const [conversation, setConversation] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [docSearch, setDocSearch] = useState('')
  const [showTOC, setShowTOC] = useState(false)
  const bottomRef = useRef(null)
  const msgRefs = useRef({})

  const scrollToMsg = useCallback((indexOrAction) => {
    if (indexOrAction === 'bibliographer') {
      // Switch to bibliographer role and pre-fill a summarize prompt
      setSelectedRole('bibliographer')
      setInput('Please create a Thread Record summarizing this conversation so far: what we set out to do, what was completed, what decisions were made, what files were created, and what the next step is.')
      return
    }
    const el = msgRefs.current[indexOrAction]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => {
      setModels(data.models || [])
      setAgentRoles(data.agentRoles || [])
      const first = (data.models || []).find(m => m.available)
      if (first) setSelectedModel(first.id)
    })
  }, [])

  // Auto-attach defaultDocs when model changes
  useEffect(() => {
    if (!selectedModel || !models.length || !canonDocs.length) return
    const model = models.find(m => m.id === selectedModel)
    if (!model?.defaultDocs?.length) return
    const docsToAttach = model.defaultDocs
      .map(docPath => canonDocs.find(d => d.path === docPath || d.file === docPath.split('/').pop()))
      .filter(Boolean)
    if (docsToAttach.length) setSelectedDocs(docsToAttach)
  }, [selectedModel, models, canonDocs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation, streaming])

  const currentRole = agentRoles.find(r => r.id === selectedRole)
  const currentModel = models.find(m => m.id === selectedModel)

  const filteredDocs = canonDocs.filter(d =>
    !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
    d.canonStatus?.toLowerCase().includes(docSearch.toLowerCase())
  )

  const send = async () => {
    if (!input.trim() || !selectedModel || streaming) return
    const userMsg = { role: 'user', content: input.trim() }
    const newConv = [...conversation, userMsg]
    setConversation(newConv)
    setInput('')
    setStreaming(true)
    setError(null)

    let assistantText = ''
    const assistantMsg = { role: 'assistant', content: '', streaming: true }
    setConversation([...newConv, assistantMsg])

    try {
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModel,
          systemPrompt: currentRole?.systemPrompt,
          messages: newConv,
          sourceDocs: selectedDocs.map(d => ({ title: d.title, path: d.path })),
        }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              assistantText += data.text
              setConversation([...newConv, { role: 'assistant', content: assistantText, streaming: true }])
            }
            if (data.error) setError(data.error)
            if (data.done) {
              setConversation([...newConv, { role: 'assistant', content: assistantText, streaming: false, model: data.model }])
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(e.message)
    }
    setStreaming(false)
  }

  const routeToModel = (targetModelId, messageContent) => {
    setSelectedModel(targetModelId)
    setInput(messageContent)
  }

  const saveThread = async () => {
    const content = conversation.map(m =>
      `**${m.role === 'user' ? 'Director' : currentModel?.name || 'Assistant'}:** ${m.content}`
    ).join('\n\n')
    const title = `Session — ${new Date().toLocaleDateString()}`
    await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags: [selectedRole, selectedModel] }),
    })

    // Auto-log to umbruh-session-log.md when Umbruh is the active model
    if (selectedModel === 'umbruh') {
      try {
        await fetch('/api/umbruh-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation }),
        })
        alert('Thread saved. Session log updated.')
      } catch {
        alert('Thread saved. Session log update failed — check Ollama is running.')
      }
    } else {
      alert('Thread saved to Knowledge Navigator')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16, maxWidth: 1100, position: 'relative' }}>
      {/* Config panel */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Model */}
        <Panel title="Model">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {models.map(m => (
              <ModelOption
                key={m.id}
                model={m}
                selected={selectedModel === m.id}
                onClick={() => {
                  if (!m.available) return
                  setSelectedModel(m.id)
                  if (m.defaultDocs?.length && canonDocs.length) {
                    const toAttach = m.defaultDocs
                      .map(p => canonDocs.find(d => d.path === p || d.file === p.split('/').pop()))
                      .filter(Boolean)
                    if (toAttach.length) setSelectedDocs(toAttach)
                  } else if (!m.defaultDocs?.length) {
                    setSelectedDocs([])
                  }
                }}
              />
            ))}
          </div>
        </Panel>

        {/* Agent role */}
        <Panel title="Agent role">
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          >
            <option value="">Director (open)</option>
            {agentRoles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {currentRole && (
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6, lineHeight: 1.5 }}>
              {currentRole.systemPrompt.slice(0, 120)}…
            </div>
          )}
        </Panel>

        {/* Source docs */}
        <Panel title={`Source docs (${selectedDocs.length})`}>
          <button
            onClick={() => setShowDocPicker(!showDocPicker)}
            style={{
              width: '100%', background: 'none',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 5, padding: '5px 8px',
              fontSize: 12, color: 'var(--color-text-2)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-plus" style={{ fontSize: 13 }}></i>
            Add source document
          </button>
          {selectedDocs.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 6px', background: 'var(--color-border)', borderRadius: 4,
              marginTop: 4,
            }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.title}</span>
              <button onClick={() => setSelectedDocs(selectedDocs.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-3)', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 4 }}>
                <i className="ti ti-x" style={{ fontSize: 12 }}></i>
              </button>
            </div>
          ))}
        </Panel>

        {conversation.length > 0 && (
          <button
            onClick={saveThread}
            style={{
              background: 'none', border: '0.5px solid var(--color-border-strong)',
              borderRadius: 6, padding: '7px 10px', fontSize: 12,
              color: 'var(--color-text-2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <i className="ti ti-bookmark" style={{ fontSize: 14 }}></i>
            Save thread
          </button>
        )}
      </div>

      {/* Doc picker overlay */}
      {showDocPicker && (
        <div style={{
          position: 'absolute', left: 270, top: 60, width: 320, zIndex: 100,
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: 10, borderBottom: '0.5px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Search docs…"
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              style={{ flex: 1, fontSize: 13 }}
              autoFocus
            />
            <button onClick={() => setShowDocPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 16 }}>
              <i className="ti ti-x"></i>
            </button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {filteredDocs.slice(0, 30).map((d, i) => {
              const selected = selectedDocs.find(s => s.path === d.path)
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (selected) setSelectedDocs(selectedDocs.filter(s => s.path !== d.path))
                    else setSelectedDocs([...selectedDocs, d])
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selected ? 'var(--color-active-bg)' : 'none',
                    borderBottom: '0.5px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <i className={`ti ${selected ? 'ti-check' : 'ti-file'}`} style={{ fontSize: 14, color: selected ? 'var(--color-active-text)' : 'var(--color-text-3)', flexShrink: 0 }}></i>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: selected ? 500 : 400 }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{d.docType} · {d.canonStatus}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* TOC toggle sits top-right of the conversation area */}
        <div style={{ position: 'relative', height: 32, marginBottom: 8, flexShrink: 0 }}>
          <ThreadTOC
            conversation={conversation}
            visible={showTOC}
            onToggle={() => setShowTOC(!showTOC)}
            onScrollTo={scrollToMsg}
          />
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 4px',
          display: 'flex', flexDirection: 'column', gap: 16,
          minHeight: 200,
        }}>
          {conversation.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 8, color: 'var(--color-text-3)',
            }}>
              <i className="ti ti-messages" style={{ fontSize: 32 }}></i>
              <div style={{ fontSize: 13 }}>Select a model and agent role, then send a message.</div>
              {selectedDocs.length === 0 && (
                <div style={{ fontSize: 12 }}>Add source docs to ground the response in your canon.</div>
              )}
            </div>
          ) : (
            conversation.map((msg, i) => (
              <div key={i} ref={el => { if (el) msgRefs.current[i] = el }}>
                <Message
                  msg={msg}
                  models={models}
                  onRoute={(targetId) => routeToModel(targetId, msg.content)}
                />
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div style={{
            margin: '8px 0',
            padding: '8px 12px',
            background: 'var(--color-escalation-bg)',
            color: 'var(--color-escalation-text)',
            borderRadius: 6, fontSize: 12,
          }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 5 }}></i>{error}
          </div>
        )}

        {/* Input bar */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          padding: '12px 0 0',
          borderTop: '0.5px solid var(--color-border)',
          marginTop: 8,
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Message ${currentModel?.name || '…'} as ${currentRole?.name || 'Director'}…`}
            rows={3}
            style={{
              flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5,
              padding: '8px 10px',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 8,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || !selectedModel || streaming}
            style={{
              padding: '8px 14px',
              background: streaming ? 'var(--color-surface-2)' : 'var(--color-active-bg)',
              color: streaming ? 'var(--color-text-3)' : 'var(--color-active-text)',
              border: streaming ? '0.5px solid var(--color-border)' : '0.5px solid var(--color-active-border)',
              borderRadius: 8, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}
          >
            <i className={`ti ${streaming ? 'ti-loader' : 'ti-send'}`} style={{ fontSize: 15 }}></i>
            {streaming ? 'Thinking…' : 'Send'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>
          Enter to send · Shift+Enter for new line · {selectedDocs.length} source doc{selectedDocs.length !== 1 ? 's' : ''} attached
        </div>
      </div>
    </div>
  )
}

function Message({ msg, models, onRoute }) {
  const isUser = msg.role === 'user'
  const [showRoute, setShowRoute] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', padding: '0 4px' }}>
        {isUser ? 'Director' : `Assistant${msg.model ? ` (${msg.model})` : ''}${msg.streaming ? ' ·' : ''}`}
      </div>
      <div style={{
        maxWidth: '90%',
        padding: '10px 14px',
        background: isUser ? 'var(--color-active-bg)' : 'var(--color-surface)',
        color: isUser ? 'var(--color-active-text)' : 'var(--color-text)',
        border: isUser ? '0.5px solid var(--color-active-border)' : '0.5px solid var(--color-border)',
        borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content || (msg.streaming ? '…' : '')}
      </div>
      {!isUser && !msg.streaming && msg.content && (
        <div style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
          <button
            onClick={() => navigator.clipboard.writeText(msg.content)}
            style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <i className="ti ti-copy" style={{ fontSize: 13 }}></i> Copy
          </button>
          <button
            onClick={() => setShowRoute(!showRoute)}
            style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <i className="ti ti-arrow-forward-up" style={{ fontSize: 13 }}></i> Route to…
          </button>
          {showRoute && models.filter(m => m.available).map(m => (
            <button
              key={m.id}
              onClick={() => { onRoute(m.id); setShowRoute(false) }}
              style={{
                background: 'var(--color-border)', border: 'none',
                borderRadius: 4, padding: '2px 7px',
                fontSize: 11, color: 'var(--color-text-2)', cursor: 'pointer',
              }}
            >{m.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '7px 12px',
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <span className="glyph-label">{title}</span>
      </div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  )
}

function ModelOption({ model, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      title={!model.available && model.unavailableReason ? model.unavailableReason : undefined}
      style={{
        padding: '7px 9px',
        borderRadius: 6,
        border: selected ? '1px solid var(--color-border-strong)' : '0.5px solid var(--color-border)',
        background: selected ? 'var(--color-border)' : 'none',
        cursor: model.available ? 'pointer' : 'not-allowed',
        opacity: model.available ? 1 : 0.45,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: model.available ? 'var(--color-available)' : 'var(--color-unavailable)',
        }} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{model.name}</span>
        {model.autoDetected && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            color: 'var(--color-text-3)',
            border: '0.5px solid var(--color-border-mid)',
            borderRadius: 3, padding: '1px 4px', marginLeft: 'auto',
          }}>AUTO</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2, paddingLeft: 13 }}>
        {model.description}
      </div>
    </div>
  )
}
