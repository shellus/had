/**
 * HAD (HTTP Address Dispatcher) 客户端库
 * 支持浏览器和Node.js环境
 * 
 * 使用方式：
 * - 浏览器: <script src="had-client.js"></script>
 * - Node.js: const { HADClient } = require('./had-client.js');
 */

(function (global) {
  'use strict';

  /**
   * HTTP请求适配器 - 抽象具体的HTTP实现
   */
  class HttpAdapter {
    /**
     * 发起HTTP请求
     * @param {string} url - 请求URL
     * @param {object} options - 请求选项 {method, headers, timeout}
     * @returns {Promise<{status, data}>}
     */
    async request(url, options = {}) {
      throw new Error('HttpAdapter.request() 必须被实现');
    }
  }

  /**
   * 浏览器环境的HTTP适配器
   */
  class BrowserHttpAdapter extends HttpAdapter {
    async request(url, options = {}) {
      const timeout = options.timeout || 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers: options.headers || {},
          signal: controller.signal
        });

        const data = await response.json();
        return { status: response.status, data };
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Node.js环境的HTTP适配器
   */
  class NodeHttpAdapter extends HttpAdapter {
    async request(url, options = {}) {
      const timeout = options.timeout || 5000;
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const http = isHttps ? require('https') : require('http');

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          req.destroy();
          reject(new Error('Request timeout'));
        }, timeout);

        const req = http.request(url, {
          method: options.method || 'GET',
          headers: options.headers || {},
          timeout
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            clearTimeout(timeoutId);
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) });
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });

        req.end();
      });
    }
  }

  /**
   * HAD客户端 - 核心路由客户端
   */
  class HADClient {
    constructor(config = {}) {
      this.config = {
        routerBaseUrl: config.routerBaseUrl || 'http://localhost:8080',
        application: config.application || 'default',
        client: config.client || 'web',
        environment: config.environment || 'prod',
        vendor: config.vendor || null,
        requestTimeout: config.requestTimeout || 1000,
        ...config
      };

      // 自动检测环境并选择HTTP适配器
      this.httpAdapter = this._selectHttpAdapter();
      this.cache = new Map();
    }

    /**
     * 自动选择HTTP适配器
     */
    _selectHttpAdapter() {
      if (typeof fetch !== 'undefined') {
        return new BrowserHttpAdapter();
      } else if (typeof require !== 'undefined') {
        return new NodeHttpAdapter();
      }
      throw new Error('无法检测到支持的HTTP环境');
    }

    /**
     * 生成缓存key
     */
    _getCacheKey(params) {
      return `${params.application}:${params.client}:${params.environment}:${params.vendor || 'default'}`;
    }

    /**
     * 检查缓存是否有效
     */
    _isCacheValid(cached) {
      if (!cached) return false;
      const now = Date.now();
      const age = (now - cached.timestamp) / 1000;
      return age < cached.ttl;
    }

    /**
     * 获取路由信息 - DNS解析式缓存策略
     * 1. 检查缓存 → 有效则返回
     * 2. 缓存无效 → 请求服务器
     * 3. 服务器故障 → 使用过期缓存
     */
    async getRoute(params = {}) {
      const mergedParams = { ...this.config, ...params };
      const cacheKey = this._getCacheKey(mergedParams);

      // 步骤1: 检查缓存
      const cached = this.cache.get(cacheKey);
      if (this._isCacheValid(cached)) {
        return cached.data;
      }

      // 步骤2: 请求服务器
      try {
        const response = await this._requestRoute(mergedParams);
        if (response.code === 200) {
          // 缓存成功响应
          this.cache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now(),
            ttl: response.data.ttl || this.config.defaultTtl || 300
          });
          return response.data;
        }
      } catch (error) {
        console.warn('[HAD] 路由请求失败:', error.message);
      }

      // 步骤3: 使用过期缓存
      if (cached) {
        console.warn('[HAD] 使用过期缓存');
        return cached.data;
      }

      throw new Error('[HAD] 无可用路由信息');
    }

    /**
     * 请求路由信息
     */
    async _requestRoute(params) {
      const queryParams = new URLSearchParams({
        application: params.application,
        client: params.client,
        environment: params.environment,
        ...(params.vendor && { vendor: params.vendor }),
        ...(params.ip && { ip: params.ip })
      });

      const url = `${this.config.routerBaseUrl}/api/v2/route?${queryParams}`;
      const response = await this.httpAdapter.request(url, {
        timeout: this.config.requestTimeout
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.data;
    }

    /**
     * 清除缓存 - 用于服务端宕机检测
     */
    clearCache(params = {}) {
      const mergedParams = { ...this.config, ...params };
      const cacheKey = this._getCacheKey(mergedParams);
      this.cache.delete(cacheKey);
    }

    /**
     * 选择端点 - 简单实现：取第一个
     */
    selectEndpoint(endpoints) {
      if (endpoints && endpoints.length > 0) {
        return endpoints[0];
      }
      return null;
    }

    /**
     * 选择端点 - 复杂实现：基于权重和负载
     */
    selectEndpointAdvanced(endpoints) {
      const healthyEndpoints = endpoints.filter(ep => ep.status === 'healthy');

      if (healthyEndpoints.length === 0) {
        return endpoints[0] || null;
      }

      const totalWeight = healthyEndpoints.reduce((sum, ep) => {
        return sum + (ep.weight * (1 - ep.load));
      }, 0);

      let random = Math.random() * totalWeight;
      for (const endpoint of healthyEndpoints) {
        random -= endpoint.weight * (1 - endpoint.load);
        if (random <= 0) {
          return endpoint;
        }
      }

      return healthyEndpoints[0];
    }

    /**
     * 检查是否为服务端宕机的错误
     */
    isServerFaultError(error) {
      if (!error) return false;

      const errorMsg = error.message || '';
      const errorCode = error.code || '';
      const errorName = error.name || '';

      // 网络连接错误
      const networkErrors = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'TimeoutError'
      ];

      return networkErrors.includes(errorCode) ||
             networkErrors.includes(errorName) ||
             errorMsg.includes('timeout') ||
             errorMsg.includes('network') ||
             errorMsg.includes('refused') ||
             errorMsg.includes('reset');
    }

    /**
     * 检查HTTP响应是否表示服务端宕机
     */
    isServerFaultResponse(status) {
      // 5xx错误表示服务端故障
      return status >= 500;
    }
  }

  // 导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HADClient, HttpAdapter, BrowserHttpAdapter, NodeHttpAdapter };
  } else {
    global.HADClient = HADClient;
  }

})(typeof window !== 'undefined' ? window : global);

