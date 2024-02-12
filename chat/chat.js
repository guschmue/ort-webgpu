import { env, pipeline } from './transformers/transformers.js';

const clipboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
<path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
<path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
</svg>`

marked.use({
  mangle: false,
  headerIds: false
});

function log(i) { console.log(i); document.getElementById('status').innerText += `\n${i}`; }

const sendButton = document.getElementById('send-button');


// adjusts the padding at the bottom of scrollWrapper to be the height of the input box
function adjustPadding() {
  const inputBoxHeight = document.getElementById('input-area').offsetHeight;
  const scrollWrapper = document.getElementById('scroll-wrapper');
  scrollWrapper.style.paddingBottom = `${inputBoxHeight + 15}px`;
}

// sets up padding resize whenever input box has its height changed
const autoResizePadding = new ResizeObserver(() => {
  adjustPadding();
});
autoResizePadding.observe(document.getElementById('input-area'));

// variables to handle auto-scroll
// we only need one ResizeObserver and isAutoScrollOn variable globally
// no need to make a new one for every time submitRequest is called
const scrollWrapper = document.getElementById('scroll-wrapper');
let isAutoScrollOn = true;
// autoscroll when new line is added
const autoScroller = new ResizeObserver(() => {
  if (isAutoScrollOn) {
    scrollWrapper.scrollIntoView({ behavior: "smooth", block: "end" });
  }
});

// event listener for scrolling
let lastKnownScrollPosition = 0;
let ticking = false;
document.addEventListener("scroll", (event) => {
  // if user has scrolled up and autoScroll is on we turn it off
  if (!ticking && isAutoScrollOn && window.scrollY < lastKnownScrollPosition) {
    window.requestAnimationFrame(() => {
      isAutoScrollOn = false;
      ticking = false;
    });
    ticking = true;
  }
  // if user has scrolled nearly all the way down and autoScroll is disabled, re-enable
  else if (!ticking && !isAutoScrollOn &&
    window.scrollY > lastKnownScrollPosition && // make sure scroll direction is down
    window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 30 // add 30px of space--no need to scroll all the way down, just most of the way
  ) {
    window.requestAnimationFrame(() => {
      isAutoScrollOn = true;
      ticking = false;
    });
    ticking = true;
  }
  lastKnownScrollPosition = window.scrollY;
});


function copyTextToClipboard(responseDiv, with_button) {
  let elem = responseDiv;
  if (with_button) {
    let copyButton = document.createElement('button');
    copyButton.className = 'btn btn-secondary copy-button';
    copyButton.innerHTML = clipboardIcon;
    elem = copyButton;
  }

  elem.onclick = () => {
    let text = responseDiv.hidden_text;
    if (!text) {
      text = responseDiv.innerText;
    }
    navigator.clipboard.writeText(text).then(() => {
      console.log('Text copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };
  if (with_button) {
    responseDiv.appendChild(elem);
  }
}

let interrupt;


// Function to handle the user input and call the API functions
async function submitRequest() {
  if (sendButton.innerHTML == "Stop" && interrupt) {
    console.log("Stop");
    interrupt.abort('Stop button pressed');
    return;
  }

  document.getElementById('chat-container').style.display = 'block';

  const input = document.getElementById('user-input').value;
  if (input.length == 0) {
    document.getElementById('chat-history').context = "";
    let chatHistory = document.getElementById('chat-history');
    while (chatHistory.firstChild) {
      chatHistory.firstChild.remove();
    }
    return;
  }
  let context = document.getElementById('chat-history').context;
  if (context === undefined) {
    context = "";
  }
  // Create user message element and append to chat history
  let chatHistory = document.getElementById('chat-history');
  let userMessageDiv = document.createElement('div');
  userMessageDiv.className = 'mb-2 user-message';
  userMessageDiv.innerText = input;
  chatHistory.appendChild(userMessageDiv);
  copyTextToClipboard(userMessageDiv);

  // Create response container
  let responseDiv = document.createElement('div');
  responseDiv.className = 'response-message mb-2 text-start';
  responseDiv.style.minHeight = '3em'; // make sure div does not shrink if we cancel the request when no text has been generated yet
  let spinner = document.createElement('div');
  spinner.className = 'spinner-border text-light';
  spinner.setAttribute('role', 'status');
  responseDiv.appendChild(spinner);
  chatHistory.appendChild(responseDiv);

  // create button to stop text generation
  sendButton.innerHTML = "Stop";
  interrupt = new AbortController();

  // change autoScroller to keep track of our new responseDiv
  autoScroller.observe(responseDiv);

  Query(context + " " + input, (word) => {
    // add word to response
    responseDiv.innerHTML = DOMPurify.sanitize(marked.parse(word)); // Append word to response container
  }).then(() => {
    chatHistory.context = responseDiv.innerHTML;
    copyTextToClipboard(responseDiv, true);
    sendButton.innerHTML = "Send";
    spinner.remove();
    interrupt = undefined;
  }).catch(error => {
    if (error !== 'Stop button pressed') {
      console.error(error);
    }
    sendButton.innerHTML = "Send";
    spinner.remove();
    interrupt = undefined;
  });

  // Clear user input
  document.getElementById('user-input').value = '';
}

// Event listener for Ctrl + Enter or CMD + Enter
document.getElementById('user-input').addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    submitRequest();
  }
});

const provider = "webgpu";
let pipe;

function cleanup_text(text) {
  const assistantText = text.slice(text.indexOf('assistant|>') + 11);
  return assistantText;
}

async function Query(query, cb) {
  let prompt;

  // Define the list of messages
  const messages = [
    { "role": "system", "content": "You are a friendly assistant." },
    // { "role": "user", "content": "Tell me about the lighthouse of Alexandria" },
    { "role": "user", "content": query },
  ]

  // Construct the prompt
  prompt = pipe.tokenizer.apply_chat_template(messages, {
    tokenize: false, add_generation_prompt: true,
  });

  // Generate a response
  const start = performance.now();
  const result = await pipe(prompt, {
    max_new_tokens: 256,
    temperature: 0.7,
    do_sample: false,  // < TRUE
    top_k: 15,
    callback_function: function (beams) {
      const decodedText = pipe.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true, });
      cb(cleanup_text(decodedText));
    }
  });
  const stop = performance.now();
  log(`took ${((stop - start) / 1000).toFixed(1)}sec`);
}

async function LoadModel() {
  let options;
  let model;

  env.backends.onnx.wasm.numThreads = 1;
  env.localModelPath = 'models/';
  env.allowRemoteModels = true;
  env.backends.onnx.wasm.wasmPaths = 'dist/';

  if (provider == "webgpu") {
    model = 'schmuell/TinyLlama-1.1B-Chat-v1.0-fp16';
    options = {
      quantized: false,
      session_options: {
        executionProviders: ["webgpu"],
        preferredOutputLocation: {},
        externalData: [
          {
            data: 'onnx/decoder_model_merged.onnx.data',
            path: 'decoder_model_merged.onnx.data'
          },
        ]
      }
    }
    for (let i = 0; i < 22; ++i) {
      options.session_options.preferredOutputLocation[`present.${i}.key`] = 'gpu-buffer';
      options.session_options.preferredOutputLocation[`present.${i}.value`] = 'gpu-buffer';
    }
  }
  if (provider == "wasm") {
    model = 'Xenova/TinyLlama-1.1B-Chat-v1.0';
    options = {
      quantized: true,
      session_options: {
        executionProviders: ["wasm"],
      }
    }
  }

  const start = performance.now();
  log("Loading model ... ");
  pipe = await pipeline('text-generation', model, options);
  log(`done, ${((performance.now() - start) / 1000).toFixed(1)}sec`);
}

async function hasFp16() {
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter.features.has('shader-f16')
  } catch (e) {
    return false
  }
}

window.onload = () => {
  hasFp16().then((fp16) => {
    if (fp16) {
      LoadModel().then(() => {
        adjustPadding();
        sendButton.addEventListener('click', submitRequest);
        const userInput = document.getElementById('user-input');
        document.getElementById("status").style.display = "none";
        userInput.focus();
      });
    } else {
      log("Your GPU or Browser doesn't support webgpu/f16");
    }

  });

}
