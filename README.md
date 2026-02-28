# jupyterlite-ai

[![Github Actions Status](https://github.com/jupyterlite/ai/workflows/Build/badge.svg)](https://github.com/jupyterlite/ai/actions/workflows/build.yml)
[![Documentation Status](https://readthedocs.org/projects/jupyterlite-ai/badge/?version=latest)](https://jupyterlite-ai.readthedocs.io/en/latest/?badge=latest)
[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

AI code completions and chat for JupyterLab, Notebook 7 and JupyterLite.

[a screencast showing the Jupyterlite AI extension in JupyterLite](https://github.com/user-attachments/assets/e33d7d84-53ca-4835-a034-b6757476c98b)

## Features

### Chat & Code Completions

AI-powered chat sidebar and inline code completions. Configure any supported
provider (OpenAI, Anthropic, Google, Mistral, or a generic OpenAI-compatible
endpoint) and start chatting or getting suggestions as you type.

### Notebook AI Actions

Five one-click actions are available in the notebook toolbar for the active code
cell:

- **Format** — Automatically add comments, docstrings, type hints, and improve
  formatting. The cell source is updated in-place.
- **Explain** — Get an ELI5-style explanation of the code (including stdout and
  error context).
- **Debug** — Diagnose an error in the cell using the captured traceback and
  suggest a fix.
- **Complete** — Complete a partial code snippet, using preceding cells as
  context.
- **Review** — Receive a constructive code review with inline references.

Results are displayed as an inline output below the cell.

## Requirements

- JupyterLab >= 4.4.0 or Notebook >= 7.4.0

## Try it in your browser

You can try the extension in your browser using JupyterLite:

[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

## Install

To install the extension, execute:

```bash
pip install jupyterlite-ai
```

To install requirements (JupyterLab, JupyterLite and Notebook):

```bash
pip install jupyterlite-ai[jupyter]
```

## Documentation

For detailed usage instructions, including how to configure AI providers, see the [documentation](https://jupyterlite-ai.readthedocs.io/).

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md)
