import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import { MOVIES } from '@consumet/extensions';
import { StreamingServers } from '@consumet/extensions/dist/models';

import cache from '../../utils/cache';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const sflix = new MOVIES.SFlix();

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro:
        "Welcome to the sflix provider: check out the provider's website @ https://sflix.to/",
      routes: ['/:query', '/info', '/watch', '/recent-shows', '/recent-movies', '/trending', '/servers', '/country', '/genre'],
      documentation: 'https://docs.consumet.org/#tag/sflix',
    });
  });

  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = decodeURIComponent((request.params as { query: string }).query);

    const page = (request.query as { page: number }).page;

    let res = await cache.fetch(
      `sflix:${query}:${page}`,
      async () => await sflix.search(query, page ? page : 1),
      60 * 60 * 6,
    )

    reply.status(200).send(res);
  });

  fastify.get('/recent-shows', async (request: FastifyRequest, reply: FastifyReply) => {
    let res = await cache.fetch(
      `sflix:recent-shows`,
      async () => await sflix.fetchRecentTvShows(),
      60 * 60 * 3,
    )

    reply.status(200).send(res);
  });

  fastify.get('/recent-movies', async (request: FastifyRequest, reply: FastifyReply) => {
    let res = await cache.fetch(
      `sflix:recent-movies`,
      async () => await sflix.fetchRecentMovies(),
      60 * 60 * 3,
    )

    reply.status(200).send(res);
  });

  fastify.get('/trending', async (request: FastifyRequest, reply: FastifyReply) => {
    const type = (request.query as { type: string }).type;
    try {
      if (!type) {
        const res = {
          results: [
            ...(await sflix.fetchTrendingMovies()),
            ...(await sflix.fetchTrendingTvShows()),
          ],
        };
        return reply.status(200).send(res);
      }

      let res = await cache.fetch(
        `sflix:trending:${type}`,
        async () =>
          type === 'tv'
            ? await sflix.fetchTrendingTvShows()
            : await sflix.fetchTrendingMovies(),
        60 * 60 * 3,
      )

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id: string }).id;

    if (typeof id === 'undefined')
      return reply.status(400).send({
        message: 'id is required',
      });

    try {
      let res = await cache.fetch(
        `sflix:info:${id}`,
        async () => await sflix.fetchMediaInfo(id),
        60 * 60 * 3,
      )

      reply.status(200).send(res);
    } catch (err) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get('/watch', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId: string }).episodeId;
    const mediaId = (request.query as { mediaId: string }).mediaId;
    const server = (request.query as { server: StreamingServers }).server;

    if (typeof episodeId === 'undefined')
      return reply.status(400).send({ message: 'episodeId is required' });
    if (typeof mediaId === 'undefined')
      return reply.status(400).send({ message: 'mediaId is required' });

    if (server && !Object.values(StreamingServers).includes(server))
      return reply.status(400).send({ message: 'Invalid server query' });

    try {
      let res = await cache.fetch(
        `sflix:watch:${episodeId}:${mediaId}:${server}`,
        async () => await sflix.fetchEpisodeSources(episodeId, mediaId, server),
        60 * 30,
      )

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId: string }).episodeId;
    const mediaId = (request.query as { mediaId: string }).mediaId;

    if (typeof episodeId === 'undefined')
      return reply.status(400).send({ message: 'episodeId is required' });
    if (typeof mediaId === 'undefined')
      return reply.status(400).send({ message: 'mediaId is required' });

    try {
      let res = await cache.fetch(
        `sflix:servers:${episodeId}:${mediaId}`,
        async () => await sflix.fetchEpisodeServers(episodeId, mediaId),
        60 * 30,
      )

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get('/country/:country', async (request: FastifyRequest, reply: FastifyReply) => {
    const country = (request.params as { country: string }).country;
    const page = (request.query as { page: number }).page ?? 1;
    try {
      let res = await cache.fetch(
        `sflix:country:${country}:${page}`,
        async () => await sflix.fetchByCountry(country, page),
        60 * 60 * 3,
      )

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });


  fastify.get('/genre/:genre', async (request: FastifyRequest, reply: FastifyReply) => {
    const genre = (request.params as { genre: string }).genre;
    const page = (request.query as { page: number }).page ?? 1;
    try {
      let res = await cache.fetch(
        `sflix:genre:${genre}:${page}`,
        async () => await sflix.fetchByGenre(genre, page),
        60 * 60 * 3,
      )

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });
};
export default routes;
