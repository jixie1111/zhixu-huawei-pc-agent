FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsx scripts/install-ima.ts --download --target /opt/ima
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 PUBLIC_DEPLOYMENT=true DATA_DIR=/mnt/workspace/zhixu IMA_SKILL_PATH=/opt/ima/ima_api.cjs
WORKDIR /app
# tsx is the TypeScript server runtime; keep the locked installation.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/prompts ./prompts
COPY --from=build /opt/ima /opt/ima
RUN mkdir -p /mnt/workspace/zhixu && chown -R node:node /mnt/workspace/zhixu
USER node
EXPOSE 7860
CMD ["npm", "start"]
