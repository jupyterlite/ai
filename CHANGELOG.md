# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 0.8.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.7.0...c736eca4e55cf491105aee04c01de8e9f7982b4a))

### Enhancements made

- Update to `@jupyter/chat` 0.14.0 [#108](https://github.com/jupyterlite/ai/pull/108) ([@jtpio](https://github.com/jtpio))
- Allow different providers for the chat and the completer [#105](https://github.com/jupyterlite/ai/pull/105) ([@brichet](https://github.com/brichet))
- Open the settings from the chat panel [#101](https://github.com/jupyterlite/ai/pull/101) ([@jtpio](https://github.com/jtpio))
- Gemini [#100](https://github.com/jupyterlite/ai/pull/100) ([@jtpio](https://github.com/jtpio))
- System prompt configurable [#96](https://github.com/jupyterlite/ai/pull/96) ([@brichet](https://github.com/brichet))
- Chat panel tweaks [#92](https://github.com/jupyterlite/ai/pull/92) ([@jtpio](https://github.com/jtpio))
- Improve Mistral completions [#85](https://github.com/jupyterlite/ai/pull/85) ([@jtpio](https://github.com/jtpio))

### Bugs fixed

- Fix secret fields initialization when using the secrets manager [#120](https://github.com/jupyterlite/ai/pull/120) ([@brichet](https://github.com/brichet))
- Fix the notification in settings [#119](https://github.com/jupyterlite/ai/pull/119) ([@brichet](https://github.com/brichet))
- Fix the messages datetime [#94](https://github.com/jupyterlite/ai/pull/94) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Update langchain packages [#117](https://github.com/jupyterlite/ai/pull/117) ([@jtpio](https://github.com/jtpio))
- Remove provider settings check/generation [#113](https://github.com/jupyterlite/ai/pull/113) ([@brichet](https://github.com/brichet))
- Deduplicate npm dependencies [#109](https://github.com/jupyterlite/ai/pull/109) ([@brichet](https://github.com/brichet))
- Add UI tests [#97](https://github.com/jupyterlite/ai/pull/97) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-06-05&to=2025-07-09&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-06-05..2025-07-09&type=Issues) | [@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2025-06-05..2025-07-09&type=Issues)

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.7.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.6.2...317fedd438232fb3add50e28037adb637cbc0814))

### Enhancements made

- Add a welcome message [#89](https://github.com/jupyterlite/ai/pull/89) ([@brichet](https://github.com/brichet))
- Handle compatibility with chromeAI and WebLLM [#87](https://github.com/jupyterlite/ai/pull/87) ([@brichet](https://github.com/brichet))
- Do not expose providers api [#84](https://github.com/jupyterlite/ai/pull/84) ([@brichet](https://github.com/brichet))
- Remove the custom settings connector [#81](https://github.com/jupyterlite/ai/pull/81) ([@brichet](https://github.com/brichet))
- Upgrade secrets manager [#75](https://github.com/jupyterlite/ai/pull/75) ([@brichet](https://github.com/brichet))
- Better handling of default values in settings [#73](https://github.com/jupyterlite/ai/pull/73) ([@brichet](https://github.com/brichet))
- Add Ollama provider [#69](https://github.com/jupyterlite/ai/pull/69) ([@brichet](https://github.com/brichet))
- WebLLM [#47](https://github.com/jupyterlite/ai/pull/47) ([@jtpio](https://github.com/jtpio))

### Bugs fixed

- Export the IAIProviderRegistry token [#88](https://github.com/jupyterlite/ai/pull/88) ([@brichet](https://github.com/brichet))
- Update `@langchain/community` to fix ChromeAI [#76](https://github.com/jupyterlite/ai/pull/76) ([@jtpio](https://github.com/jtpio))

### Maintenance and upkeep improvements

- Pin PyPI version of jupyter-secrets-manager [#86](https://github.com/jupyterlite/ai/pull/86) ([@brichet](https://github.com/brichet))
- Install `ipywidgets` for the demo deployed on GitHub Pages [#79](https://github.com/jupyterlite/ai/pull/79) ([@jtpio](https://github.com/jtpio))

### Documentation improvements

- Mention JupyterLab 4.4 and Notebook 7.4 final in the README [#83](https://github.com/jupyterlite/ai/pull/83) ([@jtpio](https://github.com/jtpio))
- Update Ollama instructions [#82](https://github.com/jupyterlite/ai/pull/82) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-05-13&to=2025-06-05&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-05-13..2025-06-05&type=Issues) | [@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2025-05-13..2025-06-05&type=Issues) | [@trungleduc](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Atrungleduc+updated%3A2025-05-13..2025-06-05&type=Issues)

## 0.6.2

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.6.1...8cf12919ab5922b2ec7ed8f284299725a493d349))

### Bugs fixed

- Fix completer settings [#70](https://github.com/jupyterlite/ai/pull/70) ([@brichet](https://github.com/brichet))
- Fix the API keys in provider when using the secrets manager [#68](https://github.com/jupyterlite/ai/pull/68) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Align the version of rjsf dependencies [#72](https://github.com/jupyterlite/ai/pull/72) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-05-02&to=2025-05-13&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-05-02..2025-05-13&type=Issues)

## 0.6.1

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.6.0...52376d7823635a8561eda88d6fcd7acd615c50c8))

### Enhancements made

- Allow to avoid displaying the secret fields of the settings UI [#65](https://github.com/jupyterlite/ai/pull/65) ([@brichet](https://github.com/brichet))
- Update secrets manager to >=0.3.0 [#63](https://github.com/jupyterlite/ai/pull/63) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Update secrets manager to >=0.3.0 [#63](https://github.com/jupyterlite/ai/pull/63) ([@brichet](https://github.com/brichet))
- Update to jupyterlab>=4.4.0 [#62](https://github.com/jupyterlite/ai/pull/62) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-03-31&to=2025-05-02&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-03-31..2025-05-02&type=Issues)

## 0.6.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.5.0...15b6de565429273e0b159fa1a66712575449605d))

### Enhancements made

- Stop streaming [#61](https://github.com/jupyterlite/ai/pull/61) ([@brichet](https://github.com/brichet))
- Do not store passwords to server settings [#60](https://github.com/jupyterlite/ai/pull/60) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-03-21&to=2025-03-31&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-03-21..2025-03-31&type=Issues) | [@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2025-03-21..2025-03-31&type=Issues)

## 0.5.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.4.0...f37fb548ee1c49f5600495ccb6be35ab976a3bce))

### Enhancements made

- Default providers refactoring [#58](https://github.com/jupyterlite/ai/pull/58) ([@brichet](https://github.com/brichet))
- Use the secrets manager [#53](https://github.com/jupyterlite/ai/pull/53) ([@brichet](https://github.com/brichet))

### Bugs fixed

- Avoid building settings schemas when building javascript [#59](https://github.com/jupyterlite/ai/pull/59) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Default providers refactoring [#58](https://github.com/jupyterlite/ai/pull/58) ([@brichet](https://github.com/brichet))
- Update @jupyter/chat to v0.8.1 [#57](https://github.com/jupyterlite/ai/pull/57) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-03-10&to=2025-03-21&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-03-10..2025-03-21&type=Issues)

## 0.4.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.3.0...bd9c07a7fec2bfb62c6863a0aacdaefbf22bcd82))

### Enhancements made

- Provider registry [#50](https://github.com/jupyterlite/ai/pull/50) ([@brichet](https://github.com/brichet))
- Completer plugin [#49](https://github.com/jupyterlite/ai/pull/49) ([@brichet](https://github.com/brichet))
- Settings UI improvement [#48](https://github.com/jupyterlite/ai/pull/48) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2025-02-19&to=2025-03-10&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2025-02-19..2025-03-10&type=Issues)

## 0.3.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.2.0...1b482ade692e42ad8885aaf3211502720cadeecf))

### Enhancements made

- Add chat autocompletion and the `/clear` command [#41](https://github.com/jupyterlite/ai/pull/41) ([@jtpio](https://github.com/jtpio))
- Add icon and name for the AI assistant [#40](https://github.com/jupyterlite/ai/pull/40) ([@jtpio](https://github.com/jtpio))
- Stream responses [#39](https://github.com/jupyterlite/ai/pull/39) ([@jtpio](https://github.com/jtpio))
- Use a chat model instead of LLM for codestral completion [#31](https://github.com/jupyterlite/ai/pull/31) ([@brichet](https://github.com/brichet))
- Add initial system prompt in ChatHandler and completion [#28](https://github.com/jupyterlite/ai/pull/28) ([@brichet](https://github.com/brichet))
- Add `ChromeAI` [#27](https://github.com/jupyterlite/ai/pull/27) ([@jtpio](https://github.com/jtpio))
- Anthropic (Claude) provider [#22](https://github.com/jupyterlite/ai/pull/22) ([@brichet](https://github.com/brichet))
- Add OpenAI provider [#19](https://github.com/jupyterlite/ai/pull/19) ([@brichet](https://github.com/brichet))
- Dynamic settings for providers [#14](https://github.com/jupyterlite/ai/pull/14) ([@brichet](https://github.com/brichet))

### Bugs fixed

- Update to a newer `@langchain/community` to fix ChromeAI integration [#43](https://github.com/jupyterlite/ai/pull/43) ([@jtpio](https://github.com/jtpio))
- Upgrade the jupyterlite-core package in deployment [#30](https://github.com/jupyterlite/ai/pull/30) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Deployment with prereleased jupyterlite-pyodide-kernel [#33](https://github.com/jupyterlite/ai/pull/33) ([@brichet](https://github.com/brichet))
- Fix installation of pre-released jupyterlite in deployment [#32](https://github.com/jupyterlite/ai/pull/32) ([@brichet](https://github.com/brichet))
- Upgrade the jupyterlite-core package in deployment [#30](https://github.com/jupyterlite/ai/pull/30) ([@brichet](https://github.com/brichet))

### Documentation improvements

- Update README.md [#26](https://github.com/jupyterlite/ai/pull/26) ([@jtpio](https://github.com/jtpio))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2024-12-04&to=2025-02-19&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2024-12-04..2025-02-19&type=Issues) | [@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2024-12-04..2025-02-19&type=Issues)

## 0.2.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/v0.1.0...8c41100bf87c99e377fd4752c50853dace7667e1))

### Enhancements made

- Refactoring AIProvider and handling errors [#15](https://github.com/jupyterlite/ai/pull/15) ([@brichet](https://github.com/brichet))
- Making the LLM providers more generics [#10](https://github.com/jupyterlite/ai/pull/10) ([@brichet](https://github.com/brichet))
- Use a throttler instead of a debouncer for code completion [#8](https://github.com/jupyterlite/ai/pull/8) ([@brichet](https://github.com/brichet))
- Update @jupyter/chat to 0.5.0 [#7](https://github.com/jupyterlite/ai/pull/7) ([@brichet](https://github.com/brichet))
- Switch to using langchain.js [#6](https://github.com/jupyterlite/ai/pull/6) ([@jtpio](https://github.com/jtpio))

### Bugs fixed

- Improves the relevance of codestral completion [#18](https://github.com/jupyterlite/ai/pull/18) ([@brichet](https://github.com/brichet))

### Maintenance and upkeep improvements

- Update references to the repo after the rename [#21](https://github.com/jupyterlite/ai/pull/21) ([@jtpio](https://github.com/jtpio))
- Rename the extension `jupyterlite_ai` [#20](https://github.com/jupyterlite/ai/pull/20) ([@brichet](https://github.com/brichet))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2024-06-24&to=2024-12-04&type=c))

[@brichet](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Abrichet+updated%3A2024-06-24..2024-12-04&type=Issues) | [@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2024-06-24..2024-12-04&type=Issues)

## 0.1.0

([Full Changelog](https://github.com/jupyterlite/ai/compare/9c8d350b8876ad3a9ffe8dbe723ca093bb680681...b77e9e9a563cda3b9d37972248e738746f7370a8))

### Maintenance and upkeep improvements

- Reset version [#4](https://github.com/jupyterlite/ai/pull/4) ([@jtpio](https://github.com/jtpio))

### Documentation improvements

- Add disclaimer [#3](https://github.com/jupyterlite/ai/pull/3) ([@jtpio](https://github.com/jtpio))
- Update links to the repo [#2](https://github.com/jupyterlite/ai/pull/2) ([@jtpio](https://github.com/jtpio))
- Add files for a JupyterLite demo [#1](https://github.com/jupyterlite/ai/pull/1) ([@jtpio](https://github.com/jtpio))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlite/ai/graphs/contributors?from=2024-06-10&to=2024-06-24&type=c))

[@jtpio](https://github.com/search?q=repo%3Ajupyterlite%2Fai+involves%3Ajtpio+updated%3A2024-06-10..2024-06-24&type=Issues)
