/** An explicit static build or a loopback-only preview; never inferred from server errors. */
export const isDemo = import.meta.env.VITE_PUBLIC_DEMO === 'true' ||
  (['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1');
export const demoSourceLabel = '公开官网摘录';
