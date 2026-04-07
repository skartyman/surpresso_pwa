import { createApp } from './app/createApp.js';
import { config } from './config/env.js';

const app = await createApp();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Surpresso Mini App API started on 0.0.0.0:${config.port}`);
});
