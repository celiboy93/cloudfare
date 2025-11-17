// main.ts
import {
  S3Client,
  PutObjectCommand,
} from "https://esm.sh/v135/npm:@aws-sdk/client-s3@^3.592.0";

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

  // --- 3A. Serve the HTML upload form ---
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <title>R2 Image Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: sans-serif; display: grid; place-items: center; min-height: 90vh; background: #f4f4f4; }
          div { background: #fff; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          input { margin-bottom: 1rem; }
          #result { margin-top: 1rem; word-break: break-all; }
          #warning { color: red; font-size: 0.9em; margin-top: 1rem; max-width: 300px; }
        </style>
      </head>
      <body>
        <div>
          <h2>Upload Photo to R2</h2>
          <form id="uploadForm">
            <input type="file" id="file" name="file" accept="image/*" required>
            <br>
            <button type="submit">Upload</button>
          </form>
          <div id="result"></div>
          <div id="warning"><b>Note:</b> This link is an R2 default domain. You may need a VPN to view it.</div>
        </div>
        <script>
          const form = document.getElementById('uploadForm');
          const resultDiv = document.getElementById('result');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('file');
            const file = fileInput.files[0];
            
            if (file) {
              resultDiv.textContent = 'Uploading...';
              const formData = new FormData();
              formData.append('file', file);
              
              try {
                const response = await fetch('/upload', {
                  method: 'POST',
                  body: formData,
                });
                
                if (response.ok) {
                  const data = await response.json();
                  resultDiv.innerHTML = \`Success! Direct Link: <br><a href="\${data.url}" target="_blank">\${data.url}</a>\`;
                } else {
                  const error = await response.text();
                  resultDiv.textContent = \`Error: \${error}\`;
                }
              } catch (err) {
                resultDiv.textContent = \`Network error: \${err.message}\`;
              }
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
    if (!R2_ACCOUNT_ID || !R2_PUBLIC_URL) {
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

      // Use the R2 Default Public URL
      const directLink = `https://${R2_PUBLIC_URL}/${fileName}`;

      return Response.json({ url: directLink });

    } catch (err) {
      console.error(err);
      return new Response(`Upload failed: ${err.message}`, { status: 500 });
    }
  }

  // --- 4. Return 404 for other paths ---
  return new Response("Not Found", { status: 404 });
});
