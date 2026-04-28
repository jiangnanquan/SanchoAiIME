# @sancho-ai-ime/dashboard

Static dashboard renderer for SanchoAiIME management surfaces.

The package turns local Sancho state into a redacted view model and renders one
HTML file for:

* quick dictionary managed entries
* action registry snippets and executable actions
* profile switch environment preview
* local model setup and benchmark status
* lexicon import summaries
* maintenance jobs
* release checks

Profile environment values that look like API keys, tokens, passwords, or
credentials are rendered as `[redacted]`. Import previews include only summary
counts; private lexicon rows are intentionally omitted from the dashboard view
model.

```sh
sancho-dashboard render --state packages/dashboard/examples/dashboard-state.example.json --output data/dashboard.html
sancho-dashboard sample-state --output data/dashboard-state.json
```

Generated dashboards derived from real local state may still include personal
quick dictionary phrases. Keep generated files under ignored runtime directories
such as `data/`.
