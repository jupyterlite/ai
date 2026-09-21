# Using OpenRouter

[OpenRouter](https://openrouter.ai/) gives access to models from many AI providers (Anthropic, OpenAI, Google, Mistral, open-weight models, and more) with a single account and a single API key. It also offers a selection of free models, which is handy to try `jupyterlite-ai` without a paid plan.

## Connecting your OpenRouter account

The **OpenRouter** provider can create an API key for you, so there is no need to copy and paste one:

1. Open the AI settings panel and go to the **Providers** section
2. Click on "Add Provider"
3. Select the **OpenRouter** provider
4. Choose a **Model**: the list comes from OpenRouter and shows the models with tool support, the most used first. The first model is selected by default. Type a part of a name (for example `sonnet`) to filter the list, or enter any [model ID supported by OpenRouter](https://openrouter.ai/models)
5. Click on **Connect with OpenRouter**

A window opens with the OpenRouter website, where you can log in (or create an account) and authorize `jupyterlite-ai`. If you are not logged in, OpenRouter shows its sign-up page first: use the **Sign in** link on that page if you already have an account. The window closes after the authorization. The provider is saved with the new API key, and a notification confirms the connection. If you close the window before the authorization, nothing is saved and you can click on the button again.

The application is not reloaded, so your work is not interrupted, and the API keys of the other providers are kept.

To connect again later, for example when the API key is gone after reloading the page (see [below](#where-is-the-api-key-stored)), edit the provider and click on **Connect with OpenRouter** again.

:::{note}
Each connection creates a new API key in your OpenRouter account, labelled "JupyterLite AI" by default. You can review and delete the keys on the [OpenRouter keys page](https://openrouter.ai/settings/keys).
:::

:::{note}
If the window does not open, allow popup windows for the site in your browser and try again.
:::

:::{note}
The **Connect with OpenRouter** button needs a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts): the application must be served over HTTPS, or from `localhost`. Otherwise the button is not shown and you can enter an API key manually.
:::

### How it works

The connection uses the [OAuth PKCE flow of OpenRouter](https://openrouter.ai/docs/guides/overview/auth/oauth). It runs entirely in the browser: there is no application to register and no client secret. The authorization code returned by OpenRouter can be used only once, and only by the browser tab that started the flow.

OpenRouter returns the code to the URL of the application. The window loads the application for a moment to pass the code to the main window, then it closes.

## Entering an API key manually

You can also use an existing key:

1. Create an API key on the [OpenRouter keys page](https://openrouter.ai/settings/keys)
2. In the provider dialog, select the **OpenRouter** provider and a model
3. Paste the key in the **API Key** field and save the provider

## Using OpenRouter without the account connection

The OpenRouter provider always offers the **Connect with OpenRouter** button. A deployment that provides the API key itself, or that does not want users to connect their own OpenRouter account, can use the [Generic provider (OpenAI-compatible)](./usage.md#using-a-generic-openai-compatible-provider) instead, with the following settings:

- **Base URL**: `https://openrouter.ai/api/v1`
- **Model**: a [model ID supported by OpenRouter](https://openrouter.ai/models), for example `openrouter/auto`
- **API Key**: the OpenRouter API key

To also remove the OpenRouter provider from the list of providers, disable the `@jupyternaut/persona:openrouter-provider` and `@jupyternaut/persona:openrouter-auth` plugins, for example in your `jupyter-config-data` or `page_config.json`:

```json
{
  "disabledExtensions": [
    "@jupyternaut/persona:openrouter-provider",
    "@jupyternaut/persona:openrouter-auth"
  ]
}
```

:::{note}
The Generic provider does not fetch the list of models and does not send the [app attribution](#app-attribution). With the secrets manager, its API key is shared by all the Generic provider configurations.
:::

## App attribution

OpenRouter can [attribute the requests to an application](https://openrouter.ai/docs/app-attribution), which then shows in the OpenRouter rankings and in the activity of the user. By default the requests are attributed to "JupyterLite AI".

An application that includes `jupyterlite-ai` can set its own name and URL with the `appAttribution` setting, for example in an `overrides.json` file:

```json
{
  "@jupyternaut/persona:settings-model": {
    "appAttribution": {
      "name": "My App",
      "url": "https://example.org/my-app"
    }
  }
}
```

The name is also the label of the API keys created with **Connect with OpenRouter**. OpenRouter identifies an application by its URL, so set both values. An empty value is not sent.

## Where is the API key stored?

The API key is handled like the keys of the other providers, see [API Key Management](./api-keys.md).

By default the key is stored through the secrets manager. The default connector of the secrets manager keeps the secrets _in memory_, which means that **the key is lost when reloading the page**. When that happens, connect again from the provider dialog, or pick one of the options described in [API Key Management](./api-keys.md) to keep the key across reloads.
