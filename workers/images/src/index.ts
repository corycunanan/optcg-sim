/**
 * OPTCG Images Worker
 *
 * Proxies card images from the R2 bucket and sets
 * Cross-Origin-Resource-Policy: cross-origin so browsers
 * can load images from any origin (needed for Vercel-hosted app).
 *
 * Deploy: pnpm worker:deploy (from project root)
 */

interface Env {
  IMAGES_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only allow GET
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    // Strip leading slash → R2 key (e.g. "/cards/OP01-001.webp" → "cards/OP01-001.webp")
    const key = url.pathname.replace(/^\//, "");

    if (!key) {
      return new Response("Not Found", { status: 404 });
    }

    const object = await env.IMAGES_BUCKET.get(key);

    if (!object) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  },
} satisfies ExportedHandler<Env>;
