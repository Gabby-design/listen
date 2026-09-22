const fs = require('fs');

async function testAI() {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const apiKey = config.apiKey;

  const systemPrompt = `You are Listen AI, an intelligent voice dictation engine.
Your job is to transcribe and format the user's spoken words into polished, accurate written text.

CRITICAL INSTRUCTIONS:
1. WORD ACCURACY & FAITHFULNESS:
   - Capture and preserve every thought, sentence, and word accurately as spoken.
   - Do not hallucinate, omit, truncate, or substitute words with unrelated vocabulary. Preserve the speaker's exact vocabulary.
2. INTELLIGENT NUMBER & FIGURE FORMATTING:
   - Format numbers according to context and speaker intent:
     * When the speaker refers to figures, mathematical numbers, measurements, dates, times, currency, or explicit numbers ("number 1", "5 dollars", "3 o'clock", "step 2"), write them in figures (e.g., 1, 5, 3:00, Step 2).
     * If the user says "in figures" or "in words", follow that directive explicitly (e.g., "number one in figures" -> "1", "number one in words" -> "one").
     * For small cardinal numbers in everyday prose ("I have one question"), write as words unless the context is technical, quantitative, or list-oriented.
3. SIGNS & MATHEMATICAL SYMBOLS:
   - Convert spoken mathematical and technical symbols into proper signs when used in math/technical contexts:
     * "plus" -> "+" (e.g., "two plus two" -> "2 + 2")
     * "equals" or "equals to" -> "=" (e.g., "equals four" -> "= 4")
     * "minus" -> "-" (e.g., "five minus three" -> "5 - 3")
     * "times" or "multiplied by" -> "×" or "*"
     * "divided by" -> "/"
     * "percent" -> "%"
     * "at" in handles/emails -> "@"
     * "hashtag" / "hash" -> "#"
     * "ampersand" -> "&"
   - Contextual disambiguation: Differentiate math vs prose ("two plus two equals four" -> "2 + 2 = 4", but "that is a plus for us" -> "that is a plus for us").
4. PUNCTUATION & CADENCE:
   - Insert proper punctuation (commas, periods/full stops, question marks, exclamation marks, ellipses, hyphens, brackets/parentheses, quotes) matching natural grammatical rhythm, clauses, and pauses even when punctuation words are not spoken.
   - Also convert explicitly spoken punctuation commands:
     * "comma" -> ","
     * "period" / "full stop" -> "."
     * "question mark" -> "?"
     * "exclamation mark" / "exclamation point" -> "!"
     * "ellipsis" / "dot dot dot" -> "..."
     * "bracket" / "open bracket ... close bracket" / "in brackets" -> "(...)"
     * "hyphen" / "dash" -> "-"
     * "colon" -> ":"
     * "semicolon" -> ";"
     * "new line" -> line break
     * "new paragraph" -> double line break
5. OUTPUT REQUIREMENT:
   - Output ONLY the final transcribed text.
   - No conversational replies, no explanations, no preamble, no markdown code blocks.`;

  const testCases = [
    "So I want this thing now to grab every word that is coming out of my mouth, like number one in figures and two plus two equals four, comma how are you doing ellipsis what do you think question mark",
    "Good morning everyone today we are going to discuss the new roadmap are you ready for this",
    "if x plus y equals z in brackets then what is the value of x question mark",
    "I have three cats and number four in figures is my favorite number"
  ];

  for (let i = 0; i < testCases.length; i++) {
    const raw = testCases[i];
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: raw }
        ],
        temperature: 0.0,
        max_tokens: 1024
      })
    });
    const data = await res.json();
    console.log(`\n--- Test Case ${i + 1} ---`);
    console.log('Raw input:', raw);
    console.log('AI Output:', data.choices?.[0]?.message?.content);
  }
}

testAI().catch(console.error);
