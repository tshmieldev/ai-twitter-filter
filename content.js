(() => {
  let enabled = true;
  let debounceTimer = null;
  const pendingTweets = new Map(); // hash -> { element, text }
  const processedHashes = new Map(); // hash -> { hide: boolean, reason: string }

  // Simple string hash
  function hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(36);
  }

  function extractTweetText(article) {
    const textEl = article.querySelector('div[data-testid="tweetText"]');
    if (!textEl) return null;
    return textEl.innerText.trim();
  }

  function extractAuthor(article) {
    const userNameEl = article.querySelector('div[data-testid="User-Name"]');
    if (userNameEl) {
      const link = userNameEl.querySelector("a");
      if (link) {
        const spans = link.querySelectorAll("span");
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text && !text.startsWith("@")) return text;
        }
      }
    }
    return "Unknown";
  }

  // ---- DOM manipulation helpers ----

  function hideChildren(article) {
    for (const child of article.children) {
      if (
        child.classList.contains("ai-filter-banner") ||
        child.classList.contains("ai-filter-loader")
      )
        continue;
      child.style.setProperty("display", "none", "important");
    }
  }

  function showChildren(article) {
    for (const child of article.children) {
      if (
        child.classList.contains("ai-filter-banner") ||
        child.classList.contains("ai-filter-loader")
      )
        continue;
      child.style.removeProperty("display");
    }
  }

  function addLoader(article) {
    if (article.querySelector(".ai-filter-loader")) return;
    const loader = document.createElement("div");
    loader.className = "ai-filter-loader";
    loader.innerHTML = `
      <div class="ai-filter-spinner"></div>
      <span>Checking tweet...</span>
    `;
    article.prepend(loader);
  }

  function removeLoader(article) {
    const loader = article.querySelector(".ai-filter-loader");
    if (loader) loader.remove();
  }

  function createBanner(author, reason) {
    const banner = document.createElement("div");
    banner.className = "ai-filter-banner";
    banner.innerHTML = `
      <svg class="ai-filter-banner-icon" viewBox="0 0 24 24">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L12 10.94l7.22-7.22a.75.75 0 1 1 1.06 1.06L13.06 12l7.22 7.22a.75.75 0 1 1-1.06 1.06L12 13.06l-7.22 7.22a.75.75 0 0 1-1.06-1.06L10.94 12 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
      </svg>
      <span class="ai-filter-banner-text">
        <span class="ai-filter-banner-author"></span>
        <span class="ai-filter-banner-reason"></span>
      </span>
      <button class="ai-filter-banner-show">Show</button>
    `;
    banner.querySelector(".ai-filter-banner-author").textContent = author;
    const reasonEl = banner.querySelector(".ai-filter-banner-reason");
    reasonEl.textContent = reason ? ` \u2014 ${reason}` : " \u2014 hidden by AI filter";
    banner.querySelector(".ai-filter-banner-show").addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        const article = banner.closest("article");
        if (article) {
          article.classList.remove("ai-filter-hidden");
          showChildren(article);
          banner.remove();
        }
      }
    );
    return banner;
  }

  // ---- Tweet processing ----

  function processTweet(article) {
    if (!enabled) return;
    if (article.dataset.aiFilterProcessed) return;

    const author = extractAuthor(article);
    const text = `Tweet by user ${author}: ` + (extractTweetText(article) || "<This tweet has no text.>");

    const hash = hashText(text);
    article.dataset.aiFilterProcessed = "true";
    article.dataset.aiFilterHash = hash;

    // If we already have a verdict for this hash, apply immediately
    if (processedHashes.has(hash)) {
      const verdict = processedHashes.get(hash);
      if (verdict.hide) {
        applyHidden(article, verdict.reason);
      }
      return;
    }

    // Hide content and show loader while we wait for AI
    hideChildren(article);
    addLoader(article);

    pendingTweets.set(hash, { element: article, text });
    scheduleBatch();
  }

  function scheduleBatch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendBatch, 500);
  }

  async function sendBatch() {
    if (pendingTweets.size === 0) return;

    const batch = [];
    const elements = new Map();

    for (const [hash, data] of pendingTweets) {
      batch.push({ hash, text: data.text });
      elements.set(hash, data.element);
    }
    pendingTweets.clear();

    try {
      const results = await chrome.runtime.sendMessage({
        type: "EVALUATE_TWEETS",
        tweets: batch,
      });

      if (!results) return;

      for (const verdict of results) {
        processedHashes.set(verdict.id, { hide: verdict.hide, reason: verdict.reason || "" });
        applyVerdictToAll(verdict.id, verdict.hide, verdict.reason || "");
      }
    } catch (err) {
      console.error("AI Twitter Filter - Error sending batch:", err);
      // Fail open - show all tweets in this batch
      for (const [hash] of elements) {
        applyVerdictToAll(hash, false);
      }
    }
  }

  function applyVerdictToAll(hash, hide, reason) {
    const articles = document.querySelectorAll(
      `article[data-testid="tweet"][data-ai-filter-hash="${hash}"]`
    );
    for (const article of articles) {
      removeLoader(article);
      if (hide) {
        applyHidden(article, reason);
      } else {
        showChildren(article);
      }
    }
  }

  function applyHidden(article, reason) {
    article.classList.add("ai-filter-hidden");
    hideChildren(article);
    if (!article.querySelector(".ai-filter-banner")) {
      const author = extractAuthor(article);
      article.prepend(createBanner(author, reason));
    }
  }

  function unhideAll() {
    // Remove banners and loaders
    document.querySelectorAll(".ai-filter-banner, .ai-filter-loader").forEach((el) => el.remove());
    // Restore children visibility
    document.querySelectorAll(".ai-filter-hidden, [data-ai-filter-processed]").forEach((article) => {
      article.classList.remove("ai-filter-hidden");
      showChildren(article);
    });
  }

  function resetAll() {
    unhideAll();
    processedHashes.clear();
    pendingTweets.clear();
    document.querySelectorAll("[data-ai-filter-processed]").forEach((el) => {
      delete el.dataset.aiFilterProcessed;
      delete el.dataset.aiFilterHash;
    });
  }

  // ---- DOM observer ----

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.matches?.('article[data-testid="tweet"]')) {
          processTweet(node);
        }

        const articles = node.querySelectorAll?.(
          'article[data-testid="tweet"]'
        );
        if (articles) {
          for (const article of articles) {
            processTweet(article);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Process tweets already on the page
  document.querySelectorAll('article[data-testid="tweet"]').forEach(processTweet);

  // ---- Message listener ----

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED") {
      if ("enabled" in message.changes) {
        enabled = message.changes.enabled;
        if (!enabled) {
          unhideAll();
        } else {
          resetAll();
          document
            .querySelectorAll('article[data-testid="tweet"]')
            .forEach(processTweet);
        }
      }

      if ("filterPrompt" in message.changes) {
        resetAll();
        document
          .querySelectorAll('article[data-testid="tweet"]')
          .forEach(processTweet);
      }
    }
  });

  // Load initial settings
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
    if (settings) {
      enabled = settings.enabled;
    }
  });

  console.log("AI Twitter Filter - Content script loaded");
})();
