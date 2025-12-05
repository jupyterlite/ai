# API Key Management

To avoid storing the API keys in the settings, `jupyterlite-ai` uses [jupyter-secrets-manager](https://github.com/jupyterlab-contrib/jupyter-secrets-manager) by default.

The secrets manager gets the API keys from a connector in a secure way.
The default connector of the secrets manager is _in memory_, which means that **the API keys are reset when reloading the page**.

To prevent the keys from being reset on reload, there are two options:

## Option 1: Use a remote connector

Use a connector that fetches the keys from a remote server (using secure REST API, or WebSocket).

This is the recommended method, as it ensures the security of the keys and makes them accessible only to logged-in users.

However, it requires some frontend and backend deployments:

- A server that can store and send the keys on demand
- A way to get authenticated to the server
- A frontend extension providing the connector, able to connect to the server side

## Option 2: Disable the secrets manager

Disable the use of the secrets manager from the AI settings panel.

:::{warning}
The API keys will be stored in plain text using the settings system of JupyterLab:

- Using JupyterLab, the settings are stored in a [directory](https://jupyterlab.readthedocs.io/en/stable/user/directories.html#jupyterlab-user-settings-directory) on the server
- Using JupyterLite, the settings are stored in the [browser](https://jupyterlite.readthedocs.io/en/latest/howto/configure/storage.html#configure-the-browser-storage)
  :::
