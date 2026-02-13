# Web Retrieval

`jupyterlite-ai` supports two kinds of web retrieval:

1. **Local browser fetch** with the built-in `browser_fetch` tool.
2. **Provider-hosted web tools** such as `web_search`, `web_fetch`, or `google_search`.

This page explains how they work, how to configure them, and how fallback works in chat.

## Tool Types

### `browser_fetch` (local tool)

- Runs in the browser with `fetch`.
- Good for quick retrieval of public pages that allow cross-origin access.
- Limited by browser rules (CORS), network restrictions, and site-level bot protections.

### Provider-hosted tools

Configured per provider via **AI Settings -> Providers -> Configure provider -> Advanced Settings -> Provider Web Tools**.

- `web_search`: provider-side web search.
- `web_fetch`: provider-side URL fetch (currently Anthropic in this project).
- `google_search`: Google provider search tool.

Provider tools run on provider infrastructure and are usually less affected by browser CORS.

## Fallback Strategy

When web tools are available, the agent follows this policy:

1. For a specific URL request, prefer `browser_fetch` first.
2. If the first fetch method fails due to access/policy/network issues, try the other fetch method (`browser_fetch` <-> `web_fetch`) when available.
3. If `web_fetch` fails with provider-side policy errors such as `url_not_allowed` or `url_not_accessible`, retry with `browser_fetch` before search when possible.
4. Fall back to `web_search` / `google_search` only after both fetch methods fail or are unavailable.

This behavior is encoded in the agent prompt policy and is intended to keep URL inspection deterministic while still giving a useful fallback path.

## Provider Support

### OpenAI

- Search: `web_search`
- Fetch: no provider `web_fetch` integration in this project

Example:

```json
{
  "customSettings": {
    "webSearch": {
      "enabled": true,
      "searchContextSize": "medium",
      "externalWebAccess": true,
      "allowedDomains": ["example.com"]
    }
  }
}
```

### Anthropic

- Search: `web_search_20250305`
- Fetch: `web_fetch_20250910`

Example:

```json
{
  "customSettings": {
    "webSearch": {
      "enabled": true,
      "maxUses": 5
    },
    "webFetch": {
      "enabled": true,
      "maxUses": 2,
      "maxContentTokens": 12000,
      "citationsEnabled": true
    }
  }
}
```

### Google

- Search: `google_search`
- Fetch: no provider `web_fetch` integration in this project

Example:

```json
{
  "customSettings": {
    "webSearch": {
      "enabled": true,
      "mode": "MODE_UNSPECIFIED",
      "dynamicThreshold": 1
    }
  }
}
```

Note: in the current AI SDK Google provider implementation, provider-defined `google_search` is skipped when function tools are also enabled.

## Tool Visibility In Chat

- Function tools from the local tool registry are selectable.
- Provider tools are shown in the tool menu as enabled/read-only because they come from provider settings.

## Troubleshooting

### `web_fetch` returns `url_not_accessible`

Common causes:

- Website blocks automated access.
- URL requires login/session/cookies.
- Provider cannot reach the site from its environment.

Try:

- Another public URL from the same domain.
- `web_search` fallback when direct fetch is blocked.
- `browser_fetch` for sites that allow cross-origin browser access.

### `web_fetch` returns `url_not_allowed`

Common causes:

- Domain restrictions in provider settings (`allowedDomains` / `blockedDomains`).
- Provider-side URL policy rejects that endpoint.

If `allowedDomains` is empty/unset, provider-side policy can still reject some URLs.

When `browser_fetch` is available, the agent must retry the same URL with `browser_fetch` before switching to search.

### Why `web_search` may answer without `web_fetch`

Search tools can already return enough grounded context for the model to answer. A follow-up `web_fetch` is only used when the model decides it needs direct URL fetch content.

With Anthropic, search results can include opaque fields such as `encryptedContent`. They are not user-readable but are used by Anthropic's grounding/citation pipeline across turns.

## Recommendations

1. Enable both search and fetch when available for your provider.
2. Keep prompts explicit for URL-specific tasks ("inspect this exact URL").
3. Require source URLs or citations for high-confidence outputs.
