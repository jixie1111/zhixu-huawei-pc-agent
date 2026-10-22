FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 PUBLIC_DEPLOYMENT=true DATA_DIR=/mnt/workspace/zhixu PUBLISHED_DATA_DIR=/app/published-data PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
ENV PUBLIC_ORIGIN=https://jixie1111-zhixu-huawei-pc-demo.ms.show FRAME_ANCESTORS=https://modelscope.cn,https://www.modelscope.cn
WORKDIR /app
# tsx is the TypeScript server runtime; keep the locked installation.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/published-data ./published-data
COPY --from=build /root/.cache/ms-playwright /opt/playwright
RUN npx playwright install-deps chromium && apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /mnt/workspace/zhixu && chown -R node:node /mnt/workspace/zhixu
USER node
EXPOSE 7860
CMD ["npm", "start"]
