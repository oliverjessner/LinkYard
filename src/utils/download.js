export function downloadText(text, filename, mimeType) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Give Chrome a chance to start reading the Blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
