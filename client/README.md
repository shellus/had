# HAD 客户端库

HAD 客户端库是一个轻量级的JavaScript库，支持在浏览器和Node.js环境中使用。

## 特性

- ✅ **双环境支持** - 浏览器和Node.js
- ✅ **自动HTTP适配** - 自动检测环境并选择合适的HTTP实现
- ✅ **DNS解析式缓存** - 类似DNS的缓存策略，确保高可用
- ✅ **故障检测** - 自动检测服务端宕机
- ✅ **无依赖** - 零外部依赖，可直接使用
- ✅ **TypeScript友好** - 清晰的API设计

## 安装

### 浏览器

```html
<script src="client/had-client.js"></script>
```

### Node.js

```bash
npm install  # 如果有package.json
# 或直接引入
const { HADClient } = require('./client/had-client.js');
```

## 快速开始

### 浏览器示例

```javascript
// 创建客户端
const client = new HADClient({
  routerBaseUrl: 'https://router.example.com',
  application: 'user-service',
  client: 'web',
  environment: 'prod'
});

// 获取路由
const route = await client.getRoute();

// 选择端点
const endpoint = client.selectEndpoint(route.endpoints);

// 发起请求
const response = await fetch(endpoint.url + '/api/users');
```

### Node.js示例

```javascript
const { HADClient } = require('./client/had-client.js');

const client = new HADClient({
  routerBaseUrl: 'https://router.example.com',
  application: 'user-service',
  client: 'backend',
  environment: 'prod'
});

const route = await client.getRoute();
const endpoint = client.selectEndpoint(route.endpoints);
```

## API 文档

### 构造函数

```javascript
new HADClient(config)
```

**参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| routerBaseUrl | string | http://localhost:8080 | HAD服务器地址 |
| application | string | default | 应用名称 |
| client | string | web | 客户端类型：web/app/device |
| environment | string | prod | 环境：prod/pre/dev |
| vendor | string | null | 业务厂商标识（可选） |
| requestTimeout | number | 1000 | 路由请求超时（毫秒） |
| defaultTtl | number | 300 | 默认缓存时间（秒） |

### 方法

#### getRoute(params)

获取路由信息，自动管理缓存。

```javascript
const route = await client.getRoute({
  application: 'user-service',  // 可选，覆盖构造函数配置
  client: 'web',
  environment: 'prod'
});
```

**返回值**:
```javascript
{
  endpoints: [
    {
      name: 'us-a-prod',
      url: 'https://api-bj1.example.com',
      status: 'healthy',
      weight: 100,
      load: 0.3
    }
  ],
  client_info: { ... }
}
```

#### selectEndpoint(endpoints)

简单的端点选择 - 返回第一个端点。

```javascript
const endpoint = client.selectEndpoint(route.endpoints);
// endpoint.url → 'https://api-bj1.example.com'
```

#### selectEndpointAdvanced(endpoints)

高级端点选择 - 基于权重和负载的负载均衡。

```javascript
const endpoint = client.selectEndpointAdvanced(route.endpoints);
```

#### isServerFaultError(error)

检测是否为服务端宕机错误。

```javascript
try {
  const response = await fetch(url);
} catch (error) {
  if (client.isServerFaultError(error)) {
    // 服务端宕机
    client.clearCache();
  }
}
```

#### isServerFaultResponse(status)

检测HTTP响应状态是否表示服务端宕机。

```javascript
const response = await fetch(url);
if (client.isServerFaultResponse(response.status)) {
  // 服务端故障（5xx）
  client.clearCache();
}
```

#### clearCache(params)

清除缓存，用于服务端宕机检测后强制重新请求。

```javascript
client.clearCache();
// 或清除特定应用的缓存
client.clearCache({ application: 'user-service' });
```

## 工作流程

### 正常流程

```
1. 检查缓存 → 有效 → 返回缓存
2. 缓存无效 → 请求服务器
3. 缓存响应 → 返回数据
```

### 故障流程

```
1. 业务请求失败
2. 检测是否为服务端宕机
3. 是 → 清除缓存 → 重新请求路由
4. 否 → 按正常错误处理
```

## 缓存策略

### TTL（Time To Live）

缓存有效期由后端配置决定：

```yaml
# 全局TTL
ttl: 300

# 端点级TTL
endpoints:
  us-a-prod:
    ttl: 600
```

### 缓存有效期判断

```
当前时间 - 缓存时间戳 < TTL → 缓存有效
当前时间 - 缓存时间戳 ≥ TTL → 缓存过期，请求服务器
```

## 故障检测

### 服务端宕机的判断标准

以下情况表示服务端宕机，应清除缓存：

- ECONNREFUSED - 连接拒绝
- ECONNRESET - 连接重置
- ENOTFOUND - DNS解析失败
- ETIMEDOUT - 连接超时
- HTTP 5xx - 服务器错误

### 非故障错误

以下情况**不**表示服务端宕机：

- HTTP 4xx - 客户端错误
- 业务逻辑错误
- 路由器故障（使用缓存，不清除）

## 示例

详细的使用示例请参考 [example.js](example.js)

## 最佳实践

### 1. 设置合理的超时时间

```javascript
const client = new HADClient({
  requestTimeout: 1000  // 路由请求超时1秒
});
```

### 2. 实现重试机制

```javascript
let retries = 0;
while (retries < 3) {
  try {
    const route = await client.getRoute();
    break;
  } catch (error) {
    if (client.isServerFaultError(error)) {
      client.clearCache();
      retries++;
      await sleep(1000 * retries);
    } else {
      throw error;
    }
  }
}
```

### 3. 监控缓存命中率

```javascript
// 在应用启动时记录缓存命中
let cacheHits = 0;
let cacheMisses = 0;

const originalGetRoute = client.getRoute.bind(client);
client.getRoute = async function(params) {
  const cached = this.cache.get(this._getCacheKey(params));
  if (cached && this._isCacheValid(cached)) {
    cacheHits++;
  } else {
    cacheMisses++;
  }
  return originalGetRoute(params);
};
```

## 许可证

MIT

