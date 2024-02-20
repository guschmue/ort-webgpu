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

const preCannedQueries = {
  "1": "Tell me about the lighthouse of Alexandria",
  "2": "Did the lighthouse of Alexandria existed at the same time the library of Alexandria existed?",
  "3": "How did the Pharos lighthouse impact ancient maritime trade?",
  "4": "Tell me about Constantinople?",
};

// Event listener for Ctrl + Enter or CMD + Enter
document.getElementById('user-input').addEventListener('keydown', function (e) {
  if (e.ctrlKey) {
    if (e.key === 'Enter') {
      submitRequest();
    } else {
      const query = preCannedQueries[e.key];
      if (query) {
        document.getElementById('user-input').value = query;
        submitRequest();
      }
    }
  }
});

function cleanup_text(text) {
  const assistantText = text.slice(text.indexOf('assistant|>') + 11);
  return assistantText;
}

function getConfig() {
  const query = window.location.search.substring(1);
  var config = {
    model: "schmuell/TinyLlama-1.1B-Chat-v1.0-int4",
    provider: "webgpu",
    isPhi2: false,
    needsExternalData: false,
    layers: 22,
  }
  let vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    let pair = vars[i].split("=");
    if (pair[0] in config) {
      config[pair[0]] = decodeURIComponent(pair[1]);
    } else if (pair[0].length > 0) {
      throw new Error("unknown argument: " + pair[0]);
    }
  }
  if (config.model.includes("phi2")) {
    config.isPhi2 = true;
    config.layers = 32;
  }
  config.needsExternalData = config.model.includes("-fp16");

  return config;
}

const config = getConfig();

let pipe;

async function Query(query, cb) {
  // Define the list of messages
  const messages = [
    { "role": "system", "content": "You are a friendly assistant." },
    // { "role": "user", "content": "Tell me about the lighthouse of Alexandria" },
    { "role": "user", "content": query },
  ]

  // Construct the prompt
  let prompt;
  if (config.isPhi2) {
    prompt = query;
  } else {
    prompt = pipe.tokenizer.apply_chat_template(messages, {
      tokenize: false, add_generation_prompt: true,
    });
  }

  // Generate a response
  const start = performance.now();
  const result = await pipe(prompt, {
    max_new_tokens: 256,
    temperature: 0.7,
    do_sample: true,
    top_k: 15,
    callback_function: function (beams) {
      const decodedText = pipe.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true, });
      cb(cleanup_text(decodedText));
    }
  });
  const stop = performance.now();
  console.log(`took ${((stop - start) / 1000).toFixed(1)}sec`);
}

async function LoadModel() {

  env.backends.onnx.wasm.numThreads = 1;
  env.allowRemoteModels = true;
  env.backends.onnx.wasm.wasmPaths = 'transformers/';

  const model = config.model;
  let options;

  if (config.isPhi2) {
    // slighly different setup for phi2
    options = {
      quantized: false,
      session_options: {
        executionProviders: [config.provider],
        preferredOutputLocation: {},
      }
    }
  } else {
    options = {
      quantized: config.provider == "wasm" ? true : false,
      session_options: {
        executionProviders: [config.provider],
        preferredOutputLocation: {},
      }
    }
    if (config.provider == "webgpu") {
      for (let i = 0; i < config.layers; ++i) {
        options.session_options.preferredOutputLocation[`present.${i}.key`] = 'gpu-buffer';
        options.session_options.preferredOutputLocation[`present.${i}.value`] = 'gpu-buffer';
      }
    }
  }
  if (config.needsExternalData) {
    options.session_options.externalData = [
      {
        data: 'onnx/decoder_model_merged.onnx.data',
        path: 'decoder_model_merged.onnx.data'
      },
    ];
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
