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
// Express 5 also invokes the listen callback on binding failure. Never present
// an occupied port as a successful start or leave an old service unnoticed.
const server=app.listen(port,host,(error?:Error)=>{
  if(error){
    const reason=(error as NodeJS.ErrnoException).code==='EADDRINUSE'?'端口已被占用，请关闭原服务或换一个端口。':'无法监听本机地址，请检查主机和端口配置。';
    process.stderr.write(`物有言启动失败（${host}:${port}）：${reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`物有言已启动：http://${host}:${port}（${production?'production':'development'}）\n`);
});
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
