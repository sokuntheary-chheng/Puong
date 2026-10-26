# Puong API — NestJS + Prisma.
#
# The build context is the *repository root*, not api/: the seed script reads
# web/src/mock/db.json so the database and the prototype's mock cannot drift
# apart, and that file has to be in the image for `npm run seed` to work.

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY api/package*.json ./
COPY api/prisma ./prisma
RUN npm ci

COPY api/tsconfig.json api/tsconfig.build.json api/nest-cli.json ./
COPY api/src ./src
RUN npx prisma generate && npm run build

# --- runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim

WORKDIR /app

COPY api/package*.json ./
COPY api/prisma ./prisma
# Production dependencies for the server, plus the two tools the container
# still needs: the Prisma CLI for `migrate deploy` and `tsx` for the seed.
# `--no-save` keeps them out of the package.json inside the image, so the
# lockfile the image was built from stays the one that was tested.
RUN npm ci --omit=dev && npm install --no-save prisma@6 tsx@4

# Set *after* the install above: npm maps NODE_ENV=production to `omit=dev`,
# which made `npm install --no-save tsx@4` skip tsx (it is a devDependency in
# package.json) and broke `npx prisma db seed` with `spawn tsx ENOENT`.
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
# The seed resolves db.json as `prisma/../../web/src/mock/db.json` — two levels
# above prisma/, i.e. the repo root's sibling of api/. In this image api/ is
# /app, so the repo root is /: the file has to land at /web/..., not /app/web/...
COPY web/src/mock/db.json /web/src/mock/db.json

EXPOSE 3000

# Migrations on start, then the API. Migrations are idempotent; seeding is
# not, so it is a separate command (see docker-compose.yml).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
