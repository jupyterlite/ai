# jupyterlite-ai

[![Github Actions Status](https://github.com/jupyterlite/ai/workflows/Build/badge.svg)](https://github.com/jupyterlite/ai/actions/workflows/build.yml)
[![Documentation Status](https://readthedocs.org/projects/jupyterlite-ai/badge/?version=latest)](https://jupyterlite-ai.readthedocs.io/en/latest/?badge=latest)
[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

AI code completions and chat for JupyterLab, Notebook 7 and JupyterLite, with the Jupyternaut persona of [Jupyter AI](https://github.com/jupyterlab/jupyter-ai) running in the browser.

[a screencast showing the Jupyterlite AI extension in JupyterLite](https://github.com/user-attachments/assets/e33d7d84-53ca-4835-a034-b6757476c98b)

## Requirements

- JupyterLab >= 4.5.0 or Notebook >= 7.5.0

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

## Packages

| Package                                                   | npm                       | Description                                                                            |
| --------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| [`jupyter-ai-persona-kit`](python/jupyter-ai-persona-kit) | `@jupyter-ai/persona-kit` | A kit to build in-browser personas: tools, skills, shared settings and sign-in helpers |
| [`jupyternaut`](python/jupyternaut)                       | `@jupyter-ai/jupyternaut` | The Jupyternaut persona: AI chat and code completions with the AI SDK providers        |
| [`jupyterlite-ai`](python/jupyterlite-ai)                 |                           | A meta package that installs both                                                      |

See [Building an in-browser persona](docs/personas.md) to build a persona on the kit in another repository.

## Documentation

For detailed usage instructions, including how to configure AI providers, see the [documentation](https://jupyterlite-ai.readthedocs.io/).

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai jupyternaut jupyter-ai-persona-kit
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md)
