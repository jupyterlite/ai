import os

from jupyter_ai_persona_manager import BasePersona, PersonaDefaults
from jupyterlab_chat.models import Message

_AVATAR_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../packages/agent/style/icons/jupyternaut-lite.svg")
)


class JupyternautPersona(BasePersona):
    """Frontend-driven persona — all response logic runs in the browser."""

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
