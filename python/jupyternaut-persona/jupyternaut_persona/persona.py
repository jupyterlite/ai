import json5
import os

try:
    from jupyterlab.labapp import LabServerApp
except ImportError:
    LabServerApp = None
from jupyter_ai_persona_manager import BasePersona, ModelConfiguration, ModelOption, PersonaDefaults
from jupyter_core.paths import jupyter_config_dir
from jupyterlab_chat.models import Message

_AVATAR_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../packages/agent/style/icons/jupyternaut-lite.svg")
)


class JupyternautPersona(BasePersona):
    """Frontend-driven persona — all response logic runs in the browser."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._publish_model_config()

    @property
    def defaults(self) -> PersonaDefaults:
        return PersonaDefaults(
            name="Jupyternaut-frontend",
            description="AI assistant powered by in-browser models.",
            avatar_path=_AVATAR_PATH,
            system_prompt="",
        )

    async def process_message(self, message: Message) -> None:
        # Response is handled entirely by the frontend extension.
        pass

    def _user_settings_path(self) -> str | None:
        """Return the JupyterLab user settings file path if it exists, else None."""
        server_app = getattr(getattr(self.parent, "parent", None), "serverapp", None)
        if server_app and LabServerApp is not None and hasattr(server_app, "extension_manager") and hasattr(server_app.extension_manager, "extension_apps"):
        # if server_app and hasattr(server_app, "user_settings_dir"):
            lab_apps = server_app.extension_manager.extension_apps.get("jupyterlab") or []
            lab_server_app = next((app for app in lab_apps if isinstance(app, LabServerApp)), None)
            if hasattr(lab_server_app, "user_settings_dir"):
                settings_dir = lab_server_app.user_settings_dir
            else:
                settings_dir = os.path.join(jupyter_config_dir(), "lab", "user-settings")
        else:
            settings_dir = os.path.join(jupyter_config_dir(), "lab", "user-settings")

        path = os.path.join(
            settings_dir, "@jupyternaut", "persona", "settings-model.jupyterlab-settings"
        )
        return path if os.path.exists(path) else None

    def _publish_model_config(self) -> None:
        """Read providers from JupyterLab user settings and publish to awareness."""
        path = self._user_settings_path()
        if not path:
            return

        try:
            with open(path) as f:
                data = json5.load(f)
        except Exception:
            self.log.warning("Failed to read JupyterLab settings from %s", path)
            return

        providers = data.get("providers", [])
        if not providers:
            return

        options = [
            ModelOption(
                id=p["id"],
                name=p.get("name"),
                description=f"{p.get('provider', '')}/{p.get('model', '')}",
            )
            for p in providers
        ]
        current = data.get("defaultProvider") or None
        self.report_model_configuration(
            ModelConfiguration(current=current, options=options, settings=[])
        )
