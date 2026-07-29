document.getElementById("captureBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:")
  ) {
    document.getElementById("status").textContent =
      "Error: Cannot capture internal browser pages.";
    document.getElementById("status").style.color = "#d9534f";
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const SKIP_TAGS = new Set([
          "script",
          "style",
          "noscript",
          "link",
          "meta",
          "head",
          "title",
          "iframe",
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
            return null;
          }
        }

        async function walk(el) {
          const tag = el.tagName.toLowerCase();
          if (SKIP_TAGS.has(tag)) return null;

          // --- 1. SVG HANDLING ---
          if (tag === "svg") {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null;
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden")
              return null;

            return {
              tag: "svg",
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              svgCode: el.outerHTML,
              display: style.display,
              position: style.position,
            };
          }

          // --- 2. STANDARD ELEMENT FILTERING ---
          const rect = el.getBoundingClientRect();
          // Allow 0-height elements IF they have text (like some inline spans or links)
          const hasDirectText = Array.from(el.childNodes).some(
            (n) =>
              n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0,
          );
          if (
            (rect.width === 0 || rect.height === 0) &&
            !hasDirectText &&
            tag !== "input"
          )
            return null;

          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden")
            return null;

          // --- 3. NODE CONSTRUCTION ---
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
            position: style.position,
            flexDirection: style.flexDirection,
            justifyContent: style.justifyContent,
            alignItems: style.alignItems,
            gap: style.gap,

            // Layout Padding
            paddingTop: style.paddingTop,
            paddingRight: style.paddingRight,
            paddingBottom: style.paddingBottom,
            paddingLeft: style.paddingLeft,

            // Text Alignment & Behavior
            textAlign: style.textAlign,
            lineHeight: style.lineHeight,
            flexWrap: style.flexWrap,

            // Borders & Shadows
            borderRadius: style.borderRadius,
            borderWidth: style.borderWidth,
            borderColor: style.borderColor,
            borderStyle: style.borderStyle,
            boxShadow: style.boxShadow,
            children: [],
          };

          // --- 4. IMAGE & BACKGROUND HANDLING ---
          if (tag === "img" && el.src) {
            node.imageData = await imageToBase64(el.src);
          } else if (
            style.backgroundImage &&
            style.backgroundImage !== "none" &&
            style.backgroundImage.startsWith("url")
          ) {
            // Extract URL from background-image: url("...")
            const bgUrlMatch = style.backgroundImage.match(
              /url\(['"]?(.*?)['"]?\)/,
            );
            if (bgUrlMatch && bgUrlMatch[1]) {
              node.imageData = await imageToBase64(bgUrlMatch[1]);
            }
          }

          // --- 5. COMPREHENSIVE TEXT EXTRACTION ---
          let extractedText = "";

          // A. Form Elements (Inputs, Text areas, Selects)
          if (tag === "input" || tag === "textarea") {
            // Capture typed value first, fallback to placeholder
            extractedText = el.value || el.placeholder || "";
          }
          // B. Buttons (Sometimes buttons wrap text weirdly)
          else if (tag === "button") {
            extractedText = el.textContent.trim();
          }
          // C. Standard DOM Text (Spans, P, H1, Divs, Links)
          else {
            extractedText = Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent.trim())
              .filter((t) => t.length > 0)
              .join(" ");
          }

          if (extractedText) {
            node.text = extractedText;
          }

          // --- 6. ICON FONTS (FontAwesome / CSS Pseudo-elements) ---
          const beforeStyle = window.getComputedStyle(el, "::before");
          const content = beforeStyle.getPropertyValue("content");
          if (content && content !== "none" && content !== '""' && !node.text) {
            node.text = content.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
            node.fontFamily = beforeStyle.fontFamily;
          }

          // --- 7. RECURSIVE CHILD WALK ---
          // Don't walk children of buttons or inputs to avoid duplicating their inner text
          if (tag !== "button" && tag !== "input" && tag !== "textarea") {
            for (const child of el.children) {
              const childNode = await walk(child);
              if (childNode) node.children.push(childNode);
            }
          }

          return node;
        }

        return await walk(document.body);
      },
    });

    const json = JSON.stringify(result);
    await navigator.clipboard.writeText(json);

    const statusEl = document.getElementById("status");
    statusEl.textContent =
      "Copied to clipboard! (" + json.length + " characters)";
    statusEl.style.color = "#2b2b2b";
  } catch (error) {
    console.error("Capture runtime error:", error);
    document.getElementById("status").textContent =
      "Extraction failed: " + error.message;
    document.getElementById("status").style.color = "#d9534f";
  }
});
