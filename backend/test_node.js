const http = require('http');

const data = JSON.stringify({ username: 'demo@finance-ai.pt', password: 'password' });

const options = {
  hostname: '127.0.0.1',
  port: 8000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Login Response:', res.statusCode, body);
    if (res.statusCode === 200) {
      const token = JSON.parse(body).access_token;
      testEndpoints(token);
    }
  });
});

req.write('username=demo%40finance-ai.pt&password=password');
req.end();

function testEndpoints(token) {
  const endpoints = [
    '/api/v1/dashboard/summary',
    '/api/v1/reports/income-statement?period=2026-T3',
    '/api/v1/fiscal/vat-position?period=2026-T3',
    '/api/v1/retentions/position'
  ];

  endpoints.forEach(ep => {
    http.get({
      hostname: '127.0.0.1',
      port: 8000,
      path: ep,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Company-Id': 'COMP001'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[${res.statusCode}] ${ep}`);
        if (res.statusCode !== 200) console.log(body);
      });
    });
  });
}
