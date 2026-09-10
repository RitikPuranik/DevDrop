"""Design Agent output schema — Phase 2, Section 4."""
import re

from pydantic import BaseModel, Field, field_validator

_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


class Colors(BaseModel):
    background: str
    surface: str
    primary: str
    secondary: str
    text: str
    muted: str
    border: str

    @field_validator("background", "surface", "primary", "secondary", "text", "muted", "border")
    @classmethod
    def must_be_hex(cls, v: str) -> str:
        if not _HEX_COLOR.match(v):
            raise ValueError(f"'{v}' is not a 6-digit hex color like '#7C3AED'.")
        return v


class Typography(BaseModel):
    heading: str
    body: str


class Spacing(BaseModel):
    scale: str


class Radius(BaseModel):
    style: str


class Layout(BaseModel):
    maxContentWidth: str


class Animation(BaseModel):
    level: str
    enabled: bool


class Responsive(BaseModel):
    mobileFirst: bool


class DesignSystem(BaseModel):
    style: str
    theme: str
    colors: Colors
    typography: Typography
    spacing: Spacing
    radius: Radius
    layout: Layout
    animation: Animation
    responsive: Responsive


class SectionGuideline(BaseModel):
    section: str = Field(description="Must match a section id from the Requirements output.")
    layout: str


class DesignSpec(BaseModel):
    """A coherent, consistent design language for the site — colors,
    type, spacing, and per-section layout guidance. No code."""

    designSystem: DesignSystem
    sectionGuidelines: list[SectionGuideline]
