async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

document.getElementById("btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const meta = document.getElementById("meta");
  const preview = document.getElementById("preview");
  const svgLink = document.getElementById("svgLink");

  status.textContent = "Generating...";
  meta.textContent = "";
  preview.src = "";
  svgLink.href = "#";

  try {
    const payload = {
      type: document.getElementById("type").value,
      brand: document.getElementById("brand").value,
      letter: document.getElementById("letter").value,
      concept: document.getElementById("concept").value,
      color: document.getElementById("color").value,
      strict_safe: document.getElementById("strictSafe").checked,
    };

    const out = await postJson("/api/generate", payload);

    status.textContent = "Done ✅";
    meta.textContent = JSON.stringify(out.meta, null, 2);

    // PNG 预览（base64）
    preview.src = `data:image/png;base64,${out.png_base64}`;

    // SVG 链接
    svgLink.href = out.svg_url;
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
});