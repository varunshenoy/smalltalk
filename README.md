# Small Talk 🐁

Small Talk is a simple Chrome extension that uses a local instance of [Gemini Nano](https://deepmind.google/technologies/gemini/nano/) via the experimental [Prompt API](https://developer.chrome.com/docs/ai/built-in) in Chrome.

It can:

→ Summarize highlighted text (**Cmd+Shift+S**)

→ Explain content as if you're 5 years old (**Cmd+Shift+E**)

It can also read the generated summaries and explanations aloud using [Cartesia](https://cartesia.ai/)'s lightning fast Text-to-Speech model.

## Configuration

Before running the extension, you need to get an API key from [Cartesia](https://cartesia.ai/) and set it at the top of the `content.js` file.

You also need to be running the latest version of Chrome Canary with some experimental flags enabled. You can find more information on how to set up your environment [here](https://developer.chrome.com/docs/ai/built-in).
