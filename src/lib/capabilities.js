// Shared capability-possibility map (T13 → extracted at T18b so Settings.jsx and
// Onboarding.jsx read ONE source of truth instead of duplicating the const).
//
// This is a capability *possibility* map, NOT an enablement. `computerUse:true` here
// only means "could be wired at G8", never "is on". Keep in sync with
// docs/capability-architecture.md §3. Enforcement of any capability is gate G8;
// nothing in this module turns anything on — it only tells the UI which toggles to
// offer where the provider is known to support the capability.
export const PROVIDER_CAPABILITIES = {
  anthropic:     { tools: true,  mcp: true,  computerUse: true  },
  'claude-code': { tools: true,  mcp: true,  computerUse: true  },
  openai:        { tools: true,  mcp: true,  computerUse: false },
  gemini:        { tools: true,  mcp: false, computerUse: false },
  mistral:       { tools: true,  mcp: false, computerUse: false },
  deepseek:      { tools: true,  mcp: false, computerUse: false },
  qwen:          { tools: true,  mcp: false, computerUse: false },
  ollama:        { tools: true,  mcp: false, computerUse: false },
}

export const CAP_COLS = [
  { key: 'tools',       label: 'Tools' },
  { key: 'mcp',         label: 'MCP' },
  { key: 'computerUse', label: 'Computer-use' },
]

// True when the provider is known to support the given capability key.
export function providerSupports(provider, key) {
  const p = PROVIDER_CAPABILITIES[provider]
  return !!(p && p[key])
}

// Build the "bulk-enable tools + MCP for all cloud models" capability INTENT map (T18b §4.1).
// Cloud = every provider except the local `ollama` runtime. For each cloud model whose
// provider supports the capability we record tools:true / mcp:<provider-supported>, and
// ALWAYS computerUse:false. This produces INTENT ONLY — it never sets `enforced`; the
// caller POSTs it inside `{ capabilities: { enforced:false, models } }` so the server's
// sanitizeCapabilities coerces it to inert data. Enablement is gate G8.
export function bulkCloudCapabilityIntents(models) {
  const out = {}
  for (const m of (models || [])) {
    if (!m || !m.id || m.provider === 'ollama') continue     // local model — not a "cloud" grant
    if (!providerSupports(m.provider, 'tools')) continue      // provider can't take tools at all
    out[m.id] = {
      tools: true,
      mcp: providerSupports(m.provider, 'mcp'),               // MCP only where the provider allows it
      computerUse: false,                                     // never enabled here (G8, Anthropic-first)
    }
  }
  return out
}
