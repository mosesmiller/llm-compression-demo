# A Model Is a Compression

Companion site for the class "from regression to LLMs" (AI for Business, Global MBA, Reichman University).

Can a 4.3 GB language model file "contain" English Wikipedia? We asked local Qwen models (0.6B, 7B and 32B
parameters, run on a Mac with no internet) to write Wikipedia articles from their titles alone. Then we compared
what they wrote with the real articles, sentence by sentence, and scaled the result up to every eligible English
topic, the way a poll scales up from a sample.

The live lab (section 9) runs only in class, on the instructor's computer. Everything else on the site is the
recorded experiment, and it runs entirely in the browser (no tracking, no external scripts).

## Sources and licences

- **Wikipedia text** (the real articles shown next to the model's versions): English Wikipedia snapshot of
  2023-11-01 (Hugging Face `wikimedia/wikipedia`, `20231101.en`). Text by Wikipedia contributors, licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); each article links to its Wikipedia page.
  The real side is shortened to its first 2,500 words.
- **Page views**: Wikimedia pageview dumps, October 2023.
- **Generated text**: written by Qwen2.5-7B-Instruct, Qwen3-0.6B and Qwen2.5-32B-Instruct (Apache 2.0), from the
  title alone. **It is machine output, shown to measure how often it is wrong. Much of it is false. Do not cite it.**
  In this online copy, generated sentences that make a sensitive claim about a real person or organization (for
  example a crime, an allegation, or that a living person has died) and that the fact check could not confirm are
  replaced by a note. They keep their fact-check colour, and all statistics count them as written.
- **Fact check**: facebook/bart-large-mnli; **similarity**: BAAI/bge-small-en-v1.5 and
  sentence-transformers/all-MiniLM-L6-v2.
