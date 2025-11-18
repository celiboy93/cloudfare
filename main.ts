// main.ts (V3.2 - FINAL STABLE CORE: Removes KV and Auth to prevent ISOLATE FAILURE)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { PutObjectCommand, S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "npm:@aws-sdk/client-s3@^3";

// --- CORE SECRETS (Only 5 R2 Keys needed now) ---
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL"); // This must be set!

// --- S3 CLIENT (Must be Top Level) ---
const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    },
});

// --- HELPER FUNCTIONS ---
// Simplest query format for APKs
const APK_QUERY = '?t=lugyiapk2025'; 

function mimeToExt(mimeType) {
  const mapping = {'video/mp4': 'mp4','video/webm': 'webm','image/jpeg': 'jpg','image/png': 'png','application/octet-stream': 'bin'};
  const simpleMime = mimeType.split(';')[0];
  return mapping[simpleMime] || 'bin';
}
function sanitizeFileName(name) {
  if (!name || name.trim() === "") return null;
  return name.replace(/\.[^/.]+$/, "").replace(/[?&#/\\]/g, "").replace(/[\s_]+/g, "-").trim() || null;
}
function generateLinks(host, fileName) {
    const proxyLink = `https://${host}/image/${fileName}${APK_QUERY}&play=true`;
    const downloadLink = `https://${host}/download/${fileName}${APK_QUERY}`;
    const r2Link = `https://${R2_PUBLIC_URL}/${fileName}`;

    return { proxyLink, downloadLink, r2Link };
}


// --- MAIN HANDLER LOGIC ---
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    // --- 1. UPLOADER PAGE (GET /) ---
    if (pathname === "/") {
        const generatedLinkParam = searchParams.get("generatedLink") || "";
        
        return new Response(getUploaderPageHTML(url.host, generatedLinkParam), { headers: { "Content-Type": "text/html; charset-utf-8" } });
    }

    // --- 2. LOCAL FILE UPLOAD HANDLER (POST /upload-file) ---
    if (pathname === "/upload-file" && method === "POST") {
        if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return new Response("R2 Config Missing", { status: 500 });
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const displayFilename = formData.get("displayFilename") as string;
        
        if (!file || !file.name || !displayFilename) return new Response("Missing file or filename.", { status: 400 });

        try {
            const r2Key = sanitizeFileName(displayFilename) || slugify(displayFilename); // Use simple slugify for safety
            const extension = mimeToExt(file.type);
            const fileName = `${r2Key}.${extension}`;
            
            const putCommand = new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
                Body: new Uint8Array(await file.arrayBuffer()),
                ContentType: file.type || "application/octet-stream",
            });
            await s3Client.send(putCommand);

            // Generate final link and redirect to success view
            const generatedLink = `${url.origin}/download/${fileName}?t=${url.searchParams.get('t')}`; // Send back a simple link
            return Response.redirect(`${url.origin}/?generatedLink=${encodeURIComponent(generatedLink)}`);

        } catch (e) {
             return new Response(`Upload Failed: ${e.message}`, { status: 500 });
        }
    }


    // --- 3. STREAM/DOWNLOAD PROXY ROUTE ---
    if (pathname.startsWith("/image/") || pathname.startsWith("/download/")) {
        if (!R2_PUBLIC_URL) return new Response("R2 Config Missing", { status: 500 });

        const isDownload = pathname.startsWith("/download/");
        const r2Key = pathname.substring(isDownload ? "/download/".length : "/image/".length);
        
        // *** Token Check (Essential for APK) ***
        if (searchParams.get("t") !== 'lugyiapk2025') {
            return new Response("Access Denied: Invalid stream token.", { status: 403 });
        }
        
        const sourceUrl = `https://${R2_PUBLIC_URL}/${r2Key}`;
        
        try {
            const range = req.headers.get("range");
            const fetchHeaders = new Headers();
            if (range) { fetchHeaders.set("range", range); }

            const videoResponse = await fetch(sourceUrl, { headers: fetchHeaders });
            if (!videoResponse.ok) return new Response("File not found.", { status: videoResponse.status });
            
            const responseHeaders = new Headers(videoResponse.headers);
            responseHeaders.set('Access-Control-Allow-Origin', '*');
            responseHeaders.set('Accept-Ranges', 'bytes');
            responseHeaders.set('Cache-Control', 'public, max-age=604800');
            
            // Final decision: Play or Download
            responseHeaders.set('Content-Disposition', isDownload 
                ? `attachment; filename="${r2Key}"` 
                : `inline; filename="${r2Key}"`);

            return new Response(videoResponse.body, { status: videoResponse.status, headers: responseHeaders });
        } catch (e) {
            return new Response("Error proxying the stream.", { status: 500 });
        }
    }

    return new Response("Not Found", { status: 404 });
}

serve(handler);

// --- HTML FUNCTIONS (For User Interface) ---

function getUploaderPageHTML(host: string, generatedLinkParam: string): string {
    const generatedLinkHTML = generatedLinkParam ? `
        <div class="result-box">
            <h3>Upload Complete!</h3>
            <p style="color: #28a745;">SUCCESS: File uploaded and secured.</p>
            <label>1. Stream Link (APK/Browser Play):</label>
            <div class="link-group"><input type="text" id="stream-link-input" value="${decodeURIComponent(generatedLinkParam)}&play=true" readonly><button onclick="copyLink('stream')">Copy</button></div>
            <label>2. Download Link (Force Download):</label>
            <div class="link-group"><input type="text" id="download-link-input" value="${decodeURIComponent(generatedLinkParam).replace('&play=true', '')}" readonly><button onclick="copyLink('download')">Copy</button></div>
        </div>
    ` : '';
    
    return `<!DOCTYPE html><html><head><title>R2 Uploader</title><style>
    body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:2rem;} .container{max-width:400px;margin:auto;} h2{color:#58a6ff;}
    .panel{background:#161b22;padding:2rem;border:1px solid #30363d;border-radius:8px;margin-bottom:2rem;} 
    input{padding:0.8rem;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:6px;width:100%;box-sizing:border-box;}
    .submit-btn{width:100%;padding:0.8rem;background:#238636;color:white;border:none;border-radius:6px;cursor:pointer;margin-top:1rem;}
    .result-box{background:#222;padding:1rem;border:1px solid #28a745; margin-top:1.5rem;}.link-group{display:flex;margin-top:0.5rem;}
    .link-group input{flex-grow:1;border-radius:6px 0 0 6px;font-size:0.9em;}.link-group button{border-radius:0 6px 6px 0;background:#007aff;}
    .error{color:#e43f5a;font-weight:bold;}
    </style>
    <script>
    function copyLink(id){
        const targetId = id === 'stream' ? 'stream-link-input' : 'download-link-input';
        const i=document.getElementById(targetId);
        i.select();
        navigator.clipboard.writeText(i.value).then(()=>{alert('Link copied!')});
    }
    </script>
    </head><body><div class="container">
    <h2>R2 File Uploader (Stable)</h2>
    <p class="error">${url.searchParams.get('error') || ''}</p>
    
    <div class="panel"><h3>Upload File from Device</h3>
        <form action="/upload-file" method="POST" enctype="multipart/form-data">
            <label>Select File (Video/Image):</label><input type="file" name="file" required>
            <label>Display Filename (e.g., Movie Name):</label><input type="text" name="displayFilename" placeholder="e.g., Movie-Name (ASCII ONLY)" required>
            <button type="submit" class="submit-btn">Start Local Upload</button>
        </form>
    </div>
    
    <div class="panel"><h3>Upload Remote URL</h3>
        <p style="font-size:0.9em; color:#bbb;">Note: Remote upload needs manual file name entry, then upload.</p>
        <form action="/generate" method="POST">
            <label>Original Remote URL:</label><input type="text" name="originalUrl" placeholder="MediaFire Premium Link" required>
            <label>Filename (e.g., movie-name.mp4):</label><input type="text" name="filename" placeholder="ASCII ONLY" required>
            <button type="submit" class="submit-btn" style="background:#555;">Start Remote Generation</button>
        </form>
    </div>
    
    ${generatedLinkHTML}
    </div></body></html>`;
}
