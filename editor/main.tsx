import React from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
const App = React.lazy(() => import('./App').then(module => ({default: module.App})));
const MotionReviewPage = React.lazy(() => import('./MotionReviewPage').then(module => ({default: module.MotionReviewPage})));
const reviewing = /^\/motion-review\/?$/.test(location.pathname);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div style={{padding: 32}}>正在打开工作台…</div>}>
      {reviewing ? <MotionReviewPage /> : <App />}
    </React.Suspense>
  </React.StrictMode>,
);
