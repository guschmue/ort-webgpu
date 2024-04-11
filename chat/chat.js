import { env, AutoTokenizer } from './transformers/transformers.js';
import * as ort from './dist/esm/ort.webgpu.min.js'

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


// Function to handle the user input and call the API functions
async function submitRequest() {
  if (sendButton.innerHTML == "Stop") {
    llm.abort();
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

  // change autoScroller to keep track of our new responseDiv
  autoScroller.observe(responseDiv);

  Query(input, (word) => {
    // add word to response
    responseDiv.innerHTML = DOMPurify.sanitize(marked.parse(word)); // Append word to response container
  }).then(() => {
    chatHistory.context = responseDiv.innerHTML;
    copyTextToClipboard(responseDiv, true);
    sendButton.innerHTML = "Send";
    spinner.remove();
  }).catch(error => {
    if (error !== 'Stop button pressed') {
      console.error(error);
    }
    sendButton.innerHTML = "Send";
    spinner.remove();
  });

  // Clear user input
  document.getElementById('user-input').value = '';
}

const preCannedQueries = {
  "1": "Tell me about the lighthouse of Alexandria.",
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

const MODELS = {
  "tinyllama": { name: "tinyllama", path: "schmuell/TinyLlama-1.1B-Chat-v1.0-int4" },
  "tinyllama_fp16": { name: "tinyllama-fp16", path: "schmuell/TinyLlama-1.1B-Chat-v1.0-fp16", externaldata: true },
  "phi2": { name: "phi2", path: "schmuell/phi2-int4" },
  "stablelm": { name: "stablelm", path: "schmuell/stablelm-2-zephyr-1_6b-int4" },
}

function getConfig() {
  const query = window.location.search.substring(1);
  var config = {
    model: "tinyllama",
    provider: "webgpu",
    profiler: 0,
    verbose: 0,
    threads: 1,
    trace: 0,
    csv: 0,
    max_tokens: 512,
    local: 0,
  }
  let vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    let pair = vars[i].split("=");
    if (pair[0] in config) {
      const key = pair[0];
      const value = decodeURIComponent(pair[1]);
      if (typeof config[key] == "number") {
        config[key] = parseInt(value);
      }
      else {
        config[key] = value;
      }
    } else if (pair[0].length > 0) {
      throw new Error("unknown argument: " + pair[0]);
    }
  }
  if (MODELS[config.model] !== undefined) {
    config.model = MODELS[config.model];
  }
  return config;
}

async function fetchAndCache(url) {
  try {
    const cache = await caches.open("onnx");
    let cachedResponse = await cache.match(url);
    if (cachedResponse == undefined) {
      await cache.add(url);
      cachedResponse = await cache.match(url);
      log(`${url} (network)`);
    } else {
      log(`${url} (cached)`);
    }
    const data = await cachedResponse.arrayBuffer();
    return data;
  } catch (error) {
    log(`${url} (network)`);
    return await fetch(url).then(response => response.arrayBuffer());
  }
}

class LLM {
  sess = undefined;
  profiler = false;
  trace = false;
  feed = {};
  output_tokens = [];
  eos = 2;
  need_position_ids = true;
  stop = false;
  kv_dims = [];
  dtype = "float16";

  constructor() {
  }

  async load(model, options) {
    const provider = options.provider || "webgpu";
    const verbose = options.verbose;
    const local = options.local;
    this.profiler = options.profiler;
    this.trace = options.trace;
    
    const model_path = (local) ? "models/" + model.path : "https://huggingface.co/" + model.path + "/resolve/main";
  
    log(`loading... ${model.name},  ${provider}`);
    const json_bytes = await fetchAndCache(model_path + "/config.json");
    let textDecoder = new TextDecoder();
    const model_config = JSON.parse(textDecoder.decode(json_bytes));

    const model_bytes = await fetchAndCache(model_path + "/onnx/decoder_model_merged.onnx");
    log(`model size ${Math.round(model_bytes.byteLength / 1024 / 1024)} MB`);
    const externaldata = (model.externalData) ? await fetchAndCache(model_path + '/onnx/decoder_model_merged.onnx.data') : false;

    const opt = {
      executionProviders: [provider],
      preferredOutputLocation: {},
    }

    switch (provider) {
      case "webgpu":
        if (!("gpu" in navigator)) {
          throw new Error("webgpu is NOT supported");
        }
        for (let i = 0; i < model_config.num_hidden_layers; ++i) {
          opt.preferredOutputLocation[`present.${i}.key`] = 'gpu-buffer';
          opt.preferredOutputLocation[`present.${i}.value`] = 'gpu-buffer';
        }
        break;
      case "webnn":
        if (!("ml" in navigator)) {
          throw new Error("webnn is NOT supported");
        }
        break;
    }

    if (externaldata !== undefined) {
      opt.externalData = [
        {
          data: externaldata,
          path: 'decoder_model_merged.onnx.data'
        },
      ]
    }
    if (verbose) {
      opt.logSeverityLevel = 0;
      opt.logVerbosityLevel = 0;
      ort.env.logLevel = "verbose";
    }

    ort.env.webgpu.profiling = {}
    if (this.profiler) {
      opt.enableProfiling = true;
      ort.env.webgpu.profilingMode = 'default';
      ort.env.webgpu.profiling.mode = 'default';
    }

    this.sess = await ort.InferenceSession.create(model_bytes, opt);

    if (this.trace) {
      ort.env.trace = true;
      ort.env.webgpu.profiling.ondata = (version, inputsMetadata, outputsMetadata, kernelId, kernelType,
        kernelName, programName, startTime, endTime) => { };
    }

    this.eos = model_config.eos_token_id;
    this.kv_dims = [1, model_config.num_key_value_heads, 0, model_config.hidden_size / model_config.num_attention_heads];
    this.dtype = config.model.dtype || "float16";
    this.num_layers = model_config.num_hidden_layers;
    this.initilize_feed();
  }

  initilize_feed() {
    this.feed = {};
    const empty = (this.dtype === "float16") ? new Uint16Array() : [];
    for (let i = 0; i < this.num_layers; ++i) {
      this.feed[`past_key_values.${i}.key`] = new ort.Tensor(this.dtype, empty, this.kv_dims)
      this.feed[`past_key_values.${i}.value`] = new ort.Tensor(this.dtype, empty, this.kv_dims)
    }
    this.output_tokens = [];
  }


  argmax(t) {
    const arr = t.data;
    const start = t.dims[2] * (t.dims[1] - 1);
    let max = arr[start];
    let maxidx = 0;

    for (let i = 0; i < t.dims[2]; i++) {
      const val = arr[i + start];
      if (!isFinite(val)) {
        throw new Error("found infinitive in logits");
      }
      if (val > max) {
        max = arr[i + start];
        maxidx = i;
      }
    }
    return maxidx;
  }

  update_kv_cache(feed, outputs) {
    for (const name in outputs) {
      if (name.startsWith('present')) {
        let newName = name.replace('present', 'past_key_values');
        // free old gpu buffer
        const t = feed[newName];
        if (t.location === 'gpu-buffer') {
          t.dispose();
        }
        feed[newName] = outputs[name];
      }
    }
  }

  abort() {
    this.stop = true;
  }

  async generate(tokens, callback, options) {
    const keep_cache = options.keep_cache;
    const max_tokens = options.max_tokens || 256;
    const feed = this.feed;
    const input_ids = new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]);
    feed['input_ids'] = input_ids;
    this.stop = false;

    if (keep_cache) {
      this.output_tokens.push(...input_ids)
    } else {
        this.initilize_feed();
        this.output_tokens = Array.from(feed['input_ids'].data);
    }

    let last_token = 0n;
    let seqlen = this.output_tokens.length;
    if (this.need_position_ids) {
      if (keep_cache) {
        feed['position_ids'] = new ort.Tensor('int64', BigInt64Array.from({ length: seqlen }, (_, i) => BigInt(i)), [1, input_ids.length]);
      } else {
        feed['position_ids'] = new ort.Tensor('int64', BigInt64Array.from({ length: seqlen }, (_, i) => BigInt(i)), [1, seqlen]);
      }
    }

    while (last_token != this.eos && seqlen < max_tokens && !this.stop) {
      seqlen = this.output_tokens.length;
      feed['attention_mask'] = new ort.Tensor('int64', BigInt64Array.from({ length: seqlen }, () => 1n), [1, seqlen]);
      let outputs;
      if (this.trace) {
        console.timeStamp("RUN-BEGIN");
        outputs = await this.sess.run(feed);
        console.timeStamp("RUN-END");
      } else {
        outputs = await this.sess.run(feed);
      }
      last_token = BigInt(this.argmax(outputs.logits));
      this.output_tokens.push(last_token);
      if (callback && !this.profiler) {
        callback(this.output_tokens);
      }
      this.update_kv_cache(feed, outputs);
      feed['input_ids'] = new ort.Tensor('int64', BigInt64Array.from([last_token]), [1, 1]);
      if (this.need_position_ids) {
        feed['position_ids'] = new ort.Tensor('int64', BigInt64Array.from([BigInt(seqlen)]), [1, 1]);
      }
    }
    if (this.profiler) {
      this.sess.endProfiling();
    }
    return this.output_tokens;
  }
}


const config = getConfig();
let tokenizer;

env.localModelPath = 'models';
env.allowRemoteModels = config.local == 0;
env.allowLocalModels = config.local == 1;
ort.env.wasm.numThreads = config.threads;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = document.location.pathname.replace('index.html', '') + 'dist/';

const llm = new LLM();

function token_to_text(tokenizer, tokens, startidx) {
  const txt = tokenizer.decode(tokens.slice(startidx), { skip_special_tokens: true, });
  return txt;
}

async function Query(query, cb) {
  let prompt;

  if (config.model.name == 'phi2') {
    prompt = `User:${query}\nAssistant:`;
  } else if (config.model.name == 'phix') {
    prompt = query;
  } else {
    prompt = `"<|system|>\nYou are a friendly assistant.</s>\n<|user|>\n${query}</s>\n<|assistant|>\n`;
  }

  const { input_ids } = await tokenizer(prompt, { return_tensor: false, padding: true, truncation: true });

  const start_timer = performance.now();
  const output_tokens = await llm.generate(input_ids, (output_tokens) => {
    cb(token_to_text(tokenizer, output_tokens, input_ids.length));
  }, {});

  const took = (performance.now() - start_timer) / 1000;
  const txt = token_to_text(tokenizer, output_tokens, input_ids.length);
  cb(txt);
  const seqlen = output_tokens.length;
  const perf = `${seqlen} tokens in ${took.toFixed(1)}sec, ${(seqlen / took).toFixed(2)} tokens/sec`;
  console.log(perf);
}


async function LoadModel() {
  try {
    tokenizer = await AutoTokenizer.from_pretrained(config.model.path);

    log("Loading model...");
    await llm.load(config.model, {
      provider: config.provider,
      profiler: config.profiler,
      verbose: config.verbose,
      trace: config.trace,
      local: config.local,
    });
    log("Ready.");
  } catch (error) {
    log(error);
  }
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
