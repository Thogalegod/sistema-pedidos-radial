import https from 'https';
import fs from 'fs';

const supabaseUrl = 'https://iurqgskfuupslrghgtej.supabase.co';
const anonKey = 'sb_publishable_n7-pv8Cy4qAF6qvVYROgSA_GYPp9Nd6';

const options = {
  hostname: 'iurqgskfuupslrghgtej.supabase.co',
  path: '/rest/v1/?apikey=' + anonKey,
  headers: {
    'Accept': 'application/openapi+json'
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('schema.json', data);
  });
});
