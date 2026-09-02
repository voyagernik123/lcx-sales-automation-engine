FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
COPY packages/shared packages/shared
RUN npm run build -w @lcx/shared
COPY apps/api apps/api
RUN npm run build -w @lcx/api
# @lcx/shared exports point at TS source for dev; the runtime image needs compiled dist
RUN npm pkg set -w @lcx/shared main=./dist/index.js types=./dist/index.d.ts \
  'exports[.].types=./dist/index.d.ts' 'exports[.].import=./dist/index.js' 'exports[.].default=./dist/index.js'
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
USER app
EXPOSE 8787
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/index.js"]
