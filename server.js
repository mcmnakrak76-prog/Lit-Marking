const express = require("express");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ── RUBRIC TEXT ──────────────────────────────────────────────────────────────
const RUBRICS = {
  G2: `Band 1 (21-25): Well-focused on question demands. Understands how writer conveys meaning. Careful and relevant evidence. Clear arguments — may be laboured. May lapse into narrative.
Band 2 (18-20): Relevant to main demands. Understands more obvious concerns. Some analysis but often not successfully done. Argument present but lacking focus, some narrative tracts.
Band 3 (15-17): Generally relevant but link may not be sustained. Understands basic concerns but NO attempt at interpretation. Generalisations, evidence generally relevant. Largely narrative.
Band 4 (12-14): Little relevance. Little understanding of text. Evidence included without understanding significance. Argument hard to identify, no direction or focus.
Band 5 (0-11): Almost no understanding of question demands. Misreading of text. Hardly any evidence. Basic argument absent, no direction.`,

  G3: `Band 1 (21-25): Pays close attention to the demands of the question. Top answers may explore the opportunities offered by the question. Demonstrates sound understanding of the text; better answers reveal some insights into the text's main concerns and effects achieved by the writer. Response is well-substantiated with thoughtfully selected textual evidence. Clear and organised argument that demonstrates a consistent viewpoint.
Band 2 (18-20): Generally well-focused on the demands of the question. Demonstrates understanding of the text's main concerns and some knowledge of how the writer conveys these. Response is substantiated with careful and relevant selection of evidence. Clear and competent but laboured arguments may be present. The response may lapse into narrative.
Band 3 (15-17): Relevant to the main demands of the question. Demonstrates some understanding of the more obvious concerns of the text. Some analysis can be observed, but not always successfully done. Response is substantiated with careful and relevant selection of textual evidence, though not consistently done. An argument is present but lacking in focus, with some tracts of narrative.
Band 4 (12-14): Generally relevant to the main demands of the question though link may not always be sustained. Demonstrates some understanding of the basic concerns of the text but does not show any attempt at interpretation. Response is in the form of generalisations but selection of textual evidence is generally relevant. Some attempt at forming an argument but struggles for clarity. Writing is largely narrative.
Band 5 (9-11): Has little relevance to the question. Demonstrates little understanding of the text and its concerns. Often includes information from the text without understanding its significance. An argument is difficult to identify in the writing. Struggles to offer any sense of direction and focus.
Band 6 (0-8): Reflects almost no understanding of the demands of the question. Answers may be extremely brief or are obviously prepared/memorised scripts that have little to do with the question. Some misreading of the text and its concerns. Hardly includes any information from the text. Basic argument is absent and lacks direction or focus.`
};

// ── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────
function buildSystem(stream) {
  const bandInfo = stream === "G3"
    ? "6 bands (Band 1 highest, Band 6 lowest)"
    : "5 bands (Band 1 highest, Band 5 lowest)";

  return `You are Miss Rina, a warm but rigorous Secondary 2 Literature teacher at a Singapore secondary school. You help 14–15 year old students improve their PEAEAL paragraphs about the poem "Neighbours" by Alfian Sa'at.

This student is in the ${stream} stream. Use ONLY the ${stream} marking rubric below (${bandInfo}) when assessing their work. Do not refer to bands from the other stream.

IMPORTANT — key literary facts students must get right:
- Alfian Sa'at is the POET who wrote "Neighbours". He is NOT a character in the poem.
- The narrator is referred to only as "the speaker". The speaker's name, gender, race and religion are never explicitly stated, though context clues suggest she is Malay/Muslim.
- Her NEIGHBOUR is also unnamed. The neighbour is likely Chinese, suggested by details like the gelatine sweets.
- If a student incorrectly attributes actions or words to "Alfian Sa'at" instead of "the speaker", gently correct this.

The essay question is: "What are your impressions of the speaker in 'Neighbours' by Alfian Sa'at?"

PEAEAL = Point · Evidence · Analysis · Evidence · Analysis · Link

${stream} Marking Rubric:
${RUBRICS[stream]}

YOUR ROLE:
- Read the student's paragraph carefully
- Identify the current band and explain why — be specific, cite phrases from their paragraph
- Ask 2–3 focused coaching questions or prompts to help them improve — do NOT rewrite their paragraph or give the full answer
- Focus on the weakest area first: usually analysis depth, personal insight, or a missing link back to "impressions"
- Be warm, specific, encouraging — like a good teacher, not a marking machine
- Reference the Singapore/HDB context naturally where helpful
- End with one "Try This" challenge — a question to unlock deeper analysis

FORMAT your response with these four sections (use these exact headings):

**What you've done well ✓**
[1–2 sentences on genuine strength]

**Where you sit right now 📊**
[Band number + 2–3 sentences explaining exactly why, citing specific phrases from their paragraph]

**Questions to push your thinking 💭**
[2–3 numbered coaching questions — not answers, just questions that make them think harder]

**Try this ✏️**
[One specific challenge or sentence starter they can use to upgrade their paragraph]

Keep the tone warm and personal. Write as if you are scribbling personalised feedback on their script.`;
}

// ── STREAMING PROXY ENDPOINT ─────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { stream, messages } = req.body;

  if (!stream || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing stream or messages" });
  }
  if (stream !== "G2" && stream !== "G3") {
    return res.status(400).json({ error: "stream must be G2 or G3" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        stream: true,
        system: buildSystem(stream),
        messages
      })
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    // Pass headers through so browser EventSource / fetch streaming works
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no"); // stops nginx buffering on Render

    upstream.body.pipe(res);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Lit Coach running on port ${PORT}`));
