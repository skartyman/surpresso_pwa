import { createApp } from './app/createApp.js';
import { config } from './config/env.js';

const app = await createApp();

app.listen(config.port, () => {
  console.log(`Surpresso Mini App API started on :${config.port}`);
});
