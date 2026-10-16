# Installation

## Install the extension

To install the extension, execute:

```bash
pip install jupyter-ai-lite
```

`jupyter-ai-lite` installs the [Jupyternaut](https://pypi.org/project/jupyternaut/) persona (`jupyternaut`) and the [persona kit](./personas.md) it is built on (`jupyter-ai-persona-kit`).

## Install with Jupyter dependencies

To install requirements (JupyterLab, JupyterLite and Notebook):

```bash
pip install jupyter-ai-lite[jupyter]
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyter-ai-lite jupyternaut jupyter-ai-persona-kit
```

## Upgrading from 0.20

Version 0.21 renames the packages: `jupyterlite-ai` becomes `jupyter-ai-lite`, and `jupyternaut-persona` becomes `jupyternaut`, built on the new `jupyter-ai-persona-kit`. `pip` does not remove the old packages, so remove them by hand. Otherwise the old and the new extension load together, and the API keys stay locked. If you have `jupyter-ai-jupyternaut` (the server Jupyternaut), also remove it before the install: the two packages install the same labextension folder.

```bash
pip uninstall jupyterlite-ai jupyternaut-persona
pip install jupyter-ai-lite
```

The settings ids change (`@jupyter-ai/jupyternaut:settings-model` and `@jupyter-ai/persona-kit:settings`), so the providers, the model choice and the settings of the Behavior tab must be entered again. The API keys stored in the secrets manager are kept. With the secrets manager disabled, the API keys stored in the settings must be entered again. The options of the Jupyternaut inline completer (provider `@jupyter-ai/jupyternaut:completer` in the `@jupyterlab/completer-extension:inline-completer` settings) must also be set again.
