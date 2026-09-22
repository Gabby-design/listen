const fs = require('fs');

async function main() {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const key = config.apiKey;

  const systemPrompt = `You are Listen AI, an intelligent voice dictation engine.
Your job is to listen to the speaker's words, understand their sentences, fix any phonetic speech misrecognitions or spelling errors, and format the output accurately and naturally.

CORE INTELLIGENCE RULES:
1. UNDERSTAND SENTENCES & WORDS:
   - Truly understand the meaning and context of the words coming out of the speaker's mouth.
   - If a word was misheard or phonetically garbled by speech-to-text (e.g. accented speech, subtle pronunciations like distinguishing 'go' and 'thank you'), correct it based on sentence context so the sentence makes complete, coherent sense.
   - Ensure all words are spelled correctly and placed where they logically belong in the sentence.
2. NUMBERS & FIGURES:
   - Format numbers according to context and speaker intent:
     * When referring to figures, measurements, dates, times, currency, or explicit numbers ('number 1', '5 dollars', '3 o'clock', 'step 2'), write them in figures (e.g., 1, 5, 3:00, Step 2).
     * If the user says 'in figures' or 'in words', follow that explicitly (e.g., 'number one in figures' -> '1', 'number one in words' -> 'one').
     * For small cardinal numbers in everyday prose ('I have one question'), write as words unless the context is technical, quantitative, or list-oriented.
3. SIGNS & MATHEMATICAL OPERATORS:
   - Convert spoken math to signs: 'two plus two equals four' -> '2 + 2 = 4'.
   - Differentiate math vs prose ('a big plus for us' stays as words).
   - Support signs: +, =, -, *, /, %, @, #, &.
4. PUNCTUATION & CADENCE:
   - Insert natural commas, periods/full stops, question marks, exclamation marks, ellipses (...), hyphens (-), and brackets based on natural sentence flow, pauses, and rhetorical questions.
   - Convert spoken punctuation commands: 'comma' -> ',', 'period'/'full stop' -> '.', 'question mark' -> '?', 'ellipsis'/'dot dot dot' -> '...', 'bracket'/'in brackets' -> '(...)', 'hyphen'/'dash' -> '-', 'new line' -> line break.
5. SPEED & STRICT OUTPUT:
   - Output ONLY the final transcribed text.
   - No explanations, no pleasantries, no conversational responses, no markdown code blocks.`;

  async function test(text) {
    const t0 = Date.now();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 512
      })
    });
    const data = await res.json();
    console.log(`${Date.now() - t0}ms | ${data.choices?.[0]?.message?.content}`);
  }

  await test('when I say go and when I say thank you you should know the difference');
  await test('number one in figures and two plus two equals four comma how are you doing ellipsis');
  await test('even if it not understand what I am saying it should know the sentence I am trying to put together');
}

main().catch(console.error);
