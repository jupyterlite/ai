% The changelog is pre-processed by the docs:build script to escape @ symbols,
% which would otherwise be interpreted as MyST role syntax (e.g., @username mentions).
% See package.json for the sed command that generates _changelog_content.md.

```{include} _changelog_content.md

```
