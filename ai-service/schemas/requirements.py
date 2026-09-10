"""Requirements Agent output schema — Phase 2, Section 3."""
from pydantic import BaseModel, Field


class Page(BaseModel):
    name: str
    path: str


class Section(BaseModel):
    id: str = Field(description="Short lowercase-hyphen identifier, e.g. 'hero', 'about'.")
    purpose: str = Field(description="One sentence: what this section is for.")


class ContentField(BaseModel):
    required: bool


class RequirementsSpec(BaseModel):
    """A normalized, structured statement of what the website needs to
    contain and achieve — no code, no visual design. Those are the Design
    and Architecture agents' jobs."""

    websiteType: str
    targetAudience: str = Field(description="Who the site is for.")
    primaryGoal: str = Field(description="The single main outcome the site should achieve.")
    pages: list[Page]
    sections: list[Section]
    features: list[str] = Field(
        description="Functional capabilities, e.g. 'responsive-design', 'smooth-scroll'."
    )
    contentRequirements: dict[str, ContentField] = Field(
        description="Which pieces of user-provided content are required vs optional."
    )
