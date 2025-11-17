// main.ts
import {
  S3Client,
  PutObjectCommand,
} from "npm:@aws-sdk/client-s3";

// --- 1. Get Secrets from Deno Deploy Environment Variables ---
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

// --- 2. Create S3 Client for R2 ---
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

  // --- 3A. Serve the NEW Beautiful HTML upload form ---
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <title>R2 Image Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          :root {
            --bg: #222;
            --card-bg: #333;
            --text: #eee;
            --text-dim: #999;
            --accent: #007aff;
            --accent-hover: #0056b3;
            --success: #34C759;
            --error: #FF3B30;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: grid;
            place-items: center;
            min-height: 100vh;
            margin: 0;
            background: var(--bg);
            color: var(--text);
          }
          .container {
            width: 90%;
            max-width: 400px;
            background: var(--card-bg);
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            text-align: center;
          }
          h2 {
            margin-top: 0;
            color: var(--text);
          }
          #uploadForm {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }
          #file {
            display: none;
          }
          #fileLabel {
            display: block;
            padding: 1rem;
            border: 2px dashed var(--text-dim);
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
          }
          #fileLabel:hover {
            background: rgba(255,255,255,0.05);
          }
          #fileName {
            font-size: 0.9em;
            color: var(--text-dim);
          }
          #submitBtn {
            font-size: 1rem;
            padding: 0.8rem;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
          }
          #submitBtn:hover {
            background: var(--accent-hover);
          }
          #submitBtn:disabled {
            background: var(--text-dim);
            cursor: not-allowed;
          }
          #result {
            margin-top: 1.5rem;
            word-break: break-all;
            line-height: 1.5;
          }
          #result a {
            color: var(--accent);
            text-decoration: none;
          }
          .success { color: var(--success); }
          .error { color: var(--error); }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Upload Photo to R2</h2>
          <form id="uploadForm">
            <label for="file" id="fileLabel">
              Click to select image
              <div id="fileName">No file chosen</div>
            </label>
            <input type="file" id="file" name="file" accept="image/*" required>
            <button type="submit" id="submitBtn" disabled>Upload</button>
          </form>
          <div id="result"></div>
        </div>
        <script>
          const form = document.getElementById('uploadForm');
          const fileInput = document.getElementById('file');
          const fileLabel = document.getElementById('fileLabel');
          const fileNameDiv = document.getElementById('fileName');
          const submitBtn = document.getElementById('submitBtn');
          const resultDiv = document.getElementById('result');

          fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
              fileNameDiv.textContent = fileInput.files[0].name;
              submitBtn.disabled = false;
            } else {
              fileNameDiv.textContent = 'No file chosen';
              submitBtn.disabled = true;
            }
          });

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            if (!file) return;

            resultDiv.textContent = 'Uploading...';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading...';

            const formData = new FormData();
            formData.append('file', file);
            
            try {
              const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
              });
              
              if (response.ok) {
                const data = await response.json();
                resultDiv.innerHTML = \`<span class="success">Success! Link (No VPN):</span> <br><a href="\${data.url}" target="_blank">\${data.url}</a>\`;
              } else {
                const error = await response.text();
                resultDiv.innerHTML = \`<span class="error">Error: \${error}</span>\`;
              }
            } catch (err) {
              resultDiv.innerHTML = \`<span class="error">Network error: \${err.message}</span>\`;
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Upload';
            }
          });
        </script>
      </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // --- 3B. Handle the file upload (POST) ---
  if (req.method === "POST" && url.pathname === "/upload") {
    if (!R2_ACCOUNT_ID || !R2_PUBLIC_URL || !R2_BUCKET_NAME) {
      return new Response("R2 Environment Variables are not configured.", { status: 500 });
    }

    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return new Response("No file found.", { status: 400 });

      const fileBuffer = await file.arrayBuffer();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `${crypto.randomUUID()}.${fileExtension}`;

      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: new Uint8Array(fileBuffer),
        ContentType: file.type,
      });

      await s3Client.send(putCommand);

      // *** CHANGE ***
      // Return the PROXY link (Deno link) instead of the R2 link
      const selfHost = url.host; // This gets "your-project.deno.dev"
      const directLink = `https://${selfHost}/image/${fileName}`;

      return Response.json({ url: directLink });

    } catch (err) {
      console.error(err);
      return new Response(`Upload failed: ${err.message}`, { status: 500 });
    }
  }

  // --- 3C. *** NEW *** Handle the Proxy Request (GET) ---
  if (req.method === "GET" && url.pathname.startsWith("/image/")) {
    if (!R2_PUBLIC_URL) {
      return new Response("R2_PUBLIC_URL not set.", { status: 500 });
    }

    // Get "image.jpg" from "/image/image.jpg"
    const fileName = url.pathname.substring("/image/".length);
    if (!fileName) {
      return new Response("File name not specified.", { status: 400 });
    }

    // This is the R2 link (that needs VPN)
    const r2Url = `https://${R2_PUBLIC_URL}/${fileName}`;

    try {
      // Deno server fetches the image from R2 (server-to-server)
      const r2Response = await fetch(r2Url);

      if (!r2Response.ok) {
        return new Response("Image not found on storage.", { status: r2Response.status });
      }

      // Send the image data (r2Response.body) back to the user
      // Copy important headers like Content-Type
      const headers = new Headers();
      headers.set("Content-Type", r2Response.headers.get("Content-Type") || "application/octet-stream");
      headers.set("Content-Length", r2Response.headers.get("Content-Length") || "0");
      // Add a cache header so the browser doesn't re-download it
      headers.set("Cache-Control", "public, max-age=604800"); // 7 days

      return new Response(r2Response.body, {
        status: 200,
        headers: headers,
      });

    } catch (err) {
      console.error(err);
      return new Response("Proxy failed.", { status: 500 });
    }
  }

  // --- 4. Return 404 for other paths ---
  return new Response("Not Found", { status: 404 });
});
