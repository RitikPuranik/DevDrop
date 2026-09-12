const clean = (value) => String(value ?? '').trim();
const list = (items = []) => items.filter(Boolean).map((item) => clean(item)).filter(Boolean);

const section = (title, value) => (value ? `\n### ${title}\n${value}\n` : '');

export function buildPortfolioPrompt(details, design) {
  const projects = (details.projects || [])
    .filter((project) => project.title?.trim() || project.description?.trim() || project.link?.trim())
    .map((project, index) => {
      return `${index + 1}. ${clean(project.title) || 'Untitled project'}\n   Description: ${clean(project.description) || 'Not provided'}\n   Link: ${clean(project.link) || 'Not provided'}`;
    })
    .join('\n');

  const experience = (details.experience || [])
    .filter((item) => item.company?.trim() || item.role?.trim() || item.description?.trim())
    .map((item, index) => `${index + 1}. ${clean(item.role)} at ${clean(item.company)} (${clean(item.period) || 'Period not provided'})\n   ${clean(item.description)}`)
    .join('\n');

  const education = (details.education || [])
    .filter((item) => item.institution?.trim() || item.degree?.trim())
    .map((item) => `${clean(item.degree)} at ${clean(item.institution)} (${clean(item.period) || 'Period not provided'})`)
    .join('\n');

  return `Create a production-quality personal portfolio website from the user's specifications below.

IMPORTANT GENERATION RULES:
- Build a complete, polished, responsive React website, not a mockup or placeholder.
- Use the supplied personal information as the source of truth. Do not invent employers, degrees, projects, achievements, statistics, testimonials, URLs, or contact details.
- If a field is empty, omit that content rather than displaying filler text.
- Make the website feel intentionally designed around this person, not like a generic portfolio template.
- Include accessible semantic HTML, responsive layouts, keyboard-friendly controls, and working navigation.
- Make all buttons and links meaningful. External links should open safely in a new tab when appropriate.
- Use the requested visual direction consistently across every section.
- Use tasteful motion only according to the requested animation level and respect prefers-reduced-motion.
- The final result must be ready to preview immediately with no missing imports, broken assets, undefined components, or TODO placeholders.
- Prefer a self-contained /App.js for the portfolio. If you split the app into component files, every local component must be explicitly imported and every imported component must be exported from the exact target file.
- Before returning the JSON, compile-check every JSX element whose name starts with an uppercase letter (for example: Hero, Header, Projects). Each one must either be a locally declared component/variable in that file or a valid import. Never render an undefined component.
- Do not reference a component name that exists only in your plan or in another file unless it is actually imported.
- If you create Hero, Header, or any other named component in the same file, define it before returning the final source and verify that its identifier exactly matches every JSX usage.

## Website
Type: Portfolio
Primary goal: ${clean(details.primaryGoal) || 'Present the person professionally and encourage relevant visitors to get in touch.'}
Target audience: ${clean(details.targetAudience) || 'Recruiters, clients, collaborators and professional connections.'}

## Personal information
Name: ${clean(details.name)}
Professional role: ${clean(details.role)}
Location: ${clean(details.location)}
Email: ${clean(details.contactEmail)}
Phone: ${clean(details.phone)}

${section('Bio', clean(details.bio))}

## Skills
${list(details.skills).length ? list(details.skills).join(', ') : 'No skills supplied. Do not invent any.'}

${section('Experience', experience)}
${section('Education', education)}
${section('Projects', projects)}
${section('Achievements', list(details.achievements).map((item) => `- ${item}`).join('\n'))}
Resume / CV: ${details.resumeFile ? details.resumeFile.name + ' (a resume file is attached — include a prominent "Download Resume" button that downloads this file)' : 'Not provided — omit the download button.'}
${section('Interests', list(details.interests).join(', '))}

## Social links
GitHub: ${clean(details.socialLinks?.github)}
LinkedIn: ${clean(details.socialLinks?.linkedin)}
Twitter / X: ${clean(details.socialLinks?.twitter)}
Instagram: ${clean(details.socialLinks?.instagram)}

## Call to action
CTA text: ${clean(details.ctaText)}
CTA destination: ${clean(details.ctaLink)}

## Design direction
Style: ${clean(design.style) || 'modern'}
Theme: ${clean(design.theme) || 'dark'}
Animation: ${clean(design.animations) || 'subtle'}
Primary color: ${clean(design.primaryColor) || 'Choose a tasteful palette that fits the requested theme.'}

## Required page structure
Use the available information to decide the best section order, but normally include:
1. Header / navigation
2. Hero with name, role, concise value proposition and strongest CTA
3. About section when enough information is provided
4. Skills / expertise
5. Experience when supplied
6. Featured projects with real supplied links
7. Education and achievements when supplied
8. Contact section with supplied contact details
9. Footer with relevant social links

Do not force empty sections. Prioritize hierarchy, readability and visual storytelling over cramming every field onto the page.

Return the website using DevDrop's existing structured file-generation contract. Include all files required for the preview to run. Do not return commentary outside the required JSON contract.`;
}
