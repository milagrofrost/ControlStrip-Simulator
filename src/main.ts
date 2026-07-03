import './style.css';
import { createControlStrip } from './ControlStrip';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = '';
document.body.append(createControlStrip());
