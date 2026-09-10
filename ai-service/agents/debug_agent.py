"""Debug Agent — Phase 4, Section 11."""
from agents.base_agent import BaseAgent
from prompts.debug import build_prompt as _build_prompt
from schemas.debug import DebugResult


class DebugAgent(BaseAgent):
    name = "DebugAgent"
    schema = DebugResult
    temperature = 0.2  # precise, minimal changes — not creative

    def build_prompt(self, context: dict) -> str:
        return _build_prompt(
            architecture=context["architecture"],
            build_result=context["buildResult"],
            normalized_errors=context["normalizedErrors"],
            affected_files=context["affectedFiles"],
        )
