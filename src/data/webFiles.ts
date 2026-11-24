/** Browser file I/O shared by the web variants of ofxFile / backupFile. */

/** Opens the file picker and returns the file's text, or null if cancelled. */
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      removeEventListener('focus', onFocus);
      resolve((await input.files?.[0]?.text()) ?? null);
    };
    // Not every browser fires `cancel`; when the picker closes the window
    // regains focus, so check shortly after (the `change` event comes first
    // when a file was chosen, so wait a beat before treating it as a cancel).
    const onFocus = () => setTimeout(finish, 1000);
    input.addEventListener('change', finish);
    input.addEventListener('cancel', finish);
    addEventListener('focus', onFocus);
    input.click();
  });
}

/**
 * Opens the browser print dialog for an HTML page ("Save as PDF" there).
 * Uses a hidden srcdoc iframe: it inherits the page's CSP (no scripts run in
 * it) and needs no popup, which Safari would block.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/**
 * Hands the file to the user: share sheet when available (iOS can save it to
 * Files / iCloud Drive), plain download otherwise. Returns false if the user
 * dismissed the share sheet.
 */
export async function saveTextFile(name: string, content: string): Promise<boolean> {
  const file = new File([content], name, { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Anything else (e.g. user gesture expired after the slow key derivation): download instead.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
