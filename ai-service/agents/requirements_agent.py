"""Requirements Agent — Phase 2, Section 3."""
from agents.base_agent import BaseAgent
from prompts.requirements import build_prompt as _build_prompt
from schemas.requirements import RequirementsSpec


class RequirementsAgent(BaseAgent):
    name = "RequirementsAgent"
    schema = RequirementsSpec
    temperature = 0.3  # faithful to input over creative — must not invent facts

    def build_prompt(self, context: dict) -> str:
        return _build_prompt(
            website_type=context["websiteType"],
            user_data=context.get("userData", {}),
            preferences=context.get("preferences", {}),
        )
