# Efficiency scorecard

The report shows a before → after efficiency score plus honest proxy metrics:

- **Criteria** — which token levers are satisfied now vs after applying.
- **Context footprint** — files considered, noise excluded, instruction tokens, lean vs typical tool count.
- **Instruction sizes** — so guidance stays lean (it loads on every request).
- **Deep links** — build the semantic index, open agent debug logs / Cache Explorer, and per-session cost controls.
- **Measure real usage** — import an exported chat JSON for a proxy token estimate.

> Precise live token metering is not exposed to extensions, so the report uses counts + estimates and deep links to Copilot's own tools.
