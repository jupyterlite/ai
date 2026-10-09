# jupyternaut-terminal

The [pi coding agent](https://pi.dev) as a `pi` command (alias `ai`) in the
[JupyterLite terminal](https://github.com/jupyterlite/terminal), with the
interactive interface of pi.

## Install

```bash
pip install jupyternaut-terminal
```

This also installs `jupyterlite-terminal` and JupyterLite 0.8.6 or later.

Then enable terminals in the JupyterLite deployment (`jupyter-lite.json`):

```json
{
  "jupyter-config-data": {
    "terminalsAvailable": true
  }
}
```

Open a terminal and type `pi` (or `ai`). Run `/login` to add an API key and
`/model` to select a model.
