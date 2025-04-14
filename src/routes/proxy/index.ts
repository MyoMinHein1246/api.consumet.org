import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';

const allowAll = process.env.PROXY_ALLOW_ALL || true;

"use server";

export async function proxyM3U8(masterUrl: string): Promise<string> {
    try {
        const response = await fetch(masterUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch master.m3u8: ${response.statusText}`);
        }

        const masterContent = await response.text();

        // Rewrite relative paths to absolute URLs using the proxy
        const proxyBaseUrl = "https://api-consumet-org-one-indol.vercel.app"?.replace(/\/+$/, "") || "";
        const rewrittenContent = masterContent.replace(
            /(URI=|,)(["']?)([^"'\n]+\.m3u8)/g,
            (_, prefix, quote, relativePath) =>
                `${prefix}${quote}${proxyBaseUrl}?url=${new URL(relativePath, masterUrl).toString()}`
        );

        return rewrittenContent;
    } catch (error) {
        console.error("Error rewriting master.m3u8:", error);
        throw error;
    }
}

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
    fastify.all('/', async (request: FastifyRequest, reply: FastifyReply) => {
        // Read allowed origins from environment variables
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');

        // Validate the Origin or Referer header
        const origin = request.headers.origin || request.headers.referer;

        if ((!origin || !allowedOrigins.some((allowed) => origin.startsWith(allowed))) && !allowAll) {
            return reply.status(403).send({ error: 'Access denied: Origin not allowed' });
        }

        const targetUrl = (request.query as { url?: string }).url as string;

        // Validate the target URL
        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
            return reply.status(400).send({ error: 'Invalid or missing target URL' });
        }

        try {
            // Prepare the options for the proxied request
            const proxyOptions: RequestInit = {
                method: request.method,
                headers: Object.fromEntries(
                    Object.entries(request.headers).filter(([_, value]) => typeof value === 'string') as [string, string][]
                ),
                redirect: 'manual',
            };

            // Remove the 'host' header to avoid conflicts
            if (proxyOptions.headers && typeof proxyOptions.headers === 'object') {
                delete (proxyOptions.headers as Record<string, string>).host;
            }

            // Include the request body for methods like POST, PUT, PATCH
            if (['POST', 'PUT', 'PATCH'].includes(request.method || '') && request.body) {
                proxyOptions.body =
                    typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
            }

            // Perform the proxied request
            const response = await fetch(targetUrl, proxyOptions);

            // Forward the response headers
            response.headers.forEach((value, key) => {
                if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
                    reply.header(key, value);
                }
            });

            // Ensure CORS headers are included
            reply.headers({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',

            });

            // Set the response status code
            reply.status(response.status);

            // Send the response body
            const responseBody = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';
            reply.type(contentType);

            return reply.send(responseBody);
        } catch (error: any) {
            return reply.status(500).send({ error: 'Error proxying request', details: error.message });
        }
    });
};

export default routes;