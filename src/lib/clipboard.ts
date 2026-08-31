type ClipboardEnvironment = {
  isSecureContext: boolean;
  navigator: {
    clipboard?: {
      writeText: (text: string) => Promise<void>;
    };
  };
  document: Document;
};

function browserEnvironment(): ClipboardEnvironment {
  return {
    isSecureContext: window.isSecureContext,
    navigator: window.navigator,
    document: window.document,
  };
}

function copyWithTextArea(text: string, document: Document): boolean {
  const textArea = document.createElement("textarea");
  const activeElement = document.activeElement;
  const selection = document.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];

  textArea.value = text;
  textArea.readOnly = true;
  textArea.setAttribute("aria-hidden", "true");
  Object.assign(textArea.style, {
    position: "fixed",
    left: "0",
    top: "-9999px",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "0",
    fontSize: "16px",
  });
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true });
    }
    if (selection) {
      selection.removeAllRanges();
      for (const range of previousRanges) selection.addRange(range);
    }
  }
}

/** Copies in HTTPS browsers and on local HTTP device-testing URLs. */
export async function copyTextToClipboard(
  text: string,
  environment: ClipboardEnvironment = browserEnvironment(),
): Promise<boolean> {
  if (environment.isSecureContext && environment.navigator.clipboard) {
    try {
      await environment.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Safari can expose the API and still reject it. Keep the click useful.
    }
  }

  return copyWithTextArea(text, environment.document);
}
