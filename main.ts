// main.ts (v1.7 - Final Clean Version, Removed Storage Usage)
import {
  S3Client,
  PutObjectCommand,
  UploadPartCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
} from "npm:@aws-sdk/client-s3";

// --- 1. Get Secrets from Deno Deploy Environment Variables ---
// We ONLY need the original 5 secrets for R2 S3 operations
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

// --- 2. Create S3 Client for R2 ---
// This client only needs the R2_ACCOUNT_ID
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

// --- 3. Start the Web Server ---
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- 3A. Serve the HTML (Storage feature is removed) ---
  if (req.method === "GET" && url.pathname === "/") {
    
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <title>R2 Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          :root {
            --bg: #1a1a1a; --card-bg: #2a2a2a; --text: #f0f0f0; --text-dim: #888;
            --accent: #007aff; --accent-hover: #0056b3; --success: #34C759; --error: #FF3B30;
            --tab-inactive: #444; --border: #333; --progress-bg: #444; --input-bg: #1f1f1f;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: grid; place-items: center; min-height: 100vh; margin: 0;
            background: var(--bg); color: var(--text);
          }
          .container {
            width: 90%; max-width: 420px; background: var(--card-bg);
            padding: 1.5rem 2rem 2rem 2rem; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          }
          h2 { text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
          
          .tab-buttons { display: flex; border-bottom: 2px solid var(--border); margin-bottom: 1.5rem; }
          .tab-btn {
            flex: 1; padding: 0.8rem; background: none; border: none; color: var(--text-dim);
            font-size: 1rem; cursor: pointer; border-bottom: 3px solid transparent;
          }
          .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          form { display: flex; flex-direction: column; gap: 1.5rem; }
          #fileLabel {
            display: block; padding: 1.5rem 1rem; border: 2px dashed var(--text-dim);
            border-radius: 8px; cursor: pointer; text-align: center; transition: background 0.2s;
          }
          #fileLabel:hover { background: rgba(255,255,255,0.05); }
          #fileName { font-size: 0.9em; color: var(--text-dim); margin-top: 0.5rem; }
          #urlInput {
            font-size: 1rem; padding: 0.8rem; background: var(--bg); border: 1px solid var(--border);
            border-radius: 8px; color: var(--text);
          }
          .submitBtn {
            font-size: 1rem; padding: 0.9rem; background: var(--accent); color: white;
            border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s;
          }
          .submitBtn:hover { background: var(--accent-hover); }
          .submitBtn:disabled { background: var(--text-dim); cursor: not-allowed; }
          
          #progress-container { display: none; margin-top: 1rem; }
          #progress-bar-outer { width: 100%; background: var(--progress-bg); border-radius: 5px; overflow: hidden; }
          #progress-bar-inner {
            height: 10px; background: var(--accent); border-radius: 5px;
            width: 0%; transition: width 0.2s ease-out;
          }
          #progress-text { text-align: center; margin-top: 5px; font-size: 0.9em; color: var(--text-dim); }
          #progress-bar-inner.indeterminate {
            width: 100% !important;
            background: linear-gradient(90deg, var(--accent-hover) 0%, var(--accent) 50%, var(--accent-hover) 100%);
            background-size: 200% 100%;
            animation: indeterminate-scroll 1.5s linear infinite;
          }
          @keyframes indeterminate-scroll {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          
          #result { margin-top: 1.5rem; width: 100%; }
          .success { color: var(--success); text-align: center; display: block; margin-bottom: 1rem; }
          .error { color: var(--error); text-align: center; display: block; word-break: break-all;}
          
          .links-container { display: flex; flex-direction: column; gap: 0.75rem; }
          .link-box { display: flex; flex-direction: column; gap: 0.5rem; }
          .link-box strong { font-size: 0.9em; color: var(--text-dim); }
          .link-input-group { display: flex; }
          .link-box input[type="text"] {
            flex: 1; font-size: 0.9rem; padding: 0.5rem; background: var(--input-bg);
            border: 1px solid var(--border); border-right: none;
            color: var(--text); border-radius: 4px 0 0 4px;
        }
          .copy-btn {
            font-size: 0.9rem; padding: 0 0.75rem; background: var(--accent); color: white;
            border: 1px solid var(--accent); border-radius: 0 4px 4px 0; cursor: pointer;
          }
          .copy-btn:hover { background: var(--accent-hover); }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>R2 Uploader</h2>
          
          <div class="tab-buttons">
            <button class="tab-btn active" data-tab="file">Upload File</button>
            <button class="tab-btn" data-tab="url">Remote URL</button>
          </div>

          <div id="tab-file" class="tab-content active">
            <form id="fileUploadForm">
              <label for="file" id="fileLabel">
                Click to select file
                <div id="fileName">No file chosen</div>
              </label>
              <input type="file" id="file" name="file" style="display:none;" required>
              <button type="submit" id="fileSubmitBtn" class="submitBtn" disabled>Upload File</button>
            </form>
          </div>
          
          <div id="tab-url" class="tab-content">
            <form id="urlUploadForm">
              <input type="url" id="urlInput" placeholder="Enter remote URL (http://...)" required>
              <button type="submit" id="urlSubmitBtn" class="submitBtn">Upload from URL</button>
            </form>
          </div>

          <div id="progress-container">
            <div id="progress-bar-outer">
              <div id="progress-bar-inner"></div>
            </div>
            <div id="progress-text">0%</div>
          </div>
          
          <div id="result"></div>
        </div>
        
        <script>
          const resultDiv = document.getElementById('result');
          const progressContainer = document.getElementById('progress-container');
          const progressBar = document.getElementById('progress-bar-inner');
          const progressText = document.getElementById('progress-text');
          
          document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
              document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
              resetUI();
            });
          });
          
          document.body.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
              const inputField = e.target.previousElementSibling;
              if (inputField) {
                inputField.select();
                try {
                  navigator.clipboard.writeText(inputField.value);
                  e.target.textContent = 'Copied!';
                  setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
                } catch (err) { console.error('Copy failed', err); }
              }
            }
          });

          const fileForm = document.getElementById('fileUploadForm');
          const fileInput = document.getElementById('file');
          const fileNameDiv = document.getElementById('fileName');
          const fileSubmitBtn = document.getElementById('fileSubmitBtn');

          fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
              fileNameDiv.textContent = fileInput.files[0].name;
              fileSubmitBtn.disabled = false;
            } else {
              fileNameDiv.textContent = 'No file chosen';
              fileSubmitBtn.disabled = true;
            }
            resetUI();
          });

          fileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            if (!file) return;
            setLoading(fileSubmitBtn, 'Uploading...', true);
            showProgress(0, '0%');
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload-file');
            xhr.upload.addEventListener('progress', (event) => {
              if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                showProgress(percent, percent + '%');
              }
            });
            xhr.addEventListener('load', () => {
              hideProgress();
              setLoading(fileSubmitBtn, 'Upload File', false);
              try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status === 200) {
                  setResult(data);
                } else {
                  setResult(data.error, 'error');
                }
              } catch (err) {
                setResult(\`Server error: \${xhr.responseText}\`, 'error');
              }
            });
            xhr.addEventListener('error', () => {
              hideProgress();
              setLoading(fileSubmitBtn, 'Upload File', false);
              setResult('Upload failed. Network error.', 'error');
            });
            xhr.send(formData);
          });

          const urlForm = document.getElementById('urlUploadForm');
          const urlInput = document.getElementById('urlInput');
          const urlSubmitBtn = document.getElementById('urlSubmitBtn');

          urlForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = urlInput.value;
            if (!url) return;
            setLoading(urlSubmitBtn, 'Uploading...', true);
            showProgress(100, 'Uploading from remote URL...', true);
            try {
              const response = await fetch('/upload-remote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
              });
              const data = await response.json();
              if (response.ok) {
                setResult(data);
              } else {
                setResult(data.error, 'error');
              }
            } catch (err) {
              setResult(\`Network error: \${err.message}\`, 'error');
            } finally {
              hideProgress();
              setLoading(urlSubmitBtn, 'Upload from URL', false);
            }
          });

          function setLoading(button, text, disabled = true) {
            button.disabled = disabled;
            button.textContent = text;
          }
          
          function setResult(data, type = 'success') {
            if (type === 'error') {
              resultDiv.innerHTML = \`<span class="error">\${data}</span>\`;
            } else {
              resultDiv.innerHTML = \`
                <span class="success">Upload Complete!</span>
                <div classs="links-container">
                  <div class="link-box">
                    <strong>No VPN (Proxy Link)</strong>
                    <div class="link-input-group">
                      <input type="text" value="\${data.proxyUrl}" readonly>
                      <button class="copy-btn">Copy</button>
                    </div>
                  </div>
                  <div class="link-box">
                    <strong>R2 Original (VPN may be needed)</strong>
                    <div class="link-input-group">
                      <input type="text" value="\${data.r2Url}" readonly>
                      <button class="copy-btn">Copy</button>
                    </div>
                  </div>
                </div>
              \`;
            }
          }
          
          function showProgress(percent, text, indeterminate = false) {
            progressContainer.style.display = 'block';
            progressBar.style.width = percent + '%';
            progressText.textContent = text;
            if (indeterminate) {
              progressBar.classList.add('indeterminate');
            } else {
              progressBar.classList.remove('indeterminate');
            }
          }
          
          function hideProgress() {
            progressContainer.style.display = 'none';
          }
          
          function resetUI() {
            resultDiv.innerHTML = '';
            hideProgress();
          }
        </script>
      </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // --- 3B. Handle File Upload (from computer) ---
  // (Server-side code is UNCHANGED from v1.3)
  if (req.method === "POST" && url.pathname === "/upload-file") {
    if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return Response.json({ error: "R2 Environment Variables not set." }, { status: 500 });
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return Response.json({ error: "No file found." }, { status: 400 });
      const fileBuffer = await file.arrayBuffer();
      const originalName = file.name || "file.bin";
      const extension = originalName.includes('.') ? originalName.split('.').pop() : "bin";
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: new Uint8Array(fileBuffer),
        ContentType: file.type,
      });
      await s3Client.send(putCommand);
      const proxyLink = `https://${url.host}/image/${fileName}`;
      const r2Link = `https://${R2_PUBLIC_URL}/${fileName}`;
      return Response.json({ proxyUrl: proxyLink, r2Url: r2Link });
    } catch (err) {
      console.error("File Upload Error:", err);
      return Response.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
    }
  }

  // --- 3C. Handle Remote URL Upload ---
  // (Server-side code is UNCHANGED from v1.3)
  if (req.method === "POST" && url.pathname === "/upload-remote") {
    if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return Response.json({ error: "R2 Environment Variables not set." }, { status: 500 });
    try {
      const { url: remoteUrl } = await req.json();
      if (!remoteUrl) return Response.json({ error: "No URL provided." }, { status: 400 });
      const remoteResponse = await fetch(remoteUrl);
      if (!remoteResponse.ok) {
        return Response.json({ error: `Remote server error: ${remoteResponse.status}` }, { status: 400 });
      }
      if (!remoteResponse.body) {
        return Response.json({ error: "Remote file has no content." }, { status: 400 });
      }
      const originalName = new URL(remoteUrl).pathname.split('/').pop() || "remote-file.bin";
      const extension = originalName.includes('.') ? originalName.split('.').pop() : "bin";
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const contentType = remoteResponse.headers.get("Content-Type") || "application/octet-stream";
      const createUpload = await s3Client.send(
        new CreateMultipartUploadCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          ContentType: contentType,
        })
      );
      const uploadId = createUpload.UploadId;
      if (!uploadId) throw new Error("Failed to create multipart upload.");
      const parts: { ETag: string; PartNumber: number }[] = [];
      const reader = remoteResponse.body.getReader();
      const partSize = 10 * 1024 * 1024; // 10MB parts
      let partNumber = 1;
      let buffer = new Uint8Array(0);
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
        }
        while (buffer.length >= partSize) {
          const partData = buffer.slice(0, partSize);
          buffer = buffer.slice(partSize);
          const uploadPart = await s3Client.send(
            new UploadPartCommand({
              Bucket: R2_BUCKET_NAME, 
              Key: fileName,
              UploadId: uploadId,
              PartNumber: partNumber,
              Body: partData,
            })
          );
          parts.push({ ETag: uploadPart.ETag!, PartNumber: partNumber });
          partNumber++;
        }
        if (done) {
          if (buffer.length > 0) {
            const uploadPart = await s3Client.send(
              new UploadPartCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: buffer,
              })
            );
            parts.push({ ETag: uploadPart.ETag!, PartNumber: partNumber });
          }
          break;
        }
      }
      await s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      );
      const proxyLink = `https://${url.host}/image/${fileName}`;
      const r2Link = `https://${R2_PUBLIC_URL}/${fileName}`;
      return Response.json({ proxyUrl: proxyLink, r2Url: r2Link });
    } catch (err) {
      console.error("Remote Upload Error:", err);
      return Response.json({ error: `Remote upload failed: ${err.message}` }, { status: 500 });
    }
  }

  // --- 3D. Handle the Proxy Request (GET) ---
  // (Server-side code is UNCHANGED from v1.3)
  if (req.method === "GET" && url.pathname.startsWith("/image/")) {
    if (!R2_PUBLIC_URL) {
      return new Response("R2_PUBLIC_URL not set.", { status: 500 });
    }
    const fileName = url.pathname.substring("/image/".length);
    if (!fileName) {
      return new Response("File name not specified.", { status: 400 });
    }
    const r2Url = `https://${R2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;
    try {
      const r2Response = await fetch(r2Url);
      if (!r2Response.ok) {
        return new Response("Image not found on storage.", { status: r2Response.status });
      }
      const headers = new Headers();
      headers.set("Content-Type", r2Response.headers.get("Content-Type") || "application/octet-stream");
      headers.set("Content-Length", r2Response.headers.get("Content-Length") || "0");
      headers.set("Cache-Control", "public, max-age=604800"); // 7 days
      return new Response(r2Response.body, {
        status: 200,
        headers: headers,
      });
    } catch (err) {
      console.error("Proxy Error:", err);
      return new Response("Proxy failed.", { status: 500 });
    }
  }

  // --- 4. Return 404 for other paths ---
  return new Response("Not Found", { status: 404 });
});
