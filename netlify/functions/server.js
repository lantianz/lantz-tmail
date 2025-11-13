exports.handler = async (event, context) => {
  try {
    // 动态导入 ES modules
    const { default: app } = await import('../../dist/index.js');
    
    const { httpMethod, path, headers, body, queryStringParameters } = event;
    
    // 构建标准的 Request 对象
    const url = new URL(path, `https://${headers.host || 'localhost'}`);
    if (queryStringParameters) {
      Object.entries(queryStringParameters).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    
    const request = new Request(url.toString(), {
      method: httpMethod,
      headers: headers,
      body: body && httpMethod !== 'GET' && httpMethod !== 'HEAD' ? body : undefined,
    });
    
    // 调用 Hono app
    const response = await app.fetch(request);
    const responseBody = await response.text();
    
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody
    };
  } catch (error) {
    console.error('Netlify function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      })
    };
  }
}; 