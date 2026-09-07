"""Code Generation Agent — Phase 3, Section 5."""
from agents.base_agent import BaseAgent
from prompts.code_generation import build_prompt as _build_prompt
from schemas.code_generation import GeneratedProject


class CodeGenerationAgent(BaseAgent):
    name = "CodeGenerationAgent"
    schema = GeneratedProject
    temperature = 0.25  # this output becomes source code — correctness over creative variety

    def build_prompt(self, context: dict) -> str:
        return _build_prompt(
            requirements=context["requirements"],
            design=context["design"],
            architecture=context["architecture"],
        )
