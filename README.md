# A Model Is a Compression

Companion site for the class "from regression to LLMs" (AI for Business, Global MBA, Reichman University).

Can a 4.3 GB language model file "contain" English Wikipedia? We asked local Qwen models (0.6B, 7B and 32B
parameters, run on a Mac with no internet) to write Wikipedia articles from their titles alone. Then we compared
what they wrote with the real articles, sentence by sentence, and scaled the result up to every eligible English
topic, the way a poll scales up from a sample.

The live lab (section 9) runs only in class, on the instructor's computer. Everything else on the site is the
recorded experiment, and it runs entirely in the browser (no tracking, no external scripts).

**In this online copy, the models' text is shown only where the fact check confirmed it.** Language models invent
things about real people and organizations, so every generated sentence the fact check could not confirm appears
as […], grey if the real article does not mention it and red if the real article contradicts it. All statistics
count the full text as written. Topics that do not exist (section 8) are shown as written.

## Sources and licences

- **Wikipedia text** (the real articles shown next to the model's versions): English Wikipedia snapshot of
  2023-11-01 (Hugging Face `wikimedia/wikipedia`, `20231101.en`). Text by Wikipedia contributors, licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); each article links to its Wikipedia page.
  The real side is plain text, shortened to its first 2,500 words.
- **Page views**: Wikimedia pageview dumps, October 2023.
- **Generated text**: written by Qwen2.5-7B-Instruct, Qwen3-0.6B and Qwen2.5-32B-Instruct (Apache 2.0), from the
  title alone. It is machine output, shown to measure how often it is wrong. Do not cite it.
- **Fact check**: facebook/bart-large-mnli; **similarity**: BAAI/bge-small-en-v1.5 and
  sentence-transformers/all-MiniLM-L6-v2.
