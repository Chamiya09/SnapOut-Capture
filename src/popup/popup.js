document.getElementById("captureBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const SKIP_TAGS = new Set([
        "script",
        "style",
        "noscript",
        "link",
        "meta",
      ]);

      function walk(el) {
        const tag = el.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden")
          return null;

        const node = {
          tag,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          children: [],
        };

        // Only capture direct text (not text belonging to child elements)
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .filter((t) => t.length > 0)
          .join(" ");

        if (directText) {
          node.text = directText;
        }

        for (const child of el.children) {
          const childNode = walk(child);
          if (childNode) node.children.push(childNode);
        }

        return node;
      }

      return walk(document.body);
    },
  });

  const json = JSON.stringify(result);
  await navigator.clipboard.writeText(json);
  document.getElementById("status").textContent =
    "Copied to clipboard! (" + json.length + " characters)";
});
