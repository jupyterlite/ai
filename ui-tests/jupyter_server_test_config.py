"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
from pathlib import Path

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)

c.FileContentsManager.delete_to_trash = False

# Allow reading dotfiles like `.agents/skills` from the server root.
c.ContentsManager.allow_hidden = True

# Ensure the server root is the ui-tests directory so `.agents/skills` is found.
c.ServerApp.root_dir = str(Path(__file__).parent.resolve())

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
