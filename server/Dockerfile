FROM node:22-slim

WORKDIR /app

# 只装后端依赖（express / cors / web-push / supabase）
COPY package*.json ./
RUN npm install --omit=dev

COPY index.js mcp.js ./

ENV NODE_ENV=production
EXPOSE 3001

# Railway 会自动注入 PORT 环境变量，index.js 读 process.env.PORT || 3001
CMD ["node", "index.js"]
