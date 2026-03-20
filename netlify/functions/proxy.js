const https = require('https');
const http = require('http');
const { URL } = require('url');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // Get ollama URL from query param or header
  const ollamaUrl = (event.queryStringParameters && event.queryStringParameters.target) 
    || event.headers['x-ollama-url'] 
    || 'http://localhost:11434';

  // Extract path after /proxy
  const path = event.path.replace('/.netlify/functions/proxy', '') || '/api/tags';
  const fullUrl = `${ollamaUrl}${path}`;

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(fullUrl);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: event.httpMethod,
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: {
              'Content-Type': res.headers['content-type'] || 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: data
          });
        });
      });

      req.on('error', (e) => {
        resolve({
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: e.message })
        });
      });

      if (event.body && event.httpMethod === 'POST') {
        req.write(event.body);
      }

      req.end();
    } catch(e) {
      resolve({
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: e.message })
      });
    }
  });
};
