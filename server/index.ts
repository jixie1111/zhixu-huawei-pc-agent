import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app';
import { publicDeployment } from './config';

const app=createApp();
const production=process.argv.includes('--production')||process.env.NODE_ENV==='production';
if(production){app.use(express.static(path.resolve('dist'),{dotfiles:'deny'}));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
else{const vite=await createViteServer({server:{middlewareMode:true,host:'127.0.0.1'},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT)||3000;
const host=process.env.HOST||(publicDeployment?'0.0.0.0':'127.0.0.1');
const server=app.listen(port,host,()=>process.stdout.write(`知序已启动：http://${host}:${port}（${production?'production':'development'}）\n`));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
