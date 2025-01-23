# jupyterlite-ai

[![Github Actions Status](https://github.com/jupyterlite/ai/workflows/Build/badge.svg)](https://github.com/jupyterlite/ai/actions/workflows/build.yml)
[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

AI code completions and chat for JupyterLab, Notebook 7 and JupyterLite, powered by MistralAI ✨

[a screencast showing the Jupyterlite AI extension in JupyterLite](https://github.com/jupyterlite/ai/assets/591645/855c4e3e-3a63-4868-8052-5c9909922c21)

## Requirements

> [!NOTE]
> This extension is meant to be used in JupyterLite to enable AI code completions and chat in the browser, with a specific provider.
> To enable more AI providers in JupyterLab and Jupyter Notebook, we recommend using the [Jupyter AI](https://github.com/jupyterlab/jupyter-ai) extension directly.
> At the moment Jupyter AI is not compatible with JupyterLite, but might be to some extent in the future.

- JupyterLab >= 4.4.0a0 or Notebook >= 7.4.0a0

> [!WARNING]
> This extension is still very much experimental. It is not an official MistralAI extension.
> It is exploring the integration of the MistralAI API with JupyterLab, which can also be used in [JupyterLite](https://jupyterlite.readthedocs.io/).
> For a more complete AI extension for JupyterLab, see [Jupyter AI](https://github.com/jupyterlab/jupyter-ai).

## ✨ Try it in your browser ✨

You can try the extension in your browser using JupyterLite:

[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

See the [Usage](#usage) section below for more information on how to provide your API key.

## Install

To install the extension, execute:

```bash
pip install jupyterlite-ai
```

To install requirements (jupyterlab, jupyterlite and notebook), there is an optional dependencies argument:

```bash
pip install jupyterlite-ai[jupyter]
```

# Usage

1. Go to https://console.mistral.ai/api-keys/ and create an API key.

![Screenshot showing how to create an API key](./img/1-api-key.png)

2. Open the JupyterLab settings and go to the **Ai providers** section to select the provider
(`mistral` is only supported one currently) and the API key (required).

![Screenshot showing how to add the API key to the settings](./img/2-jupyterlab-settings.png)

3. Open the chat, or use the inline completer

![Screenshot showing how to use the chat](./img/3-usage.png)

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlite_ai directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall jupyterlite-ai
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `@jupyterlite/ai` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
