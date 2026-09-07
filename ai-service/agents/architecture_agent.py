"""Architecture Agent — Phase 2, Section 5."""
from agents.base_agent import BaseAgent
from prompts.architecture import build_prompt as _build_prompt
from schemas.architecture import ArchitectureSpec


class ArchitectureAgent(BaseAgent):
    name = "ArchitectureAgent"
    schema = ArchitectureSpec
    temperature = 0.2  # most rule-bound agent — this contract drives Phase 3 codegen directly

    def build_prompt(self, context: dict) -> str:
        return _build_prompt(
            requirements=context["requirements"],
            design=context["design"],
        )
