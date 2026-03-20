const https = require('https');
const http = require('http');
const { URL } = require('url');

exports.handler = async function(event) {
  // Manejo de CORS preflight
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

  // Obtener la URL base de Ollama desde el header
  const ollamaUrl = event.headers['x-ollama-url'] || 'http://localhost:11434';

  // Extraer el path real: quitar el prefijo de la función de Netlify
  // El path llega como /.netlify/functions/proxy/api/tags o similar
  let path = event.path
    .replace('/.netlify/functions/proxy', '')
    .replace('/ollama', ''); // por si llega por el redirect
  if (!path || path === '') path = '/api/tags';

  const fullUrl = `${ollamaUrl}${path}`;

  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(fullUrl);
    } catch(e) {
      return resolve({
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'URL inválida: ' + fullUrl })
      });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'  // siempre skip el warning de ngrok
      },
      // Tiempo máximo de espera: 2 minutos (para respuestas largas del modelo)
      timeout: 120000
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

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Timeout: Ollama tardó demasiado en responder.' })
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
  });
};
