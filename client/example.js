/**
 * HAD 客户端使用示例
 * 展示如何在实际项目中集成HAD客户端
 */

// ============ 浏览器环境示例 ============

// 1. 基础使用 - 获取路由并发起请求
async function basicExample() {
  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod'
  });

  try {
    // 获取路由信息（自动缓存管理）
    const route = await client.getRoute();
    
    // 选择端点
    const endpoint = client.selectEndpoint(route.endpoints);
    
    if (!endpoint) {
      console.error('无可用端点');
      return;
    }

    // 发起业务请求
    const response = await fetch(endpoint.url + '/api/users');
    const data = await response.json();
    
    console.log('用户数据:', data);
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

// 2. 故障处理 - 检测服务端宕机并重新路由
async function faultHandlingExample() {
  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod'
  });

  try {
    const route = await client.getRoute();
    const endpoint = client.selectEndpoint(route.endpoints);

    // 发起请求
    const response = await fetch(endpoint.url + '/api/users');

    // 检查HTTP响应状态
    if (client.isServerFaultResponse(response.status)) {
      console.warn('检测到服务端故障 (HTTP ' + response.status + ')');
      
      // 清除缓存，强制重新请求路由
      client.clearCache();
      
      // 重新获取路由
      const newRoute = await client.getRoute();
      const newEndpoint = client.selectEndpoint(newRoute.endpoints);
      
      if (newEndpoint) {
        console.log('自动切换到备用服务器:', newEndpoint.url);
        // 重新发起请求
        return await fetch(newEndpoint.url + '/api/users');
      }
    }

    return response;
  } catch (error) {
    // 检查是否为服务端宕机错误
    if (client.isServerFaultError(error)) {
      console.warn('检测到服务端宕机:', error.message);
      
      // 清除缓存，重新请求
      client.clearCache();
      const route = await client.getRoute();
      const endpoint = client.selectEndpoint(route.endpoints);
      
      if (endpoint) {
        console.log('自动切换到备用服务器:', endpoint.url);
        return await fetch(endpoint.url + '/api/users');
      }
    }

    throw error;
  }
}

// 3. 高级端点选择 - 基于权重和负载的负载均衡
async function advancedSelectionExample() {
  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod'
  });

  const route = await client.getRoute();
  
  // 使用高级选择算法（基于权重和负载）
  const endpoint = client.selectEndpointAdvanced(route.endpoints);
  
  console.log('选择的端点:', endpoint.name, endpoint.url);
  console.log('权重:', endpoint.weight, '负载:', endpoint.load);
  
  return await fetch(endpoint.url + '/api/users');
}

// 4. 多应用场景 - 为不同应用获取不同的路由
async function multiApplicationExample() {
  const userServiceClient = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod'
  });

  const orderServiceClient = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'order-service',
    client: 'web',
    environment: 'prod'
  });

  // 并行获取两个服务的路由
  const [userRoute, orderRoute] = await Promise.all([
    userServiceClient.getRoute(),
    orderServiceClient.getRoute()
  ]);

  const userEndpoint = userServiceClient.selectEndpoint(userRoute.endpoints);
  const orderEndpoint = orderServiceClient.selectEndpoint(orderRoute.endpoints);

  console.log('用户服务:', userEndpoint.url);
  console.log('订单服务:', orderEndpoint.url);
}

// 5. 自定义HTTP适配器 - 用于特殊需求
class CustomHttpAdapter extends HttpAdapter {
  async request(url, options = {}) {
    // 添加自定义逻辑，如请求签名、日志记录等
    console.log('[CustomAdapter] 请求:', url);
    
    // 调用原生fetch
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log('[CustomAdapter] 响应状态:', response.status);
    return { status: response.status, data };
  }
}

// ============ Node.js 环境示例 ============

// 在Node.js中使用
async function nodeExample() {
  const { HADClient } = require('./had-client.js');

  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'backend',
    environment: 'prod'
  });

  try {
    const route = await client.getRoute();
    const endpoint = client.selectEndpoint(route.endpoints);

    // 使用Node.js的http/https模块发起请求
    const response = await fetch(endpoint.url + '/api/users');
    const data = await response.json();

    console.log('用户数据:', data);
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

// ============ 缓存管理示例 ============

// 查看缓存状态
function cacheStatusExample() {
  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod'
  });

  // 获取路由（会缓存）
  const route1 = await client.getRoute();
  console.log('第一次请求 - 从服务器获取');

  // 再次获取（会使用缓存）
  const route2 = await client.getRoute();
  console.log('第二次请求 - 从缓存获取');

  // 清除缓存
  client.clearCache();
  console.log('缓存已清除');

  // 再次获取（会重新请求服务器）
  const route3 = await client.getRoute();
  console.log('第三次请求 - 从服务器获取');
}

// ============ 错误处理最佳实践 ============

async function bestPracticeExample() {
  const client = new HADClient({
    routerBaseUrl: 'https://router.example.com',
    application: 'user-service',
    client: 'web',
    environment: 'prod',
    requestTimeout: 1000  // 路由请求超时1秒
  });

  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const route = await client.getRoute();
      const endpoint = client.selectEndpoint(route.endpoints);

      if (!endpoint) {
        throw new Error('无可用端点');
      }

      const response = await fetch(endpoint.url + '/api/users', {
        timeout: 5000
      });

      if (response.ok) {
        return await response.json();
      }

      // 检查是否为服务端故障
      if (client.isServerFaultResponse(response.status)) {
        console.warn('服务端故障，清除缓存并重试');
        client.clearCache();
        retries++;
        continue;
      }

      // 其他HTTP错误
      throw new Error(`HTTP ${response.status}`);

    } catch (error) {
      // 检查是否为网络故障
      if (client.isServerFaultError(error)) {
        console.warn('网络故障，清除缓存并重试');
        client.clearCache();
        retries++;
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        continue;
      }

      // 其他错误直接抛出
      throw error;
    }
  }

  throw new Error('达到最大重试次数');
}

// 导出示例函数（如果在Node.js中使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    basicExample,
    faultHandlingExample,
    advancedSelectionExample,
    multiApplicationExample,
    nodeExample,
    cacheStatusExample,
    bestPracticeExample
  };
}

