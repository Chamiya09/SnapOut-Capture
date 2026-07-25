document.getElementById("captureBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const SKIP_TAGS = new Set([
        "script",
        "style",
        "noscript",
        "link",
        "meta",
      ]);

      async function imageToBase64(url) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          return null; // CORS-blocked or failed to load — skip gracefully
        }
      }

      async function walk(el) {
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
          fontFamily: style.fontFamily,
          display: style.display,
          flexDirection: style.flexDirection,
          justifyContent: style.justifyContent,
          alignItems: style.alignItems,
          gap: style.gap,
          borderRadius: style.borderRadius,
          borderWidth: style.borderWidth,
          borderColor: style.borderColor,
          borderStyle: style.borderStyle,
          boxShadow: style.boxShadow,
          children: [],
        };

        if (tag === "img" && el.src) {
          node.imageData = await imageToBase64(el.src);
        }

        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .filter((t) => t.length > 0)
          .join(" ");

        if (directText) {
          node.text = directText;
        }

        for (const child of el.children) {
          const childNode = await walk(child);
          if (childNode) node.children.push(childNode);
        }

        return node;
      }

      return await walk(document.body);
    },
  });

  const json = JSON.stringify(result);
  await navigator.clipboard.writeText(json);
  document.getElementById("status").textContent =
    "Copied to clipboard! (" + json.length + " characters)";
});
