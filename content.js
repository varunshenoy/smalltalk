// Configuration
const CONFIG = {
  API_KEY: "your-api-key-here", // Get an API key from https://cartesia.ai/
  API_VERSION: "2024-06-10",
  API_URL: "https://api.cartesia.ai/tts/bytes",
  VOICE_ID: "c45bc5ec-dc68-4feb-8829-6e6b2748095d",
  MODEL_ID: "sonic-english",
};

// Utility functions
function parseMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, "<br>");
}

function findFirstTextNode(element) {
  if (
    element.nodeType === Node.TEXT_NODE &&
    element.textContent.trim() !== ""
  ) {
    return element;
  }
  for (let child of element.childNodes) {
    const textNode = findFirstTextNode(child);
    if (textNode) return textNode;
  }
  return null;
}

function restoreOriginalContent(event, originalContents) {
  const div = event.target.closest("div[id^='extension-replaced-']");
  if (div && div.id in originalContents) {
    const originalContent = originalContents[div.id];

    const temp = document.createElement("div");
    temp.innerHTML = originalContent.html;

    const parent = div.parentNode;
    while (temp.firstChild) {
      parent.insertBefore(temp.firstChild, div);
    }
    parent.removeChild(div);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(originalContent.range);

    delete originalContents[div.id];
  }
}

// StreamingAudioPlayer class
class StreamingAudioPlayer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.bufferQueue = [];
    this.isPlaying = false;
    this.sampleRate = 44100;
    this.channelCount = 1;
    this.bufferSize = 2 * this.sampleRate; // 2 seconds buffer
    this.currentBuffer = new Float32Array(this.bufferSize);
    this.bufferFillAmount = 0;
    this.remainder = new Uint8Array(0);
  }

  async addChunk(chunk) {
    const combinedChunk = new Uint8Array(this.remainder.length + chunk.length);
    combinedChunk.set(this.remainder);
    combinedChunk.set(chunk, this.remainder.length);

    const alignedLength = Math.floor(combinedChunk.length / 4) * 4;
    const newSamples = new Float32Array(
      combinedChunk.buffer,
      0,
      alignedLength / 4
    );

    this.remainder = combinedChunk.slice(alignedLength);

    if (this.bufferFillAmount + newSamples.length > this.bufferSize) {
      if (this.bufferFillAmount > 0) {
        this.playBuffer();
      }
      this.bufferFillAmount = 0;
    }

    this.currentBuffer.set(newSamples, this.bufferFillAmount);
    this.bufferFillAmount += newSamples.length;

    if (this.bufferFillAmount >= this.bufferSize / 2) {
      this.playBuffer();
      this.bufferFillAmount = 0;
    }
  }

  playBuffer() {
    const audioBuffer = this.audioContext.createBuffer(
      this.channelCount,
      this.bufferFillAmount,
      this.sampleRate
    );
    audioBuffer.copyToChannel(
      this.currentBuffer.slice(0, this.bufferFillAmount),
      0
    );

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    if (this.isPlaying) {
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } else {
      source.start(0);
      this.nextStartTime = this.audioContext.currentTime + audioBuffer.duration;
      this.isPlaying = true;
    }
  }

  async finish() {
    if (this.bufferFillAmount > 0 || this.remainder.length > 0) {
      if (this.remainder.length > 0) {
        const paddedRemainder = new Uint8Array(
          Math.ceil(this.remainder.length / 4) * 4
        );
        paddedRemainder.set(this.remainder);
        const finalSamples = new Float32Array(paddedRemainder.buffer);
        this.currentBuffer.set(finalSamples, this.bufferFillAmount);
        this.bufferFillAmount += finalSamples.length;
      }
      this.playBuffer();
    }
    await new Promise((resolve) =>
      setTimeout(resolve, this.nextStartTime * 1000)
    );
  }
}

// Text to Speech function
async function speakText(text, button, parentDiv) {
  button.textContent = "Speaking...";
  button.disabled = true;

  const startTime = Date.now();
  let firstChunkReceived = false;

  const options = {
    method: "POST",
    headers: {
      "X-API-Key": CONFIG.API_KEY,
      "Cartesia-Version": CONFIG.API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      output_format: {
        container: "raw",
        sample_rate: 44100,
        encoding: "pcm_f32le",
      },
      language: "en",
      voice: {
        mode: "id",
        id: CONFIG.VOICE_ID,
      },
      model_id: CONFIG.MODEL_ID,
      transcript: text,
    }),
  };

  try {
    const response = await fetch(CONFIG.API_URL, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const streamingAudioPlayer = new StreamingAudioPlayer(audioContext);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstChunkReceived) {
        firstChunkReceived = true;
        const timeToFirstChunk = Date.now() - startTime;
        console.log(`Time to first chunk: ${timeToFirstChunk}ms`);
      }

      await streamingAudioPlayer.addChunk(value);
    }

    await streamingAudioPlayer.finish();
  } catch (error) {
    console.error("Error fetching or playing audio:", error);
    alert("Failed to generate or play audio. Please try again.");
  } finally {
    button.textContent = "Speak to me";
    button.disabled = false;
  }
}

// AI Action function
async function performAIAction(action, text, contentDiv) {
  const canCreate = await window.ai.canCreateTextSession();
  if (canCreate === "no") {
    throw new Error("AI text session cannot be created");
  }

  const session = await window.ai.createTextSession();
  let prompt;

  action = action.toLowerCase();

  if (action === "summarize") {
    prompt = `Summarize the following text very concisely in a few sentences:\n\n${text}`;
  } else if (action === "eli5") {
    prompt = `Explain the following text like I'm 5 years old in a few sentences:\n\n${text}`;
  } else {
    throw new Error("Unknown action: " + action);
  }

  const stream = session.promptStreaming(prompt);

  for await (const chunk of stream) {
    contentDiv.innerHTML = parseMarkdown(chunk);
  }
}

// Text Replacement function
function handleReplaceText(aiAction, originalContents) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const originalRange = selection.getRangeAt(0).cloneRange();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(originalRange.cloneContents());
    const originalHTML = tempDiv.innerHTML;

    const firstTextNode = findFirstTextNode(tempDiv);
    let originalStyles = null;
    if (firstTextNode && firstTextNode.parentElement) {
      originalStyles = window.getComputedStyle(firstTextNode.parentElement);
    }

    const uniqueId = "extension-replaced-" + Date.now();
    originalContents[uniqueId] = {
      html: originalHTML,
      range: originalRange,
      styles: originalStyles,
    };

    const div = createReplacementDiv(uniqueId, aiAction, originalStyles);
    const contentDiv = div.querySelector(".content");
    const speakButton = div.querySelector(".speak-button");

    originalRange.deleteContents();
    originalRange.insertNode(div);
    selection.removeAllRanges();

    performAIAction(aiAction, tempDiv.textContent, contentDiv);

    div.addEventListener("click", (event) => {
      if (event.target !== speakButton) {
        restoreOriginalContent(event, originalContents);
      }
    });

    speakButton.addEventListener("click", () =>
      speakText(contentDiv.textContent, speakButton, div)
    );
  }
}

function createReplacementDiv(uniqueId, aiAction, originalStyles) {
  const div = document.createElement("div");
  div.id = uniqueId;
  div.className = "extension-replaced";
  div.style.cssText = `
        cursor: pointer;
        background-color: ${
          aiAction.toLowerCase() === "eli5" ? "#FFE5B4" : "#e0f7e0"
        };
        padding: 20px 10px 10px 10px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        margin: 5px 0;
        position: relative;
      `;

  const label = document.createElement("div");
  label.textContent = aiAction.toUpperCase();
  label.style.cssText = `
        position: absolute;
        top: 5px;
        left: 10px;
        font-size: 10px;
        color: #888;
        font-weight: bold;
      `;

  const contentDiv = document.createElement("div");
  contentDiv.className = "content";
  contentDiv.textContent = "Loading...";
  if (originalStyles) {
    contentDiv.style.cssText = `
          font: ${originalStyles.font};
          color: ${originalStyles.color};
          text-align: ${originalStyles.textAlign};
          line-height: ${originalStyles.lineHeight};
          letter-spacing: ${originalStyles.letterSpacing};
          text-indent: ${originalStyles.textIndent};
        `;
  }

  const speakButton = document.createElement("button");
  speakButton.className = "speak-button";
  speakButton.textContent = "Speak to me";
  speakButton.style.cssText = `
        margin-top: 10px;
        padding: 5px 10px;
        background-color: ${
          aiAction.toLowerCase() === "eli5" ? "#FFA500" : "#4CAF50"
        };
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      `;

  div.appendChild(label);
  div.appendChild(contentDiv);
  div.appendChild(speakButton);

  return div;
}

// Main execution
const originalContents = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "ready" });
    return true;
  }
  if (request.action === "replaceText") {
    handleReplaceText(request.aiAction, originalContents);
    sendResponse({ success: true });
    return true;
  }
  if (request.action === "checkSelection") {
    const selection = window.getSelection();
    sendResponse({ hasSelection: selection.toString().trim().length > 0 });
    return true;
  }
});

console.log("Content script loaded");
