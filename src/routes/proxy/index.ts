import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';

const allowAll = process.env.PROXY_ALLOW_ALL || true;

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
    fastify.all('/', async (request: FastifyRequest, reply: FastifyReply) => {
        const allowedOrigins = [
            'https://anime-addict-anonymous.vercel.app',
            'http://localhost:3000', // Adjust this to your local development URL
            'http://127.0.0.1:3000',
        ];

        // Validate the Origin or Referer header
        const origin = request.headers.origin || request.headers.referer;
        if (!origin || (!allowedOrigins.some((allowed) => origin.startsWith(allowed)) && !allowAll)) {
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
            reply.header('Access-Control-Allow-Origin', '*');

            // Set the response status code
            reply.status(response.status);

            // Send the response body
            const responseBody = Buffer.from(await response.arrayBuffer());
            return reply.send(responseBody);
        } catch (error: any) {
            return reply.status(500).send({ error: 'Error proxying request', details: error.message });
        }
    });
};

export default routes;