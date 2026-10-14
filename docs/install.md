# Installation

## Install the extension

To install the extension, execute:

```bash
pip install jupyterlite-ai
```

`jupyterlite-ai` installs the [Jupyternaut](https://pypi.org/project/jupyter-ai-jupyternaut-frontend/) persona (`jupyter-ai-jupyternaut-frontend`) and the [persona kit](./personas.md) it is built on (`jupyter-ai-persona-kit`).

## Install with Jupyter dependencies

To install requirements (JupyterLab, JupyterLite and Notebook):

```bash
pip install jupyterlite-ai[jupyter]
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai jupyter-ai-jupyternaut-frontend jupyter-ai-persona-kit
```

## Upgrading from 0.20

Version 0.21 renames the packages: `jupyternaut-persona` becomes `jupyter-ai-jupyternaut-frontend`, built on the new `jupyter-ai-persona-kit`. `pip` does not remove the old package, so remove it by hand. Otherwise the old and the new extension load together, and the API keys stay locked:

```bash
pip uninstall jupyternaut-persona
```

The settings ids change (`@jupyter-ai/jupyternaut-frontend:settings-model` and `@jupyter-ai/persona-kit:settings`), so the providers, the model choice and the settings of the Behavior tab must be entered again. The API keys stored in the secrets manager are kept. With the secrets manager disabled, the API keys stored in the settings must be entered again.
