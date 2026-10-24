import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router';

/* No store is registered yet — Pinia arrives with M1 item 4. */
createApp(App).use(router).mount('#app');
