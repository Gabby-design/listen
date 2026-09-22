const assert = require('assert');

const wordToFig = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12'
};
const figToWord = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten'
};

function formatTranscription(rawText) {
  if (!rawText) return '';
  let text = rawText.trim();

  // 1. Explicit number directives: "number one in figures" -> "1", "number 1 in words" -> "one"
  text = text.replace(/\bnumber\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+in\s+figures\b/gi, (_m, val) => {
    const lower = val.toLowerCase();
    return wordToFig[lower] || val;
  });

  text = text.replace(/\bnumber\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+in\s+words\b/gi, (_m, val) => {
    return figToWord[val] || val.toLowerCase();
  });

  // 2. Mathematical expressions with digits or words
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:plus|\+)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} + ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:minus|\-)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} - ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:times|\*|multiplied by)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} * ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:divided by|\/)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} / ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:equals to|equal to|equals|=)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} = ${nb}`;
  });

  // Hyphenated words: "user dash friendly" -> "user-friendly"
  text = text.replace(/\b([a-zA-Z0-9]+)\s+(?:hyphen|dash)\s+([a-zA-Z0-9]+)\b/gi, '$1-$2');

  // 3. Spoken punctuation commands and signs conversion
  const spokenPunctuation = [
    { regex: /\b(ellipsis|ellipses|dot dot dot)\b/gi, rep: '...' },
    { regex: /\b(period|full stop)\b/gi, rep: '.' },
    { regex: /\b(comma)\b/gi, rep: ',' },
    { regex: /\b(question mark)\b/gi, rep: '?' },
    { regex: /\b(exclamation mark|exclamation point)\b/gi, rep: '!' },
    { regex: /\b(colon)\b/gi, rep: ':' },
    { regex: /\b(semicolon)\b/gi, rep: ';' },
    { regex: /\b(hyphen|dash)\b/gi, rep: '-' },
    { regex: /\b(plus sign)\b/gi, rep: '+' },
    { regex: /\b(equals to|equal to)\b/gi, rep: '=' },
    { regex: /\b(open bracket|open parenthesis|open paren)\b/gi, rep: '(' },
    { regex: /\b(close bracket|close parenthesis|close paren)\b/gi, rep: ')' },
    { regex: /\b(open square bracket)\b/gi, rep: '[' },
    { regex: /\b(close square bracket)\b/gi, rep: ']' },
    { regex: /\b(open curly bracket|open brace)\b/gi, rep: '{' },
    { regex: /\b(close curly bracket|close brace)\b/gi, rep: '}' },
    { regex: /\b(open quote)\b/gi, rep: '"' },
    { regex: /\b(close quote)\b/gi, rep: '"' },
    { regex: /\b(percent sign|percentage sign)\b/gi, rep: '%' },
    { regex: /\b(at sign)\b/gi, rep: '@' },
    { regex: /\b(hashtag|hash sign|pound sign)\b/gi, rep: '#' },
    { regex: /\b(ampersand|and sign)\b/gi, rep: '&' },
    { regex: /\b(forward slash)\b/gi, rep: '/' },
    { regex: /\b(backslash)\b/gi, rep: '\\' },
    { regex: /\b(new line)\b/gi, rep: '\n' },
    { regex: /\b(new paragraph)\b/gi, rep: '\n\n' }
  ];

  for (const { regex, rep } of spokenPunctuation) {
    text = text.replace(regex, rep);
  }

  // 4. Fix spacing around punctuation marks
  text = text.replace(/\.\.\./g, '___ELLIPSIS___');
  text = text.replace(/\s+([,:;?!%])/g, '$1');
  text = text.replace(/\s+\./g, '.');
  text = text.replace(/([,.:;?!])([A-Za-z0-9])/g, '$1 $2');
  text = text.replace(/___ELLIPSIS___/g, '... ');

  // 5. Brackets & parenthesis formatting
  text = text.replace(/\(\s+/g, '(');
  text = text.replace(/\s+\)/g, ')');
  text = text.replace(/([A-Za-z0-9])\(/g, '$1 (');
  text = text.replace(/\)([A-Za-z0-9])/g, ') $1');

  text = text.replace(/\[\s+/g, '[');
  text = text.replace(/\s+\]/g, ']');
  text = text.replace(/([A-Za-z0-9])\[/g, '$1 [');
  text = text.replace(/\]([A-Za-z0-9])/g, '] $1');

  // 6. Collapse consecutive spaces (preserving newlines)
  text = text.replace(/[ \t]+/g, ' ');

  // 7. Intelligent capitalization
  text = text.charAt(0).toUpperCase() + text.slice(1);
  text = text.replace(/([.?!]\s+)([a-z])/g, (_match, p1, p2) => p1 + p2.toUpperCase());
  text = text.replace(/(\n+)([a-z])/g, (_match, p1, p2) => p1 + p2.toUpperCase());
  text = text.replace(/\b(i)\b/g, 'I');
  text = text.replace(/\bi'([a-z]+)/gi, (_match, suffix) => "I'" + suffix.toLowerCase());

  return text.trim();
}

console.log('Testing local formatTranscription:');

// Test 1: Numbers in figures and words
const test1 = formatTranscription('please write number one in figures and number 2 in words');
console.log('Test 1:', test1);
assert.strictEqual(test1, 'Please write 1 and two');

// Test 2: Math signs
const test2 = formatTranscription('two plus two equals to four');
console.log('Test 2:', test2);
assert.strictEqual(test2, '2 + 2 = 4');

const test2b = formatTranscription('2 plus 2 equals 4');
console.log('Test 2b:', test2b);
assert.strictEqual(test2b, '2 + 2 = 4');

// Test 3: Spoken punctuation & signs
const test3 = formatTranscription('hello comma how are you question mark ellipsis this is bracket open bracket secret close bracket full stop');
console.log('Test 3:', test3);
assert.strictEqual(test3, 'Hello, how are you? ... This is bracket (secret).');

// Test 4: Hyphen & percent
const test4 = formatTranscription('user dash friendly and twenty percent sign');
console.log('Test 4:', test4);
assert.strictEqual(test4, 'User-friendly and twenty%');

console.log('All local tests passed successfully.');
