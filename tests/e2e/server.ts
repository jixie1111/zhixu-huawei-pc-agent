import path from 'node:path';
import { knowledgeFixture } from '../fixtures';

// Deliberately isolated from the developer's .env, knowledge and saved works.
const fixture = knowledgeFixture();
process.env.DOTENV_CONFIG_PATH = path.join(fixture.root, 'intentionally-no-env');
process.env.DATA_DIR = path.join(fixture.root, 'runtime');
process.env.KNOWLEDGE_DIR = fixture.root;
process.env.PUBLIC_DEPLOYMENT = 'false';
for (const name of ['IMA_OPENAPI_CLIENTID', 'IMA_OPENAPI_APIKEY', 'IMA_CLIENT_ID', 'IMA_API_KEY', 'LLM_API_KEY', 'LLM_MODEL', 'ADMIN_TOKEN']) process.env[name] = '';
// Non-empty fake values prevent config's optional home-directory credential fallback.
process.env.IMA_OPENAPI_CLIENTID = 'qa-browser-synthetic-account';
process.env.IMA_OPENAPI_APIKEY = 'qa-browser-never-used-secret';
const { createApp } = await import('../../server/app');
const { KnowledgeStore } = await import('../../server/knowledge');
const { RunStore } = await import('../../server/store');
const { ImaAdapter } = await import('../../server/ima');
const { createServer: createViteServer } = await import('vite');
const store = new RunStore(':memory:');
const ima = new ImaAdapter({ credentials: () => ({ clientId: '', imaKey: '', kbName: '仅QA合成库' }), call: async () => { throw new Error('QA browser server forbids external ima calls'); } });
const app = createApp({ knowledge: new KnowledgeStore(fixture.root), store, ima });
const vite = await createViteServer({ server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: 24679 } }, appType: 'spa' });
app.use(vite.middlewares);
const server = app.listen(3101, '127.0.0.1', () => process.stdout.write('QA synthetic-only browser server: http://127.0.0.1:3101\n'));
async function stop() {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await vite.close(); store.close(); fixture.cleanup(); process.exit(0);
}
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
