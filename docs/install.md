# Installation

## Install the extension

To install the extension, execute:

```bash
pip install jupyterlite-ai
```

`jupyterlite-ai` installs the [Jupyternaut](https://pypi.org/project/jupyternaut/) persona (`jupyternaut`) and the [persona kit](./personas.md) it is built on (`jupyter-ai-persona-kit`).

## Install with Jupyter dependencies

To install requirements (JupyterLab, JupyterLite and Notebook):

```bash
pip install jupyterlite-ai[jupyter]
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai jupyternaut jupyter-ai-persona-kit
```

## Upgrading from 0.20

Version 0.21 renames the packages: `jupyternaut-persona` becomes `jupyternaut`, built on the new `jupyter-ai-persona-kit`. `pip` does not remove the old package, so remove it by hand. Otherwise the old and the new extension load together, and the API keys stay locked:

```bash
pip uninstall jupyternaut-persona
```

If you have `jupyter-ai-jupyternaut` (the server Jupyternaut), uninstall it first: the two packages install the same labextension folder.

The settings ids change (`@jupyter-ai/jupyternaut:settings-model` and `@jupyter-ai/persona-kit:settings`), so the providers, the model choice and the settings of the Behavior tab must be entered again. The API keys stored in the secrets manager are kept. With the secrets manager disabled, the API keys stored in the settings must be entered again. The options of the Jupyternaut inline completer (provider `@jupyter-ai/jupyternaut:completer` in the `@jupyterlab/completer-extension:inline-completer` settings) must also be set again.
