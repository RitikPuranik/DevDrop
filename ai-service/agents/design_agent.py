"""Design Agent — Phase 2, Section 4."""
from agents.base_agent import BaseAgent
from prompts.design import build_prompt as _build_prompt
from schemas.design import DesignSpec


class DesignAgent(BaseAgent):
    name = "DesignAgent"
    schema = DesignSpec
    temperature = 0.6  # a bit more room for genuine visual-design judgment

    def build_prompt(self, context: dict) -> str:
        return _build_prompt(
            requirements=context["requirements"],
            preferences=context.get("preferences", {}),
        )
