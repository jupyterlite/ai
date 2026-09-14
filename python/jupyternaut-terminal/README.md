# jupyternaut-terminal

Jupyternaut coding agent as a `jupyternaut` command (alias `ai`) in the
[JupyterLite terminal](https://github.com/jupyterlite/terminal).

## Install

```bash
pip install jupyternaut-terminal
```

Then enable terminals in the JupyterLite deployment (`jupyter-lite.json`):

```json
{
  "jupyter-config-data": {
    "terminalsAvailable": true
  }
}
```

Open a terminal and type `jupyternaut` (or `ai`). The agent uses the provider,
model and API key configured in the AI settings panel.
