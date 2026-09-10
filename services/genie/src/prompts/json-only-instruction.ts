/**
 * CRITICAL JSON-ONLY OUTPUT INSTRUCTION
 * Use this in ALL code generation agents to enforce strict JSON output
 */

export const JSON_ONLY_OUTPUT_INSTRUCTION = `

═══════════════════════════════════════════════════════════════════
🚨🚨🚨 CRITICAL FINAL OUTPUT REQUIREMENT 🚨🚨🚨
═══════════════════════════════════════════════════════════════════

YOUR FINAL RESPONSE MUST BE PURE JSON. NO TEXT. NO MARKDOWN. JUST JSON.

❌ WRONG:
"I'll help you..." {{ "files": [...] }}

✅ CORRECT:
{{"files":[{{"path":"...","content":"..."}}]}}

═══════════════════════════════════════════════════════════════════

AFTER ALL TOOL CALLS COMPLETE:
→ Output ONLY the JSON object
→ NO explanations before
→ NO explanations after
→ NO markdown code fences
→ NO conversational text

Your response = Pure JSON that passes JSON.parse()

If your response starts with ANYTHING other than {{ → REJECTED
If your response ends with ANYTHING other than }} → REJECTED

═══════════════════════════════════════════════════════════════════
THIS IS THE LAST THING YOU READ. REMEMBER IT.
OUTPUT ONLY JSON. NOTHING ELSE.
═══════════════════════════════════════════════════════════════════
`;
